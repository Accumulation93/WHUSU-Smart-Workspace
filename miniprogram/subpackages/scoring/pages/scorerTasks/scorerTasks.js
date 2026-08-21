const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/scoring/pages/scorerTasks/scorerTasks');
const { format: localeFormat } = require('../../../../locales/runtime');
const { callFunction, showShortToast, getErrorText } = require('../../../../utils/api');
const { saveAndShareFile } = require('../../../../utils/tableFile');
const orgSession = require('../../../../utils/orgSession');

function buildOptions(values = []) {
  return [localeCopy.copy_31d4595959, ...values.filter(Boolean)];
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

function assignmentNatureText(value) {
  if (value === 'staff') return localeCopy.assignmentNatureStaff;
  if (value === 'liaison') return localeCopy.assignmentNatureLiaison;
  if (value === 'other') return localeCopy.assignmentNatureOther;
  return String(value || '').trim();
}

function buildAssignmentChip(row) {
  const item = row || {};
  if (item.historicalAssignmentUnavailable) return localeCopy.historicalAssignmentUnavailable;
  const assignmentLabel = typeof item.assignmentLabel === 'string'
    ? item.assignmentLabel.trim()
    : '';
  return [
    assignmentNatureText(item.assignmentNature),
    assignmentLabel
  ].filter(Boolean).join(' · ');
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
      assignmentId: row.assignmentId || '',
      _showAssignmentChip: Boolean(row.historicalAssignmentUnavailable || (row.needsAssignmentDisambiguation && row.assignmentId)),
      _assignmentChipText: row.historicalAssignmentUnavailable || (row.needsAssignmentDisambiguation && row.assignmentId)
        ? buildAssignmentChip(row)
        : '',
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
    localeCopy,
    activityId: '',
    activityName: '',
    loading: false,
    keyword: '',
    filterOptions: {
      departments: [localeCopy.copy_31d4595959],
      identities: [localeCopy.copy_31d4595959],
      workGroups: [localeCopy.copy_31d4595959]
    },
    filters: {
      department: localeCopy.copy_31d4595959,
      identity: localeCopy.copy_31d4595959,
      workGroup: localeCopy.copy_31d4595959
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
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    const activityId = decodeURIComponent(options.activityId || '');
    const activityName = formatActivityName(decodeURIComponent(options.activityName || ''));
    this.setData({
      activityId,
      activityName
    });
    this.loadData();
  },

  onShow() {
    const organizationState = orgSession.consume(this);
    if (!this.data.activityId || !organizationState.changed) return;
    orgSession.invalidateRequests(this);
    showShortToast(localeCopy.copy_7f63d5ff75);
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/subpackages/main/pages/portal/portal' })
    });
  },

  callCloud(name, data = {}) {
    return callFunction({ name, data });
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
        title: localeCopy.copy_c0d3210812,
        icon: 'none'
      });
      return;
    }
  
    const request = orgSession.beginRequest(this, 'scorerTasks');
  
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
  
        if (!orgSession.isRequestCurrent(this, request)) {
          return;
        }
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_e52119b17e,
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
      if (orgSession.isRequestCurrent(this, request)) {
        showShortToast(getErrorText(error, localeCopy.copy_e52119b17e));
      }
    } finally {
      if (orgSession.isRequestCurrent(this, request)) {
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
    const picked = (optionMap[field] || [])[valueIndex] || localeCopy.copy_31d4595959;
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

    const request = orgSession.beginRequest(this, 'scorerTaskPopup');

    this.setData({
      pendingPopupVisible: true,
      pendingPopupTitle: localeFormat(localeCopy.copy_c523dc2ef9, [row.scorerName]),
      pendingPopupLoading: true,
      pendingPopupList: []
    });

    try {
      const result = await this.callCloud('getScorerTaskStatus', {
        activityId: this.data.activityId,
        scorerKey: row.assignmentId || row.scorerKey,
        assignmentId: row.assignmentId || ''
      });

      if (!orgSession.isRequestCurrent(this, request)) {
        return;
      }

      if (result.status === 'success' && result.scorer) {
        this.setData({
          pendingPopupList: result.scorer.pendingList || [],
          pendingPopupLoading: false
        });
      } else {
        wx.showToast({ title: result.message || localeCopy.copy_e52119b17e, icon: 'none' });
        this.setData({ pendingPopupLoading: false });
      }
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) {
        showShortToast(getErrorText(error, localeCopy.copy_e52119b17e));
        this.setData({ pendingPopupLoading: false });
      }
    }
  },

  closePendingPopup() {
    orgSession.beginRequest(this, 'scorerTaskPopup');
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
      itemList: [localeCopy.copy_7ffcbc33aa, localeCopy.copy_5503123f4c],
      success: function (res) {
        const format = res.tapIndex === 0 ? 'csv' : 'excel';
        _this._doExportCurrentView(reportType, format);
      }
    });
  },

  async _doExportCurrentView(reportType, format) {
    const request = orgSession.beginRequest(this, 'scorerTaskExport:' + reportType);
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

      if (!orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success' || !result.fileContent) {
        wx.showToast({
          title: result.message || localeCopy.copy_2b61466286,
          icon: 'none'
        });
        return;
      }

      saveAndShareFile(result.fileContent, result.fileName || localeCopy.copy_47d48f32f4, result.extension || 'csv');
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) {
        showShortToast(getErrorText(error, localeCopy.copy_2b61466286));
      }
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setExportLoading(reportType, false);
    }
  }
});
