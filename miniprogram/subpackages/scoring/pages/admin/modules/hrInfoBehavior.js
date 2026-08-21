const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/hrInfoBehavior');
const { format: localeFormat } = require('../../../../../locales/runtime');
// Behavior: hrInfo tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const personnelViewModel = require('./personnelViewModel');
const { PROFILE_EDIT_MODE_OPTIONS, PROFILE_FIELD_TYPE_OPTIONS, NUMBER_RULE_OPTIONS, emptyHrForm, emptyHrProfileTemplateForm, emptyHrProfileFilters, createEmptyProfileField, normalizeHrProfileFieldForForm, applyHrProfileFilters, buildCsvColumnMapping, refreshCsvMappingOptions, showShortToast, buildHrProfileFilterOptions, validateProfileField, buildFieldHint } = utils;
const { chooseTableFile, buildCsv, saveAndShareFile } = require('../../../../../utils/tableFile');
const orgSession = require('../../../../../utils/orgSession');

function toHrProfileListRow(item) {
  return {
    id: item.id,
    name: item.name,
    studentId: item.studentId,
    wxBindStatus: item.wxBindStatus,
    auditStatus: item.auditStatus,
    auditStatusText: item.auditStatusText,
    assignmentCount: item.assignmentCount,
    hasPending: item.hasPending,
    selected: Boolean(item.selected),
    personId: item.personId || '',
    organizationId: item.organizationId || '',
    accountId: item.accountId || '',
    auth: item.auth || null,
    governanceAvailable: Boolean(item.governanceAvailable),
    accountState: item.accountState || 'unbound',
    accountStateText: item.accountStateText || localeCopy.copy_ba9b0425fd,
    accountStateClass: item.accountStateClass || 'unbound-chip',
    verificationText: item.verificationText || '',
    recoveryText: item.recoveryText || '',
    showVerificationStatus: Boolean(item.showVerificationStatus),
    canIssueVerification: Boolean(item.canIssueVerification),
    canRevokeVerification: Boolean(item.canRevokeVerification),
    canIssueRecovery: Boolean(item.canIssueRecovery),
    canRevokeRecovery: Boolean(item.canRevokeRecovery),
    canUnbindWechat: Boolean(item.canUnbindWechat),
    canSelectForAuth: Boolean(item.canSelectForAuth),
    hasAssignments: Number(item.assignmentCount || 0) > 0
  };
}

