// Behavior: hrInfo tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { PROFILE_EDIT_MODE_OPTIONS, PROFILE_FIELD_TYPE_OPTIONS, NUMBER_RULE_OPTIONS, emptyHrForm, emptyHrProfileTemplateForm, emptyHrProfileFilters, createEmptyProfileField, normalizeHrProfileFieldForForm, applyHrProfileFilters, buildCsvColumnMapping, refreshCsvMappingOptions, showShortToast, buildHrProfileFilterOptions, validateProfileField, buildFieldHint } = utils;
const { chooseTableFile, buildCsv, saveAndShareFile } = require('../../../../../utils/tableFile');
const orgSession = require('../../../../../utils/orgSession');

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
          title: '请稍后刷新人事成员',
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
          console.error('批量维护失败:', result.message);
          wx.showToast({
            title: result.message || '未完成，请重试',
            icon: 'none'
          });
          return;
        }
  
        await this.loadDepartmentList();
        await this.loadWorkGroupList();
        await this.loadIdentityList();
        this.updateHrFormOptions();
        
        const stats = result.stats || {};
        const changedCount = ['departmentsCreated', 'identitiesCreated', 'workGroupsCreated']
          .reduce((sum, key) => sum + Number(stats[key] || 0), 0);
        wx.showToast({
          title: changedCount ? `已补齐${changedCount}项` : '组织字典已完整',
          icon: 'success'
        });
      } catch (error) {
        console.error('批量维护失败:', error);
        wx.showToast({
          title: '未完成，请重试',
          icon: 'none'
        });
      } finally {
        this.setLoading('batchMaintain', false);
      }
    },

    async loadHrProfileAdminData() {
      const request = orgSession.beginRequest(this, 'hrProfileAdmin');
      this.setLoading('profile', true);
      try {
        const result = await this.callCloud('listHrProfileAdminData');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '请稍后刷新人事模板',
            icon: 'none'
          });
          return;
        }
  
        const template = result.template || null;
        const rawRows = result.rows || [];
        const hrProfileFields = template && Array.isArray(template.fields) ? template.fields : [];
        const hrProfileFilterOptions = buildHrProfileFilterOptions(rawRows);
        // Cascade work group options based on current department filter
        if (this.data.hrProfileFilters.department === '全部部门') {
          hrProfileFilterOptions.workGroups = ['无'];
        } else {
          const dept = this.data.departmentList.find(d => d.name === this.data.hrProfileFilters.department) || {};
          const wgs = this.data.workGroupList
            .filter(w => w.departmentId === dept.id)
            .map(w => w.name);
          hrProfileFilterOptions.workGroups = ['无', ...wgs];
        }
        const hrProfileRows = applyHrProfileFilters(rawRows, this.data.hrProfileFilters);
        this.setData({
          hrProfileTemplateForm: template ? {
            description: template.description || '',
            editMode: template.editMode || PROFILE_EDIT_MODE_OPTIONS[0].value,
            editModeLabel: (PROFILE_EDIT_MODE_OPTIONS.find((item) => item.value === (template.editMode || PROFILE_EDIT_MODE_OPTIONS[0].value)) || PROFILE_EDIT_MODE_OPTIONS[0]).label,
            fields: Array.isArray(template.fields) && template.fields.length
              ? template.fields.map((item) => normalizeHrProfileFieldForForm(item))
              : [createEmptyProfileField()]
          } : emptyHrProfileTemplateForm(),
          hrProfileRawRows: rawRows,
          hrProfileFields,
          hrProfileFilterOptions,
          hrProfileRows
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        wx.showToast({
          title: '请稍后刷新人事模板',
          icon: 'none'
        });
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
          showShortToast('请稍后刷新');
          return;
        }
        const active = result.activeSnapshot || null;
        if (active && Array.isArray(active.fields)) {
          active.fields = active.fields.map((field) => {
            const typeOption = PROFILE_FIELD_TYPE_OPTIONS.find((item) => item.value === field.type);
            let ruleText = '';
            if (field.type === 'text' && (field.minLength != null || field.maxLength != null)) {
              ruleText = `长度 ${field.minLength == null ? '不限' : field.minLength}–${field.maxLength == null ? '不限' : field.maxLength}`;
            } else if (field.type === 'number') {
              if (field.numberRule === 'length_range') {
                ruleText = `位数 ${field.minDigits == null ? '不限' : field.minDigits}–${field.maxDigits == null ? '不限' : field.maxDigits}`;
              } else if (field.minValue != null || field.maxValue != null) {
                ruleText = `范围 ${field.minValue == null ? '不限' : field.minValue}–${field.maxValue == null ? '不限' : field.maxValue}`;
              }
              if (field.allowDecimal === false) ruleText = `${ruleText ? `${ruleText} · ` : ''}填写整数`;
            } else if (field.type === 'sequence') {
              ruleText = (field.options || []).length ? `选项：${field.options.join(' / ')}` : '暂无选项';
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
        showShortToast('请稍后刷新');
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
        if (result.status !== 'success') return showShortToast('未复制，请重试');
        await this.loadHrProfileTemplates();
        showShortToast('已复制', 'success');
      } catch (_) {
        showShortToast('未复制，请重试');
      } finally {
        this.setLoading('duplicateHrProfileTemplate', false);
      }
    },

    deleteHrProfileTemplate(e) {
      const id = String(e.currentTarget.dataset.id || '');
      const template = (this.data.hrProfileTemplateList || []).find((item) => item.id === id);
      if (!template) return;
      wx.showModal({
        title: '删除人事模板',
        content: '确认删除此模板？',
        confirmText: '彻底删除',
        confirmColor: '#ef4444',
        success: async (modalResult) => {
          if (!modalResult.confirm) return;
          try {
            const result = await this.callCloud('deleteHrProfileTemplateDefinition', { id });
            if (result.status !== 'success') return showShortToast('未删除，请重试');
            await this.loadHrProfileTemplates();
            showShortToast('已删除', 'success');
          } catch (_) {
            showShortToast('未删除，请重试');
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
        if (result.status !== 'success') return showShortToast('请稍后刷新');
        const targetFields = (result.targetTemplate && result.targetTemplate.fields) || [];
        const sources = (result.sourceFields || []).map((source) => {
          const targetOptions = [{ id: '', label: '请选择新资料项' }]
            .concat(targetFields.filter((target) => (source.compatibleTargetIds || []).indexOf(target.id) >= 0));
          return Object.assign({}, source, {
            action: 'hide',
            actionIndex: 0,
            targetTemplateFieldId: '',
            targetIndex: 0,
            targetOptions,
            suggestionText: source.suggestedTargetId
              ? `建议移入：${(targetFields.find((field) => field.id === source.suggestedTargetId) || {}).label || ''}`
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
        showShortToast('请稍后刷新');
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
        return showShortToast('请选择目标');
      }
      this.setLoading('previewHrTemplateSwitch', true);
      try {
        const result = await this.callCloud('previewHrProfileTemplateSwitch', {
          targetTemplateId: target.id,
          fieldActions: actions
        });
        if (result.status === 'mapping_blocked') {
          const invalidCount = (result.blockers || []).reduce((sum, item) => sum + Number(item.invalidCount || 0), 0);
          wx.showModal({ title: '请先调整资料', content: `有 ${invalidCount} 项资料不符合新模板要求，请修改后重试。`, showCancel: false });
          return;
        }
        if (result.status !== 'success') return showShortToast('请稍后重试');
        this.setData({ hrTemplateSwitchToken: result.switchToken, hrTemplateSwitchSummary: result.summary });
        const summary = result.summary || {};
        const hasDelete = summary.hasDelete === true;
        wx.showModal({
          title: hasDelete ? '确认永久删除' : '确认应用模板',
          content: `转移${summary.mapValueCount || 0}项，隐藏${summary.hideValueCount || 0}项，永久删除${summary.deleteValueCount || 0}项。${hasDelete ? '删除后无法恢复。' : ''}`,
          confirmText: hasDelete ? '删除并应用' : '确认应用',
          confirmColor: hasDelete ? '#ef4444' : '#2563eb',
          success: (modalResult) => {
            if (modalResult.confirm) this.applyHrProfileTemplateSwitch(hasDelete);
          }
        });
      } catch (_) {
        showShortToast('请稍后重试');
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
          showShortToast(result.status === 'stale_switch' ? '请重新确认' : '未应用，请重试');
          return;
        }
        this.closeHrProfileTemplateSwitch();
        await Promise.all([this.loadHrProfileTemplates(), this.loadHrProfileAdminData()]);
        showShortToast('已应用', 'success');
      } catch (_) {
        showShortToast('未应用，请重试');
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
        if (result.status !== 'success') return showShortToast('未保存，请重试');
        await Promise.all([this.loadHrProfileTemplates(), this.loadHrProfileAdminData()]);
        showShortToast('已保存', 'success');
      } catch (_) {
        showShortToast('未保存，请重试');
      } finally {
        this.setLoading('saveActiveHrProfileSettings', false);
      }
    },

    refreshHrProfileRows(nextFilters = this.data.hrProfileFilters, nextRawRows = this.data.hrProfileRawRows) {
      this.setData({
        hrProfileRows: applyHrProfileFilters(nextRawRows, nextFilters)
      });
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
        if (value === '全部部门') {
          patch['hrProfileFilterOptions.workGroups'] = ['无'];
          nextFilters.workGroup = '无';
          patch.hrProfileFilters = nextFilters;
        } else {
          const dept = this.data.departmentList.find(d => d.name === value) || {};
          const wgs = this.data.workGroupList
            .filter(w => w.departmentId === dept.id)
            .map(w => w.name);
          patch['hrProfileFilterOptions.workGroups'] = ['无', ...wgs];
          nextFilters.workGroup = '无';
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
        'hrProfileFilterOptions.workGroups': ['无'],
        _hrInfoKeywordInput: ''
      });
      this.refreshHrProfileRows(nextFilters);
    },

    exportHrProfiles() {
      const rows = this.data.hrProfileRows || [];
      if (!rows.length) {
        showShortToast('暂无可导出资料');
        return;
      }

      const fields = this.data.hrProfileFields || [];
      const columns = [
        { key: 'name', label: '姓名', groupLabel: '基本信息', source: 'name', checked: true },
        { key: 'studentId', label: '学号', groupLabel: '基本信息', source: 'studentId', checked: true },
        { key: 'department', label: '所属部门', groupLabel: '基本信息', source: 'department', checked: true },
        { key: 'identity', label: '身份', groupLabel: '基本信息', source: 'identity', checked: true },
        { key: 'workGroup', label: '工作分工（职能组）', groupLabel: '基本信息', source: 'workGroup', checked: true },
        { key: 'wxBindStatus', label: '微信绑定状态', groupLabel: '基本信息', source: 'wxBindStatus', checked: true },
        { key: 'auditStatus', label: '补充资料状态', groupLabel: '基本信息', source: 'auditStatus', checked: true }
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
          groupLabel: '补充资料',
          source: 'profile',
          fieldId: field.id,
          checked: true
        });
        if (pendingFieldMap[field.id]) {
          columns.push({
            key: 'pending_' + fieldIndex,
            label: field.label + '（待审核）',
            groupLabel: '待审核资料',
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
        showShortToast('请选择导出内容');
        return;
      }
      const headers = columns.map((column) => ({ key: column.key, label: column.label }));
      const rows = (this.data.hrProfileRows || []).map((item) => {
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
              bound: '已绑定',
              pending_activation: '待激活',
              unbound: '未绑定'
            };
            exportRow[column.key] = bindStatusTextMap[item.wxBindStatus] || '未绑定';
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
      const orgName = this.data.currentOrganizationName || '当前组织';
      const fileName = orgName + '-成员资料';
      this.setLoading('exportHrProfiles', true);
      try {
        const result = await this.callCloud('buildTableFile', {
          format,
          headers,
          rows,
          sheetName: '成员资料'
        });
        if (!result || result.status !== 'success' || !result.fileBase64) {
          showShortToast((result && result.message) || '未导出，请重试');
          return;
        }
        this.setData({ hrProfileExportVisible: false });
        await saveAndShareFile(result.fileBase64, fileName, result.extension || format);
      } catch (error) {
        showShortToast('未导出，请重试');
      } finally {
        this.setLoading('exportHrProfiles', false);
      }
    },

    async openHrPersonDetail(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      if (!hrId) return;
  
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
  
      this.setData({ showHrPersonDetail: true, detailHrId: hrId, loadingDetailHr: true });
      try {
        const result = await this.callCloud('getHrPersonDetail', { hrId });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '请稍后刷新', icon: 'none' });
          this.setData({ showHrPersonDetail: false, loadingDetailHr: false });
          return;
        }
        const vals = {};
        const profile = result.profile || {};
        if (profile.name) vals._name = profile.name;
        if (profile.studentId) vals._studentId = profile.studentId;
        if (profile.departmentId) vals._departmentId = profile.departmentId;
        if (profile.department) vals._departmentName = profile.department;
        if (profile.identityId) vals._identityId = profile.identityId;
        if (profile.identity) vals._identityName = profile.identity;
        if (profile.workGroupId) vals._workGroupId = profile.workGroupId;
        if (profile.workGroup) vals._workGroupName = profile.workGroup;
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
        this.setData({
          detailHrProfile: profile,
          detailHrTemplate,
          detailHrValues: vals,
          detailHrPendingValues: result.pendingValues || {},
          detailHrAuditStatus: result.auditStatus || 'none',
          detailHrAuditStatusText: result.auditStatusText || '未提交',
          detailHrRejectionReason: result.rejectionReason || '',
          detailHrHasPending: !!result.hasPending,
          loadingDetailHr: false
        });
        this._ensureDetailFormOptions();
        this.updateDetailWorkGroupOptions();
        this._syncDetailPickerValues();
        await this.loadMembershipAssignments(hrId);
      } catch (err) {
        wx.showToast({ title: '请稍后刷新详情', icon: 'none' });
        this.setData({ showHrPersonDetail: false, loadingDetailHr: false });
      }
    },

    async loadMembershipAssignments(hrId) {
      try {
        const result = await this.callCloud('listMembershipAssignments', {
          hrId: hrId || this.data.detailHrId
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '请稍后刷新岗位', icon: 'none' });
          return;
        }
        this.setData({ membershipAssignmentList: result.list || [] });
      } catch (error) {
        wx.showToast({ title: '请稍后刷新岗位', icon: 'none' });
      }
    },

    startCreateMembershipAssignment() {
      this.setData({
        membershipAssignmentFormVisible: true,
        membershipAssignmentForm: {
          id: '',
          assignmentKind: 'staff',
          assignmentKindIndex: 0,
          title: '',
          departmentId: '',
          department: '',
          identityId: '',
          identity: '',
          workGroupId: '',
          workGroup: '',
          isPrimary: false
        },
        assignmentDepartmentIndex: 0,
        assignmentIdentityIndex: 0,
        assignmentWorkGroupIndex: 0,
        assignmentWorkGroupOptions: []
      });
    },

    editMembershipAssignment(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = (this.data.membershipAssignmentList || [])[index];
      if (!item) return;
      const departments = this.data.departmentList || [];
      const identities = this.data.identityList || [];
      const workGroups = [{ id: '', name: '不设置' }].concat(
        (this.data.workGroupList || [])
          .filter((row) => String(row.departmentId) === String(item.departmentId))
      );
      this.setData({
        membershipAssignmentFormVisible: true,
        membershipAssignmentForm: {
          ...item,
          assignmentKindIndex: Math.max(0, (this.data.assignmentKindValues || []).indexOf(item.assignmentKind))
        },
        assignmentDepartmentIndex: Math.max(0, departments.findIndex((row) => String(row.id) === String(item.departmentId))),
        assignmentIdentityIndex: Math.max(0, identities.findIndex((row) => String(row.id) === String(item.identityId))),
        assignmentWorkGroupIndex: Math.max(0, workGroups.findIndex((row) => String(row.id) === String(item.workGroupId))),
        assignmentWorkGroupOptions: workGroups
      });
    },

    cancelMembershipAssignmentEdit() {
      this.setData({
        membershipAssignmentFormVisible: false,
        membershipAssignmentForm: {},
        assignmentWorkGroupOptions: []
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
      const department = (this.data.departmentList || [])[index] || {};
      const workGroups = [{ id: '', name: '不设置' }].concat(
        (this.data.workGroupList || [])
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
      const identity = (this.data.identityList || [])[index] || {};
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

    onMembershipAssignmentPrimaryChange(e) {
      this.setData({ 'membershipAssignmentForm.isPrimary': Boolean(e.detail.value) });
    },

    async saveMembershipAssignment() {
      const form = this.data.membershipAssignmentForm || {};
      if (!form.departmentId || !form.identityId) {
        wx.showToast({ title: '请选择部门和身份', icon: 'none' });
        return;
      }
      this.setLoading('saveMembershipAssignment', true);
      try {
        const result = await this.callCloud('saveMembershipAssignment', {
          ...form,
          hrId: this.data.detailHrId
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '未保存，请重试', icon: 'none' });
          return;
        }
        this.cancelMembershipAssignmentEdit();
        await this.loadMembershipAssignments();
        wx.showToast({ title: '岗位已保存', icon: 'success' });
      } catch (error) {
        wx.showToast({ title: '未保存，请重试', icon: 'none' });
      } finally {
        this.setLoading('saveMembershipAssignment', false);
      }
    },

    deleteMembershipAssignment(e) {
      const id = String(e.currentTarget.dataset.id || '');
      if (!id) return;
      wx.showModal({
        title: '删除岗位',
        content: '删除后将无法再选择该岗位，历史记录不受影响。',
        success: async (modalResult) => {
          if (!modalResult.confirm) return;
          try {
            const result = await this.callCloud('deleteMembershipAssignment', { id });
            if (result.status !== 'success') {
              wx.showToast({ title: result.message || '未删除，请重试', icon: 'none' });
              return;
            }
            await this.loadMembershipAssignments();
            wx.showToast({ title: '岗位已删除', icon: 'success' });
          } catch (error) {
            wx.showToast({ title: '未删除，请重试', icon: 'none' });
          }
        }
      });
    },

    closeHrPersonDetail() {
      this.setData({
        showHrPersonDetail: false,
        detailWorkGroupOptions: [],
        detailDepartmentValue: 0,
        detailIdentityValue: 0,
        detailWorkGroupValue: 0,
        detailFieldValues: {},
        membershipAssignmentList: [],
        membershipAssignmentFormVisible: false,
        membershipAssignmentForm: {}
      });
    },

    onDetailBasicFieldInput(e) {
      const field = String(e.currentTarget.dataset.field || '');
      this.setData({ ['detailHrValues.' + field]: e.detail.value });
    },

    onDetailProfileFieldInput(e) {
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

    onDetailDepartmentChange(e) {
      const index = Number(e.detail.value);
      const dept = this.data.departmentList[index] || {};
      this.setData({
        'detailHrValues._departmentId': dept.id || '',
        'detailHrValues._departmentName': dept.name || '',
        'detailHrValues._workGroupId': '',
        'detailHrValues._workGroupName': '',
        detailDepartmentValue: index
      });
      this.updateDetailWorkGroupOptions(dept.id);
    },

    onDetailIdentityChange(e) {
      const index = Number(e.detail.value);
      const ident = this.data.identityList[index] || {};
      this.setData({
        'detailHrValues._identityId': ident.id || '',
        'detailHrValues._identityName': ident.name || '',
        detailIdentityValue: index
      });
    },

    onDetailWorkGroupChange(e) {
      const index = Number(e.detail.value);
      if (index === 0) {
        this.setData({
          'detailHrValues._workGroupId': '',
          'detailHrValues._workGroupName': '',
          detailWorkGroupValue: 0
        });
        return;
      }
      const deptId = this.data.detailHrValues._departmentId || (this.data.detailHrProfile || {}).departmentId || '';
      const idStr = String(deptId);
      const wgs = this.data.workGroupList.filter(w => String(w.departmentId) === idStr);
      const wg = wgs[index - 1] || {};
      this.setData({
        'detailHrValues._workGroupId': wg.id || '',
        'detailHrValues._workGroupName': wg.name || '',
        detailWorkGroupValue: index
      });
    },

    async saveHrPersonDetail() {
      const vals = this.data.detailHrValues || {};
      const profile = this.data.detailHrProfile || {};
      const hrId = this.data.detailHrId;
      if (!hrId) return;
  
      const name = (vals._name || '').trim();
      const studentId = (vals._studentId || '').trim();
      const departmentId = vals._departmentId || profile.departmentId || '';
      const identityId = vals._identityId || profile.identityId || '';
      const workGroupId = vals._workGroupId || profile.workGroupId || '';
  
      if (!name || !studentId || !departmentId || !identityId) {
        wx.showToast({ title: '请填写完整的姓名、学号、部门和身份', icon: 'none' });
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
  
      this.setData({ savingDetailHr: true });
      try {
        const result = await this.callCloud('saveHrPersonFull', {
          hrId, name, studentId, departmentId, identityId, workGroupId, profileValues
        });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '未保存，请重试', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已保存', icon: 'success' });
        this.setData({ showHrPersonDetail: false });
        this.loadHrProfileAdminData();
        this.loadHrList();
      } catch (err) {
        wx.showToast({ title: '未保存，请重试', icon: 'none' });
      } finally {
        this.setData({ savingDetailHr: false });
      }
    },

    async approveDetailHrProfile() {
      const profile = this.data.detailHrProfile || {};
      const studentId = profile.studentId || '';
      if (!studentId) return;
      try {
        const result = await this.callCloud('reviewHrProfileChange', { studentId, action: 'approve' });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '未完成，请重试', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已通过', icon: 'success' });
        this.closeHrPersonDetail();
        this.loadHrProfileAdminData();
      } catch (err) {
        wx.showToast({ title: '未完成，请重试', icon: 'none' });
      }
    },

    async rejectDetailHrProfile() {
      const profile = this.data.detailHrProfile || {};
      const studentId = profile.studentId || '';
      if (!studentId) return;
      try {
        const result = await this.callCloud('reviewHrProfileChange', { studentId, action: 'reject' });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || '未完成，请重试', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已驳回', icon: 'success' });
        this.closeHrPersonDetail();
        this.loadHrProfileAdminData();
      } catch (err) {
        wx.showToast({ title: '未完成，请重试', icon: 'none' });
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
          wx.showToast({ title: '表格文件为空或格式不正确', icon: 'none' });
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
          ? headers.slice(0, 5).join('、') + ' 等' + headers.length + '项资料'
          : headers.join('、');
  
        wx.showModal({
          title: '导入资料项',
          content: '表格中有 ' + headers.length + ' 项资料：' + headerPreview + '。请选择替换现有内容，或追加到末尾。',
          confirmText: '替换',
          cancelText: '追加',
          success: function (modalRes) {
            const fields = modalRes.confirm ? newFields : existingFields.concat(newFields);
            _this.setData({ 'hrProfileTemplateForm.fields': fields });
            wx.showToast({ title: '已导入 ' + headers.length + ' 项', icon: 'success' });
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
        wx.showToast({ title: '请填写模板名称', icon: 'none' });
        return;
      }

      if (!fields.length || fields.some((item) => !item.label)) {
        wx.showToast({
          title: '请填写资料项名称',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveProfileTemplate', true);
      wx.showLoading({
        title: '更新中...',
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
          showShortToast('未更新，请重试');
          return;
        }
  
        this.setData({ showHrTemplateEditor: false, hrProfileTemplateForm: emptyHrProfileTemplateForm() });
        await this.loadHrProfileTemplates();
        showShortToast('已更新', 'success');
      } catch (error) {
        showShortToast('未更新，请重试');
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
        title: '通过审核',
        content: '确认通过此次修改？',
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
                title: result.message || '未通过，请重试',
                icon: 'none'
              });
              return;
            }
            await this.loadHrProfileAdminData();
            wx.showToast({
              title: '已通过审核',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '未通过，请重试',
              icon: 'none'
            });
          }
        }
      });
    },

    rejectHrProfileChange(e) {
      const studentId = String(e.currentTarget.dataset.studentId || '').trim();
      if (!studentId) {
        return;
      }
  
      wx.showModal({
        title: '驳回修改',
        content: '确认驳回此次修改？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
  
          try {
            const result = await this.callCloud('reviewHrProfileChange', {
              studentId,
              action: 'reject'
            });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '未驳回，请重试',
                icon: 'none'
              });
              return;
            }
            await this.loadHrProfileAdminData();
            wx.showToast({
              title: '已驳回修改',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '未驳回，请重试',
              icon: 'none'
            });
          }
        }
      });
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

    editHr(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.hrList[index];
      if (!item) {
        return;
      }
  
      this.setData({
        hrForm: {
          id: item.id,
          name: item.name,
          studentId: item.studentId,
          departmentId: item.departmentId || '',
          department: item.department,
          identityId: item.identityId || '',
          identity: item.identity,
          workGroupId: item.workGroupId || '',
          workGroup: item.workGroup || ''
        },
        showAddEditForm: true
      });
    },

    editHrFromProfile(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      const index = (this.data.hrList || []).findIndex(item => String(item.id) === hrId);
      if (index < 0) {
        wx.showToast({ title: '请稍后刷新成员', icon: 'none' });
        return;
      }
      this.editHr({ currentTarget: { dataset: { index } } });
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
      const { id, name, studentId, departmentId, identityId, workGroupId } = this.data.hrForm;
    
      if (!name || !studentId || !departmentId || !identityId) {
        wx.showToast({
          title: '请填写完整人事信息',
          icon: 'none'
        });
        return;
      }
    
      this.setLoading('saveHr', true);
      try {
        const result = await this.callCloud('saveHrInfo', {
          id,
          name,
          studentId,
          departmentId,
          identityId,
          workGroupId
        });
    
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '未保存，请重试',
            icon: 'none'
          });
          return;
        }
    
        this.resetHrForm();
        await this.loadHrList();
        await this.loadHrProfileAdminData(); // refresh unified list
        wx.showToast({
          title: '人事成员已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '未保存，请重试',
          icon: 'none'
        });
      } finally {
        this.setLoading('saveHr', false);
      }
    },

    deleteHr(e) {
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除人事成员',
        content: '删除后将清理绑定信息，是否继续？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          try {
            await this.callCloud('deleteHrInfo', { id });
            await this.loadHrList();
            await this.loadHrProfileAdminData(); // refresh unified list
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '未删除，请重试',
              icon: 'none'
            });
          }
        }
      });
    },

    unbindHrWechat(e) {
      const hrId = String(e.currentTarget.dataset.hrId || '');
      const name = String(e.currentTarget.dataset.name || '该成员');
      if (!hrId) return;

      wx.showModal({
        title: '从所有组织解绑',
        content: '确认解绑「' + name + '」在所有组织中的微信绑定吗？解绑后需重新验证身份。',
        confirmText: '确认解绑',
        confirmColor: '#dc2626',
        success: async (res) => {
          if (!res.confirm) return;

          try {
            const result = await this.callCloud('unbindHrWechat', { hrId });
            if (result.status !== 'success') {
              wx.showToast({ title: result.message || '未解绑，请重试', icon: 'none' });
              return;
            }
            wx.showToast({ title: '已全部解绑', icon: 'success' });
            await this.loadHrProfileAdminData();
            await this.loadHrList();
          } catch (error) {
            wx.showToast({ title: '未解绑，请重试', icon: 'none' });
          }
        }
      });
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
        wx.showToast({ title: '请检查表格格式', icon: 'none' });
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
        wx.showToast({ title: '暂无问题记录', icon: 'none' });
        return;
      }
      wx.showActionSheet({
        itemList: ['CSV 格式 (.csv)', 'Excel 格式 (.xlsx)'],
        success: function (res) {
          let format = res.tapIndex === 0 ? 'csv' : 'excel';
          let headers = [
            { key: 'name', label: '姓名' },
            { key: 'studentId', label: '学号' },
            { key: 'fieldName', label: '资料项' },
            { key: 'fieldType', label: '内容类型' },
            { key: 'errorValue', label: '原内容' },
            { key: 'errorReason', label: '问题说明' }
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
            self.callCloud('buildTableFile', { headers: headers, rows: rows, sheetName: '导入问题清单' }).then(function (result) {
              if (result && result.status === 'success' && result.fileBase64) {
                saveAndShareFile(result.fileBase64, '导入问题明细', 'xlsx');
              } else {
                wx.showToast({ title: '未导出，请重试', icon: 'none' });
              }
            }).catch(function () {
              wx.showToast({ title: '未导出，请重试', icon: 'none' });
            });
          } else {
            saveAndShareFile(buildCsv(headers, rows), '导入问题明细', 'csv');
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
          header: item.header || '未命名列',
          targetLabel: item.targetLabel || '未命名资料项',
          targetTypeLabel: item.targetType === 'extension' ? '补充资料' : '基本资料'
        });
      }
      let normalizedIgnored = [];
      for (let j = 0; j < ignoredColumns.length; j++) {
        normalizedIgnored.push({
          columnKey: 'ignored-column-' + ignoredColumns[j].columnIndex,
          header: ignoredColumns[j].header || '未命名列'
        });
      }
      let invalidRows = Number(data.invalidRows || 0);
      let skipInvalid = !!this.data.csvImportSkipInvalid;
      return {
        fileName: this.data.csvImportFileName || '待导入表格',
        sheetName: this.data.csvImportSheetName || '当前工作表',
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
      let fieldLabels = { name: '姓名', studentId: '学号', department: '所属部门', identity: '身份' };
      let missingLabels = [];
      for (let i = 0; i < requiredFields.length; i++) {
        if (payload.basicMapping[requiredFields[i]] === undefined) {
          missingLabels.push(fieldLabels[requiredFields[i]]);
        }
      }
      if (missingLabels.length) {
        wx.showModal({
          title: '请选择资料所在列',
          content: '请选择以下资料所在列：' + missingLabels.join('、') + '。工作分工可留空。',
          showCancel: false,
          confirmText: '关闭'
        });
        return;
      }

      this._csvImportActive = true;
      this.setData({ csvImportLoading: true });
      try {
        let result = await this.callCloud('previewHrTableImport', payload);
        if (!result || result.status !== 'success') {
          wx.showToast({ title: (result && result.message) || '请稍后重试', icon: 'none' });
          return;
        }
        this.setData({
          showCsvMappingDialog: false,
          showHrImportPreview: true,
          hrImportPreview: this.buildHrImportPreviewView(result.preview)
        });
      } catch (error) {
        wx.showToast({ title: '请稍后重试', icon: 'none' });
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
        wx.showToast({ title: '请修改问题记录', icon: 'none' });
        return;
      }
      this._csvImportActive = true;
      this.setData({ csvImportLoading: true });
      wx.showLoading({ title: '正在导入...', mask: true });
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
            validationErrorSummary: '请修改 ' + validationErrors.length + ' 项内容'
          });
          return;
        }
        if (!result || result.status !== 'success') {
          wx.showToast({ title: (result && result.message) || '未导入，请重试', icon: 'none' });
          return;
        }

        let skippedErrors = this.flattenHrImportErrors(result.errors);
        this.setData({
          showHrImportPreview: false,
          showCsvMappingDialog: false,
          csvName: this.data.csvImportFileName || '已导入表格'
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
            validationErrorSummary: '已导入 ' + Number(result.count || 0) + ' 条，另有 ' + skippedErrors.length + ' 项未导入'
          });
          wx.showToast({ title: '导入完成', icon: 'success' });
        } else {
          wx.showToast({ title: '已导入 ' + Number(result.count || 0) + ' 条', icon: 'success' });
        }
      } catch (error) {
        wx.showToast({ title: '未导入，请重试', icon: 'none' });
      } finally {
        wx.hideLoading();
        this._csvImportActive = false;
        this.setData({ csvImportLoading: false });
      }
    }
  }
});
