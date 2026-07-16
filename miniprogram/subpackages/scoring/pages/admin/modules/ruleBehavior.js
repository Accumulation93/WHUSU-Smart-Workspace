// Behavior: rule tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { RULE_SCOPE_OPTIONS, emptyRuleForm, emptyRuleFilters, buildRuleListItem, buildRuleFilterOptions, markSelectedRules, filterRuleList, normalizeRuleFilters, createSelectedRuleIdMap, getScopeLabel, buildRuleClausesForBatchApply, buildRuleClausesForSave, normalizeClauseForEdit, moveItem, refreshTemplateConfigSortOrder } = utils;
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    setRuleListState(ruleList = [], selectedRuleIds = this.data.selectedRuleIds, filters = this.data.ruleFilters) {
      const normalizedList = (ruleList || []).map((item) => buildRuleListItem(item));
      const ruleIdSet = new Set(normalizedList.map((item) => item.id).filter(Boolean));
      const safeSelectedRuleIds = (selectedRuleIds || [])
        .map((item) => String(item || '').trim())
        .filter((id, index, list) => id && ruleIdSet.has(id) && list.indexOf(id) === index);
      const filterOptions = buildRuleFilterOptions(normalizedList);
      const nextFilters = normalizeRuleFilters(filters || emptyRuleFilters(), filterOptions);
      const selectedRuleIdMap = createSelectedRuleIdMap(safeSelectedRuleIds);
      const markedRuleList = markSelectedRules(normalizedList, safeSelectedRuleIds);
      const ruleListView = markSelectedRules(filterRuleList(normalizedList, nextFilters), safeSelectedRuleIds);
      const visibleRuleAllSelected = ruleListView.length > 0
        && ruleListView.every((item) => selectedRuleIdMap[String(item.id || '')]);
  
      this.setData({
        ruleList: markedRuleList,
        ruleListView,
        selectedRuleIds: safeSelectedRuleIds,
        selectedRuleIdMap,
        visibleRuleAllSelected,
        ruleFilters: nextFilters,
        ruleFilterOptions: filterOptions
      });
    },

    async loadRuleList(options = {}) {
      const request = orgSession.beginRequest(this, 'ruleList');
      const silent = !!options.silent;
      if (!silent) {
        this.setLoading('rules', true);
      }
      try {
        if (!this.data.currentActivityId) {
          this.setRuleListState([], [], emptyRuleFilters());
          return;
        }
  
        const result = await this.callCloud('listRateRules', {
          activityId: this.data.currentActivityId
        });
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status && result.status !== 'success') {
          throw new Error(result.message || '加载评分人类别失败');
        }
        this.setRuleListState(result.rules || [], this.data.selectedRuleIds, this.data.ruleFilters);
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        if (!silent) {
          wx.showToast({
            title: '加载评分人类别失败',
            icon: 'none'
          });
        }
      } finally {
        if (!silent && orgSession.isRequestCurrent(this, request)) {
          this.setLoading('rules', false);
        }
      }
    },

    async reloadRuleListWithRetry(expectedMinimum = 0) {
      const retryDelays = [0, 200, 500];
      for (let i = 0; i < retryDelays.length; i += 1) {
        if (retryDelays[i] > 0) {
          await this.wait(retryDelays[i]);
        }
  
        await this.loadRuleList();
        if ((this.data.ruleList || []).length >= expectedMinimum) {
          return;
        }
      }
    },

    upsertRuleListItem(rule) {
      const item = buildRuleListItem(rule);
      if (!item.id && (!item.scorerDepartment || !item.scorerIdentity)) {
        return;
      }
  
      const selectedRuleIds = this.data.selectedRuleIds || [];
      const nextList = [...(this.data.ruleList || [])];
      const index = nextList.findIndex((current) => (
        (item.id && String(current.id || '') === item.id)
        || (
          String(current.scorerDepartment || '') === item.scorerDepartment
          && String(current.scorerIdentity || '') === item.scorerIdentity
        )
      ));
      if (index >= 0) {
        nextList[index] = {
          ...nextList[index],
          ...item
        };
      } else {
        nextList.push(item);
      }
  
      nextList.sort((a, b) => {
        if (a.scorerDepartment !== b.scorerDepartment) {
          return String(a.scorerDepartment || '').localeCompare(String(b.scorerDepartment || ''), 'zh-CN');
        }
        return String(a.scorerIdentity || '').localeCompare(String(b.scorerIdentity || ''), 'zh-CN');
      });
  
      this.setRuleListState(nextList, selectedRuleIds, this.data.ruleFilters);
    },

    async reloadRuleListAfterSave(savedRule) {
      this.upsertRuleListItem(savedRule);
      const expectedId = String((savedRule && savedRule.id) || '').trim();
      const expectedDepartment = String((savedRule && savedRule.scorerDepartment) || '').trim();
      const expectedIdentity = String((savedRule && savedRule.scorerIdentity) || '').trim();
      const retryDelays = [120, 300, 600];
      for (let i = 0; i < retryDelays.length; i += 1) {
        await this.wait(retryDelays[i]);
        await this.loadRuleList({ silent: true });
        const matched = (this.data.ruleList || []).find((item) => (
          (expectedId && String(item.id || '') === expectedId)
          || (
            String(item.scorerDepartment || '') === expectedDepartment
            && String(item.scorerIdentity || '') === expectedIdentity
          )
        ));
        if (matched && (matched.clauses || []).length) {
          return;
        }
      }
      this.upsertRuleListItem(savedRule);
    },

    onRuleFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value.trim();
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          [field]: value
        }
      });
    },

    onClauseScopeChange(e) {
      const clauseScope = RULE_SCOPE_OPTIONS[e.detail.value].value;
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseScope,
          clauseScopeLabel: RULE_SCOPE_OPTIONS[e.detail.value].label
        }
      });
    },

    openScorerTaskPage() {
      if (!this.data.currentActivityId) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
      wx.navigateTo({
        url: `/subpackages/scoring/pages/scorerTasks/scorerTasks?activityId=${encodeURIComponent(this.data.currentActivityId)}&activityName=${encodeURIComponent(this.data.currentActivityName || '')}`
      });
    },

    onClauseRequireAllCompleteChange(e) {
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseRequireAllComplete: !!e.detail.value
        }
      });
    },

    onAllowSelfAssessmentChange(e) {
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          allowSelfAssessment: !!e.detail.value
        }
      });
    },

    onCalculationMethodChange(e) {
      const methods = ['weighted_average', 'trim_extremes'];
      const method = methods[e.detail.value];
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseCalculationMethod: method
        }
      });
    },

    openNewRuleClauseEditor() {
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseScope: RULE_SCOPE_OPTIONS[0].value,
          clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
          clauseTargetIdentityId: '',
          clauseTargetIdentity: '',
          clauseRequireAllComplete: false,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseTemplateConfigEditingIndex: -1,
          clauseEditingIndex: -1,
          clauseTemplateConfigs: [],
          isRuleClauseEditorVisible: true,
          isTemplateConfigEditorVisible: false
        }
      });
    },

    openTemplateConfigEditor() {
      this.setData({
        clauseTemplateInlineEditIndex: this.data.ruleForm.clauseTemplateConfigs.length,
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseCalculationMethod: 'weighted_average',
          clauseTrimHighCount: 0,
          clauseTrimLowCount: 0,
          clauseTemplateConfigEditingIndex: -1
        }
      });
    },

    startCreateRuleCategory() {
      this.setData({
        ruleForm: emptyRuleForm(),
        draggingClauseTemplateIndex: -1
      });
    },

    onRuleScorerDepartmentChange(e) {
      const index = Number(e.detail.value);
      const departmentObj = this.data.departmentList[index] || {};
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          scorerDepartmentId: departmentObj.id || '',
          scorerDepartment: departmentObj.name || ''
        }
      });
    },

    onRuleScorerIdentityChange(e) {
      const index = Number(e.detail.value);
      const identityObj = this.data.identityList[index] || {};
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          scorerIdentityId: identityObj.id || '',
          scorerIdentity: identityObj.name || ''
        }
      });
    },

    onRuleTargetIdentityChange(e) {
      const index = Number(e.detail.value);
      const identityObj = this.data.identityList[index] || {};
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseTargetIdentityId: identityObj.id || '',
          clauseTargetIdentity: identityObj.name || ''
        }
      });
    },

    onRuleFilterChange(e) {
      const { field } = e.currentTarget.dataset;
      const optionKey = field === 'identity' ? 'identities' : 'departments';
      const options = (this.data.ruleFilterOptions || {})[optionKey] || ['全部'];
      const value = options[Number(e.detail.value)] || '全部';
      const nextFilters = {
        ...(this.data.ruleFilters || emptyRuleFilters()),
        [field]: value
      };
      this.setRuleListState(this.data.ruleList, this.data.selectedRuleIds, nextFilters);
    },

    resetRuleFilters() {
      this.setRuleListState(this.data.ruleList, this.data.selectedRuleIds, emptyRuleFilters());
    },

    toggleRuleSelection(e) {
      const { id } = e.currentTarget.dataset;
      const targetId = String(id || '').trim();
      if (!targetId) {
        return;
      }
  
      const selectedRuleIds = new Set((this.data.selectedRuleIds || []).map((item) => String(item)));
      if (selectedRuleIds.has(targetId)) {
        selectedRuleIds.delete(targetId);
      } else {
        selectedRuleIds.add(targetId);
      }
  
      const nextSelectedRuleIds = [...selectedRuleIds];
      this.setRuleListState(this.data.ruleList, nextSelectedRuleIds, this.data.ruleFilters);
    },

    toggleSelectAllRules() {
      const visibleRuleIds = (this.data.ruleListView || []).map((item) => item.id).filter(Boolean);
      if (!visibleRuleIds.length) {
        return;
      }
  
      const selectedSet = new Set((this.data.selectedRuleIds || []).map((item) => String(item)));
      const isVisibleAllSelected = visibleRuleIds.every((id) => selectedSet.has(String(id)));
      visibleRuleIds.forEach((id) => {
        if (isVisibleAllSelected) {
          selectedSet.delete(String(id));
        } else {
          selectedSet.add(String(id));
        }
      });
      this.setRuleListState(this.data.ruleList, [...selectedSet], this.data.ruleFilters);
    },

    reverseSelectVisibleRules() {
      const visibleRuleIds = (this.data.ruleListView || []).map((item) => item.id).filter(Boolean);
      if (!visibleRuleIds.length) {
        return;
      }
  
      const selectedSet = new Set((this.data.selectedRuleIds || []).map((item) => String(item)));
      visibleRuleIds.forEach((id) => {
        const textId = String(id);
        if (selectedSet.has(textId)) {
          selectedSet.delete(textId);
        } else {
          selectedSet.add(textId);
        }
      });
      this.setRuleListState(this.data.ruleList, [...selectedSet], this.data.ruleFilters);
    },

    async applyClausesToSelectedRules() {
      const selectedRules = (this.data.ruleList || []).filter((item) => (this.data.selectedRuleIds || []).includes(item.id));
      const clauseResult = buildRuleClausesForBatchApply(this.data.ruleForm);
      const clauses = clauseResult.clauses || [];
      const currentActivity = (this.data.activityList || []).find((item) => item.id === this.data.currentActivityId);
  
      if (!this.data.currentActivityId || !currentActivity) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
  
      if (!selectedRules.length) {
        wx.showToast({
          title: '请先勾选需要批量设置的评分人类别',
          icon: 'none'
        });
        return;
      }
  
      if (!clauseResult.ok) {
        wx.showToast({
          title: clauseResult.message || '请先准备好要批量应用的被评分人规则',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('batchSaveRules', true);
      wx.showLoading({ title: '正在批量应用...', mask: true });
      try {
        const savedRules = [];
        for (const rule of selectedRules) {
          const result = await this.callCloud('saveRateRule', {
            id: rule.id,
            activityId: this.data.currentActivityId,
            activityName: currentActivity.name || '',
            scorerDepartmentId: rule.scorerDepartmentId,
            scorerIdentityId: rule.scorerIdentityId,
            clauses,
            mode: 'replace'
          });
  
          if (result.status !== 'success') {
            wx.hideLoading();
            wx.showToast({
              title: result.message || (`批量设置失败：${rule.scorerDepartment}/${rule.scorerIdentity}`),
              icon: 'none'
            });
            this.setLoading('batchSaveRules', false);
            return;
          }
          savedRules.push({
            id: result.id || rule.id,
            activityId: this.data.currentActivityId,
            activityName: currentActivity.name || '',
            scorerDepartmentId: rule.scorerDepartmentId,
            scorerDepartment: rule.scorerDepartment,
            scorerIdentityId: rule.scorerIdentityId,
            scorerIdentity: rule.scorerIdentity,
            clauses
          });
        }
  
        savedRules.forEach((rule) => this.upsertRuleListItem(rule));
        await this.loadRuleList({ silent: true });
        wx.hideLoading();
        wx.showToast({
          title: '批量更新完成',
          icon: 'success'
        });
      } catch (error) {
        wx.hideLoading();
        wx.showToast({
          title: '批量设置规则失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('batchSaveRules', false);
      }
    },

    onRuleTemplateChange(e) {
      const index = Number(e.detail.value);
      const template = this.data.templateList[index];
      if (!template) {
        return;
      }
  
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateId: template.id,
          clauseTemplateName: template.name
        }
      });
    },

    addClauseTemplateConfig() {
    const {
      clauseTemplateId,
      clauseTemplateName,
      clauseTemplateWeight,
      clauseTemplateConfigEditingIndex,
      clauseTemplateConfigs
    } = this.data.ruleForm;
  
      if (!clauseTemplateId) {
        wx.showToast({
          title: '请先选择评分问题',
          icon: 'none'
        });
        return;
      }
  
      const weight = Number(clauseTemplateWeight);
      if (!Number.isFinite(weight) || weight <= 0) {
        wx.showToast({
          title: '评分问题权重必须大于 0',
          icon: 'none'
        });
        return;
      }
  
      const sortOrderValue = clauseTemplateConfigEditingIndex >= 0 && clauseTemplateConfigs[clauseTemplateConfigEditingIndex]
        ? Number(clauseTemplateConfigs[clauseTemplateConfigEditingIndex].sortOrder) || (clauseTemplateConfigEditingIndex + 1)
        : clauseTemplateConfigs.length + 1;
  
      const nextConfig = {
        templateId: clauseTemplateId,
        templateName: clauseTemplateName,
        weight: String(weight),
        sortOrder: String(sortOrderValue),
        calculationMethod: this.data.ruleForm.clauseCalculationMethod || 'weighted_average',
        trimHighCount: Number(this.data.ruleForm.clauseTrimHighCount || 0),
        trimLowCount: Number(this.data.ruleForm.clauseTrimLowCount || 0)
      };
  
      const exists = clauseTemplateConfigs.some((item, index) => (
        index !== clauseTemplateConfigEditingIndex &&
        item.templateId === nextConfig.templateId
      ));
  
      if (exists) {
        wx.showToast({
          title: '这个评分问题已在当前规则中',
          icon: 'none'
        });
        return;
      }
  
      const nextConfigs = [...clauseTemplateConfigs];
      if (clauseTemplateConfigEditingIndex >= 0 && nextConfigs[clauseTemplateConfigEditingIndex]) {
        nextConfigs[clauseTemplateConfigEditingIndex] = nextConfig;
      } else {
        nextConfigs.push(nextConfig);
      }
  
      nextConfigs.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
      const normalizedNextConfigs = refreshTemplateConfigSortOrder(nextConfigs);
  
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateConfigs: normalizedNextConfigs,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseTemplateConfigEditingIndex: -1,
          isTemplateConfigEditorVisible: false
        }
      });
    },

    editClauseTemplateConfig(e) {
      const index = Number(e.currentTarget.dataset.index);
      const targetConfig = this.data.ruleForm.clauseTemplateConfigs[index];
      if (!targetConfig) {
        return;
      }
  
      this.setData({
        clauseTemplateInlineEditIndex: index,
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateId: targetConfig.templateId || '',
          clauseTemplateName: targetConfig.templateName || '',
          clauseTemplateWeight: String(targetConfig.weight || '1'),
          clauseTemplateOrder: String(targetConfig.sortOrder || ''),
          clauseCalculationMethod: targetConfig.calculationMethod || 'weighted_average',
          clauseTrimHighCount: Number(targetConfig.trimHighCount || 0),
          clauseTrimLowCount: Number(targetConfig.trimLowCount || 0),
          clauseTemplateConfigEditingIndex: index
        }
      });
    },

    removeClauseTemplateConfig(e) {
      const index = Number(e.currentTarget.dataset.index);
      const nextConfigs = this.data.ruleForm.clauseTemplateConfigs.filter((_, configIndex) => configIndex !== index);
      const nextEditingIndex = this.data.ruleForm.clauseTemplateConfigEditingIndex === index
        ? -1
        : (this.data.ruleForm.clauseTemplateConfigEditingIndex > index
          ? this.data.ruleForm.clauseTemplateConfigEditingIndex - 1
          : this.data.ruleForm.clauseTemplateConfigEditingIndex);
  
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateConfigs: refreshTemplateConfigSortOrder(nextConfigs),
          clauseTemplateConfigEditingIndex: nextEditingIndex,
        }
      });
    },

    moveClauseTemplateConfigUp(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (Number.isNaN(index) || index <= 0) return;
      const configs = refreshTemplateConfigSortOrder(
        moveItem(this.data.ruleForm.clauseTemplateConfigs, index, index - 1)
      );
      this.setData({
        ruleForm: { ...this.data.ruleForm, clauseTemplateConfigs: configs }
      });
    },

    moveClauseTemplateConfigDown(e) {
      const index = Number(e.currentTarget.dataset.index);
      const configs = this.data.ruleForm.clauseTemplateConfigs;
      if (Number.isNaN(index) || index >= configs.length - 1) return;
      const nextConfigs = refreshTemplateConfigSortOrder(
        moveItem(configs, index, index + 1)
      );
      this.setData({
        ruleForm: { ...this.data.ruleForm, clauseTemplateConfigs: nextConfigs }
      });
    },

    saveClauseTemplateConfigInline() {
      const {
        clauseTemplateId,
        clauseTemplateName,
        clauseTemplateWeight,
        clauseTemplateConfigs
      } = this.data.ruleForm;
      const editIndex = this.data.clauseTemplateInlineEditIndex;
  
      if (!clauseTemplateId) {
        wx.showToast({ title: '请先选择评分问题', icon: 'none' });
        return;
      }
  
      const weight = Number(clauseTemplateWeight);
      if (!Number.isFinite(weight) || weight <= 0) {
        wx.showToast({ title: '评分问题权重必须大于 0', icon: 'none' });
        return;
      }
  
      const isAdd = editIndex >= clauseTemplateConfigs.length;
      const sortOrderValue = isAdd
        ? clauseTemplateConfigs.length + 1
        : Number(clauseTemplateConfigs[editIndex].sortOrder) || (editIndex + 1);
  
      const nextConfig = {
        templateId: clauseTemplateId,
        templateName: clauseTemplateName,
        weight: String(weight),
        sortOrder: String(sortOrderValue),
        calculationMethod: this.data.ruleForm.clauseCalculationMethod || 'weighted_average',
        trimHighCount: Number(this.data.ruleForm.clauseTrimHighCount || 0),
        trimLowCount: Number(this.data.ruleForm.clauseTrimLowCount || 0)
      };
  
      const exists = clauseTemplateConfigs.some((item, idx) => (
        idx !== editIndex && item.templateId === nextConfig.templateId
      ));
  
      if (exists) {
        wx.showToast({ title: '这个评分问题已在当前规则中', icon: 'none' });
        return;
      }
  
      const nextConfigs = [...clauseTemplateConfigs];
      if (isAdd) {
        nextConfigs.push(nextConfig);
      } else {
        nextConfigs[editIndex] = nextConfig;
      }
  
      nextConfigs.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
      const normalizedNextConfigs = refreshTemplateConfigSortOrder(nextConfigs);
  
      this.setData({
        clauseTemplateInlineEditIndex: -1,
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateConfigs: normalizedNextConfigs,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseTemplateConfigEditingIndex: -1
        }
      });
    },

    cancelClauseTemplateConfigInline() {
      this.setData({
        clauseTemplateInlineEditIndex: -1,
        ruleForm: {
          ...this.data.ruleForm,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseCalculationMethod: 'weighted_average',
          clauseTrimHighCount: 0,
          clauseTrimLowCount: 0,
          clauseTemplateConfigEditingIndex: -1
        }
      });
    },

    cancelClauseTemplateConfigEdit() {
      this.cancelClauseTemplateConfigInline();
    },

    addRuleClause() {
      const {
        clauseScope,
        clauseTargetIdentityId,
        clauseTargetIdentity,
        clauseRequireAllComplete,
        clauseEditingIndex,
        clauseTemplateConfigs,
        clauses
      } = this.data.ruleForm;
      if (clauseScope !== 'all_people' && !clauseTargetIdentityId && clauseScope.indexOf('_all') === -1) {
        wx.showToast({
          title: '请填写被评分人身份',
          icon: 'none'
        });
        return;
      }
  
      const nextClause = {
        scopeType: clauseScope,
        scopeLabel: getScopeLabel(clauseScope),
        targetIdentityId: clauseTargetIdentityId,
        targetIdentity: clauseTargetIdentity,
        requireAllComplete: !!clauseRequireAllComplete,
        templateConfigs: [...clauseTemplateConfigs].sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
      };
  
      const exists = clauses.some((item, index) => (
        index !== clauseEditingIndex &&
        item.scopeType === nextClause.scopeType &&
        item.targetIdentityId === nextClause.targetIdentityId &&
        JSON.stringify(item.templateConfigs || []) === JSON.stringify(nextClause.templateConfigs)
      ));
  
      if (exists) {
        wx.showToast({
          title: '被评分人规则已存在',
          icon: 'none'
        });
        return;
      }
  
      const nextClauses = [...clauses];
      if (clauseEditingIndex >= 0 && nextClauses[clauseEditingIndex]) {
        nextClauses[clauseEditingIndex] = nextClause;
      } else {
        nextClauses.push(nextClause);
      }
  
      this.setData({
        clauseTemplateInlineEditIndex: -1,
        ruleForm: {
          ...this.data.ruleForm,
          clauses: nextClauses,
          clauseScope: RULE_SCOPE_OPTIONS[0].value,
          clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
          clauseTargetIdentityId: '',
          clauseTargetIdentity: '',
          clauseRequireAllComplete: false,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseTemplateConfigEditingIndex: -1,
          clauseEditingIndex: -1,
          clauseTemplateConfigs: [],
          isRuleClauseEditorVisible: false,
          isTemplateConfigEditorVisible: false
        }
      });
    },

    removeRuleClause(e) {
      const index = Number(e.currentTarget.dataset.index);
      const nextClauses = this.data.ruleForm.clauses.filter((_, clauseIndex) => clauseIndex !== index);
      const nextEditingIndex = this.data.ruleForm.clauseEditingIndex === index
        ? -1
        : (this.data.ruleForm.clauseEditingIndex > index
          ? this.data.ruleForm.clauseEditingIndex - 1
          : this.data.ruleForm.clauseEditingIndex);
  
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauses: nextClauses,
          clauseTemplateConfigs: this.data.ruleForm.clauseEditingIndex === index ? [] : this.data.ruleForm.clauseTemplateConfigs,
          clauseTemplateId: this.data.ruleForm.clauseEditingIndex === index ? '' : this.data.ruleForm.clauseTemplateId,
          clauseTemplateName: this.data.ruleForm.clauseEditingIndex === index ? '' : this.data.ruleForm.clauseTemplateName,
          clauseTemplateWeight: this.data.ruleForm.clauseEditingIndex === index ? '1' : this.data.ruleForm.clauseTemplateWeight,
          clauseTemplateOrder: this.data.ruleForm.clauseEditingIndex === index ? '' : this.data.ruleForm.clauseTemplateOrder,
          clauseTemplateConfigEditingIndex: this.data.ruleForm.clauseEditingIndex === index ? -1 : this.data.ruleForm.clauseTemplateConfigEditingIndex,
          clauseEditingIndex: nextEditingIndex,
          isRuleClauseEditorVisible: nextEditingIndex >= 0,
          isTemplateConfigEditorVisible: this.data.ruleForm.clauseEditingIndex === index ? false : this.data.ruleForm.isTemplateConfigEditorVisible
        }
      });
    },

    editRuleClause(e) {
      const index = Number(e.currentTarget.dataset.index);
      const targetClause = this.data.ruleForm.clauses[index];
      if (!targetClause) {
        return;
      }
  
      this.setData({
        ruleForm: {
          ...this.data.ruleForm,
          clauseScope: targetClause.scopeType || RULE_SCOPE_OPTIONS[0].value,
          clauseScopeLabel: getScopeLabel(targetClause.scopeType),
          clauseTargetIdentityId: targetClause.targetIdentityId || '',
          clauseTargetIdentity: targetClause.targetIdentity || '',
          clauseRequireAllComplete: targetClause.requireAllComplete === true,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseTemplateConfigEditingIndex: -1,
          clauseTemplateConfigs: refreshTemplateConfigSortOrder(normalizeClauseForEdit(targetClause).templateConfigs),
          clauseEditingIndex: index,
          isRuleClauseEditorVisible: true,
          isTemplateConfigEditorVisible: false
        }
      });
    },

    cancelRuleClauseEdit() {
      this.setData({
        clauseTemplateInlineEditIndex: -1,
        ruleForm: {
          ...this.data.ruleForm,
          clauseScope: RULE_SCOPE_OPTIONS[0].value,
          clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
          clauseTargetIdentityId: '',
          clauseTargetIdentity: '',
          clauseRequireAllComplete: false,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseTemplateConfigEditingIndex: -1,
          clauseTemplateConfigs: [],
          clauseEditingIndex: -1,
          isRuleClauseEditorVisible: false,
          isTemplateConfigEditorVisible: false
        }
      });
    },

    editRule(e) {
      const { id, index } = e.currentTarget.dataset;
      const targetId = String(id || '').trim();
      const target = targetId
        ? (this.data.ruleList || []).find((item) => String(item.id || '') === targetId)
        : this.data.ruleList[Number(index)];
      if (!target) {
        return;
      }
  
      this.setData({
        ruleForm: {
          id: target.id,
          scorerDepartmentId: target.scorerDepartmentId || '',
          scorerDepartment: target.scorerDepartment || '',
          scorerIdentityId: target.scorerIdentityId || '',
          scorerIdentity: target.scorerIdentity || '',
          allowSelfAssessment: target.allowSelfAssessment !== false,
          clauseScope: RULE_SCOPE_OPTIONS[0].value,
          clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
          clauseTargetIdentity: '',
          clauseRequireAllComplete: false,
          clauseTemplateId: '',
          clauseTemplateName: '',
          clauseTemplateWeight: '1',
          clauseTemplateOrder: '',
          clauseCalculationMethod: 'weighted_average',
          clauseTrimHighCount: 0,
          clauseTrimLowCount: 0,
          clauseTemplateConfigEditingIndex: -1,
          clauseEditingIndex: -1,
          isRuleClauseEditorVisible: false,
          isTemplateConfigEditorVisible: false,
          clauseTemplateConfigs: [],
          clauses: (target.clauses || []).map((item) => normalizeClauseForEdit(item))
        },
        activeTab: 'rules'
      });
    },

    async saveRuleCategory() {
      const { id, scorerDepartmentId, scorerDepartment, scorerIdentityId, scorerIdentity } = this.data.ruleForm;
      const clauseResult = buildRuleClausesForSave(this.data.ruleForm);
      const clauses = clauseResult.clauses || [];
      const currentActivity = (this.data.activityList || []).find((item) => item.id === this.data.currentActivityId);
      if (!this.data.currentActivityId || !currentActivity) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
  
      if (!scorerDepartmentId || !scorerIdentityId) {
        wx.showToast({
          title: '请填写完整的评分人类别',
          icon: 'none'
        });
        return;
      }
  
      if (!clauseResult.ok) {
        wx.showToast({
          title: clauseResult.message || '请先添加被评分人规则',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveRule', true);
      try {
        const result = await this.callCloud('saveRateRule', {
          id,
          activityId: this.data.currentActivityId,
          activityName: currentActivity.name || '',
          scorerDepartmentId,
          scorerIdentityId,
          allowSelfAssessment: this.data.ruleForm.allowSelfAssessment,
          clauses
        });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '保存评分人类别失败',
            icon: 'none'
          });
          return;
        }
  
        await this.reloadRuleListAfterSave(result.rule || {
          id: result.id || id,
          activityId: this.data.currentActivityId,
          activityName: currentActivity.name || '',
          scorerDepartmentId,
          scorerIdentityId,
          clauses
        });
        this.setData({ ruleForm: emptyRuleForm() });
        wx.showToast({
          title: '类别已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存评分人类别失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('saveRule', false);
      }
    },

    async generateRuleCategories() {
      if (!this.data.currentActivityId) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('generateRules', true);
      try {
        const result = await this.callCloud('generateRateTargetRules', {
          activityId: this.data.currentActivityId
        });
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '生成默认评分人类别失败',
            icon: 'none'
          });
          return;
        }
  
        await this.reloadRuleListWithRetry(result.ruleCount || 0);
        wx.showToast({
          title: result.ruleCount ? '默认评分人类别已生成' : '没有可生成的评分人类别',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '生成默认评分人类别失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('generateRules', false);
      }
    },

    async generateRuleCategoriesSafe() {
      if (!this.data.currentActivityId) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('generateRules', true);
      let result = null;
      try {
        result = await this.callCloud('generateRateTargetRules', {
          activityId: this.data.currentActivityId
        });
  
        if (!result || result.status !== 'success') {
          wx.showToast({
            title: (result && result.message) || '生成默认评分人类别失败',
            icon: 'none'
          });
          return;
        }
  
        for (const delay of [0, 200, 500]) {
          if (delay > 0) {
            await this.wait(delay);
          }
          try {
            const listResult = await this.callCloud('listRateRules', {
              activityId: this.data.currentActivityId
            });
            this.setRuleListState(listResult.rules || [], this.data.selectedRuleIds, this.data.ruleFilters);
            break;
          } catch (refreshError) {}
        }
  
        wx.showToast({
          title: '默认评分人类别已生成',
          icon: 'success'
        });
        return;
      } catch (error) {
        if (result && result.status === 'success') {
          wx.showToast({
            title: '默认评分人类别已生成',
            icon: 'success'
          });
          return;
        }
  
        wx.showToast({
          title: '生成默认评分人类别失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('generateRules', false);
      }
    },

    async generateRuleCategoriesFinal() {
      if (!this.data.currentActivityId) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('generateRules', true);
      wx.showLoading({ title: '正在生成默认类别...', mask: true });
      let result = null;
      try {
        result = await this.callCloud('generateRateTargetRules', {
          activityId: this.data.currentActivityId
        });
      } catch (error) {
        wx.hideLoading();
        wx.showToast({
          title: '生成默认评分人类别失败',
          icon: 'none'
        });
        this.setLoading('generateRules', false);
        return;
      }
  
      if (!result || result.status !== 'success') {
        wx.hideLoading();
        wx.showToast({
          title: (result && result.message) || '生成默认评分人类别失败',
          icon: 'none'
        });
        this.setLoading('generateRules', false);
        return;
      }
  
      for (const delay of [0, 200, 500]) {
        if (delay > 0) {
          await this.wait(delay);
        }
  
        try {
          const listResult = await this.callCloud('listRateRules', {
            activityId: this.data.currentActivityId
          });
          this.setRuleListState(listResult.rules || [], this.data.selectedRuleIds, this.data.ruleFilters);
          break;
        } catch (refreshError) {}
      }
  
      wx.hideLoading();
      this.setLoading('generateRules', false);
      wx.showToast({
        title: `已生成 ${result.ruleCount || 0} 类评分人`,
        icon: 'none',
        duration: 2000
      });
    },

    async saveRule() {
      const { id, scorerDepartmentId, scorerDepartment, scorerIdentityId, scorerIdentity, clauses } = this.data.ruleForm;
      const currentActivity = (this.data.activityList || []).find((item) => item.id === this.data.currentActivityId);
      if (!this.data.currentActivityId || !currentActivity) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
      if (!scorerDepartmentId || !scorerIdentityId) {
        wx.showToast({
          title: '请填写完整评分人类别',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveRule', true);
      try {
        const result = await this.callCloud('saveRateRule', {
          id,
          activityId: this.data.currentActivityId,
          activityName: currentActivity.name || '',
          scorerDepartmentId,
          scorerIdentityId,
          allowSelfAssessment: this.data.ruleForm.allowSelfAssessment,
          clauses
        });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '保存失败',
            icon: 'none'
          });
          return;
        }
  
        this.setData({ ruleForm: emptyRuleForm() });
        await this.loadRuleList();
        wx.showToast({
          title: '类别已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存评分人类别失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('saveRule', false);
      }
    },

    deleteRule(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除评分人类别',
        content: '确认删除这条评分人类别吗？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          try {
            await this.callCloud('deleteRateRule', { id });
            await this.loadRuleList();
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      });
    },

    async generateDefaultRules() {
      if (!this.data.currentActivityId) {
        wx.showToast({
          title: '请先设置当前评分活动',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('generateRules', true);
      try {
        const result = await this.callCloud('generateRateTargetRules', {
          activityId: this.data.currentActivityId
        });
        wx.showToast({
          title: result.ruleCount ? '默认评分人类别已生成' : '没有可生成的评分人类别',
          icon: 'none'
        });
        await this.loadRuleList();
      } catch (error) {
        wx.showToast({
          title: '生成默认评分人类别失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('generateRules', false);
      }
    }
  }
});