module.exports = Behavior({
  methods: {
    async loadHrList() {
      const request = orgSession.beginRequest(this, 'hrList');
      this.setLoading('hr', true);
      try {
        const result = await this.callCloud('listHrInfo');
        if (!orgSession.isRequestCurrent(this, request)) return;
        const hrList = result.list || [];
        this.setData({ hrList });
        this.refreshAdminCandidates(this.data.adminCandidateKeyword);
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        wx.showToast({
          title: localeCopy.copy_838181f305,
          icon: 'none'
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('hr', false);
      }
    },

    async batchMaintainFromHrInfo() {
      this.setLoading('batchMaintain', true);
      try {
        const result = await this.callCloud('batchMaintainFromHrInfo');
        
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.integrityCheckFailed,
            icon: 'none'
          });
          return;
        }
  
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        await this.loadIdentityList();
        this.updateHrFormOptions();
        
        wx.showToast({
          title: localeCopy.integrityCheckCompleted,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.integrityCheckFailed,
          icon: 'none'
        });
      } finally {
        this.setLoading('batchMaintain', false);
      }
    },

    async loadFormerHrMembers() {
      if (!this.data.canManageHrPeople || this.data.loadingFormerHrMembers) return;
      this.setData({ loadingFormerHrMembers: true });
      try {
        const result = await this.callCloud('listFormerHrMembers', {
          organizationId: this.data.currentOrganizationId || wx.getStorageSync('activeOrgId') || ''
        });
        if (!result || result.status !== 'success') {
          wx.showToast({ title: result && result.message || localeCopy.formerMembersLoadFailed, icon: 'none' });
          return;
        }
        this.setData({ formerHrMembers: result.list || [] });
      } catch (error) {
        wx.showToast({ title: localeCopy.formerMembersLoadFailed, icon: 'none' });
      } finally {
        this.setData({ loadingFormerHrMembers: false });
      }
    },

    async reactivateHrMembership(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      if (!hrId || !this.data.canManageHrPeople) return;
      this.setData({ reactivatingHrId: hrId });
      try {
        const result = await this.callCloud('reactivateHrMembership', {
          hrId,
          organizationId: this.data.currentOrganizationId || wx.getStorageSync('activeOrgId') || ''
        });
        if (!result || result.status !== 'success') {
          wx.showToast({ title: result && result.message || localeCopy.membershipReactivateFailed, icon: 'none' });
          return;
        }
        await Promise.all([this.loadFormerHrMembers(), this.loadHrList(), this.loadHrProfileAdminData()]);
        wx.showToast({ title: localeCopy.membershipReactivated, icon: 'success' });
      } catch (error) {
        wx.showToast({ title: localeCopy.membershipReactivateFailed, icon: 'none' });
      } finally {
        this.setData({ reactivatingHrId: '' });
      }
    },

    checkHrDictionaryIntegrity() {
      return this.batchMaintainFromHrInfo();
    },

    async loadHrProfileAdminData() {
      const request = orgSession.beginRequest(this, 'hrProfileAdmin');
      this.setLoading('profile', true);
      try {
        // 账号治理信息是成员资料的增强数据，不能因其暂时不可用而清空整个人事目录。
        // 两个请求仍并行发起，但分别结算，避免认证服务故障被误报为“模板加载失败”。
        const governanceLoad = this.data.canVerifyIdentity || this.data.canRecoverAccounts || this.data.canGlobalAccountManage
          ? this.loadHrGovernanceRows().then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }))
          : Promise.resolve({ ok: true, value: new Map() });
        const result = await this.callCloud('listHrProfileAdminData');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_530e6c15c0,
            icon: 'none'
          });
          return;
        }

        const governanceResult = await governanceLoad;
        if (!orgSession.isRequestCurrent(this, request)) return;
        const governanceByHrId = governanceResult.ok ? governanceResult.value : new Map();
        const governanceUnavailable = !governanceResult.ok
          && !(governanceResult.error && governanceResult.error.silent);
  
        const template = result.template || null;
        const rawRows = this.mergeHrGovernanceRows(result.rows || [], governanceByHrId);
        const hrProfileFields = template && Array.isArray(template.fields) ? template.fields : [];
        const hrProfileFilterOptions = buildHrProfileFilterOptions(rawRows);
        // Cascade work group options based on current department filter
        if (this.data.hrProfileFilters.department === localeCopy.copy_68f7277730) {
          hrProfileFilterOptions.workGroups = [localeCopy.copy_54e953f1bb];
        } else {
          const dept = this.data.departmentList.find(d => d.name === this.data.hrProfileFilters.department) || {};
          const wgs = this.data.workGroupList
            .filter(w => w.departmentId === dept.id)
            .map(w => w.name);
          hrProfileFilterOptions.workGroups = [localeCopy.copy_54e953f1bb, ...wgs];
        }
        const filteredRows = applyHrProfileFilters(rawRows, this.data.hrProfileFilters);
        const actionState = this.buildHrMemberActionState(filteredRows);
        const selected = new Set(actionState.selectedHrMemberIds);
        const synchronizedRows = filteredRows.map((item) => Object.assign({}, item, {
          selected: selected.has(String(item.id || ''))
        }));
        // 完整资料仅留在逻辑层供筛选和导出，视图层只接收列表真正需要的摘要字段。
        this._hrProfileRawRows = rawRows.map((item) => Object.assign({}, item, {
          selected: selected.has(String(item.id || ''))
        }));
        this._hrProfileFilteredRows = synchronizedRows;
        this.setData(Object.assign({
          hrProfileTemplateForm: template ? {
            description: template.description || '',
            editMode: template.editMode || PROFILE_EDIT_MODE_OPTIONS[0].value,
            editModeLabel: (PROFILE_EDIT_MODE_OPTIONS.find((item) => item.value === (template.editMode || PROFILE_EDIT_MODE_OPTIONS[0].value)) || PROFILE_EDIT_MODE_OPTIONS[0]).label,
            fields: Array.isArray(template.fields) && template.fields.length
              ? template.fields.map((item) => normalizeHrProfileFieldForForm(item))
              : [createEmptyProfileField()]
          } : emptyHrProfileTemplateForm(),
          hrProfileFields,
          hrProfileFilterOptions,
          hrProfileRows: synchronizedRows.map(toHrProfileListRow),
          hrGovernanceUnavailable: governanceUnavailable
        }, actionState));
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        console.error('[HR] Member directory load failed', error);
        wx.showToast({
          title: localeCopy.copy_530e6c15c0,
          icon: 'none'
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('profile', false);
      }
    },

    async loadHrGovernanceDirectory() {
      const request = orgSession.beginRequest(this, 'hrGovernanceDirectory');
      this.setLoading('profile', true);
      try {
        const governanceByHrId = await this.loadHrGovernanceRows();
        if (!orgSession.isRequestCurrent(this, request)) return;
        const rows = Array.from(governanceByHrId.values()).map((item) => this.applyHrGovernancePermissions(Object.assign({}, item, {
          id: item.hrId || item.id,
          departments: item.department ? [item.department] : [],
          identities: item.identity ? [item.identity] : [],
          workGroups: item.workGroup ? [item.workGroup] : [],
          assignmentCount: item.department || item.identity || item.workGroup ? 1 : 0,
          auditStatus: '',
          auditStatusText: '',
          hasPending: false,
          wxBindStatus: item.auth && item.auth.hasActiveBinding ? 'bound' : 'unbound'
        })));
        const options = buildHrProfileFilterOptions(rows);
        const filteredRows = applyHrProfileFilters(rows, this.data.hrProfileFilters);
        const actionState = this.buildHrMemberActionState(filteredRows);
        const selected = new Set(actionState.selectedHrMemberIds);
        const synchronizedRows = filteredRows.map((item) => Object.assign({}, item, {
          selected: selected.has(String(item.id || ''))
        }));
        this._hrProfileRawRows = rows.map((item) => Object.assign({}, item, {
          selected: selected.has(String(item.id || ''))
        }));
        this._hrProfileFilteredRows = synchronizedRows;
        this.setData(Object.assign({
          hrProfileFields: [],
          hrProfileFilterOptions: options,
          hrProfileRows: synchronizedRows.map(toHrProfileListRow),
          hrGovernanceUnavailable: false
        }, actionState));
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || error && error.silent) return;
        wx.showToast({ title: localeCopy.copy_e58fa637eb, icon: 'none' });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('profile', false);
      }
    },

    async loadHrProfileTemplates() {
      if (!this.data.canManageHrProfileTemplates && !this.data.canSelectHrProfileTemplate) return;
      this.setLoading('hrProfileTemplates', true);
      try {
        const result = await this.callCloud('listHrProfileTemplates');
        if (result.status !== 'success') {
          showShortToast(localeCopy.copy_e52119b17e);
          return;
        }
        const active = result.activeSnapshot || null;
        if (active && Array.isArray(active.fields)) {
          active.fields = active.fields.map((field) => {
            const typeOption = PROFILE_FIELD_TYPE_OPTIONS.find((item) => item.value === field.type);
            let ruleText = '';
            if (field.type === 'text' && (field.minLength != null || field.maxLength != null)) {
              ruleText = localeFormat(localeCopy.copy_d631c78751, [field.minLength == null ? localeCopy.copy_62676bc383 : field.minLength, field.maxLength == null ? localeCopy.copy_62676bc383 : field.maxLength]);
            } else if (field.type === 'number') {
              if (field.numberRule === 'length_range') {
                ruleText = localeFormat(localeCopy.copy_bfcf17946a, [field.minDigits == null ? localeCopy.copy_62676bc383 : field.minDigits, field.maxDigits == null ? localeCopy.copy_62676bc383 : field.maxDigits]);
              } else if (field.minValue != null || field.maxValue != null) {
                ruleText = localeFormat(localeCopy.copy_9e71d66edf, [field.minValue == null ? localeCopy.copy_62676bc383 : field.minValue, field.maxValue == null ? localeCopy.copy_62676bc383 : field.maxValue]);
              }
              if (field.allowDecimal === false) ruleText = localeFormat(localeCopy.copy_d593ce302d, [ruleText ? `${ruleText} · ` : '']);
            } else if (field.type === 'sequence') {
              ruleText = (field.options || []).length ? localeFormat(localeCopy.copy_d789c23297, [field.options.join(' / ')]) : localeCopy.copy_266af79ece;
            }
            return Object.assign({}, field, {
              typeLabel: typeOption ? typeOption.label : field.type,
              ruleText
            });
          });
        }
        this.setData({
          hrProfileTemplateList: result.list || [],
          activeHrProfileSnapshot: active,
          canManageHrProfileTemplates: result.canManage === true,
          canSelectHrProfileTemplate: result.canSelect === true
        });
      } catch (_) {
        showShortToast(localeCopy.copy_e52119b17e);
      } finally {
        this.setLoading('hrProfileTemplates', false);
      }
    },

    startCreateHrProfileTemplate() {
      this.setData({
        hrProfileTemplateForm: emptyHrProfileTemplateForm(),
        showHrTemplateEditor: true
      });
    },

    editHrProfileTemplate(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const template = (this.data.hrProfileTemplateList || []).find((item) => item.id === id);
      if (!template) return;
      const modeOption = PROFILE_EDIT_MODE_OPTIONS.find((item) => item.value === template.editMode) || PROFILE_EDIT_MODE_OPTIONS[0];
      this.setData({
        hrProfileTemplateForm: {
          id: template.id,
          name: template.name || '',
          description: template.description || '',
          editMode: modeOption.value,
          editModeLabel: modeOption.label,
          fields: (template.fields || []).map((field) => normalizeHrProfileFieldForForm(field))
        },
        showHrTemplateEditor: true
      });
    },

    cancelHrProfileTemplateEditor() {
      this.setData({ showHrTemplateEditor: false, hrProfileTemplateForm: emptyHrProfileTemplateForm() });
    },

    async duplicateHrProfileTemplate(e) {
      const id = String(e.currentTarget.dataset.id || '');
      if (!id) return;
      this.setLoading('duplicateHrProfileTemplate', true);
      try {
        const result = await this.callCloud('duplicateHrProfileTemplateDefinition', { id });
        if (result.status !== 'success') return showShortToast(localeCopy.copy_b433d31323);
        await this.loadHrProfileTemplates();
        showShortToast(localeCopy.copy_cc6172e63c, 'success');
      } catch (_) {
        showShortToast(localeCopy.copy_b433d31323);
      } finally {
        this.setLoading('duplicateHrProfileTemplate', false);
      }
    },

    deleteHrProfileTemplate(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const template = (this.data.hrProfileTemplateList || []).find((item) => item.id === id);
      if (!template) return;
      wx.showModal({
        title: localeCopy.copy_f81d32f71f,
        content: localeCopy.copy_6fae2b39f0,
        confirmText: localeCopy.copy_7310bccaf5,
        confirmColor: '#ef4444',
        success: async (modalResult) => {
          if (!modalResult.confirm) return;
          try {
            const result = await this.callCloud('deleteHrProfileTemplateDefinition', { id });
            if (result.status !== 'success') return showShortToast(localeCopy.copy_076bb5d383);
            await this.loadHrProfileTemplates();
            showShortToast(localeCopy.copy_5398fec054, 'success');
          } catch (_) {
            showShortToast(localeCopy.copy_076bb5d383);
          }
        }
      });
    },

    async startHrProfileTemplateSwitch(e) {
      const targetTemplateId = String(e.currentTarget.dataset.id || '');
      if (!targetTemplateId) return;
      this.setLoading('hrTemplateSwitch', true);
      try {
        const result = await this.callCloud('getHrProfileTemplateSwitchContext', { targetTemplateId });
        if (result.status !== 'success') return showShortToast(localeCopy.copy_e52119b17e);
        const targetFields = (result.targetTemplate && result.targetTemplate.fields) || [];
        const sources = (result.sourceFields || []).map((source) => {
          const targetOptions = [{ id: '', label: localeCopy.copy_e6b5e03497 }]
            .concat(targetFields.filter((target) => (source.compatibleTargetIds || []).indexOf(target.id) >= 0));
          return Object.assign({}, source, {
            action: 'hide',
            actionIndex: 0,
            targetTemplateFieldId: '',
            targetIndex: 0,
            targetOptions,
            suggestionText: source.suggestedTargetId
              ? localeFormat(localeCopy.copy_209c97537d, [(targetFields.find((field) => field.id === source.suggestedTargetId) || {}).label || ''])
              : ''
          });
        });
        this.setData({
          hrTemplateSwitchVisible: true,
          hrTemplateSwitchTarget: result.targetTemplate,
          hrTemplateSwitchSources: sources,
          hrTemplateSwitchToken: '',
          hrTemplateSwitchSummary: null
        });
      } catch (_) {
        showShortToast(localeCopy.copy_e52119b17e);
      } finally {
        this.setLoading('hrTemplateSwitch', false);
      }
    },

    closeHrProfileTemplateSwitch() {
      this.setData({
        hrTemplateSwitchVisible: false,
        hrTemplateSwitchTarget: null,
        hrTemplateSwitchSources: [],
        hrTemplateSwitchToken: '',
        hrTemplateSwitchSummary: null
      });
    },

    onHrTemplateSwitchActionChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const actionIndex = Number(e.detail.value);
      const action = ['hide', 'map', 'delete'][actionIndex] || 'hide';
      const sources = [...(this.data.hrTemplateSwitchSources || [])];
      if (!sources[index]) return;
      sources[index] = Object.assign({}, sources[index], {
        action,
        actionIndex,
        targetTemplateFieldId: action === 'map' ? sources[index].targetTemplateFieldId : '',
        targetIndex: action === 'map' ? sources[index].targetIndex : 0
      });
      this.setData({ hrTemplateSwitchSources: sources, hrTemplateSwitchToken: '', hrTemplateSwitchSummary: null });
    },

    onHrTemplateSwitchTargetChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const targetIndex = Number(e.detail.value);
      const sources = [...(this.data.hrTemplateSwitchSources || [])];
      if (!sources[index]) return;
      const target = sources[index].targetOptions[targetIndex] || sources[index].targetOptions[0];
      sources[index] = Object.assign({}, sources[index], {
        targetIndex,
        targetTemplateFieldId: target.id || ''
      });
      this.setData({ hrTemplateSwitchSources: sources, hrTemplateSwitchToken: '', hrTemplateSwitchSummary: null });
    },

    buildHrTemplateSwitchActions() {
      return (this.data.hrTemplateSwitchSources || []).map((source) => ({
        sourceSnapshotFieldId: source.id,
        action: source.action || 'hide',
        targetTemplateFieldId: source.action === 'map' ? source.targetTemplateFieldId : ''
      }));
    },

    async previewHrProfileTemplateSwitch() {
      const target = this.data.hrTemplateSwitchTarget;
      if (!target) return;
      const actions = this.buildHrTemplateSwitchActions();
      if (actions.some((action) => action.action === 'map' && !action.targetTemplateFieldId)) {
        return showShortToast(localeCopy.copy_deff18cd29);
      }
      this.setLoading('previewHrTemplateSwitch', true);
      try {
        const result = await this.callCloud('previewHrProfileTemplateSwitch', {
          targetTemplateId: target.id,
          fieldActions: actions
        });
        if (result.status === 'mapping_blocked') {
          const invalidCount = (result.blockers || []).reduce((sum, item) => sum + Number(item.invalidCount || 0), 0);
          wx.showModal({ title: localeCopy.copy_028fbc8a93, content: localeFormat(localeCopy.copy_3cfda2ecef, [invalidCount]), showCancel: false });
          return;
        }
        if (result.status !== 'success') return showShortToast(localeCopy.copy_e58fa637eb);
        this.setData({ hrTemplateSwitchToken: result.switchToken, hrTemplateSwitchSummary: result.summary });
        const summary = result.summary || {};
        const hasDelete = summary.hasDelete === true;
        wx.showModal({
          title: hasDelete ? localeCopy.copy_97366c6f6d : localeCopy.copy_f6076cddc4,
          content: localeFormat(localeCopy.copy_ea656e2ae7, [summary.mapValueCount || 0, summary.hideValueCount || 0, summary.deleteValueCount || 0, hasDelete ? localeCopy.copy_0efc367eca : '']),
          confirmText: hasDelete ? localeCopy.copy_27ee30d786 : localeCopy.copy_a79c2f21ae,
          confirmColor: hasDelete ? '#ef4444' : '#2563eb',
          success: (modalResult) => {
            if (modalResult.confirm) this.applyHrProfileTemplateSwitch(hasDelete);
          }
        });
      } catch (_) {
        showShortToast(localeCopy.copy_e58fa637eb);
      } finally {
        this.setLoading('previewHrTemplateSwitch', false);
      }
    },

    async applyHrProfileTemplateSwitch(confirmDelete) {
      const target = this.data.hrTemplateSwitchTarget;
      if (!target || !this.data.hrTemplateSwitchToken) return;
      this.setLoading('applyHrTemplateSwitch', true);
      try {
        const result = await this.callCloud('applyHrProfileTemplateSwitch', {
          targetTemplateId: target.id,
          fieldActions: this.buildHrTemplateSwitchActions(),
          switchToken: this.data.hrTemplateSwitchToken,
          confirmDelete: confirmDelete === true
        });
        if (result.status !== 'success') {
          showShortToast(result.status === 'stale_switch' ? localeCopy.copy_7582cffe69 : localeCopy.copy_c45d6ea9d1);
          return;
        }
        this.closeHrProfileTemplateSwitch();
        await Promise.all([this.loadHrProfileTemplates(), this.loadHrProfileAdminData()]);
        showShortToast(localeCopy.copy_75349a79ee, 'success');
      } catch (_) {
        showShortToast(localeCopy.copy_c45d6ea9d1);
      } finally {
        this.setLoading('applyHrTemplateSwitch', false);
      }
    },

    onActiveHrProfileSettingInput(e) {
      const field = String(e.currentTarget.dataset.field || '');
      const active = Object.assign({}, this.data.activeHrProfileSnapshot || {});
      active[field] = e.detail.value;
      this.setData({ activeHrProfileSnapshot: active });
    },

    onActiveHrProfileModeChange(e) {
      const option = PROFILE_EDIT_MODE_OPTIONS[Number(e.detail.value)] || PROFILE_EDIT_MODE_OPTIONS[0];
      this.setData({ 'activeHrProfileSnapshot.editMode': option.value });
    },

    async saveActiveHrProfileSettings() {
      const active = this.data.activeHrProfileSnapshot;
      if (!active) return;
      this.setLoading('saveActiveHrProfileSettings', true);
      try {
        const result = await this.callCloud('saveOrgHrProfileTemplateSettings', {
          description: active.description || '',
          editMode: active.editMode || 'direct'
        });
        if (result.status !== 'success') return showShortToast(localeCopy.copy_215e3c57da);
        await Promise.all([this.loadHrProfileTemplates(), this.loadHrProfileAdminData()]);
        showShortToast(localeCopy.copy_0aacec2714, 'success');
      } catch (_) {
        showShortToast(localeCopy.copy_215e3c57da);
      } finally {
        this.setLoading('saveActiveHrProfileSettings', false);
      }
    },

    refreshHrProfileRows(nextFilters = this.data.hrProfileFilters, nextRawRows = this._hrProfileRawRows || []) {
      const filteredRows = applyHrProfileFilters(nextRawRows, nextFilters);
      const actionState = this.buildHrMemberActionState(filteredRows);
      const selected = new Set(actionState.selectedHrMemberIds);
      this._hrProfileRawRows = nextRawRows.map((item) => Object.assign({}, item, {
        selected: selected.has(String(item.id || ''))
      }));
      this._hrProfileFilteredRows = filteredRows.map((item) => Object.assign({}, item, {
        selected: selected.has(String(item.id || ''))
      }));
      this.setData(Object.assign({}, actionState, {
        hrProfileRows: this._hrProfileFilteredRows.map(toHrProfileListRow)
      }));
    },

    onHrProfileFilterChange(e) {
      const field = String(e.currentTarget.dataset.field || '');
      const options = this.data.hrProfileFilterOptions[field] || [];
      const keyMap = {
        departments: 'department',
        identities: 'identity',
        workGroups: 'workGroup',
        statuses: 'status'
      };
      const valueKey = keyMap[field] || 'status';
      const value = options[Number(e.detail.value)] || options[0] || '';
      const nextFilters = {
        ...this.data.hrProfileFilters,
        [valueKey]: value
      };
      const patch = { hrProfileFilters: nextFilters };
  
      // Cascade work group options when department filter changes
      if (field === 'departments') {
        if (value === localeCopy.copy_68f7277730) {
          patch['hrProfileFilterOptions.workGroups'] = [localeCopy.copy_54e953f1bb];
          nextFilters.workGroup = localeCopy.copy_54e953f1bb;
          patch.hrProfileFilters = nextFilters;
        } else {
          const dept = this.data.departmentList.find(d => d.name === value) || {};
          const wgs = dept.id
            ? this.data.workGroupList.filter(w => w.departmentId === dept.id).map(w => w.name)
            : (this._hrProfileRawRows || [])
              .filter((row) => (row.departments || [row.department]).includes(value))
              .reduce((all, row) => all.concat(row.workGroups || (row.workGroup ? [row.workGroup] : [])), [])
              .filter((name, index, all) => name && all.indexOf(name) === index);
          patch['hrProfileFilterOptions.workGroups'] = [localeCopy.copy_54e953f1bb, ...wgs];
          nextFilters.workGroup = localeCopy.copy_54e953f1bb;
          patch.hrProfileFilters = nextFilters;
        }
      }
  
      this.setData(patch);
      this.refreshHrProfileRows(nextFilters);
    },

    onHrProfileKeywordInput(e) {
      const displayValue = e.detail.value;
      this.setData({ _hrInfoKeywordInput: displayValue });
      this.clearHrInfoKeywordTimer();
      this._hrInfoKeywordTimer = setTimeout(() => {
        this._hrInfoKeywordTimer = null;
        const nextFilters = {
          ...this.data.hrProfileFilters,
          keyword: displayValue
        };
        this.setData({ hrProfileFilters: nextFilters });
        this.refreshHrProfileRows(nextFilters);
      }, 300);
    },

    clearHrInfoKeywordTimer() {
      if (!this._hrInfoKeywordTimer) return;
      clearTimeout(this._hrInfoKeywordTimer);
      this._hrInfoKeywordTimer = null;
    },

    resetHrProfileFilters() {
      const nextFilters = emptyHrProfileFilters();
      this.setData({
        hrProfileFilters: nextFilters,
        'hrProfileFilterOptions.workGroups': [localeCopy.copy_54e953f1bb],
        _hrInfoKeywordInput: ''
      });
      this.refreshHrProfileRows(nextFilters);
    },

    exportHrProfiles() {
      const rows = this._hrProfileFilteredRows || this.data.hrProfileRows || [];
      if (!rows.length) {
        showShortToast(localeCopy.copy_e59729af18);
        return;
      }

      const fields = this.data.hrProfileFields || [];
      const columns = [
        { key: 'name', label: localeCopy.copy_3c946202ff, groupLabel: localeCopy.copy_142861823e, source: 'name', checked: true },
        { key: 'studentId', label: localeCopy.copy_cbb853db1b, groupLabel: localeCopy.copy_142861823e, source: 'studentId', checked: true },
        { key: 'department', label: localeCopy.copy_cb8ac66b1a, groupLabel: localeCopy.copy_79a04f117c, source: 'department', checked: true },
        { key: 'identity', label: localeCopy.copy_e69d9e7df1, groupLabel: localeCopy.copy_79a04f117c, source: 'identity', checked: true },
        { key: 'workGroup', label: localeCopy.copy_6cc69fb176, groupLabel: localeCopy.copy_79a04f117c, source: 'workGroup', checked: true },
        { key: 'wxBindStatus', label: localeCopy.copy_f93247534b, groupLabel: localeCopy.copy_142861823e, source: 'wxBindStatus', checked: true },
        { key: 'auditStatus', label: localeCopy.copy_e3070392e0, groupLabel: localeCopy.copy_142861823e, source: 'auditStatus', checked: true }
      ];
      const pendingFieldMap = {};
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const pendingValues = rows[rowIndex].pendingValues || {};
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
          const fieldId = fields[fieldIndex].id;
          if (pendingValues[fieldId] !== undefined && String(pendingValues[fieldId]).trim()) {
            pendingFieldMap[fieldId] = true;
          }
        }
      }
      for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
        const field = fields[fieldIndex];
        columns.push({
          key: 'profile_' + fieldIndex,
          label: field.label,
          groupLabel: localeCopy.copy_9ec66981b8,
          source: 'profile',
          fieldId: field.id,
          checked: true
        });
        if (pendingFieldMap[field.id]) {
          columns.push({
            key: 'pending_' + fieldIndex,
            label: field.label + localeCopy.copy_5951b5b0a2,
            groupLabel: localeCopy.copy_ddb6dca5b6,
            source: 'pending',
            fieldId: field.id,
            checked: true
          });
        }
      }

      this.setData({
        hrProfileExportVisible: true,
        hrProfileExportColumns: columns,
        hrProfileExportSelectedCount: columns.length,
        hrProfileExportFormat: 'xlsx'
      });
    },

    closeHrProfileExport() {
      this.setData({
        hrProfileExportVisible: false,
        hrProfileExportColumns: [],
        hrProfileExportSelectedCount: 0
      });
    },

    onHrProfileExportColumnChange(e) {
      const selectedKeys = e.detail.value || [];
      const selectedMap = {};
      for (let index = 0; index < selectedKeys.length; index += 1) {
        selectedMap[selectedKeys[index]] = true;
      }
      const columns = (this.data.hrProfileExportColumns || []).map((column) =>
        Object.assign({}, column, { checked: !!selectedMap[column.key] })
      );
      this.setData({
        hrProfileExportColumns: columns,
        hrProfileExportSelectedCount: selectedKeys.length
      });
    },

    selectAllHrProfileExportColumns() {
      const columns = (this.data.hrProfileExportColumns || []).map((column) =>
        Object.assign({}, column, { checked: true })
      );
      this.setData({
        hrProfileExportColumns: columns,
        hrProfileExportSelectedCount: columns.length
      });
    },

    clearHrProfileExportColumns() {
      const columns = (this.data.hrProfileExportColumns || []).map((column) =>
        Object.assign({}, column, { checked: false })
      );
      this.setData({
        hrProfileExportColumns: columns,
        hrProfileExportSelectedCount: 0
      });
    },

    onHrProfileExportFormatChange(e) {
      const format = String(e.currentTarget.dataset.format || '');
      if (format !== 'xlsx' && format !== 'csv') return;
      this.setData({ hrProfileExportFormat: format });
    },

    confirmHrProfileExport() {
      const columns = (this.data.hrProfileExportColumns || []).filter((column) => column.checked);
      if (!columns.length) {
        showShortToast(localeCopy.copy_37795f5bde);
        return;
      }
      const headers = columns.map((column) => ({ key: column.key, label: column.label }));
      const rows = (this._hrProfileFilteredRows || this.data.hrProfileRows || []).map((item) => {
        const exportRow = {};
        for (let index = 0; index < columns.length; index += 1) {
          const column = columns[index];
          const currentValues = item.currentValues || {};
          const pendingValues = item.pendingValues || {};
          if (column.source === 'profile') {
            exportRow[column.key] = currentValues[column.fieldId] || '';
          } else if (column.source === 'pending') {
            exportRow[column.key] = pendingValues[column.fieldId] || '';
          } else if (column.source === 'wxBindStatus') {
            const bindStatusTextMap = {
              bound: localeCopy.copy_171e9799a7,
              pending_activation: localeCopy.copy_1ceaebed03,
              unbound: localeCopy.copy_ba9b0425fd
            };
            exportRow[column.key] = bindStatusTextMap[item.wxBindStatus] || localeCopy.copy_ba9b0425fd;
          } else if (column.source === 'auditStatus') {
            exportRow[column.key] = item.auditStatusText || '';
          } else {
            exportRow[column.key] = item[column.source] || '';
          }
        }
        return exportRow;
      });
      this.exportHrProfileFile(headers, rows, this.data.hrProfileExportFormat || 'xlsx');
    },

    async exportHrProfileFile(headers, rows, format) {
      const orgName = this.data.currentOrganizationName || localeCopy.copy_2b8b8bf904;
      const fileName = orgName + localeCopy.copy_e39c036ae6;
      this.setLoading('exportHrProfiles', true);
      try {
        const result = await this.callCloud('buildTableFile', {
          format,
          headers,
          rows,
          sheetName: localeCopy.copy_64dc3d4fff
        });
        if (!result || result.status !== 'success' || !result.fileBase64) {
          showShortToast((result && result.message) || localeCopy.copy_2b61466286);
          return;
        }
        this.setData({ hrProfileExportVisible: false });
        await saveAndShareFile(result.fileBase64, fileName, result.extension || format);
      } catch (error) {
        showShortToast(localeCopy.copy_2b61466286);
      } finally {
        this.setLoading('exportHrProfiles', false);
      }
    },

    async openHrPersonDetail(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      if (!hrId || !this.data.canBrowseHrInfo) return;
  
      // Proactively ensure department/identity/workGroup lists are loaded
      const loadPromises = [];
      if (!this.data.departmentList || !this.data.departmentList.length) {
        loadPromises.push(this._ensureDepartmentsLoaded());
      }
      if (!this.data.identityList || !this.data.identityList.length) {
        loadPromises.push(this._ensureIdentitiesLoaded());
      }
      if (!this.data.workGroupList || !this.data.workGroupList.length) {
        loadPromises.push(this._ensureWorkGroupsLoaded());
      }
      if (loadPromises.length) {
        await Promise.all(loadPromises);
      }
  
      const governance = this.getHrGovernanceRow(hrId);
      this.setData({
        showHrPersonDetail: true,
        detailHrId: hrId,
        detailHrGovernance: governance,
        loadingDetailHr: true
      });
      if (this.data.canGlobalAccountManage && governance && governance.personId && governance.accountId) {
        this.loadDetailHrSecurity(governance.personId);
      } else {
        this.setData({ detailHrSecurity: null });
      }
      try {
        const result = await this.callCloud('getHrPersonDetail', { hrId });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_e52119b17e, icon: 'none' });
          this.setData({ showHrPersonDetail: false, loadingDetailHr: false });
          return;
        }
        const vals = {};
        const profile = result.profile || {};
        if (profile.name) vals._name = profile.name;
        if (profile.studentId) vals._studentId = profile.studentId;
        if (result.values) {
          Object.keys(result.values).forEach(k => { vals[k] = result.values[k]; });
        }
        const detailHrTemplate = result.template ? {
          ...result.template,
          fields: Array.isArray(result.template.fields)
            ? result.template.fields.map((f) => {
                const field = {
                  id: f.id || '',
                  label: f.label || '',
                  type: f.type || 'text',
                  required: f.required === true,
                  options: Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split('\n').filter(Boolean) : []),
                  minLength: f.minLength,
                  maxLength: f.maxLength,
                  numberRule: f.numberRule || '',
                  allowDecimal: f.allowDecimal !== false,
                  minDigits: f.minDigits,
                  maxDigits: f.maxDigits,
                  minValue: f.minValue,
                  maxValue: f.maxValue
                };
                field.hintText = buildFieldHint(field);
                return field;
              })
            : []
        } : null;
        const pendingValues = result.pendingValues || {};
        this.setData({
          detailHrProfile: profile,
          detailHrTemplate,
          detailHrValues: vals,
          detailHrPendingValues: pendingValues,
          detailHrComparisonRows: personnelViewModel.buildProfileComparisonRows(
            detailHrTemplate && detailHrTemplate.fields || [],
            vals,
            pendingValues,
            this.data.localeCopy.hrProfileNoValue
          ),
          detailHrAuditStatus: result.auditStatus || 'none',
          detailHrAuditStatusText: result.auditStatusText || localeCopy.copy_67f2697101,
          detailHrRejectionReason: result.rejectionReason || '',
          detailHrHasPending: !!result.hasPending,
          loadingDetailHr: false
        });
        await this.loadPersonIdentities(hrId);
      } catch (err) {
        wx.showToast({ title: localeCopy.copy_94b36657df, icon: 'none' });
        this.setData({ showHrPersonDetail: false, loadingDetailHr: false });
      }
    },

    async loadPersonIdentities(hrId) {
      try {
        const result = await this.callCloud('listPersonIdentities', {
          hrId: hrId || this.data.detailHrId
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_c24b3e04d9, icon: 'none' });
          return;
        }
        this.setData({
          personIdentityOrganizations: personnelViewModel.normalizeAssignments(
            result.organizations || [],
            this.data.localeCopy.hrNoPosition
          ),
          globalAdminIdentities: result.globalAdminIdentities || [],
          identityManagementOrganizationId: result.managementOrganizationId || '',
          canAddGlobalSuperAdmin: result.canAddGlobalSuperAdmin === true
        });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_c24b3e04d9, icon: 'none' });
      }
    },

    async loadMembershipAssignments(hrId) {
      return this.loadPersonIdentities(hrId);
    },

    startCreateMembershipAssignment(e) {
      const orgIndex = Number(e && e.currentTarget && e.currentTarget.dataset.orgIndex);
      const organization = (this.data.personIdentityOrganizations || [])[Number.isFinite(orgIndex) ? orgIndex : 0];
      if (!organization || !organization.canEditAssignments) return;
      const dictionaries = organization.dictionaries || {};
      this.setData({
        membershipAssignmentFormVisible: true,
        membershipAssignmentForm: {
          id: '',
          assignmentKind: 'staff',
          assignmentKindIndex: 0,
          departmentId: '',
          department: '',
          identityId: '',
          identity: '',
          workGroupId: '',
          workGroup: '',
          organizationId: organization.organizationId,
          hrId: organization.hrId
        },
        assignmentDepartmentOptions: dictionaries.departments || [],
        assignmentIdentityOptions: dictionaries.identities || [],
        assignmentDepartmentIndex: 0,
        assignmentIdentityIndex: 0,
        assignmentWorkGroupIndex: 0,
        assignmentWorkGroupOptions: []
      }, () => this._scrollHrDetailTo('hr-assignment-editor'));
    },

    editMembershipAssignment(e) {
      const orgIndex = Number(e.currentTarget.dataset.orgIndex);
      const assignmentIndex = Number(e.currentTarget.dataset.assignmentIndex);
      const organization = (this.data.personIdentityOrganizations || [])[orgIndex];
      const item = organization && (organization.assignments || [])[assignmentIndex];
      if (!organization || !organization.canEditAssignments || !item) return;
      const dictionaries = organization.dictionaries || {};
      const departments = dictionaries.departments || [];
      const identities = dictionaries.identities || [];
      const workGroups = [{ id: '', name: localeCopy.copy_fe59d1afcd }].concat(
        (dictionaries.workGroups || [])
          .filter((row) => String(row.departmentId) === String(item.departmentId))
      );
      this.setData({
        membershipAssignmentFormVisible: true,
        membershipAssignmentForm: {
          ...item,
          identityId: item.identityCategoryId || item.identityId || '',
          identity: item.identityCategoryName || item.identity || '',
          organizationId: organization.organizationId,
          hrId: organization.hrId,
          assignmentKindIndex: Math.max(0, (this.data.assignmentKindValues || []).indexOf(item.assignmentKind))
        },
        assignmentDepartmentOptions: departments,
        assignmentIdentityOptions: identities,
        assignmentDepartmentIndex: Math.max(0, departments.findIndex((row) => String(row.id) === String(item.departmentId))),
        assignmentIdentityIndex: Math.max(0, identities.findIndex((row) => String(row.id) === String(item.identityId))),
        assignmentWorkGroupIndex: Math.max(0, workGroups.findIndex((row) => String(row.id) === String(item.workGroupId))),
        assignmentWorkGroupOptions: workGroups
      }, () => this._scrollHrDetailTo('hr-assignment-editor'));
    },

    cancelMembershipAssignmentEdit() {
      this.setData({
        membershipAssignmentFormVisible: false,
        membershipAssignmentForm: {},
        assignmentDepartmentOptions: [],
        assignmentIdentityOptions: [],
        assignmentWorkGroupOptions: [],
        detailScrollTarget: ''
      });
    },

    _scrollHrDetailTo(target) {
      this.setData({ detailScrollTarget: '' }, () => {
        wx.nextTick(() => this.setData({ detailScrollTarget: target }));
      });
    },

    onMembershipAssignmentInput(e) {
      const field = String(e.currentTarget.dataset.field || '');
      this.setData({ ['membershipAssignmentForm.' + field]: e.detail.value });
    },

    onMembershipAssignmentKindChange(e) {
      const index = Number(e.detail.value) || 0;
      this.setData({
        'membershipAssignmentForm.assignmentKindIndex': index,
        'membershipAssignmentForm.assignmentKind': (this.data.assignmentKindValues || [])[index] || 'staff'
      });
    },

    onMembershipAssignmentDepartmentChange(e) {
      const index = Number(e.detail.value) || 0;
      const department = (this.data.assignmentDepartmentOptions || [])[index] || {};
      const organization = (this.data.personIdentityOrganizations || []).find((item) => (
        String(item.organizationId) === String(this.data.membershipAssignmentForm.organizationId)
      ));
      const workGroups = [{ id: '', name: localeCopy.copy_fe59d1afcd }].concat(
        (((organization && organization.dictionaries) || {}).workGroups || [])
          .filter((row) => String(row.departmentId) === String(department.id))
      );
      this.setData({
        assignmentDepartmentIndex: index,
        assignmentWorkGroupIndex: 0,
        assignmentWorkGroupOptions: workGroups,
        'membershipAssignmentForm.departmentId': department.id || '',
        'membershipAssignmentForm.department': department.name || '',
        'membershipAssignmentForm.workGroupId': '',
        'membershipAssignmentForm.workGroup': ''
      });
    },

    onMembershipAssignmentIdentityChange(e) {
      const index = Number(e.detail.value) || 0;
      const identity = (this.data.assignmentIdentityOptions || [])[index] || {};
      this.setData({
        assignmentIdentityIndex: index,
        'membershipAssignmentForm.identityId': identity.id || '',
        'membershipAssignmentForm.identity': identity.name || ''
      });
    },

    onMembershipAssignmentWorkGroupChange(e) {
      const index = Number(e.detail.value) || 0;
      const workGroup = (this.data.assignmentWorkGroupOptions || [])[index] || {};
      this.setData({
        assignmentWorkGroupIndex: index,
        'membershipAssignmentForm.workGroupId': workGroup.id || '',
        'membershipAssignmentForm.workGroup': workGroup.name || ''
      });
    },

    async saveMembershipAssignment() {
      const form = this.data.membershipAssignmentForm || {};
      if (!form.departmentId || !form.identityId) {
        wx.showToast({ title: localeCopy.copy_2550a901e4, icon: 'none' });
        return;
      }
      this.setLoading('saveMembershipAssignment', true);
      try {
        const result = await this.callCloud('saveMembershipAssignment', {
          id: form.id || '',
          assignmentKind: form.assignmentKind || 'staff',
          departmentId: form.departmentId,
          identityId: form.identityId,
          workGroupId: form.workGroupId || '',
          hrId: form.hrId || this.data.detailHrId,
          organizationId: form.organizationId
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_215e3c57da, icon: 'none' });
          return;
        }
        this.cancelMembershipAssignmentEdit();
        await this.loadPersonIdentities();
        this.loadHrProfileAdminData();
        wx.showToast({ title: localeCopy.copy_735e0a8bcf, icon: 'success' });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_215e3c57da, icon: 'none' });
      } finally {
        this.setLoading('saveMembershipAssignment', false);
      }
    },

    deleteMembershipAssignment(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const organizationId = String(e.currentTarget.dataset.organizationId || '');
      if (!id) return;
      this.setData({
        identityActionConfirmVisible: true,
        identityActionConfirmTitle: localeCopy.copy_bc04d9e2e3,
        identityActionConfirmText: localeCopy.copy_3e8d61586a,
        identityActionConfirmAction: { type: 'deleteAssignment', id, organizationId }
      });
    },

    async addPersonAdminIdentity(e) {
      const orgIndex = Number(e.currentTarget.dataset.orgIndex);
      const organization = (this.data.personIdentityOrganizations || [])[orgIndex];
      if (!organization || !organization.canAddAdmin) return;
      await this._savePersonAdminIdentity({
        organizationId: organization.organizationId,
        hrId: organization.hrId,
        adminLevel: 'admin'
      });
    },

    addPersonSuperAdmin() {
      const organization = (this.data.personIdentityOrganizations || [])[0];
      if (!organization || !this.data.canAddGlobalSuperAdmin || !this.data.identityManagementOrganizationId) return;
      this.setData({
        identityActionConfirmVisible: true,
        identityActionConfirmTitle: localeCopy.copy_8ca66f00b4,
        identityActionConfirmText: localeCopy.copy_6dbeb580ce,
        identityActionConfirmAction: {
          type: 'addSuperAdmin',
          organizationId: this.data.identityManagementOrganizationId,
          hrId: organization.hrId
        }
      });
    },

    removePersonAdminIdentity(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const organizationId = String(e.currentTarget.dataset.organizationId || '');
      const level = String(e.currentTarget.dataset.level || 'admin');
      if (!id) return;
      this.setData({
        identityActionConfirmVisible: true,
        identityActionConfirmTitle: level === 'super_admin' ? localeCopy.copy_564cc6648b : localeCopy.copy_8da6e35182,
        identityActionConfirmText: localeCopy.copy_860f24df0a,
        identityActionConfirmAction: { type: 'deleteAdmin', id, organizationId }
      });
    },

    async _savePersonAdminIdentity(data) {
      this.setLoading('savePersonAdminIdentity', true);
      try {
        const profile = this.data.detailHrProfile || {};
        const result = await this.callCloud('saveAdmin', {
          organizationId: data.organizationId,
          hrId: data.hrId,
          name: profile.name || '',
          studentId: profile.studentId || '',
          adminLevel: data.adminLevel
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_215e3c57da, icon: 'none' });
          return;
        }
        await this.loadPersonIdentities();
        wx.showToast({ title: localeCopy.copy_0a6ad98837, icon: 'success' });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_215e3c57da, icon: 'none' });
      } finally {
        this.setLoading('savePersonAdminIdentity', false);
      }
    },

    closeIdentityActionConfirm() {
      this.setData({
        identityActionConfirmVisible: false,
        identityActionConfirmAction: null
      });
    },

    async confirmIdentityAction() {
      const action = this.data.identityActionConfirmAction;
      if (!action) return;
      this.closeIdentityActionConfirm();
      if (action.type === 'addSuperAdmin') {
        await this._savePersonAdminIdentity({
          organizationId: action.organizationId,
          hrId: action.hrId,
          adminLevel: 'super_admin'
        });
        return;
      }
      try {
        const result = action.type === 'deleteAssignment'
          ? await this.callCloud('deleteMembershipAssignment', {
              id: action.id,
              organizationId: action.organizationId
            })
          : await this.callCloud('deleteAdmin', {
              id: action.id,
              organizationId: action.organizationId
            });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_076bb5d383, icon: 'none' });
          return;
        }
        await this.loadPersonIdentities();
        this.loadHrProfileAdminData();
        wx.showToast({ title: localeCopy.copy_5398fec054, icon: 'success' });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_076bb5d383, icon: 'none' });
      }
    },

    closeHrPersonDetail() {
      this.setData({
        showHrPersonDetail: false,
        detailHrGovernance: null,
        detailHrSecurity: null,
        detailHrPassphraseInput: '',
        showDetailPassphraseForm: false,
        detailWorkGroupOptions: [],
        detailDepartmentValue: 0,
        detailIdentityValue: 0,
        detailWorkGroupValue: 0,
        detailFieldValues: {},
        membershipAssignmentList: [],
        personIdentityOrganizations: [],
        globalAdminIdentities: [],
        identityManagementOrganizationId: '',
        canAddGlobalSuperAdmin: false,
        membershipAssignmentFormVisible: false,
        membershipAssignmentForm: {},
        assignmentDepartmentOptions: [],
        assignmentIdentityOptions: [],
        detailScrollTarget: '',
        detailHrComparisonRows: [],
        profileRejectVisible: false,
        profileRejectStudentId: '',
        profileRejectReason: '',
        personCorrectionVisible: false,
        personCorrectionPreview: null,
        personCorrectionConfirmed: false,
        personCorrectionProfileValues: {}
      });
    },

    onDetailBasicFieldInput(e) {
      if (!this.data.canGlobalAccountManage) return;
      const field = String(e.currentTarget.dataset.field || '');
      this.setData({ ['detailHrValues.' + field]: e.detail.value });
    },

    onDetailProfileFieldInput(e) {
      if (!this.data.canManageHrPeople) return;
      const field = String(e.currentTarget.dataset.field || '');
      let value = e.detail.value;
  
      // For sequence pickers, e.detail.value is the numeric index;
      // resolve it to the option text so the display shows the selected text.
      const template = this.data.detailHrTemplate;
      let seqIndex = -1;
      if (template && template.fields) {
        const fieldDef = template.fields.find(function(f) { return String(f.id) === field; });
        if (fieldDef && fieldDef.type === 'sequence' && Array.isArray(fieldDef.options)) {
          const idx = Number(value);
          if (!isNaN(idx) && idx >= 0 && idx < fieldDef.options.length) {
            value = fieldDef.options[idx];
            seqIndex = idx;
          }
        }
      }
  
      const updates = { ['detailHrValues.' + field]: value };
      if (seqIndex >= 0) {
        updates['detailFieldValues.' + field] = seqIndex;
      }
      this.setData(updates);
    },

    async saveHrPersonDetail() {
      if (!this.data.canManageHrPeople) return;
      const vals = this.data.detailHrValues || {};
      const hrId = this.data.detailHrId;
      if (!hrId) return;
  
      const name = (vals._name || '').trim();
      const studentId = (vals._studentId || '').trim();

      if (!name || !studentId) {
        wx.showToast({ title: localeCopy.copy_e6f89839f1, icon: 'none' });
        return;
      }
  
      const profileValues = {};
      Object.keys(vals).forEach(k => {
        if (!k.startsWith('_')) {
          profileValues[k] = vals[k];
        }
      });
  
      const template = this.data.detailHrTemplate;
      if (template && Array.isArray(template.fields)) {
        for (let i = 0; i < template.fields.length; i += 1) {
          const field = template.fields[i];
          const errorMessage = validateProfileField(field, profileValues[field.id]);
          if (errorMessage) {
            wx.showToast({ title: errorMessage, icon: 'none' });
            return;
          }
        }
      }
  
      if (personnelViewModel.hasBasicIdentityChange(this.data.detailHrProfile, vals)) {
        if (!this.data.canGlobalAccountManage) return;
        this.setData({ savingDetailHr: true });
        try {
          const previewResult = await this.callCloud('previewPersonIdentityCorrection', {
            hrId,
            organizationId: this.data.currentOrganizationId || wx.getStorageSync('activeOrgId') || '',
            name,
            studentId
          });
          if (!previewResult || previewResult.status !== 'success' || !previewResult.preview) {
            wx.showToast({
              title: previewResult && previewResult.message || localeCopy.personCorrectionPreviewFailed,
              icon: 'none'
            });
            return;
          }
          this.setData({
            personCorrectionVisible: true,
            personCorrectionPreview: personnelViewModel.decorateCorrectionPreview(previewResult.preview, {
              active: this.data.localeCopy.hrMembershipActive,
              left: this.data.localeCopy.hrMembershipLeft,
              merged: this.data.localeCopy.hrMembershipMerged,
              account: {
                verified: this.data.localeCopy.hrAccountVerified,
                frozen: this.data.localeCopy.hrAccountFrozen,
                recovery_required: this.data.localeCopy.hrAccountRecoveryRequired,
                unbound: this.data.localeCopy.hrAccountUnbound
              }
            }),
            personCorrectionConfirmed: false,
            personCorrectionProfileValues: profileValues
          });
        } catch (error) {
          wx.showToast({ title: localeCopy.personCorrectionPreviewFailed, icon: 'none' });
        } finally {
          this.setData({ savingDetailHr: false });
        }
        return;
      }

      await this._saveHrPersonProfile({ hrId, name, studentId, profileValues });
    },

    async _saveHrPersonProfile(payload) {
      this.setData({ savingDetailHr: true });
      try {
        const result = await this.callCloud('saveHrPersonFull', payload);
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_215e3c57da, icon: 'none' });
          return;
        }
        wx.showToast({ title: localeCopy.copy_0aacec2714, icon: 'success' });
        this.setData({ showHrPersonDetail: false });
        this.loadHrProfileAdminData();
        this.loadHrList();
      } catch (err) {
        wx.showToast({ title: localeCopy.copy_215e3c57da, icon: 'none' });
      } finally {
        this.setData({ savingDetailHr: false });
      }
    },

    async _saveCorrectionProfileBeforeMerge(preview) {
      const profileValues = this.data.personCorrectionProfileValues || {};
      if (!Object.keys(profileValues).length) return true;
      const current = preview && preview.current || {};
      const profile = this.data.detailHrProfile || {};
      try {
        const result = await this.callCloud('saveHrPersonFull', {
          hrId: this.data.detailHrId,
          name: current.name || profile.name || '',
          studentId: current.studentId || profile.studentId || '',
          profileValues
        });
        if (!result || result.status !== 'success') {
          wx.showToast({ title: result && result.message || localeCopy.copy_215e3c57da, icon: 'none' });
          return false;
        }
        return true;
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_215e3c57da, icon: 'none' });
        return false;
      }
    },

    closePersonCorrection() {
      if (this.data.savingDetailHr) return;
      this.setData({
        personCorrectionVisible: false,
        personCorrectionPreview: null,
        personCorrectionConfirmed: false,
        personCorrectionProfileValues: {}
      });
    },

    onPersonCorrectionConfirmChange(e) {
      this.setData({ personCorrectionConfirmed: Array.isArray(e.detail.value) && e.detail.value.length > 0 });
    },

    async confirmPersonCorrection() {
      const preview = this.data.personCorrectionPreview;
      if (!preview || !this.data.personCorrectionConfirmed || this.data.savingDetailHr) {
        if (!this.data.personCorrectionConfirmed) {
          wx.showToast({ title: this.data.localeCopy.hrCorrectionConfirmRequired, icon: 'none' });
        }
        return;
      }
      this.setData({ savingDetailHr: true });
      try {
        const organizationId = this.data.currentOrganizationId || wx.getStorageSync('activeOrgId') || '';
        if (preview.mergeRequired) {
          const profileSaved = await this._saveCorrectionProfileBeforeMerge(preview);
          if (!profileSaved) return;
          const mergeResult = await this.callCloud('mergePersons', {
            sourcePersonId: preview.personId,
            targetPersonId: preview.conflictPerson && preview.conflictPerson.personId,
            sourceVersion: preview.version,
            targetVersion: preview.conflictPerson && preview.conflictPerson.version,
            organizationId,
            confirmed: true
          });
          if (!mergeResult || mergeResult.status !== 'success') {
            wx.showToast({ title: mergeResult && mergeResult.message || localeCopy.personMergeFailed, icon: 'none' });
            return;
          }
          this.closePersonCorrection();
          this.closeHrPersonDetail();
          await Promise.all([this.loadHrList(), this.loadHrProfileAdminData()]);
          wx.showToast({ title: this.data.localeCopy.hrCorrectionMerged, icon: 'success' });
          return;
        }
        const correctionResult = await this.callCloud('applyPersonIdentityCorrection', {
          hrId: this.data.detailHrId,
          organizationId,
          name: preview.proposed && preview.proposed.name,
          studentId: preview.proposed && preview.proposed.studentId,
          version: preview.version
        });
        if (!correctionResult || correctionResult.status !== 'success') {
          wx.showToast({ title: correctionResult && correctionResult.message || localeCopy.personCorrectionApplyFailed, icon: 'none' });
          return;
        }
        const profileValues = this.data.personCorrectionProfileValues || {};
        this.setData({ personCorrectionVisible: false, personCorrectionPreview: null, personCorrectionConfirmed: false });
        await this._saveHrPersonProfile({
          hrId: this.data.detailHrId,
          name: preview.proposed.name,
          studentId: preview.proposed.studentId,
          profileValues
        });
      } catch (error) {
        wx.showToast({
          title: preview.mergeRequired ? localeCopy.personMergeFailed : localeCopy.personCorrectionApplyFailed,
          icon: 'none'
        });
      } finally {
        this.setData({ savingDetailHr: false });
      }
    },

    async approveDetailHrProfile() {
      if (!this.data.canReviewHrProfile) return;
      const profile = this.data.detailHrProfile || {};
      const studentId = profile.studentId || '';
      if (!studentId) return;
      try {
        const result = await this.callCloud('reviewHrProfileChange', { studentId, action: 'approve' });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_0531ed9e78, icon: 'none' });
          return;
        }
        wx.showToast({ title: localeCopy.copy_ce171a2581, icon: 'success' });
        this.closeHrPersonDetail();
        this.loadHrProfileAdminData();
      } catch (err) {
        wx.showToast({ title: localeCopy.copy_0531ed9e78, icon: 'none' });
      }
    },

    rejectDetailHrProfile() {
      const profile = this.data.detailHrProfile || {};
      const studentId = profile.studentId || '';
      if (!studentId) return;
      this.openProfileRejectDialog(studentId);
    },

    openProfileRejectDialog(studentId) {
      if (!this.data.canReviewHrProfile) return;
      this.setData({
        profileRejectVisible: true,
        profileRejectStudentId: String(studentId || '').trim(),
        profileRejectReason: ''
      });
    },

    closeProfileRejectDialog() {
      if (this.data.loadingMap.reviewHrProfile) return;
      this.setData({ profileRejectVisible: false, profileRejectStudentId: '', profileRejectReason: '' });
    },

    onProfileRejectReasonInput(e) {
      this.setData({ profileRejectReason: e.detail.value });
    },

    async confirmProfileRejection() {
      if (!this.data.canReviewHrProfile) return;
      const studentId = String(this.data.profileRejectStudentId || '').trim();
      const reason = String(this.data.profileRejectReason || '').trim();
      if (!studentId || !reason) {
        wx.showToast({ title: localeCopy.rejectionReasonRequired, icon: 'none' });
        return;
      }
      this.setLoading('reviewHrProfile', true);
      try {
        const result = await this.callCloud('reviewHrProfileChange', { studentId, action: 'reject', reason });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_0531ed9e78, icon: 'none' });
          return;
        }
        wx.showToast({ title: localeCopy.copy_5d5af942c5, icon: 'success' });
        this.setData({ profileRejectVisible: false, profileRejectStudentId: '', profileRejectReason: '' });
        if (this.data.showHrPersonDetail) this.closeHrPersonDetail();
        await this.loadHrProfileAdminData();
      } catch (err) {
        wx.showToast({ title: localeCopy.copy_0531ed9e78, icon: 'none' });
      } finally {
        this.setLoading('reviewHrProfile', false);
      }
    },

    toggleAddEditForm() {
      this.setData({ showAddEditForm: !this.data.showAddEditForm });
    },

    toggleTemplateConfig() {
      this.setData({ showTemplateConfig: !this.data.showTemplateConfig });
    },

    onHrProfileTemplateInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value;
      this.setData({
        hrProfileTemplateForm: {
          ...this.data.hrProfileTemplateForm,
          [field]: value
        }
      });
    },

    onHrProfileFieldInput(e) {
      const index = Number(e.currentTarget.dataset.index);
      const field = String(e.currentTarget.dataset.field || '');
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        [field]: e.detail.value
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileFieldRequiredChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        required: !!e.detail.value
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileEditModeChange(e) {
      const option = PROFILE_EDIT_MODE_OPTIONS[Number(e.detail.value)] || PROFILE_EDIT_MODE_OPTIONS[0];
      this.setData({
        hrProfileTemplateForm: {
          ...this.data.hrProfileTemplateForm,
          editMode: option.value,
          editModeLabel: option.label
        }
      });
    },

    onHrProfileFieldTypeChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const option = PROFILE_FIELD_TYPE_OPTIONS[Number(e.detail.value)] || PROFILE_FIELD_TYPE_OPTIONS[0];
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        type: option.value,
        typeLabel: option.label
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileNumberRuleChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const option = NUMBER_RULE_OPTIONS[Number(e.detail.value)] || NUMBER_RULE_OPTIONS[0];
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        numberRule: option.value,
        numberRuleLabel: option.label
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    onHrProfileFieldAllowDecimalChange(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields[index] = {
        ...fields[index],
        allowDecimal: !!e.detail.value
      };
  
      this.setData({
        'hrProfileTemplateForm.fields': fields
      });
    },

    addHrProfileField() {
      this.setData({
        'hrProfileTemplateForm.fields': [
          ...(this.data.hrProfileTemplateForm.fields || []),
          createEmptyProfileField()
        ]
      });
    },

    importTableFields() {
      this.setLoading('importTemplateFieldsCsv', true);
      const _this = this;
      chooseTableFile(_this.callCloud.bind(_this)).then(function (tableData) {
        if (!tableData) { _this.setLoading('importTemplateFieldsCsv', false); return; }
  
        const headers = tableData.headers;
        if (!headers.length) {
          wx.showToast({ title: localeCopy.copy_b673ee708c, icon: 'none' });
          _this.setLoading('importTemplateFieldsCsv', false);
          return;
        }
  
        const newFields = headers.map(function (label) {
          return Object.assign({}, createEmptyProfileField(), {
            id: 'profile_field_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            label: label
          });
        });
  
        const existingFields = _this.data.hrProfileTemplateForm.fields || [];
        const headerPreview = headers.length > 5
          ? headers.slice(0, 5).join('、') + localeCopy.copy_5daecbb537 + headers.length + localeCopy.copy_5babf47a71
          : headers.join('、');
  
        wx.showModal({
          title: localeCopy.copy_d0fc81b30f,
          content: localeCopy.copy_a7e6a633a4 + headers.length + localeCopy.copy_fbdaa51ccc + headerPreview + localeCopy.copy_f37be3c249,
          confirmText: localeCopy.copy_50a212e945,
          cancelText: localeCopy.copy_01c502a089,
          success: function (modalRes) {
            const fields = modalRes.confirm ? newFields : existingFields.concat(newFields);
            _this.setData({ 'hrProfileTemplateForm.fields': fields });
            wx.showToast({ title: localeCopy.copy_4c8603086a + headers.length + localeCopy.copy_a68c09e48e, icon: 'success' });
          }
        });
        _this.setLoading('importTemplateFieldsCsv', false);
      }).catch(function () {
        _this.setLoading('importTemplateFieldsCsv', false);
      });
    },

    removeHrProfileField(e) {
      const index = Number(e.currentTarget.dataset.index);
      const fields = [...(this.data.hrProfileTemplateForm.fields || [])];
      if (!fields[index]) {
        return;
      }
  
      fields.splice(index, 1);
      this.setData({
        'hrProfileTemplateForm.fields': fields.length ? fields : [createEmptyProfileField()]
      });
    },

    async saveHrProfileTemplate() {
      const form = this.data.hrProfileTemplateForm || emptyHrProfileTemplateForm();
      const templateName = String(form.name || '').trim();
      const fields = (form.fields || []).map((item) => ({
        id: item.id,
        label: String(item.label || '').trim(),
        type: item.type,
        required: item.required === true,
        minLength: item.minLength === '' ? null : Number(item.minLength),
        maxLength: item.maxLength === '' ? null : Number(item.maxLength),
        numberRule: item.numberRule || NUMBER_RULE_OPTIONS[0].value,
        allowDecimal: item.allowDecimal !== false,
        minDigits: item.minDigits === '' ? null : Number(item.minDigits),
        maxDigits: item.maxDigits === '' ? null : Number(item.maxDigits),
        minValue: item.minValue === '' ? null : Number(item.minValue),
        maxValue: item.maxValue === '' ? null : Number(item.maxValue),
        options: String(item.optionsText || '')
          .split('\n')
          .map((option) => option.trim())
          .filter(Boolean)
      }));
  
      if (!templateName) {
        wx.showToast({ title: localeCopy.copy_d03e81ea80, icon: 'none' });
        return;
      }

      if (!fields.length || fields.some((item) => !item.label)) {
        wx.showToast({
          title: localeCopy.copy_b559e020b7,
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveProfileTemplate', true);
      wx.showLoading({
        title: localeCopy.copy_74e7385966,
        mask: true
      });
      try {
        const result = await this.callCloud('saveHrProfileTemplateDefinition', {
          id: String(form.id || ''),
          name: templateName,
          description: String(form.description || '').trim(),
          editMode: form.editMode,
          fields
        });
  
        if (result.status !== 'success') {
          showShortToast(localeCopy.copy_89be75a701);
          return;
        }
  
        this.setData({ showHrTemplateEditor: false, hrProfileTemplateForm: emptyHrProfileTemplateForm() });
        await this.loadHrProfileTemplates();
        showShortToast(localeCopy.copy_a751bbfc34, 'success');
      } catch (error) {
        showShortToast(localeCopy.copy_89be75a701);
      } finally {
        wx.hideLoading();
        this.setLoading('saveProfileTemplate', false);
      }
    },

    approveHrProfileChange(e) {
      const studentId = String(e.currentTarget.dataset.studentId || '').trim();
      if (!studentId) {
        return;
      }
  
      wx.showModal({
        title: localeCopy.copy_6c43597611,
        content: localeCopy.copy_a10c814f32,
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('reviewHrProfileChange', {
              studentId,
              action: 'approve'
            });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || localeCopy.copy_ad2391977b,
                icon: 'none'
              });
              return;
            }
            await this.loadHrProfileAdminData();
            wx.showToast({
              title: localeCopy.copy_688794e754,
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: localeCopy.copy_ad2391977b,
              icon: 'none'
            });
          }
        }
      });
    },

    rejectHrProfileChange(e) {
      const studentId = String(e.currentTarget.dataset.studentId || '').trim();
      if (studentId) this.openProfileRejectDialog(studentId);
    },

    onHrFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value.trim();
      this.setData({
        hrForm: {
          ...this.data.hrForm,
          [field]: value
        }
      });
    },

    resetHrForm() {
      this.setData({
        hrForm: emptyHrForm()
      });
    },

    startCreateHr() {
      this.resetHrForm();
      this.setData({ showAddEditForm: true });
    },

    async saveHr() {
      const { name, studentId } = this.data.hrForm;
    
      if (!name || !studentId) {
        wx.showToast({
          title: localeCopy.copy_4f9250c03f,
          icon: 'none'
        });
        return;
      }
    
      this.setLoading('saveHr', true);
      try {
        const result = await this.callCloud('saveHrInfo', {
          name,
          studentId
        });
    
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_215e3c57da,
            icon: 'none'
          });
          return;
        }
    
        await this.loadHrList();
        await this.loadHrProfileAdminData();
        this.setData({
          hrForm: emptyHrForm(),
          showAddEditForm: false
        });
        await this.openHrPersonDetail({ currentTarget: { dataset: { hrId: result.id } } });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_215e3c57da,
          icon: 'none'
        });
      } finally {
        this.setLoading('saveHr', false);
      }
    },

    deleteHr(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: localeCopy.leaveOrganizationTitle,
        content: localeCopy.leaveOrganizationMessage,
        confirmColor: '#ef4444',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          try {
            const result = await this.callCloud('deleteHrInfo', { id });
            if (!result || result.status !== 'success') {
              wx.showToast({ title: result && result.message || localeCopy.copy_076bb5d383, icon: 'none' });
              return;
            }
            await Promise.all([this.loadHrList(), this.loadHrProfileAdminData()]);
            wx.showToast({
              title: localeCopy.membershipLeft,
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: localeCopy.copy_076bb5d383,
              icon: 'none'
            });
          }
        }
      });
    },

    async unbindHrWechat(e) {
      if (!this.data.canGlobalAccountManage) return;
      const hrId = String(e.currentTarget.dataset.hrId || '');
      if (!hrId) return;
      const row = this.getHrGovernanceRow(hrId);
      if (!row || this.data.authActionLoadingKey) return;
      this.setData({ authActionLoadingKey: 'unbind-' + hrId });
      try {
        const result = await this.callCloud('unbindHrWechat', { hrId });
        if (result.status !== 'success') {
          showShortToast(result.message || localeCopy.copy_32dc191e8f);
          return;
        }
        this.patchHrGovernance(row.personId, {
          status: 'recovery_required',
          hasActiveBinding: false,
          activeSessionCount: 0,
          pendingRecoveryId: ''
        }, { wxBindStatus: 'unbound' });
        showShortToast(localeCopy.copy_52128a24e4, 'success');
      } catch (error) {
        showShortToast(localeCopy.copy_32dc191e8f);
      } finally {
        this.setData({ authActionLoadingKey: '' });
      }
    },

    chooseTable() {
      let self = this;
      self._csvImportActive = true;
  
      chooseTableFile(self.callCloud.bind(self)).then(function (tableData) {
        if (!tableData) { self._csvImportActive = false; return; }
  
        let headers = tableData.headers;
        let rows = tableData.rows;
        let fileName = tableData.fileName;
  
        let samples = [headers];
        for (let r = 0; r < Math.min(rows.length, 6); r++) {
          samples.push(rows[r]);
        }
  
        let templateFields = (self.data.hrProfileTemplateForm || {}).fields || [];
        let result = buildCsvColumnMapping(headers, samples, templateFields);
  
        self.setData({
          showCsvMappingDialog: true,
          csvImportRows: result.rows,
          csvImportHeaders: headers,
          csvImportDataRows: rows,
          csvImportSheetName: tableData.sheetName || '',
          csvImportSourceType: tableData.type || '',
          csvImportFileName: fileName || '',
          csvImportSamples: samples
        });
        self._csvImportActive = false;
      }).catch(function (err) {
        console.error('Table file parse error:', err);
        wx.showToast({ title: localeCopy.copy_cc78fc735e, icon: 'none' });
        self._csvImportActive = false;
      });
    },

    closeCsvMappingDialog() {
      this._csvImportActive = false;
      this.setData({ showCsvMappingDialog: false, showHrImportPreview: false });
    },

    toggleCsvSkipInvalid() {
      this.setData({ csvImportSkipInvalid: !this.data.csvImportSkipInvalid });
    },

    buildValidationErrorCards(flatErrors) {
      let cards = [];
      let cardMap = {};
      for (let i = 0; i < flatErrors.length; i++) {
        let e = flatErrors[i];
        let key = e.studentId || '__no_id__';
        if (!cardMap[key]) {
          cardMap[key] = { name: e.name, studentId: e.studentId, errors: [] };
          cards.push(cardMap[key]);
        }
        cardMap[key].errors.push({
          fieldName: e.fieldName,
          fieldType: e.fieldType,
          errorValue: e.errorValue,
          errorReason: e.errorReason
        });
      }
      return cards;
    },

    downloadErrorTable() {
      let self = this;
      let errors = self.data.validationErrors || [];
      if (!errors.length) {
        wx.showToast({ title: localeCopy.copy_62e4cca082, icon: 'none' });
        return;
      }
      wx.showActionSheet({
        itemList: [localeCopy.copy_7ffcbc33aa, localeCopy.copy_5503123f4c],
        success: function (res) {
          let format = res.tapIndex === 0 ? 'csv' : 'excel';
          let headers = [
            { key: 'name', label: localeCopy.copy_3c946202ff },
            { key: 'studentId', label: localeCopy.copy_cbb853db1b },
            { key: 'fieldName', label: localeCopy.copy_553705a0cd },
            { key: 'fieldType', label: localeCopy.copy_0304ae11cd },
            { key: 'errorValue', label: localeCopy.copy_5196fb52ef },
            { key: 'errorReason', label: localeCopy.copy_4217b924a4 }
          ];
          let rows = errors.map(function (e) {
            return {
              name: e.name || '',
              studentId: e.studentId || '',
              fieldName: e.fieldName || '',
              fieldType: e.fieldType || '',
              errorValue: e.errorValue || '',
              errorReason: e.errorReason || ''
            };
          });
          if (format === 'excel') {
            self.callCloud('buildTableFile', { headers: headers, rows: rows, sheetName: localeCopy.copy_bb51235352 }).then(function (result) {
              if (result && result.status === 'success' && result.fileBase64) {
                saveAndShareFile(result.fileBase64, localeCopy.copy_2ba036eb5f, 'xlsx');
              } else {
                wx.showToast({ title: localeCopy.copy_2b61466286, icon: 'none' });
              }
            }).catch(function () {
              wx.showToast({ title: localeCopy.copy_2b61466286, icon: 'none' });
            });
          } else {
            saveAndShareFile(buildCsv(headers, rows), localeCopy.copy_2ba036eb5f, 'csv');
          }
        }
      });
    },

    closeValidationErrors() {
      this.setData({ showValidationErrors: false });
    },

    onCsvMappingTargetChange(e) {
      let rowIndex = Number(e.currentTarget.dataset.index);
      let rows = this.data.csvImportRows.slice();
      let currentRow = rows[rowIndex] || {};
      let values = currentRow.mappingValues || [];
      let optionIndex = Number(e.detail.value);
      let targetValue = values[optionIndex];
      if (isNaN(rowIndex) || targetValue === undefined) return;

      rows[rowIndex] = {
        columnIndex: currentRow.columnIndex,
        columnKey: currentRow.columnKey,
        header: currentRow.header,
        target: targetValue,
        sampleValue: currentRow.sampleValue
      };
      let templateFields = (this.data.hrProfileTemplateForm || {}).fields || [];
      this.setData({ csvImportRows: refreshCsvMappingOptions(rows, templateFields) });
    },

    buildHrTableImportPayload() {
      let basicFields = ['name', 'studentId', 'department', 'identity', 'workGroup'];
      let basicFieldSet = {};
      for (let i = 0; i < basicFields.length; i++) basicFieldSet[basicFields[i]] = true;
      let basicMapping = {};
      let extensionMapping = [];
      let mappingRows = this.data.csvImportRows || [];
      for (let rowIndex = 0; rowIndex < mappingRows.length; rowIndex++) {
        let mappingRow = mappingRows[rowIndex];
        if (!mappingRow || !mappingRow.target || mappingRow.target === 'ignore') continue;
        if (basicFieldSet[mappingRow.target]) {
          basicMapping[mappingRow.target] = mappingRow.columnIndex;
        } else {
          extensionMapping.push({
            columnIndex: mappingRow.columnIndex,
            fieldId: mappingRow.target
          });
        }
      }
      return {
        headers: this.data.csvImportHeaders || [],
        rows: this.data.csvImportDataRows || [],
        basicMapping: basicMapping,
        extensionMapping: extensionMapping,
        skipInvalid: !!this.data.csvImportSkipInvalid
      };
    },

    flattenHrImportErrors(errorGroups) {
      let flatErrors = [];
      let groups = errorGroups || [];
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        let group = groups[groupIndex] || {};
        let errors = group.errors || [];
        for (let errorIndex = 0; errorIndex < errors.length; errorIndex++) {
          let error = errors[errorIndex] || {};
          flatErrors.push({
            rowNumber: group.rowNumber || 0,
            name: group.name || '',
            studentId: group.studentId || '',
            fieldName: error.field || '',
            fieldType: error.fieldType || '',
            errorValue: error.value || '',
            errorReason: error.error || ''
          });
        }
      }
      return flatErrors;
    },

    buildHrImportPreviewView(preview) {
      let data = preview || {};
      let ignoredColumns = data.ignoredColumns || [];
      let mappings = data.mappings || [];
      let normalizedMappings = [];
      for (let i = 0; i < mappings.length; i++) {
        let item = mappings[i] || {};
        normalizedMappings.push({
          columnKey: 'preview-column-' + item.columnIndex,
          header: item.header || localeCopy.copy_927e8200f7,
          targetLabel: item.targetLabel || localeCopy.copy_6195ef12a0,
          targetTypeLabel: item.targetType === 'extension' ? localeCopy.copy_9ec66981b8 : localeCopy.copy_6d61e35304
        });
      }
      let normalizedIgnored = [];
      for (let j = 0; j < ignoredColumns.length; j++) {
        normalizedIgnored.push({
          columnKey: 'ignored-column-' + ignoredColumns[j].columnIndex,
          header: ignoredColumns[j].header || localeCopy.copy_927e8200f7
        });
      }
      let invalidRows = Number(data.invalidRows || 0);
      let skipInvalid = !!this.data.csvImportSkipInvalid;
      return {
        fileName: this.data.csvImportFileName || localeCopy.copy_6278f75572,
        sheetName: this.data.csvImportSheetName || localeCopy.copy_a62f5b5e20,
        totalRows: Number(data.totalRows || 0),
        validRows: Number(data.validRows || 0),
        invalidRows: invalidRows,
        newRecords: Number(data.newRecords || 0),
        updateRecords: Number(data.updateRecords || 0),
        preservedEmptyFields: Number(data.preservedEmptyFields || 0),
        mappings: normalizedMappings,
        ignoredColumns: normalizedIgnored,
        newDepartments: data.newDepartments || [],
        newIdentities: data.newIdentities || [],
        newWorkGroups: data.newWorkGroups || [],
        errors: data.errors || [],
        canImport: invalidRows === 0 || skipInvalid,
        skipInvalid: skipInvalid
      };
    },

    async confirmCsvMapping() {
      let payload = this.buildHrTableImportPayload();
      let requiredFields = ['name', 'studentId', 'department', 'identity'];
      let fieldLabels = { name: localeCopy.copy_3c946202ff, studentId: localeCopy.copy_cbb853db1b, department: localeCopy.copy_62f8e70200, identity: localeCopy.copy_474f638a6f };
      let missingLabels = [];
      for (let i = 0; i < requiredFields.length; i++) {
        if (payload.basicMapping[requiredFields[i]] === undefined) {
          missingLabels.push(fieldLabels[requiredFields[i]]);
        }
      }
      if (missingLabels.length) {
        wx.showModal({
          title: localeCopy.copy_defcb9a40c,
          content: localeCopy.copy_d661ec9421 + missingLabels.join('、') + localeCopy.copy_ab34b1e15d,
          showCancel: false,
          confirmText: localeCopy.copy_b722908172
        });
        return;
      }

      this._csvImportActive = true;
      this.setData({ csvImportLoading: true });
      try {
        let result = await this.callCloud('previewHrTableImport', payload);
        if (!result || result.status !== 'success') {
          wx.showToast({ title: (result && result.message) || localeCopy.copy_e58fa637eb, icon: 'none' });
          return;
        }
        this.setData({
          showCsvMappingDialog: false,
          showHrImportPreview: true,
          hrImportPreview: this.buildHrImportPreviewView(result.preview)
        });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_e58fa637eb, icon: 'none' });
      } finally {
        this._csvImportActive = false;
        this.setData({ csvImportLoading: false });
      }
    },

    cancelHrImportPreview() {
      this._csvImportActive = false;
      this.setData({ showHrImportPreview: false, showCsvMappingDialog: true });
    },

    closeHrImportPreview() {
      this.cancelHrImportPreview();
    },

    async confirmHrTableImport() {
      let preview = this.data.hrImportPreview || {};
      if (!preview.canImport) {
        wx.showToast({ title: localeCopy.copy_2e92a9de4f, icon: 'none' });
        return;
      }
      this._csvImportActive = true;
      this.setData({ csvImportLoading: true });
      wx.showLoading({ title: localeCopy.copy_f39423b4c5, mask: true });
      try {
        let result = await this.callCloud('importHrTable', this.buildHrTableImportPayload());
        if (result && result.status === 'validation_errors') {
          let validationErrors = this.flattenHrImportErrors(result.errors);
          this.setData({
            showHrImportPreview: false,
            showCsvMappingDialog: true,
            showValidationErrors: true,
            validationErrors: validationErrors,
            validationErrorCards: this.buildValidationErrorCards(validationErrors),
            validationErrorSummary: localeCopy.copy_aee6f6c499 + validationErrors.length + localeCopy.copy_23bb2dcf13
          });
          return;
        }
        if (!result || result.status !== 'success') {
          wx.showToast({ title: (result && result.message) || localeCopy.copy_0c9080582a, icon: 'none' });
          return;
        }

        let skippedErrors = this.flattenHrImportErrors(result.errors);
        this.setData({
          showHrImportPreview: false,
          showCsvMappingDialog: false,
          csvName: this.data.csvImportFileName || localeCopy.copy_03e326cb9b
        });
        await Promise.all([this.loadDepartmentList(), this.loadIdentityList()]);
        await this.loadWorkGroupList();
        await Promise.all([this.loadHrList(), this.loadHrProfileAdminData()]);
        this.updateHrFormOptions();

        if (skippedErrors.length) {
          this.setData({
            showValidationErrors: true,
            validationErrors: skippedErrors,
            validationErrorCards: this.buildValidationErrorCards(skippedErrors),
            validationErrorSummary: localeCopy.copy_4c8603086a + Number(result.count || 0) + localeCopy.copy_067b107bd7 + skippedErrors.length + localeCopy.copy_c6e80c1d75
          });
          wx.showToast({ title: localeCopy.copy_8c05f916f4, icon: 'success' });
        } else {
          wx.showToast({ title: localeCopy.copy_4c8603086a + Number(result.count || 0) + localeCopy.copy_9aec79b593, icon: 'success' });
        }
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_0c9080582a, icon: 'none' });
      } finally {
        wx.hideLoading();
        this._csvImportActive = false;
        this.setData({ csvImportLoading: false });
      }
    }
  }
});
