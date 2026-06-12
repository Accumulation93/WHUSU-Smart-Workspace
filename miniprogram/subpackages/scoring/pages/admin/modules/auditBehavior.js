/**
 * Audit Workflow Behavior — Admin-side audit management
 *
 * Tabs: auditTemplates | auditStamps | auditSubmissions | auditVerification
 */
const utils = require('./adminUtils');

const { showShortToast, getErrorText } = utils;

module.exports = Behavior({
  data: {
    // ── Audit Flow Templates ──
    auditFlowTemplates: [],
    auditTemplateForm: {
      id: '',
      name: '',
      description: '',
      starterType: 'self',
      starterIdentityId: '',
      starterIdentityName: '',
      starterHrId: '',
      starterHrName: '',
      resubmitMode: 'fresh',
      steps: []
    },
    auditTemplateStepForm: {
      conditions: [],          // [{ conditionType, personHrIds, personHrNames, departmentScope, ... }]
      actionType: 'sign',
      editingIndex: -1
    },
    auditTemplateStepEditorVisible: false,

    // ── Step Condition Editor (sub-editor within step popup) ──
    auditStepConditionEditorVisible: false,
    auditStepConditionForm: {
      conditionType: 'identity_scope',  // 'identity_scope' | 'person'
      // identity scope fields
      departmentScope: 'all', specificDepartmentId: '', specificDepartmentName: '',
      workGroupScope: 'all', specificWorkGroupId: '', specificWorkGroupName: '',
      identityScope: 'all', specificIdentityId: '', specificIdentityName: '',
      // person fields
      personHrIds: '', personHrNames: ''
    },
    auditStepConditionEditingIndex: -1, // -1 = new, >=0 = editing existing

    // ── Unified Multi-Select Picker (replaces personnel + identity pickers) ──
    auditMultiPickerVisible: false,
    auditMultiPickerTarget: '',          // 'personHr'|'department'|'workGroup'|'identity'
    auditMultiPickerTitle: '',
    auditMultiPickerItems: [],           // [{id, name, extra}]
    auditMultiPickerSelectedIds: {},     // {id: true}
    auditMultiPickerSearchKeyword: '',
    auditMultiPickerFilterDept: '全部',
    auditMultiPickerFilterIdent: '全部',
    auditMultiPickerFilteredList: [],
    auditMultiPickerDeptOptions: ['全部'],
    auditMultiPickerIdentOptions: ['全部'],

    // ── Stamps ──
    stamps: [],
    stampForm: { id: '', name: '', imageData: '' },
    stampAssignIdentityId: '',
    stampAssignVisible: false,
    stampAssignSelectedIds: [],

    // ── Audit Submissions ──
    auditSubmissions: [],
    auditSubmissionFilters: { status: '' },
    auditSubmissionDetail: null,
    auditSubmissionDetailVisible: false,

    // ── Verification ──
    verificationPermissions: [],
    verificationGrantHrId: '',
    verificationGrantHrName: '',
    verificationResult: null,
    verificationMode: 'number',    // 'number' | 'id' | 'file'
    verificationInputNumber: '',
    verificationInputId: '',
    verificationFileName: '',
    verificationFilePath: '',
    verificationFileBase64: '',
    verificationFileSize: 0,

    // ── Personnel Picker (unified, single-select) ──
    auditPersonnelPickerVisible: false,
    auditPersonnelPickerTarget: '',
    auditPersonnelPickerLabel: '',
    auditPersonnelPickerSelectedId: '',
    auditPersonnelSearchKeyword: '',
    auditPersonnelFilterDept: '全部',
    auditPersonnelFilterIdent: '全部',
    auditPersonnelDeptOptions: ['全部'],
    auditPersonnelIdentOptions: ['全部'],
    auditPersonnelFilteredList: [],

    // ── Identity Picker (single / multi) ──
    auditIdentityPickerVisible: false,
    auditIdentityPickerTarget: '',
    auditIdentityPickerLabel: '',
    auditIdentityPickerMulti: false,
    auditIdentityPickerSelectedIds: {},
    auditIdentityPickerSelectedCount: 0,

    // ── Template step expand/collapse ──
    auditExpandedTemplateId: '',
  },

  methods: {
    // ═══════════════════════════════════════════════════════
    // Shared helpers
    // ═══════════════════════════════════════════════════════

    /** Derive display name from identityList by id */
    _auditIdentityName(id) {
      if (!id) return '';
      const found = (this.data.identityList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : id;
    },

    /** Derive display name from hrList by id */
    _auditHrName(id) {
      if (!id) return '';
      const found = (this.data.hrList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : id;
    },

    /** Derive display name from departmentList by id */
    _auditDeptName(id) {
      if (!id) return '';
      const found = (this.data.departmentList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : id;
    },

    /** Derive display name from workGroupList by id */
    _auditWgName(id) {
      if (!id) return '';
      const found = (this.data.workGroupList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : id;
    },

    /** Build department options for personnel picker */
    _auditBuildDeptOptions() {
      const depts = this.data.departmentList || [];
      return ['全部'].concat(depts.map(function (d) { return d.name; }));
    },

    /** Build identity options for personnel picker */
    _auditBuildIdentOptions() {
      const idents = this.data.identityList || [];
      return ['全部'].concat(idents.map(function (i) { return i.name; }));
    },

    // ═══════════════════════════════════════════════════════
    // Audit Flow Templates
    // ═══════════════════════════════════════════════════════

    async loadAuditFlowTemplates() {
      this.setLoading('auditTemplates', true);
      try {
        const res = await this.callCloud('listAuditFlowTemplates', {});
        console.log('[audit] listAuditFlowTemplates response:', JSON.stringify(res));
        if (res.status === 'success') {
          var that = this;
          var templates = (res.templates || []).map(function (t) {
            t.steps = (t.steps || []).map(function (s) {
              // Always resolve names from master lists
              s._approverIdentityName = that._auditIdentityName(s.approverIdentityId);
              s._approverHrName = that._auditHrName(s.approverHrId);
              // Resolve conditions with display names
              if (s.conditions && s.conditions.length) {
                s._resolvedConditions = s.conditions.map(function (c) {
                  return that._auditResolveCondition(c);
                });
              } else {
                s._resolvedConditions = [];
              }
              // Build condition summary
              s._conditionSummary = that._auditConditionSummary(s.conditions && s.conditions[0] ? s.conditions[0] : null);
              return s;
            });
            return t;
          });
          this.setData({ auditFlowTemplates: templates });
        } else {
          console.error('[audit] listAuditFlowTemplates failed:', res.message);
        }
      } catch (e) {
        console.error('[audit] loadAuditFlowTemplates error:', e);
        this.setData({ auditFlowTemplates: [] });
      } finally {
        this.setLoading('auditTemplates', false);
      }
    },

    onAuditTemplateFieldInput(e) {
      const field = e.currentTarget.dataset.field;
      const value = e.detail.value;
      this.setData({ ['auditTemplateForm.' + field]: value });
    },

    startCreateAuditTemplate() {
      this.setData({
        auditTemplateForm: {
          id: '', name: '', description: '',
          starterType: 'self',
          starterIdentityId: '', starterIdentityName: '',
          starterHrId: '', starterHrName: '',
          resubmitMode: 'fresh',
          steps: []
        },
        auditTemplateStepForm: {
          conditions: [],
          actionType: 'sign',
          editingIndex: -1
        },
        auditTemplateStepEditorVisible: false
      });
    },

    editAuditTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const template = this.data.auditFlowTemplates.find(function (t) { return t.id === id; });
      if (!template) return;
      var that = this;
      this.setData({
        auditTemplateForm: {
          id: template.id,
          name: template.name,
          description: template.description,
          starterType: template.starterType || 'self',
          starterIdentityId: template.starterIdentityId || '',
          starterIdentityName: this._auditIdentityName(template.starterIdentityId),
          starterHrId: template.starterHrId || '',
          starterHrName: this._auditHrName(template.starterHrId),
          resubmitMode: template.resubmitMode || 'fresh',
          steps: (template.steps || []).map(function(s) {
            return {
              conditions: (s.conditions || []).map(function(c) { return that._auditResolveCondition(c); }),
              actionType: s.actionType || 'sign'
            };
          })
        },
        auditTemplateStepEditorVisible: false
      });
    },

    // Starter type picker
    onStarterTypeChange(e) {
      this.setData({ 'auditTemplateForm.starterType': ['self', 'identity', 'specific_person'][e.detail.value] || 'self' });
    },

    // Resubmit mode picker
    onResubmitModeChange(e) {
      this.setData({ 'auditTemplateForm.resubmitMode': ['fresh', 'from_rejector'][e.detail.value] || 'fresh' });
    },

    // ═══════════════════════════════════════════════
    // Step editor (condition-based)
    // ═══════════════════════════════════════════════

    openAuditTemplateStepEditor(e) {
      const index = e && e.currentTarget ? parseInt(e.currentTarget.dataset.index) : -1;
      if (index >= 0 && this.data.auditTemplateForm.steps[index]) {
        const step = this.data.auditTemplateForm.steps[index];
        this.setData({
          auditTemplateStepForm: {
            conditions: (step.conditions || []).map(function(c) { return Object.assign({}, c); }),
            actionType: step.actionType || 'sign',
            editingIndex: index
          },
          auditTemplateStepEditorVisible: true
        });
      } else {
        this.setData({
          auditTemplateStepForm: {
            conditions: [],
            actionType: 'sign',
            editingIndex: -1
          },
          auditTemplateStepEditorVisible: true
        });
      }
    },

    closeAuditTemplateStepEditor() {
      this.setData({ auditTemplateStepEditorVisible: false });
    },

    onStepActionTypeChange(e) {
      this.setData({ 'auditTemplateStepForm.actionType': ['pass', 'sign', 'estamp', 'both'][e.detail.value] || 'sign' });
    },

    confirmAuditTemplateStep() {
      const step = this.data.auditTemplateStepForm;
      if (!step.conditions || !step.conditions.length) {
        showShortToast('请至少添加一个审批条件');
        return;
      }

      const steps = [...this.data.auditTemplateForm.steps];
      const newStep = {
        conditions: step.conditions.map(function(c) { return Object.assign({}, c); }),
        actionType: step.actionType || 'sign'
      };

      if (step.editingIndex >= 0) {
        steps[step.editingIndex] = newStep;
      } else {
        steps.push(newStep);
      }

      this.setData({
        'auditTemplateForm.steps': steps,
        auditTemplateStepEditorVisible: false
      });
    },

    removeAuditTemplateStep(e) {
      const index = parseInt(e.currentTarget.dataset.index);
      const steps = [...this.data.auditTemplateForm.steps];
      steps.splice(index, 1);
      this.setData({ 'auditTemplateForm.steps': steps });
    },

    // ── Step Condition Editor ──

    openStepConditionEditor(e) {
      const index = e && e.currentTarget ? parseInt(e.currentTarget.dataset.index) : -1;
      if (index >= 0 && this.data.auditTemplateStepForm.conditions[index]) {
        const cond = this.data.auditTemplateStepForm.conditions[index];
        this.setData({
          auditStepConditionForm: {
            conditionType: cond.conditionType || 'identity_scope',
            departmentScope: cond.departmentScope || 'all',
            specificDepartmentId: cond.specificDepartmentId || '',
            specificDepartmentName: cond.specificDepartmentName || this._auditDeptName(cond.specificDepartmentId),
            workGroupScope: cond.workGroupScope || 'all',
            specificWorkGroupId: cond.specificWorkGroupId || '',
            specificWorkGroupName: cond.specificWorkGroupName || this._auditWgName(cond.specificWorkGroupId),
            identityScope: cond.identityScope || 'all',
            specificIdentityId: cond.specificIdentityId || '',
            specificIdentityName: cond.specificIdentityName || this._auditIdentityName(cond.specificIdentityId),
            personHrIds: cond.personHrIds || '',
            personHrNames: cond.personHrNames || ''
          },
          auditStepConditionEditingIndex: index,
          auditStepConditionEditorVisible: true
        });
      } else {
        this.setData({
          auditStepConditionForm: {
            conditionType: 'identity_scope',
            departmentScope: 'all', specificDepartmentId: '', specificDepartmentName: '',
            workGroupScope: 'all', specificWorkGroupId: '', specificWorkGroupName: '',
            identityScope: 'all', specificIdentityId: '', specificIdentityName: '',
            personHrIds: '', personHrNames: ''
          },
          auditStepConditionEditingIndex: -1,
          auditStepConditionEditorVisible: true
        });
      }
    },

    closeStepConditionEditor() {
      this.setData({ auditStepConditionEditorVisible: false });
    },

    onConditionTypeChange(e) {
      this.setData({ 'auditStepConditionForm.conditionType': ['identity_scope', 'person'][e.detail.value] || 'identity_scope' });
    },

    onConditionScopeChange(e) {
      var field = e.currentTarget.dataset.field;
      var scopes = ['all', 'specific', 'own'];
      var scopeLabels = ['全部', '指定', '自己所在'];
      var idx = parseInt(e.detail.value);
      this.setData({ ['auditStepConditionForm.' + field]: scopes[idx] || 'all' });
    },

    confirmStepCondition() {
      var cond = this.data.auditStepConditionForm;
      var newCond = {
        conditionType: cond.conditionType
      };

      if (cond.conditionType === 'person') {
        if (!cond.personHrIds) {
          showShortToast('请选择人员');
          return;
        }
        newCond.personHrIds = cond.personHrIds;
        // Resolve names from master hrList
        var ids = cond.personHrIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        newCond.personHrNames = ids.map(function (hid) { return this._auditHrName(hid); }.bind(this)).join('、');
        newCond._personNames = ids.map(function (hid) { return this._auditHrName(hid); }.bind(this));
      } else {
        // identity_scope — always resolve names from master lists
        newCond.departmentScope = cond.departmentScope;
        newCond.specificDepartmentId = cond.departmentScope === 'specific' ? cond.specificDepartmentId : '';
        newCond._deptName = cond.departmentScope === 'specific' && cond.specificDepartmentId ? this._auditDeptName(cond.specificDepartmentId) : '';
        newCond.workGroupScope = cond.workGroupScope;
        newCond.specificWorkGroupId = cond.workGroupScope === 'specific' ? cond.specificWorkGroupId : '';
        newCond._wgName = cond.workGroupScope === 'specific' && cond.specificWorkGroupId ? this._auditWgName(cond.specificWorkGroupId) : '';
        newCond.identityScope = cond.identityScope;
        newCond.specificIdentityId = cond.identityScope === 'specific' ? cond.specificIdentityId : '';
        newCond._identName = cond.identityScope === 'specific' && cond.specificIdentityId ? this._auditIdentityName(cond.specificIdentityId) : '';
      }
      // Pre-compute display summary
      newCond._summary = this._auditConditionSummary(newCond);

      var conditions = [...this.data.auditTemplateStepForm.conditions];
      if (this.data.auditStepConditionEditingIndex >= 0) {
        conditions[this.data.auditStepConditionEditingIndex] = newCond;
      } else {
        conditions.push(newCond);
      }

      this.setData({
        'auditTemplateStepForm.conditions': conditions,
        auditStepConditionEditorVisible: false
      });
    },

    removeStepCondition(e) {
      var index = parseInt(e.currentTarget.dataset.index);
      var conditions = [...this.data.auditTemplateStepForm.conditions];
      conditions.splice(index, 1);
      this.setData({ 'auditTemplateStepForm.conditions': conditions });
    },

    // ── Build a human-readable summary for a single condition ──
    _auditConditionSummary(c) {
      if (!c) return '未知条件';
      if (c.conditionType === 'person') {
        if (c.personHrIds) {
          var names = c.personHrIds.split(',').map(function (hid) {
            return this._auditHrName(hid.trim());
          }.bind(this)).filter(function (n) { return n; });
          return names.length ? '人员: ' + names.join('、') : '人员: (未找到)';
        }
        return '人员: 未设置';
      }
      // identity_scope — resolve every sub-dimension from master lists
      var parts = [];
      if (c.departmentScope === 'all') {
        parts.push('部门不限');
      } else if (c.departmentScope === 'own') {
        parts.push('自己所在部门');
      } else if (c.specificDepartmentId) {
        parts.push('部门: ' + this._auditDeptName(c.specificDepartmentId));
      }
      if (c.workGroupScope === 'all') {
        parts.push('职能组不限');
      } else if (c.workGroupScope === 'own') {
        parts.push('自己所在职能组');
      } else if (c.specificWorkGroupId) {
        parts.push('职能组: ' + this._auditWgName(c.specificWorkGroupId));
      }
      if (c.identityScope === 'all') {
        parts.push('身份不限');
      } else if (c.identityScope === 'own') {
        parts.push('自己所在身份');
      } else if (c.specificIdentityId) {
        parts.push('身份: ' + this._auditIdentityName(c.specificIdentityId));
      }
      return parts.join(' · ');
    },

    /**
     * Resolve ALL names in a condition from master lists into _d* fields.
     * Returns a new object suitable for WXML bubble rendering.
     */
    _auditResolveCondition(c) {
      var r = Object.assign({}, c);
      if (c.conditionType === 'person') {
        if (c.personHrIds) {
          var ids = c.personHrIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          r._personNames = ids.map(function (hid) { return this._auditHrName(hid); }.bind(this));
        } else {
          r._personNames = [];
        }
      } else {
        r._deptName = c.departmentScope === 'specific' && c.specificDepartmentId ? this._auditDeptName(c.specificDepartmentId) : '';
        r._wgName = c.workGroupScope === 'specific' && c.specificWorkGroupId ? this._auditWgName(c.specificWorkGroupId) : '';
        r._identName = c.identityScope === 'specific' && c.specificIdentityId ? this._auditIdentityName(c.specificIdentityId) : '';
      }
      return r;
    },

    // ── Open unified multi-picker for step condition fields ──
    openStepConditionPicker(e) {
      var target = e.currentTarget.dataset.target;
      var title = e.currentTarget.dataset.title || '选择';
      var list = [];
      var deptOpts = this._auditBuildDeptOptions();
      var identOpts = this._auditBuildIdentOptions();

      // Determine which list to show
      switch (target) {
        case 'specificDepartmentId':
          list = (this.data.departmentList || []).map(function(d) { return { id: d.id, name: d.name, extra: d.description || '' }; });
          break;
        case 'specificWorkGroupId':
          list = (this.data.workGroupList || []).map(function(w) { return { id: w.id, name: w.name, extra: w.departmentName || '' }; });
          break;
        case 'specificIdentityId':
          list = (this.data.identityList || []).map(function(i) { return { id: i.id, name: i.name, extra: i.description || '' }; });
          break;
        case 'personHrIds':
          list = (this.data.hrList || []).map(function(h) { return { id: h.id, name: h.name, extra: (h.studentId || '') + ' · ' + (h.department || '') }; });
          break;
      }

      // Pre-populate selected IDs
      var selectedIds = {};
      var currentVal = this.data.auditStepConditionForm[target] || '';
      if (currentVal) {
        currentVal.split(',').forEach(function(id) {
          var trimmed = id.trim();
          if (trimmed) selectedIds[String(trimmed)] = true;
        });
      }

      this.setData({
        auditMultiPickerVisible: true,
        auditMultiPickerTarget: target,
        auditMultiPickerTitle: title,
        auditMultiPickerItems: list,
        auditMultiPickerSelectedIds: selectedIds,
        auditMultiPickerSearchKeyword: '',
        auditMultiPickerFilterDept: '全部',
        auditMultiPickerFilterIdent: '全部',
        auditMultiPickerDeptOptions: deptOpts,
        auditMultiPickerIdentOptions: identOpts,
        auditMultiPickerFilteredList: []
      });
      this._applyAuditMultiPickerFilters();
    },

    closeAuditMultiPicker() {
      this.setData({ auditMultiPickerVisible: false });
    },

    onAuditMultiPickerSearch(e) {
      this.setData({ auditMultiPickerSearchKeyword: e.detail.value });
      this._applyAuditMultiPickerFilters();
    },

    onAuditMultiPickerFilterDept(e) {
      var idx = e.detail.value;
      var options = this.data.auditMultiPickerDeptOptions;
      this.setData({ auditMultiPickerFilterDept: options[idx] || '全部' });
      this._applyAuditMultiPickerFilters();
    },

    onAuditMultiPickerFilterIdent(e) {
      var idx = e.detail.value;
      var options = this.data.auditMultiPickerIdentOptions;
      this.setData({ auditMultiPickerFilterIdent: options[idx] || '全部' });
      this._applyAuditMultiPickerFilters();
    },

    _applyAuditMultiPickerFilters() {
      var items = this.data.auditMultiPickerItems;
      var target = this.data.auditMultiPickerTarget;
      var keyword = (this.data.auditMultiPickerSearchKeyword || '').trim().toLowerCase();
      var filterDept = this.data.auditMultiPickerFilterDept;
      var filterIdent = this.data.auditMultiPickerFilterIdent;

      // Department/identity filters only apply to personnel picker
      if (target === 'personHrIds') {
        var hrList = this.data.hrList || [];
        if (filterDept !== '全部') {
          var deptId = this._auditDeptIdByName(filterDept);
          var filteredIds = {};
          hrList.filter(function(h) { return h.departmentId === deptId; }).forEach(function(h) { filteredIds[h.id] = true; });
          items = items.filter(function(item) { return filteredIds[item.id]; });
        }
        if (filterIdent !== '全部') {
          var identId = this._auditIdentIdByName(filterIdent);
          var filteredIds2 = {};
          hrList.filter(function(h) { return h.identityId === identId; }).forEach(function(h) { filteredIds2[h.id] = true; });
          items = items.filter(function(item) { return filteredIds2[item.id]; });
        }
      }

      if (keyword) {
        items = items.filter(function(item) {
          return [item.name, item.extra].some(function(v) {
            return String(v || '').toLowerCase().indexOf(keyword) !== -1;
          });
        });
      }

      this.setData({ auditMultiPickerFilteredList: items });
    },

    _auditDeptIdByName(name) {
      var found = (this.data.departmentList || []).find(function(d) { return d.name === name; });
      return found ? found.id : '';
    },

    _auditIdentIdByName(name) {
      var found = (this.data.identityList || []).find(function(i) { return i.name === name; });
      return found ? found.id : '';
    },

    onAuditMultiPickerToggle(e) {
      var id = String(e.currentTarget.dataset.id);
      var selected = Object.assign({}, this.data.auditMultiPickerSelectedIds);
      if (selected[id]) {
        delete selected[id];
      } else {
        selected[id] = true;
      }
      this.setData({ auditMultiPickerSelectedIds: selected });
    },

    onAuditMultiPickerSelectAll() {
      var filtered = this.data.auditMultiPickerFilteredList;
      if (!filtered.length) return;
      var selected = {};
      filtered.forEach(function(item) {
        selected[String(item.id)] = true;
      });
      this.setData({ auditMultiPickerSelectedIds: selected });
    },

    onAuditMultiPickerDeselectAll() {
      this.setData({ auditMultiPickerSelectedIds: {} });
    },

    confirmAuditMultiPicker() {
      var target = this.data.auditMultiPickerTarget;
      var selectedIds = this.data.auditMultiPickerSelectedIds;
      var ids = Object.keys(selectedIds);
      var items = this.data.auditMultiPickerItems;

      var names = ids.map(function(id) {
        var found = items.find(function(item) { return String(item.id) === String(id); });
        return found ? found.name : id;
      }).join('、');

      var updateObj = {};
      updateObj['auditStepConditionForm.' + target] = ids.join(',');
      updateObj['auditStepConditionForm.' + target.replace('Id', 'Name')] = names;
      this.setData(updateObj);
      this.closeAuditMultiPicker();
    },

    // Clear a field in the condition form (e.g., personHrIds)
    onStepConditionFieldClear(e) {
      var field = e.currentTarget.dataset.field;
      var update = {};
      update['auditStepConditionForm.' + field] = '';
      update['auditStepConditionForm.' + field.replace('Id', 'Name')] = '';
      this.setData(update);
    },

    // ── Scope label helpers ──
    _scopeLabel(scope) {
      if (scope === 'all') return '全部';
      if (scope === 'own') return '自己所在';
      if (scope === 'specific') return '指定';
      return '全部';
    },

    async saveAuditFlowTemplate() {
      const form = this.data.auditTemplateForm;
      if (!form.name) { showShortToast('请输入模板名称'); return; }
      if (!form.steps.length) { showShortToast('请至少添加一个步骤'); return; }
      // Validate each step has at least one condition
      for (var i = 0; i < form.steps.length; i++) {
        if (!form.steps[i].conditions || !form.steps[i].conditions.length) {
          showShortToast('第' + (i + 1) + '步至少需要一个审批条件');
          return;
        }
      }

      this.setLoading('saveAuditTemplate', true);
      try {
        var stepsToSend = form.steps.map(function(s) {
          return {
            conditions: s.conditions.map(function(c) {
              var cond = { conditionType: c.conditionType };
              if (c.conditionType === 'person') {
                cond.personHrIds = c.personHrIds;
              } else {
                cond.departmentScope = c.departmentScope || 'all';
                cond.specificDepartmentId = c.specificDepartmentId || '';
                cond.workGroupScope = c.workGroupScope || 'all';
                cond.specificWorkGroupId = c.specificWorkGroupId || '';
                cond.identityScope = c.identityScope || 'all';
                cond.specificIdentityId = c.specificIdentityId || '';
              }
              return cond;
            }),
            actionType: s.actionType || 'sign'
          };
        });

        const res = await this.callCloud('saveAuditFlowTemplate', {
          id: form.id,
          name: form.name,
          description: form.description,
          starterType: form.starterType,
          starterIdentityId: form.starterIdentityId,
          starterHrId: form.starterHrId,
          resubmitMode: form.resubmitMode,
          steps: stepsToSend
        });
        if (res.status === 'success') {
          showShortToast(form.id ? '模板更新成功' : '模板创建成功');
          this.startCreateAuditTemplate();
          this.loadAuditFlowTemplates();
        } else {
          showShortToast(res.message || '保存失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '保存失败'));
      } finally {
        this.setLoading('saveAuditTemplate', false);
      }
    },

    async deleteAuditFlowTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const that = this;
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，确定删除此审核流模板吗？',
        success: async function (modalRes) {
          if (!modalRes.confirm) return;
          try {
            const res = await that.callCloud('deleteAuditFlowTemplate', { id: id });
            if (res.status === 'success') {
              showShortToast('模板已删除');
              that.loadAuditFlowTemplates();
            } else {
              showShortToast(res.message || '删除失败');
            }
          } catch (e) {
            showShortToast(getErrorText(e, '删除失败'));
          }
        }
      });
    },

    // Toggle expand/collapse of a template to show step details
    toggleAuditTemplateExpand(e) {
      var id = e.currentTarget.dataset.id;
      var current = this.data.auditExpandedTemplateId;
      this.setData({ auditExpandedTemplateId: current === id ? '' : id });
    },

    // ═══════════════════════════════════════════════════════
    // Stamps Management
    // ═══════════════════════════════════════════════════════

    async loadStamps() {
      this.setLoading('auditStamps', true);
      try {
        const res = await this.callCloud('listStamps', {});
        console.log('[audit] listStamps response:', JSON.stringify(res));
        if (res.status === 'success') {
          this.setData({ stamps: res.stamps || [] });
        } else {
          console.error('[audit] listStamps failed:', res.message);
        }
      } catch (e) {
        console.error('[audit] loadStamps error:', e);
        this.setData({ stamps: [] });
      } finally {
        this.setLoading('auditStamps', false);
      }
    },

    startCreateStamp() {
      this.setData({ stampForm: { id: '', name: '', imageData: '' } });
    },

    editStamp(e) {
      const id = e.currentTarget.dataset.id;
      const stamp = this.data.stamps.find(function (s) { return s.id === id; });
      if (!stamp) return;
      this.setData({ stampForm: { id: stamp.id, name: stamp.name, imageData: stamp.imageData } });
    },

    onStampFieldInput(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ ['stampForm.' + field]: e.detail.value });
    },

    chooseStampImage() {
      const that = this;
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          const tempFilePath = res.tempFilePaths[0];
          wx.getFileSystemManager().readFile({
            filePath: tempFilePath,
            encoding: 'base64',
            success: function (fileRes) {
              const ext = tempFilePath.split('.').pop().toLowerCase();
              const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
              const mime = mimeMap[ext] || 'image/png';
              const base64 = 'data:' + mime + ';base64,' + fileRes.data;
              that.setData({ 'stampForm.imageData': base64 });
            }
          });
        }
      });
    },

    async saveStamp() {
      const form = this.data.stampForm;
      if (!form.name) { showShortToast('请输入印章名称'); return; }
      if (!form.imageData) { showShortToast('请选择印章图片'); return; }

      this.setLoading('saveStamp', true);
      try {
        const res = await this.callCloud('saveStamp', {
          id: form.id,
          name: form.name,
          imageData: form.imageData
        });
        if (res.status === 'success') {
          showShortToast(form.id ? '印章更新成功' : '印章创建成功');
          this.startCreateStamp();
          this.loadStamps();
        } else {
          showShortToast(res.message || '保存失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '保存失败'));
      } finally {
        this.setLoading('saveStamp', false);
      }
    },

    async deleteStamp(e) {
      const id = e.currentTarget.dataset.id;
      const that = this;
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，已分配的印章权限也会失效。确定删除吗？',
        success: async function (modalRes) {
          if (!modalRes.confirm) return;
          try {
            const res = await that.callCloud('deleteStamp', { id: id });
            if (res.status === 'success') {
              showShortToast('印章已删除');
              that.loadStamps();
            } else {
              showShortToast(res.message || '删除失败');
            }
          } catch (e) {
            showShortToast(getErrorText(e, '删除失败'));
          }
        }
      });
    },

    openStampAssign(e) {
      const identityId = e.currentTarget.dataset.identityId || '';
      const selectedIds = (this.data.stamps || [])
        .filter(function (s) { return (s.assignedIdentities || []).some(function (a) { return a.identityId === identityId; }); })
        .map(function (s) { return s.id; });

      this.setData({
        stampAssignIdentityId: identityId,
        stampAssignSelectedIds: selectedIds,
        stampAssignVisible: true
      });
    },

    closeStampAssign() {
      this.setData({ stampAssignVisible: false });
    },

    toggleStampAssignSelect(e) {
      const id = e.currentTarget.dataset.id;
      const selected = [...this.data.stampAssignSelectedIds];
      const idx = selected.indexOf(id);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(id);
      this.setData({ stampAssignSelectedIds: selected });
    },

    async saveStampAssignments() {
      try {
        const res = await this.callCloud('saveStampAssignments', {
          identityId: this.data.stampAssignIdentityId,
          stampIds: this.data.stampAssignSelectedIds
        });
        if (res.status === 'success') {
          showShortToast('印章分配已更新');
          this.closeStampAssign();
          this.loadStamps();
        } else {
          showShortToast(res.message || '保存失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '保存失败'));
      }
    },

    // ═══════════════════════════════════════════════════════
    // Audit Submissions (Admin View)
    // ═══════════════════════════════════════════════════════

    async loadAuditSubmissions() {
      this.setLoading('auditSubmissions', true);
      try {
        const filters = this.data.auditSubmissionFilters;
        const res = await this.callCloud('listAllAuditSubmissions', {
          status: filters.status || '',
          limit: 50,
          offset: 0
        });
        console.log('[audit] listAllAuditSubmissions response:', JSON.stringify(res));
        if (res.status === 'success') {
          this.setData({ auditSubmissions: res.submissions || [] });
        } else {
          console.error('[audit] listAllAuditSubmissions failed:', res.message);
        }
      } catch (e) {
        console.error('[audit] loadAuditSubmissions error:', e);
        this.setData({ auditSubmissions: [] });
      } finally {
        this.setLoading('auditSubmissions', false);
      }
    },

    onAuditSubmissionStatusFilter(e) {
      const statuses = ['', 'draft', 'pending', 'in_progress', 'rejected', 'approved', 'withdrawn'];
      const idx = parseInt(e.detail.value);
      this.setData({ 'auditSubmissionFilters.status': statuses[idx] || '' });
      this.loadAuditSubmissions();
    },

    async viewAuditProgress(e) {
      const submissionId = e.currentTarget.dataset.id;
      this.setLoading('auditProgress', true);
      try {
        const res = await this.callCloud('getAuditProgress', { submissionId: submissionId });
        if (res.status === 'success') {
          this.setData({
            auditSubmissionDetail: res,
            auditSubmissionDetailVisible: true
          });
        } else {
          showShortToast(res.message || '加载失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '加载失败'));
      } finally {
        this.setLoading('auditProgress', false);
      }
    },

    closeAuditSubmissionDetail() {
      this.setData({ auditSubmissionDetailVisible: false });
    },

    // ═══════════════════════════════════════════════════════
    // Verification Management
    // ═══════════════════════════════════════════════════════

    async loadVerificationPermissions() {
      this.setLoading('auditVerification', true);
      try {
        const res = await this.callCloud('listVerificationPermissions', {});
        console.log('[audit] listVerificationPermissions response:', JSON.stringify(res));
        if (res.status === 'success') {
          this.setData({ verificationPermissions: res.permissions || [] });
        } else {
          console.error('[audit] listVerificationPermissions failed:', res.message);
        }
      } catch (e) {
        console.error('[audit] loadVerificationPermissions error:', e);
        this.setData({ verificationPermissions: [] });
      } finally {
        this.setLoading('auditVerification', false);
      }
    },

    onVerificationGrantHrInput(e) {
      this.setData({ verificationGrantHrId: e.detail.value });
    },

    async grantVerificationPermission() {
      const hrId = this.data.verificationGrantHrId;
      if (!hrId) { showShortToast('请选择人员'); return; }
      try {
        const res = await this.callCloud('saveVerificationPermission', {
          granteeHrId: hrId,
          action: 'grant'
        });
        if (res.status === 'success') {
          showShortToast('验签权限已授予');
          this.setData({ verificationGrantHrId: '', verificationGrantHrName: '' });
          this.loadVerificationPermissions();
        } else {
          showShortToast(res.message || '授予失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '授予失败'));
      }
    },

    async revokeVerificationPermission(e) {
      const hrId = e.currentTarget.dataset.hrId;
      const that = this;
      wx.showModal({
        title: '确认撤销',
        content: '确定撤销该人员的验签权限吗？',
        success: async function (modalRes) {
          if (!modalRes.confirm) return;
          try {
            const res = await that.callCloud('saveVerificationPermission', {
              granteeHrId: hrId,
              action: 'revoke'
            });
            if (res.status === 'success') {
              showShortToast('验签权限已撤销');
              that.loadVerificationPermissions();
            } else {
              showShortToast(res.message || '撤销失败');
            }
          } catch (e) {
            showShortToast(getErrorText(e, '撤销失败'));
          }
        }
      });
    },

    onVerificationInputNumber(e) {
      this.setData({ verificationInputNumber: e.detail.value });
    },

    onVerificationInputId(e) {
      this.setData({ verificationInputId: e.detail.value });
    },

    chooseVerifyFile() {
      const that = this;
      wx.chooseMessageFile({
        count: 1,
        type: 'all',
        success: function(res) {
          const file = res.tempFiles[0];
          // Read file as base64 for hash computation
          wx.getFileSystemManager().readFile({
            filePath: file.path,
            encoding: 'base64',
            success: function(readRes) {
              that.setData({
                verificationFilePath: file.path,
                verificationFileName: file.name,
                verificationFileBase64: readRes.data,
                verificationFileSize: file.size
              });
            },
            fail: function() {
              showShortToast('读取文件失败');
            }
          });
        }
      });
    },

    onVerificationModeChange(e) {
      var modes = ['number', 'id', 'file'];
      this.setData({ verificationMode: modes[e.detail.value] || 'number' });
    },

    async verifySubmissionChain() {
      var params = {};
      var mode = this.data.verificationMode || 'number';

      if (mode === 'number') {
        var number = this.data.verificationInputNumber;
        if (!number) { showShortToast('请输入提交编号'); return; }
        params.submissionNumber = number;
      } else if (mode === 'id') {
        var sid = this.data.verificationInputId;
        if (!sid) { showShortToast('请输入提交ID'); return; }
        params.submissionId = sid;
      } else if (mode === 'file') {
        var fileB64 = this.data.verificationFileBase64;
        if (!fileB64) { showShortToast('请选择要验签的文件'); return; }
        params.fileBase64 = fileB64;
      }

      this.setLoading('verifyChain', true);
      try {
        const res = await this.callCloud('verifySignatureChain', params);
        if (res.status === 'success') {
          this.setData({ verificationResult: res });
        } else {
          showShortToast(res.message || '验证失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '验证失败'));
      } finally {
        this.setLoading('verifyChain', false);
      }
    },

    // ═══════════════════════════════════════════════════════
    // Personnel Picker (single-select, confirm pattern)
    // ═══════════════════════════════════════════════════════

    openAuditPersonnelPicker(e) {
      const target = e.currentTarget.dataset.target;
      const label = e.currentTarget.dataset.label || '选择人员';

      // Pre-populate selectedId from the current target field
      var selectedId = '';
      if (target === 'starterHrId') selectedId = this.data.auditTemplateForm.starterHrId;
      else if (target === 'stepHrId') selectedId = this.data.auditTemplateStepForm.approverHrId;
      else if (target === 'grantHrId') selectedId = this.data.verificationGrantHrId;

      this.setData({
        auditPersonnelPickerVisible: true,
        auditPersonnelPickerTarget: target,
        auditPersonnelPickerLabel: label,
        auditPersonnelPickerSelectedId: String(selectedId || ''),
        auditPersonnelSearchKeyword: '',
        auditPersonnelFilterDept: '全部',
        auditPersonnelFilterIdent: '全部',
        auditPersonnelDeptOptions: this._auditBuildDeptOptions(),
        auditPersonnelIdentOptions: this._auditBuildIdentOptions()
      });
      this._applyAuditPersonnelFilters();
    },

    closeAuditPersonnelPicker() {
      this.setData({ auditPersonnelPickerVisible: false });
    },

    onAuditPersonnelSearch(e) {
      this.setData({ auditPersonnelSearchKeyword: e.detail.value });
      this._applyAuditPersonnelFilters();
    },

    onAuditPersonnelFilterDept(e) {
      var idx = e.detail.value;
      var options = this.data.auditPersonnelDeptOptions;
      this.setData({ auditPersonnelFilterDept: options[idx] || '全部' });
      this._applyAuditPersonnelFilters();
    },

    onAuditPersonnelFilterIdent(e) {
      var idx = e.detail.value;
      var options = this.data.auditPersonnelIdentOptions;
      this.setData({ auditPersonnelFilterIdent: options[idx] || '全部' });
      this._applyAuditPersonnelFilters();
    },

    _applyAuditPersonnelFilters() {
      var hrList = this.data.hrList || [];
      var keyword = (this.data.auditPersonnelSearchKeyword || '').trim().toLowerCase();
      var filterDept = this.data.auditPersonnelFilterDept;
      var filterIdent = this.data.auditPersonnelFilterIdent;

      var filtered = hrList;
      if (filterDept !== '全部') {
        filtered = filtered.filter(function (item) { return item.department === filterDept; });
      }
      if (filterIdent !== '全部') {
        filtered = filtered.filter(function (item) { return item.identity === filterIdent; });
      }
      if (keyword) {
        filtered = filtered.filter(function (item) {
          return [item.name, item.studentId, item.department].some(function (v) {
            return String(v || '').toLowerCase().indexOf(keyword) !== -1;
          });
        });
      }

      this.setData({ auditPersonnelFilteredList: filtered });
    },

    onAuditPersonnelToggle(e) {
      var hrId = String(e.currentTarget.dataset.hrId);
      var current = this.data.auditPersonnelPickerSelectedId;
      // Toggle: if already selected, deselect; otherwise select
      this.setData({ auditPersonnelPickerSelectedId: current === hrId ? '' : hrId });
    },

    confirmAuditPersonnelPicker() {
      var selectedId = this.data.auditPersonnelPickerSelectedId;
      if (!selectedId) {
        showShortToast('请先选择一名人员');
        return;
      }

      var hrList = this.data.hrList || [];
      var person = hrList.find(function (item) { return String(item.id) === String(selectedId); });
      var hrId = String(selectedId);
      var hrName = person ? person.name : selectedId;

      var target = this.data.auditPersonnelPickerTarget;
      switch (target) {
        case 'starterHrId':
          this.setData({
            'auditTemplateForm.starterHrId': hrId,
            'auditTemplateForm.starterHrName': hrName
          });
          break;
        case 'stepHrId':
          this.setData({
            'auditTemplateStepForm.approverHrId': hrId,
            'auditTemplateStepForm.approverHrName': hrName
          });
          break;
        case 'grantHrId':
          this.setData({
            verificationGrantHrId: hrId,
            verificationGrantHrName: hrName
          });
          break;
      }

      this.setData({ auditPersonnelPickerVisible: false });
    },

    clearAuditPersonnel(e) {
      var target = e.currentTarget.dataset.target;
      switch (target) {
        case 'starterHrId':
          this.setData({
            'auditTemplateForm.starterHrId': '',
            'auditTemplateForm.starterHrName': ''
          });
          break;
        case 'stepHrId':
          this.setData({
            'auditTemplateStepForm.approverHrId': '',
            'auditTemplateStepForm.approverHrName': ''
          });
          break;
        case 'grantHrId':
          this.setData({
            verificationGrantHrId: '',
            verificationGrantHrName: ''
          });
          break;
      }
    },

    // ═══════════════════════════════════════════════════════
    // Identity Picker (single / multi, confirm pattern)
    // ═══════════════════════════════════════════════════════

    openAuditIdentityPicker(e) {
      var target = e.currentTarget.dataset.target;
      var label = e.currentTarget.dataset.label || '选择身份';
      var multi = e.currentTarget.dataset.multi === 'true';

      // Pre-populate selected IDs from the current target field
      var selectedIds = {};
      var currentIds = '';
      if (target === 'starterIdentityId') {
        currentIds = this.data.auditTemplateForm.starterIdentityId || '';
      } else if (target === 'stepIdentityId') {
        currentIds = this.data.auditTemplateStepForm.approverIdentityId || '';
      }
      if (currentIds) {
        currentIds.split(',').forEach(function (id) {
          var trimmed = id.trim();
          if (trimmed) selectedIds[trimmed] = true;
        });
      }

      this.setData({
        auditIdentityPickerVisible: true,
        auditIdentityPickerTarget: target,
        auditIdentityPickerLabel: label,
        auditIdentityPickerMulti: multi,
        auditIdentityPickerSelectedIds: selectedIds,
        auditIdentityPickerSelectedCount: Object.keys(selectedIds).length
      });
    },

    closeAuditIdentityPicker() {
      this.setData({
        auditIdentityPickerVisible: false,
        auditIdentityPickerSelectedIds: {},
        auditIdentityPickerSelectedCount: 0
      });
    },

    onAuditIdentityToggle(e) {
      var id = String(e.currentTarget.dataset.id);
      var selectedIds = Object.assign({}, this.data.auditIdentityPickerSelectedIds);

      if (this.data.auditIdentityPickerMulti) {
        if (selectedIds[id]) {
          delete selectedIds[id];
        } else {
          selectedIds[id] = true;
        }
      } else {
        // Single select: clear all, then toggle
        Object.keys(selectedIds).forEach(function (key) { delete selectedIds[key]; });
        if (!selectedIds[id]) {
          selectedIds[id] = true;
        }
      }

      this.setData({
        auditIdentityPickerSelectedIds: selectedIds,
        auditIdentityPickerSelectedCount: Object.keys(selectedIds).length
      });
    },

    confirmAuditIdentityPicker() {
      var selectedIds = this.data.auditIdentityPickerSelectedIds;
      var identityList = this.data.identityList || [];
      var target = this.data.auditIdentityPickerTarget;
      var ids = Object.keys(selectedIds);

      if (!ids.length) {
        showShortToast('请至少选择一个身份');
        return;
      }

      var names = ids.map(function (id) {
        var found = identityList.find(function (item) { return String(item.id) === id; });
        return found ? found.name : id;
      }).join('、');

      if (target === 'starterIdentityId') {
        this.setData({
          'auditTemplateForm.starterIdentityId': ids.join(','),
          'auditTemplateForm.starterIdentityName': names
        });
      } else if (target === 'stepIdentityId') {
        this.setData({
          'auditTemplateStepForm.approverIdentityId': ids.join(','),
          'auditTemplateStepForm.approverIdentityName': names
        });
      }

      this.setData({
        auditIdentityPickerVisible: false,
        auditIdentityPickerSelectedIds: {},
        auditIdentityPickerSelectedCount: 0
      });
    },

    clearAuditIdentity(e) {
      var target = e.currentTarget.dataset.target;
      if (target === 'starterIdentityId') {
        this.setData({
          'auditTemplateForm.starterIdentityId': '',
          'auditTemplateForm.starterIdentityName': ''
        });
      } else if (target === 'stepIdentityId') {
        this.setData({
          'auditTemplateStepForm.approverIdentityId': '',
          'auditTemplateStepForm.approverIdentityName': ''
        });
      }
    },

  }
});
