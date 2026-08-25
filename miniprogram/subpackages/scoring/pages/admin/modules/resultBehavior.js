const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/resultBehavior');
const { format: localeFormat } = require('../../../../../locales/runtime');
// Behavior: result tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyResultFilters, toNumber, clampNumber, formatScoreFixed3, buildProgressFillStyle, buildResultFilterOptions, getErrorText } = utils;
const { saveAndShareFile } = require('../../../../../utils/tableFile');
const orgSession = require('../../../../../utils/orgSession');
const { formatAuditTime, formatAuditDetailTime } = require('../../../../../utils/api');

module.exports = Behavior({
  methods: {
    clearScoreResultsState(extraState) {
      this._resultLoadSeq = Number(this._resultLoadSeq || 0) + 1;
      this.resultLoadToken = this._resultLoadSeq;
      this.targetRecordLoadToken = '';
      this.recordDetailLoadToken = '';
      this.departmentScorerToken = '';
      this.scorerTargetPopupToken = '';
      this.setData({
        loadingMap: { ...this.data.loadingMap, results: false },
        scoreResultsRaw: {
          overviewRows: [], calculationRows: [], detailRows: [], recordRows: [], scorerCompletionRows: [],
          completionBoards: { departments: [], identities: [], workGroups: [] },
          stats: {}
        },
        scoreResultsView: {
          overviewRows: [], calculationRows: [], detailRows: [], recordRows: [], scorerCompletionRows: [],
          completionBoards: { departments: [], identities: [], workGroups: [] }
        },
        resultFilterOptions: { departments: [localeCopy.copy_31d4595959], identities: [localeCopy.copy_31d4595959], workGroups: [localeCopy.copy_31d4595959] },
        resultPagination: {
          overview: { page: 0, pageSize: 0, hasMore: true, total: 0 },
          calculation: { page: 0, pageSize: 0, hasMore: true, total: 0 },
          detail: { page: 0, pageSize: 0, hasMore: true, total: 0 },
          completion: { page: 0, pageSize: 0, hasMore: true, total: 0 },
          records: { page: 0, pageSize: 0, hasMore: true, total: 0 }
        },
        selectedResultTarget: null,
        targetRecordRows: [],
        targetRecordLoading: false,
        recordDetailPopupVisible: false,
        recordDetail: null,
        expandedScoreLabelMap: {},
        selectedCompletionDepartment: '',
        departmentScorerRows: [],
        departmentScorerLoading: false,
        scorerTargetPopupVisible: false,
        scorerTargetPopupTitle: '',
        scorerTargetPopupLoading: false,
        scorerTargetPopupRows: [],
        ...(extraState || {})
      });
    },

    reloadScoreResults() {
      this.resetCurrentResultRows();
      this.loadScoreResults({ nocache: true });
    },

    async loadScoreResults(options) {
      options = options || {};
      const viewMode = this.data.resultFilters.viewMode || 'overview';
      const loadToken = (this._resultLoadSeq || 0) + 1;
      this._resultLoadSeq = loadToken;
      this.resultLoadToken = loadToken;
      const activityId = this.data.currentActivityId;
      const requestSnapshot = orgSession.getSnapshot();
      const requestIsCurrent = () => this.resultLoadToken === loadToken
        && this.data.currentActivityId === activityId
        && orgSession.isCurrent(requestSnapshot);

      if (!activityId) {
        this.clearScoreResultsState();
        this.setLoading('results', false);
        return;
      }
  
      this.setLoading('results', true);
  
      const mergedRows = {
        overviewRows: [],
        calculationRows: [],
        detailRows: [],
        recordRows: [],
        scorerCompletionRows: []
      };
  
      let offset = 0;
      let hasMore = true;
      let latestResult = null;
      let requestCount = 0;
      const maxRequests = 100;
  
      try {
        if (viewMode === 'overview') {
          // Load ALL overview rows at once (like user-side "结果公示") — server caches computed result
          const result = await this.callCloud('getScoreResults', {
            activityId,
            timezone: this.data.systemConfig.timezone,
            dataType: viewMode,
            nocache: options.nocache === true,
            filters: {
              department: this.data.resultFilters.department,
              identity: this.data.resultFilters.identity,
              workGroup: this.data.resultFilters.workGroup
            }
          });
  
          if (!requestIsCurrent()) return;
  
          if (result.status !== 'success') {
            this.clearScoreResultsState();
            if (result.status !== 'activity_not_found') {
              wx.showToast({ title: result.message || localeCopy.copy_c59ab1ce4a, icon: 'none' });
            }
            this.setLoading('results', false);
            return;
          }
  
          const overviewRows = result.overviewRows || [];
          this.setData({
            'scoreResultsRaw.stats': result.stats || {},
            'scoreResultsRaw.overviewRows': overviewRows,
            resultFilterOptions: {
              departments: buildResultFilterOptions((this.data.departmentList || []).map(function (item) { return item.name; })),
              identities: buildResultFilterOptions((this.data.identityList || []).map(function (item) { return item.name; })),
              workGroups: this.buildWorkGroupFilterOptions()
            }
          });
          this.applyScoreResultFilters();
          this.setLoading('results', false);
          return;
        }
  
        if (viewMode === 'completion') {
          const result = await this.callCloud('getScoreResults', {
            activityId,
            timezone: this.data.systemConfig.timezone,
            dataType: viewMode,
            filters: {
              department: this.data.resultFilters.department,
              identity: this.data.resultFilters.identity,
              workGroup: this.data.resultFilters.workGroup
            }
          });
  
          if (!requestIsCurrent()) {
            return;
          }
  
          if (result.status !== 'success') {
            this.clearScoreResultsState();
            if (result.status !== 'activity_not_found') {
              wx.showToast({ title: result.message || localeCopy.copy_c59ab1ce4a, icon: 'none' });
            }
            return;
          }
  
          this.setData({
            'scoreResultsRaw.stats': result.stats || {},
            'scoreResultsRaw.completionBoards': result.completionBoards || { departments: [] },
            'scoreResultsRaw.scorerCompletionRows': [],
            resultFilterOptions: {
              departments: buildResultFilterOptions((this.data.departmentList || []).map((item) => item.name)),
              identities: buildResultFilterOptions((this.data.identityList || []).map((item) => item.name)),
              workGroups: this.buildWorkGroupFilterOptions()
            }
          });
          this.applyScoreResultFilters();
          return;
        }
  
        while (hasMore && requestCount < maxRequests) {
          const result = await this.callCloud('getScoreResults', {
            activityId,
            timezone: this.data.systemConfig.timezone,
            dataType: viewMode,
            offset,
            filters: {
              department: this.data.resultFilters.department,
              identity: this.data.resultFilters.identity,
              workGroup: this.data.resultFilters.workGroup
            }
          });
  
          if (!requestIsCurrent()) {
            return;
          }
  
          if (result.status !== 'success') {
            this.clearScoreResultsState();
            if (result.status !== 'activity_not_found') {
              wx.showToast({ title: result.message || localeCopy.copy_c59ab1ce4a, icon: 'none' });
            }
            return;
          }
  
          latestResult = result;
  
          const batchMap = {
            overview: result.overviewRows || [],
            calculation: result.calculationRows || [],
            detail: result.detailRows || [],
            records: result.recordRows || [],
            completion: result.scorerCompletionRows || []
          };
  
          const batchRows = batchMap[viewMode] || [];
  
          if (viewMode === 'overview') {
            mergedRows.overviewRows.push(...batchRows);
          } else if (viewMode === 'calculation') {
            mergedRows.calculationRows.push(...batchRows);
          } else if (viewMode === 'detail') {
            mergedRows.detailRows.push(...batchRows);
          } else if (viewMode === 'records') {
            mergedRows.recordRows.push(...batchRows);
          } else if (viewMode === 'completion') {
            mergedRows.scorerCompletionRows.push(...batchRows);
          }
    
          const setDataObj = {
            'scoreResultsRaw.stats': result.stats || {},
            resultFilterOptions: {
              departments: buildResultFilterOptions((this.data.departmentList || []).map(function (item) { return item.name; })),
              identities: buildResultFilterOptions((this.data.identityList || []).map(function (item) { return item.name; })),
              workGroups: this.buildWorkGroupFilterOptions()
            }
          };
          
          if (viewMode === 'overview') {
            setDataObj['scoreResultsRaw.overviewRows'] = mergedRows.overviewRows;
          }
          
          if (viewMode === 'calculation') {
            setDataObj['scoreResultsRaw.calculationRows'] = mergedRows.calculationRows;
          }
          
          if (viewMode === 'detail') {
            setDataObj['scoreResultsRaw.detailRows'] = mergedRows.detailRows;
          }
          
          if (viewMode === 'records') {
            setDataObj['scoreResultsRaw.recordRows'] = mergedRows.recordRows;
          }
          
          if (viewMode === 'completion') {
            setDataObj['scoreResultsRaw.scorerCompletionRows'] = mergedRows.scorerCompletionRows;
            setDataObj['scoreResultsRaw.completionBoards'] = result.completionBoards || {
              departments: []
            };
          }
          
          this.setData(setDataObj);
    
          this.applyScoreResultFilters();
    
          hasMore = !!(result.pagination && result.pagination.hasMore);
          const nextOffset = result.pagination ? Number(result.pagination.nextOffset || 0) : 0;
  
          if (!batchRows.length || nextOffset <= offset) {
            hasMore = false;
          } else {
            offset = nextOffset;
          }
    
          requestCount += 1;
        }
    
        this.setData({
          resultPagination: {
            ...this.data.resultPagination,
            [viewMode]: {
              page: 1,
              pageSize: latestResult && latestResult.pagination ? latestResult.pagination.returnedCount || 0 : 0,
              hasMore: false,
              total: latestResult && latestResult.pagination ? latestResult.pagination.total || 0 : 0
            }
          }
        });
      } catch (error) {
        if (!requestIsCurrent()) return;
        this.clearScoreResultsState();
        console.error(localeCopy.copy_bd06e9a531, error);
        wx.showToast({
          title: getErrorText(error, localeCopy.copy_c59ab1ce4a),
          icon: 'none'
        });
      } finally {
        if (this.resultLoadToken === loadToken) {
          this.setLoading('results', false);
        }
      }
    },

    loadMoreScoreResults() {
      // Overview results are now loaded all at once — scrolling is instant, no pagination needed
    },

    async openTargetScoreRecords(e) {
      const targetId = String(e.currentTarget.dataset.targetId || '').trim();
      const target = (this.data.scoreResultsView.overviewRows || []).find((item) => String(item.targetId || item.id) === targetId);
      if (!target || !this.data.currentActivityId) {
        return;
      }
  
      await this.loadTargetScoreRecords(targetId, target);
    },

    async loadTargetScoreRecords(targetId, target, options = {}) {
      const organizationSnapshot = orgSession.getSnapshot();
      const activityId = this.data.currentActivityId;
      const requestToken = `${targetId}_${Date.now()}`;
      this.targetRecordLoadToken = requestToken;
      const revokedRecordId = String(options.revokedRecordId || '').trim();
      const keepRows = options.keepRows === true;
  
      const loadingData = {
        selectedResultTarget: target,
        targetRecordLoading: true
      };
      if (!keepRows) {
        loadingData.targetRecordRows = [];
      }
      this.setData(loadingData);
  
      try {
        const result = await this.callCloud('getScoreResults', {
          activityId,
          timezone: this.data.systemConfig.timezone,
          dataType: 'targetRecords',
          targetId
        });
  
        const currentTargetId = String((this.data.selectedResultTarget && (this.data.selectedResultTarget.targetId || this.data.selectedResultTarget.id)) || '');
        if (this.targetRecordLoadToken !== requestToken || currentTargetId !== targetId
          || !orgSession.isCurrent(organizationSnapshot) || this.data.currentActivityId !== activityId) {
          return;
        }
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_6af651c0a8,
            icon: 'none'
          });
          return;
        }
  
        const targetRows = (result.targetRecordRows || []).map((item) => {
          const forcePending = revokedRecordId && String(item.recordId || '') === revokedRecordId;
          const normalizedItem = forcePending ? {
            ...item,
            recordId: '',
            status: 'pending',
            statusText: localeCopy.copy_8d112a0e5f,
            submittedAt: '',
            excludedByRequireAll: false
          } : item;
          const recordStatus = normalizedItem.status === 'inactive' || normalizedItem.excludedByRequireAll
            ? 'inactive'
            : normalizedItem.status;
          return {
            ...normalizedItem,
            submittedAtText: formatAuditTime(normalizedItem.submittedAt, normalizedItem.submittedAtReviewStatus),
            status: recordStatus,
            canViewDetail: (recordStatus === 'completed' || recordStatus === 'inactive') && !!normalizedItem.recordId,
            departmentText: normalizedItem.scorerHistoricalAssignmentUnavailable
              ? localeCopy.historicalAssignmentUnavailable
              : (normalizedItem.scorerDepartment || localeCopy.copy_0fe86822a1),
            identityText: normalizedItem.scorerHistoricalAssignmentUnavailable
              ? ''
              : (normalizedItem.scorerIdentityCategory || normalizedItem.scorerIdentity || localeCopy.copy_ad183b164d),
            workGroupText: normalizedItem.scorerHistoricalAssignmentUnavailable
              ? ''
              : (normalizedItem.scorerWorkGroup || normalizedItem.workGroup || ''),
            statusClass: recordStatus === 'completed'
              ? 'status-completed'
              : (recordStatus === 'inactive' ? 'status-inactive' : 'status-pending'),
            scoreTagClass: recordStatus === 'completed'
              ? 'score-tag-completed'
              : (recordStatus === 'inactive' ? 'score-tag-inactive' : 'score-tag-pending')
          };
        });
  
        this.setData({
          targetRecordRows: targetRows
        });
      } catch (error) {
        if (this.targetRecordLoadToken !== requestToken) {
          return;
        }
        wx.showToast({
          title: localeCopy.copy_6af651c0a8,
          icon: 'none'
        });
      } finally {
        if (this.targetRecordLoadToken === requestToken) {
          this.setData({
            targetRecordLoading: false
          });
        }
      }
    },

    closeTargetScoreRecords() {
      this.targetRecordLoadToken = '';
      this.setData({
        selectedResultTarget: null,
        targetRecordRows: []
      });
    },

    async openScoreRecordDetail(e) {
      const recordId = String(e.currentTarget.dataset.recordId || '').trim();
      if (!recordId || !this.data.currentActivityId) {
        return;
      }
  
      const organizationSnapshot = orgSession.getSnapshot();
      const activityId = this.data.currentActivityId;
      const requestToken = `${recordId}_${Date.now()}`;
      this.recordDetailLoadToken = requestToken;
      this.setData({
        recordDetailPopupVisible: true,
        recordDetail: null
      });
      this.setLoading(`recordDetail_${recordId}`, true);
      try {
        const result = await this.callCloud('getScoreResults', {
          activityId,
          timezone: this.data.systemConfig.timezone,
          dataType: 'recordDetail',
          recordId
        });
  
        if (this.recordDetailLoadToken !== requestToken || !orgSession.isCurrent(organizationSnapshot)
          || this.data.currentActivityId !== activityId) return;
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_0dce54533e,
            icon: 'none'
          });
          this.setData({ recordDetailPopupVisible: false });
          return;
        }
  
        const recordDetail = result.recordDetail ? {
          ...result.recordDetail,
          submittedAtText: formatAuditDetailTime(
            result.recordDetail.submittedAt,
            result.recordDetail.submittedAtReviewStatus
          ),
          templates: (result.recordDetail.templates || []).map((template) => ({
            ...template,
            questions: (template.questions || []).map((question) => ({
              ...question,
              expandKey: `${template.templateId}_${question.questionIndex}`,
              hasScoreLabel: !!question.scoreLabel,
              scoreLabelExpanded: false
            }))
          }))
        } : null;
  
        this.setData({
          recordDetail,
          expandedScoreLabelMap: {}
        });
      } catch (error) {
        if (this.recordDetailLoadToken !== requestToken || !orgSession.isCurrent(organizationSnapshot)) return;
        this.setData({ recordDetailPopupVisible: false });
        wx.showToast({
          title: localeCopy.copy_0dce54533e,
          icon: 'none'
        });
      } finally {
        if (this.recordDetailLoadToken === requestToken) this.setLoading(`recordDetail_${recordId}`, false);
      }
    },

    closeScoreRecordDetail() {
      this.recordDetailLoadToken = '';
      this.setData({
        recordDetailPopupVisible: false,
        recordDetail: null,
        expandedScoreLabelMap: {}
      });
    },

    toggleScoreLabel(e) {
      const detail = e.detail || {};
      const dataset = e.currentTarget && e.currentTarget.dataset || {};
      const templateIndex = Number(detail.templateIndex === undefined ? dataset.templateIndex : detail.templateIndex);
      const questionIndex = Number(detail.questionIndex === undefined ? dataset.questionIndex : detail.questionIndex);
      const recordDetail = this.data.recordDetail;
      if (!recordDetail || !recordDetail.templates || !recordDetail.templates[templateIndex]) {
        return;
      }
  
      const templates = recordDetail.templates.map((template, currentTemplateIndex) => {
        if (currentTemplateIndex !== templateIndex) {
          return template;
        }
        return {
          ...template,
          questions: (template.questions || []).map((question, currentQuestionIndex) => {
            if (currentQuestionIndex !== questionIndex) {
              return question;
            }
            return {
              ...question,
              scoreLabelExpanded: !question.scoreLabelExpanded
            };
          })
        };
      });
  
      this.setData({
        recordDetail: {
          ...recordDetail,
          templates
        }
      });
    },

    resetCurrentResultRows() {
      const viewMode = this.data.resultFilters.viewMode || 'overview';
    
      const nextRaw = {
        ...this.data.scoreResultsRaw
      };
    
      if (viewMode === 'overview') {
        nextRaw.overviewRows = [];
      } else if (viewMode === 'calculation') {
        nextRaw.calculationRows = [];
      } else if (viewMode === 'detail') {
        nextRaw.detailRows = [];
      } else if (viewMode === 'records') {
        nextRaw.recordRows = [];
      } else if (viewMode === 'completion') {
        nextRaw.scorerCompletionRows = [];
        nextRaw.completionBoards = {
          departments: [],
          identities: [],
          workGroups: []
        };
      }
    
      this.setData({
        scoreResultsRaw: nextRaw,
        selectedResultTarget: null,
        targetRecordRows: [],
        recordDetailPopupVisible: false,
        recordDetail: null,
        expandedScoreLabelMap: {},
        selectedCompletionDepartment: '',
        departmentScorerRows: [],
        departmentScorerLoading: false,
        scorerTargetPopupVisible: false,
        scorerTargetPopupTitle: '',
        scorerTargetPopupLoading: false,
        scorerTargetPopupRows: [],
        resultPagination: {
          ...this.data.resultPagination,
          [viewMode]: {
            page: 0,
            pageSize: 0,
            hasMore: true,
            total: 0
          }
        }
      });
    },

    buildWorkGroupFilterOptions(department) {
      let dept = department;
      if (dept === undefined) {
        dept = this.data.resultFilters.department;
      }
      let workGroupList = this.data.workGroupList || [];
      if (!dept || dept === localeCopy.copy_31d4595959) {
        return [localeCopy.copy_5327cd39d0];
      }
      let deptId = '';
      let deptList = this.data.departmentList || [];
      for (let i = 0; i < deptList.length; i++) {
        if (deptList[i].name === dept) {
          deptId = deptList[i].id || deptList[i]._id || '';
          break;
        }
      }
      let filtered = workGroupList
        .filter(function (item) {
          return item.departmentId === deptId || item.departmentName === dept;
        })
        .map(function (item) { return item.name; });
      return [localeCopy.copy_31d4595959].concat(filtered);
    },

    applyScoreResultFilters() {
      const filters = this.data.resultFilters || emptyResultFilters();
      const isAllValue = (value) => !value
        || value === localeCopy.copy_31d4595959
        || value === localeCopy.copy_68f7277730
        || value === localeCopy.copy_55780718f9
        || value === localeCopy.copy_f54076411e
        || value === localeCopy.copy_40fc2b38e6
        || value === localeCopy.copy_03a3d115c7;
      const matches = (row) => {
        if (!isAllValue(filters.department) && row.department !== filters.department) {
          return false;
        }
        if (!isAllValue(filters.identity) && row.identity !== filters.identity) {
          return false;
        }
        if (!isAllValue(filters.workGroup) && (row.workGroup || '') !== filters.workGroup) {
          return false;
        }
        return true;
      };
  
      const sortRows = (rows, scoreField = 'finalScore') => {
        const nextRows = [...rows];
        const sortMode = filters.sortMode;
        nextRows.sort((a, b) => {
          if (sortMode === 'name_asc') {
            return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
          }
          if (sortMode === 'department_asc') {
            const depCompare = String(a.department || '').localeCompare(String(b.department || ''), 'zh-CN');
            return depCompare || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
          }
          if (sortMode === 'workGroup_asc') {
            const groupCompare = String(a.workGroup || '').localeCompare(String(b.workGroup || ''), 'zh-CN');
            return groupCompare || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
          }
          return Number(b[scoreField] || 0) - Number(a[scoreField] || 0);
        });
        return nextRows;
      };
  
      const overviewRows = sortRows((this.data.scoreResultsRaw.overviewRows || []).filter(matches), 'finalScore').map((row) => {
        const expected = Math.max(0, Math.floor(toNumber(row.expectedScorerCount, 0)));
        const submitted = Math.max(0, Math.floor(toNumber(row.submittedScorerCount, 0)));
        const safeSubmitted = expected ? Math.min(expected, submitted) : submitted;
        const rate = expected ? (safeSubmitted / expected) * 100 : 100;
        const percent = clampNumber(rate, 0, 100);
        return {
          ...row,
          finalScoreDisplay: formatScoreFixed3(row.finalScore),
          progressText: `${safeSubmitted}/${expected}`,
          progressPercentText: `${Math.round(percent)}%`,
          progressFillStyle: buildProgressFillStyle(percent)
        };
      });
      const calculationRows = sortRows((this.data.scoreResultsRaw.calculationRows || []).filter(matches), 'contributionScore');
      const detailRows = sortRows((this.data.scoreResultsRaw.detailRows || []).filter(matches), 'weightedScore');
      const recordRows = sortRows((this.data.scoreResultsRaw.recordRows || []).filter(matches), 'submittedAt');
      const backendBoards = (this.data.scoreResultsRaw.completionBoards || {}).departments || [];
      const completionBoards = backendBoards.map((item) => {
        const percent = item.memberCount
          ? clampNumber((item.completedCount / item.memberCount) * 100, 0, 100)
          : 100;
        return {
          ...item,
          completionRate: Number(percent.toFixed(2)),
          completionText: `${item.completedCount}/${item.memberCount}`,
          progressPercentText: `${Math.round(percent)}%`,
          progressFillStyle: buildProgressFillStyle(percent),
          scorerRows: undefined
        };
      }).sort((a, b) => {
        const rateDiff = Number(b.completionRate || 0) - Number(a.completionRate || 0);
        if (rateDiff !== 0) return rateDiff;
        return String(a.groupName || '').localeCompare(String(b.groupName || ''), 'zh-CN');
      });
  
      this.setData({
        scoreResultsView: {
          overviewRows,
          calculationRows,
          detailRows,
          recordRows,
          scorerCompletionRows: [],
          completionBoards: {
            departments: completionBoards
          }
        }
      });
    },

    async toggleDepartmentScorers(e) {
      const { groupName } = e.currentTarget.dataset;
      if (!groupName || !this.data.currentActivityId) return;
  
      if (this.data.selectedCompletionDepartment === groupName) {
        this.closeDepartmentScorers();
        return;
      }
  
      const activityId = this.data.currentActivityId;
      const request = orgSession.beginRequest(this, 'departmentScorers');
  
      this.setData({
        selectedCompletionDepartment: groupName,
        departmentScorerLoading: true,
        departmentScorerRows: []
      });
  
      try {
        const result = await this.callCloud('getScoreResults', {
          activityId,
          timezone: this.data.systemConfig.timezone,
          dataType: 'completion',
          departmentName: groupName,
          filters: {
            department: this.data.resultFilters.department,
            identity: this.data.resultFilters.identity,
            workGroup: this.data.resultFilters.workGroup
          }
        });
  
        if (!orgSession.isRequestCurrent(this, request)
          || this.data.currentActivityId !== activityId) return;
  
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_e52119b17e, icon: 'none' });
          this.setData({ departmentScorerLoading: false });
          return;
        }
  
        const rows = (result.scorerCompletionRows || []).map((item) => {
          const expectedCount = Math.max(0, Math.floor(toNumber(item.expectedCount, 0)));
          const submittedCount = Math.max(0, Math.floor(toNumber(item.submittedCount, 0)));
          const pendingCount = Math.max(expectedCount - submittedCount, 0);
          return {
            ...item,
            expectedCount,
            submittedCount,
            pendingCount,
            detailText: [item.identity, item.workGroup].filter(Boolean).join(' / ') || localeCopy.copy_2b4df49497,
            completionText: `${submittedCount}/${expectedCount}`,
            progressPercentText: `${expectedCount ? Math.round((submittedCount / expectedCount) * 100) : 100}%`,
            progressFillStyle: buildProgressFillStyle(expectedCount ? (submittedCount / expectedCount) * 100 : 100),
            statusText: pendingCount > 0 ? localeCopy.copy_8d112a0e5f : localeCopy.copy_2220286f1c,
            statusClass: pendingCount > 0 ? 'status-pending' : 'status-completed'
          };
        });
  
        this.setData({
          departmentScorerRows: rows,
          departmentScorerLoading: false
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request)) return;
        wx.showToast({ title: localeCopy.copy_5b26233f5a, icon: 'none' });
        this.setData({ departmentScorerLoading: false });
      }
    },

    closeDepartmentScorers() {
      orgSession.beginRequest(this, 'departmentScorers');
      this.setData({
        selectedCompletionDepartment: '',
        departmentScorerLoading: false,
        departmentScorerRows: []
      });
    },

    async openScorerTargetPopup(e) {
      const { scorerKey } = e.currentTarget.dataset;
      if (!scorerKey || !this.data.currentActivityId) return;
  
      const activityId = this.data.currentActivityId;
      const request = orgSession.beginRequest(this, 'scorerTargetPopup');
  
      const scorerRow = (this.data.departmentScorerRows || []).find((item) => item.scorerKey === scorerKey);
      const scorerName = scorerRow ? scorerRow.scorerName : scorerKey;
  
      this.setData({
        scorerTargetPopupVisible: true,
        scorerTargetPopupTitle: localeFormat(localeCopy.copy_abb0a3f46c, [scorerName]),
        scorerTargetPopupLoading: true,
        scorerTargetPopupRows: []
      });
  
      try {
        const result = await this.callCloud('getScoreResults', {
          activityId,
          timezone: this.data.systemConfig.timezone,
          dataType: 'scorerTargets',
          scorerKey
        });
  
        if (!orgSession.isRequestCurrent(this, request)
          || this.data.currentActivityId !== activityId) return;
  
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_e52119b17e, icon: 'none' });
          this.setData({ scorerTargetPopupLoading: false });
          return;
        }
  
        const rows = (result.scorerTargetRows || []).map((item) => ({
          ...item,
          detailText: item.targetHistoricalAssignmentUnavailable
            ? localeCopy.historicalAssignmentUnavailable
            : ([item.targetDepartment, item.targetIdentityCategory || item.targetIdentity, item.targetWorkGroup].filter(Boolean).join(' / ') || localeCopy.copy_2b4df49497)
        }));
  
        this.setData({
          scorerTargetPopupRows: rows,
          scorerTargetPopupLoading: false
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request)) return;
        wx.showToast({ title: localeCopy.copy_f6a9d3621a, icon: 'none' });
        this.setData({ scorerTargetPopupLoading: false });
      }
    },

    closeScorerTargetPopup() {
      orgSession.beginRequest(this, 'scorerTargetPopup');
      this.setData({
        scorerTargetPopupVisible: false,
        scorerTargetPopupTitle: '',
        scorerTargetPopupLoading: false,
        scorerTargetPopupRows: []
      });
    },

    openScorerTargetRecordDetail(e) {
      const recordId = String(e.currentTarget.dataset.recordId || '').trim();
      if (!recordId) return;
      this.openScoreRecordDetail(e);
    },

    onResultFilterChange(e) {
      const { field } = e.currentTarget.dataset;
      const { value } = e.detail;
      const optionsMap = {
        department: this.data.resultFilterOptions.departments,
        identity: this.data.resultFilterOptions.identities,
        workGroup: this.data.resultFilterOptions.workGroups,
        viewMode: (this.data.resultViewOptions || []).map((item) => item.label),
        sortMode: (this.data.resultSortOptions || []).map((item) => item.label)
      };
      const rawOptions = optionsMap[field] || [];
      const pickedLabel = rawOptions[Number(value)] || localeCopy.copy_31d4595959;
  
      if (field === 'workGroup' && pickedLabel === localeCopy.copy_5327cd39d0) {
        return;
      }
  
      let nextValue = pickedLabel;
      if (field === 'viewMode') {
        nextValue = (this.data.resultViewOptions[Number(value)] || {}).value || 'overview';
        this.setData({
          resultViewLabel: (this.data.resultViewOptions[Number(value)] || {}).label || localeCopy.copy_a6f7e5f124
        });
      }
      if (field === 'sortMode') {
        nextValue = (this.data.resultSortOptions[Number(value)] || {}).value || 'score_desc';
        this.setData({
          resultSortLabel: (this.data.resultSortOptions[Number(value)] || {}).label || localeCopy.copy_60c630a885
        });
      }
  
      const nextFilters = {
        ...this.data.resultFilters,
        [field]: nextValue
      };
  
      if (field === 'department') {
        nextFilters.workGroup = localeCopy.copy_31d4595959;
      }
  
      this.setData({
        resultFilters: nextFilters,
        'resultFilterOptions.workGroups': this.buildWorkGroupFilterOptions(nextFilters.department)
      });
      this.resetCurrentResultRows();
      this.loadScoreResults({ append: false });
    },

    exportScoreResultsUnified(e) {
      const report = e.currentTarget.dataset.report;
      if (!this.data.currentActivityId) {
        wx.showToast({ title: localeCopy.copy_4e36c10a9e, icon: 'none' });
        return;
      }
  
      const _this = this;
      wx.showActionSheet({
        itemList: [localeCopy.copy_7ffcbc33aa, localeCopy.copy_5503123f4c],
        success: function (res) {
          const format = res.tapIndex === 0 ? 'csv' : 'excel';
          _this._doExportScoreResults(report, format);
        }
      });
    },

    async _doExportScoreResults(report, format) {
      this.setLoading('export_' + report, true);
      try {
        const result = await this.callCloud('exportScoreResults', {
          activityId: this.data.currentActivityId,
          timezone: this.data.systemConfig.timezone,
          reportType: report,
          format: format,
          filters: {
            department: this.data.resultFilters.department,
            identity: this.data.resultFilters.identity,
            workGroup: this.data.resultFilters.workGroup
          }
        });
  
        if (result.status !== 'success' || !result.fileContent || !result.fileName) {
          wx.showToast({ title: result.message || localeCopy.copy_2b61466286, icon: 'none' });
          return;
        }
  
        saveAndShareFile(result.fileContent, result.fileName, result.extension || 'csv');
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_2b61466286, icon: 'none' });
      } finally {
        this.setLoading('export_' + report, false);
      }
    },

    async revokeScoreRecord(e) {
      const detail = e.detail || {};
      const dataset = e.currentTarget && e.currentTarget.dataset || {};
      const id = detail.id || dataset.id;
      if (!id) {
        return;
      }
  
      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: localeCopy.copy_a000713b84,
          content: localeCopy.copy_7647264e2a,
          confirmText: localeCopy.copy_d6c748ac95,
          cancelText: localeCopy.copy_4b213fd88a,
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false)
        });
      });
  
      if (!confirm) {
        return;
      }
  
      this.setLoading(`revoke_${id}`, true);
      try {
        const result = await this.callCloud('revokeScoreRecord', {
          recordId: id
        });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_8351ecc192,
            icon: 'none'
          });
          return;
        }
        wx.showToast({
          title: localeCopy.copy_d08849e510,
          icon: 'success'
        });
        const selectedTarget = this.data.selectedResultTarget;
        const revokedRow = (this.data.targetRecordRows || []).find((item) => String(item.recordId || '') === String(id));
        this.setData({
          recordDetailPopupVisible: false,
          recordDetail: null,
          expandedScoreLabelMap: {},
          targetRecordRows: (this.data.targetRecordRows || []).map((item) => {
            if (String(item.recordId || '') !== String(id)) {
              return item;
            }
            return {
              ...item,
              recordId: '',
              status: 'pending',
              statusText: localeCopy.copy_8d112a0e5f,
              submittedAt: '',
              excludedByRequireAll: false,
              canViewDetail: false,
              statusClass: 'status-pending',
              scoreTagClass: 'score-tag-pending'
            };
          })
        });
        await this.loadScoreResults();
        if (selectedTarget && (selectedTarget.targetId || selectedTarget.id)) {
          const targetId = String(selectedTarget.targetId || selectedTarget.id);
          const latestTarget = (this.data.scoreResultsView.overviewRows || [])
            .find((item) => String(item.targetId || item.id) === targetId) || selectedTarget;
          await this.loadTargetScoreRecords(targetId, latestTarget, {
            revokedRecordId: id,
            revokedScorerKey: revokedRow && revokedRow.scorerKey,
            keepRows: true
          });
        }
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_8351ecc192,
          icon: 'none'
        });
      } finally {
        this.setLoading(`revoke_${id}`, false);
      }
    }
  }
});
