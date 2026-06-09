const { callFunction } = require('../../utils/api');
const { saveAndShareFile } = require('../../utils/tableFile');

function buildOptions(values = []) {
  return ['全部', ...values.filter(Boolean)];
}

function getErrorText(error, fallback) {
  const text = String((error && (error.errMsg || error.message)) || '').trim();
  return text || fallback;
}

function formatActivityName(name) {
  return String(name || '').trim();
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ── Progress bar colour: 0–100 HSL lookup (red → orange → yellow → green, always bright) ──
function getProgressColor(ratePercent) {
  const t = clampNumber(toNumber(ratePercent, 0), 0, 100) / 100;

  // Hue: 0° red → 30° orange → 55° golden-yellow → 140° green
  let hue;
  if (t < 0.35)       hue = (t / 0.35) * 30;
  else if (t < 0.65)  hue = 30 + ((t - 0.35) / 0.30) * 25;
  else                hue = 55 + ((t - 0.65) / 0.35) * 85;

  // Saturation: high throughout (80–95%), peaking in the middle
  const sat = 85 + Math.sin(t * Math.PI) * 10;

  // Lightness: bright range (48–58%), peaking at golden-yellow
  const light = 50 + Math.sin(t * Math.PI) * 8;

  return `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
}

function buildProgressFillStyle(ratePercent) {
  const percent = clampNumber(toNumber(ratePercent, 0), 0, 100);
  const color = getProgressColor(percent);
  return `width: ${percent}%; background: linear-gradient(90deg, rgba(255,255,255,0.30), ${color});`;
}

function normalizeScorerRows(rows = []) {
  return rows.map((row) => {
    const expected = Math.max(0, Math.floor(toNumber(row.expectedCount, 0)));
    const submitted = Math.max(0, Math.floor(toNumber(row.submittedCount, 0)));
    const safeSubmitted = expected ? Math.min(expected, submitted) : submitted;
    const percent = expected
      ? clampNumber((safeSubmitted / expected) * 100, 0, 100)
      : 100;

    return {
      ...row,
      expectedCount: expected,
      submittedCount: safeSubmitted,
      progressText: `${safeSubmitted}/${expected}`,
      progressPercentText: `${Math.round(percent)}%`,
      progressFillStyle: buildProgressFillStyle(percent)
    };
  });
}

Page({
  data: {
    activityId: '',
    activityName: '',
    loading: false,
    keyword: '',
    filterOptions: {
      departments: ['全部'],
      identities: ['全部'],
      workGroups: ['全部']
    },
    filters: {
      department: '全部',
      identity: '全部',
      workGroup: '全部'
    },
    stats: {
      totalPendingScorers: 0
    },
    scorerRows: [],
    pendingPopupVisible: false,
    pendingPopupTitle: '',
    pendingPopupLoading: false,
    pendingPopupList: [],
    exportLoadingMap: {}
  },

  onLoad(options) {
    const activityId = decodeURIComponent(options.activityId || '');
    const activityName = formatActivityName(decodeURIComponent(options.activityName || ''));
    this.setData({
      activityId,
      activityName
    });
    this.loadData();
  },

  callCloud(name, data = {}) {
    return new Promise((resolve, reject) => {
      callFunction({
        name,
        data,
        success: (res) => resolve(res.result || {}),
        fail: reject
      });
    });
  },

  setExportLoading(key, value) {
    this.setData({
      exportLoadingMap: {
        ...this.data.exportLoadingMap,
        [key]: value
      }
    });
  },

  async loadData() {
    if (!this.data.activityId) {
      wx.showToast({
        title: '缺少评分活动',
        icon: 'none'
      });
      return;
    }
  
    const loadToken = Date.now();
    this.taskLoadToken = loadToken;
  
    this.setData({
      loading: true,
      scorerRows: []
    });
  
    try {
      let offset = 0;
      let hasMore = true;
      let requestCount = 0;
      const maxRequests = 100;
      const mergedRows = [];
      let latestResult = null;
  
      while (hasMore && requestCount < maxRequests) {
        const result = await this.callCloud('getScorerTaskStatus', {
          activityId: this.data.activityId,
          offset,
          filters: {
            department: this.data.filters.department,
            identity: this.data.filters.identity,
            workGroup: this.data.filters.workGroup,
            keyword: this.data.keyword
          }
        });
  
        if (this.taskLoadToken !== loadToken) {
          return;
        }
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '加载失败',
            icon: 'none'
          });
          return;
        }
  
        latestResult = result;
  
        const batchRows = result.scorers || [];
        mergedRows.push(...batchRows);
  
        this.setData({
          activityName: formatActivityName(result.activityName) || this.data.activityName,
          stats: result.stats || { totalPendingScorers: 0 },
          scorerRows: normalizeScorerRows(mergedRows),
          filterOptions: {
            departments: buildOptions((result.filterOptions && result.filterOptions.departments) || []),
            identities: buildOptions((result.filterOptions && result.filterOptions.identities) || []),
            workGroups: buildOptions((result.filterOptions && result.filterOptions.workGroups) || [])
          }
        });
  
        hasMore = !!(result.pagination && result.pagination.hasMore);
  
        const nextOffset = result.pagination ? Number(result.pagination.nextOffset || 0) : 0;
  
        if (!batchRows.length || nextOffset <= offset) {
          hasMore = false;
        } else {
          offset = nextOffset;
        }
  
        requestCount += 1;
  
      }
    } catch (error) {
      wx.showToast({
        title: getErrorText(error, '加载失败'),
        icon: 'none'
      });
    } finally {
      if (this.taskLoadToken === loadToken) {
        this.setData({ loading: false });
      }
    }
  },

  onFilterChange(e) {
    const { field } = e.currentTarget.dataset;
    const valueIndex = Number(e.detail.value);
    const optionMap = {
      department: this.data.filterOptions.departments,
      identity: this.data.filterOptions.identities,
      workGroup: this.data.filterOptions.workGroups
    };
    const picked = (optionMap[field] || [])[valueIndex] || '全部';
    this.setData({
      filters: {
        ...this.data.filters,
        [field]: picked
      }
    });
    this.loadData();
  },

  onKeywordInput(e) {
    this.setData({
      keyword: String(e.detail.value || '').trim()
    });
  },

  onKeywordConfirm() {
    this.loadData();
  },

  async openPendingPopup(e) {
    const index = Number(e.currentTarget.dataset.index);
    const row = this.data.scorerRows[index];
    if (!row) {
      return;
    }

    const popupToken = Date.now();
    this.pendingPopupToken = popupToken;

    this.setData({
      pendingPopupVisible: true,
      pendingPopupTitle: `${row.scorerName} 的未完成名单`,
      pendingPopupLoading: true,
      pendingPopupList: []
    });

    try {
      const result = await this.callCloud('getScorerTaskStatus', {
        activityId: this.data.activityId,
        scorerKey: row.scorerKey
      });

      if (this.pendingPopupToken !== popupToken) {
        return;
      }

      if (result.status === 'success' && result.scorer) {
        this.setData({
          pendingPopupList: result.scorer.pendingList || [],
          pendingPopupLoading: false
        });
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ pendingPopupLoading: false });
      }
    } catch (error) {
      wx.showToast({ title: getErrorText(error, '加载失败'), icon: 'none' });
      this.setData({ pendingPopupLoading: false });
    }
  },

  closePendingPopup() {
    this.setData({
      pendingPopupVisible: false,
      pendingPopupTitle: '',
      pendingPopupLoading: false,
      pendingPopupList: []
    });
  },

  noop() {},

  exportCurrentViewUnified(e) {
    const reportType = e.currentTarget.dataset.report;
    const _this = this;
    wx.showActionSheet({
      itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
      success: function (res) {
        const format = res.tapIndex === 0 ? 'csv' : 'excel';
        _this._doExportCurrentView(reportType, format);
      }
    });
  },

  async _doExportCurrentView(reportType, format) {
    this.setExportLoading(reportType, true);

    try {
      const result = await this.callCloud('exportScorerTaskStatus', {
        activityId: this.data.activityId,
        filters: {
          department: this.data.filters.department,
          identity: this.data.filters.identity,
          workGroup: this.data.filters.workGroup,
          keyword: this.data.keyword
        },
        reportType,
        format
      });

      if (result.status !== 'success' || !result.fileContent) {
        wx.showToast({
          title: result.message || '导出失败',
          icon: 'none'
        });
        return;
      }

      saveAndShareFile(result.fileContent, result.fileName || '未完成评分导出', result.extension || 'csv');
    } catch (error) {
      wx.showToast({
        title: getErrorText(error, '导出失败'),
        icon: 'none'
      });
    } finally {
      this.setExportLoading(reportType, false);
    }
  }
});
