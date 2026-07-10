/**
 * Audit Workflow Behavior — Admin-side audit management
 *
 * Tabs: auditTemplates | auditStamps | auditSubmissions | auditVerification
 */
const utils = require('./adminUtils');
const { formatAuditTime } = require('../../../../../utils/api');
const { openAuditFile } = require('../../../../../utils/filePreview');
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
      starterConditions: [],   // multi-condition starter OR-ed
      resubmitMode: 'fresh',
      steps: []
    },
    auditTemplateStepForm: {
      name: '',
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
    _auditConditionTarget: 'step',       // 'step' | 'starter' — which conditions array is being edited

    // ── Starter Condition Editor ──
    auditStarterConditionEditorVisible: false,
    auditStarterConditionForm: {
      conditionType: 'identity_scope',
      departmentScope: 'all', specificDepartmentId: '', specificDepartmentName: '',
      workGroupScope: 'all', specificWorkGroupId: '', specificWorkGroupName: '',
      identityScope: 'all', specificIdentityId: '', specificIdentityName: '',
      personHrIds: '', personHrNames: ''
    },
    auditStarterConditionEditingIndex: -1,

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
    // Department tabs for work group picker (when specific depts are selected)
    auditMultiPickerDeptTabs: [],
    auditMultiPickerActiveDeptTab: '',

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

    /** Derive display name from identityList by id — NEVER returns raw ID */
    _auditIdentityName(id) {
      if (!id) return '';
      const found = (this.data.identityList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : '';
    },

    /** Derive display name from hrList by id — NEVER returns raw ID */
    _auditHrName(id) {
      if (!id) return '';
      const found = (this.data.hrList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : '';
    },

    /** Derive display name from departmentList by id — NEVER returns raw ID */
    _auditDeptName(id) {
      if (!id) return '';
      const found = (this.data.departmentList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : '';
    },

    /** Derive display name from workGroupList by id — NEVER returns raw ID */
    _auditWgName(id) {
      if (!id) return '';
      const found = (this.data.workGroupList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : '';
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
        if (res.status === 'success') {
          let that = this;
          let templates = (res.templates || []).map(function (t) {
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

    onAuditTemplateStepField(e) {
      const field = e.currentTarget.dataset.field;
      const value = e.detail.value;
      this.setData({ ['auditTemplateStepForm.' + field]: value });
    },

    startCreateAuditTemplate() {
      this.setData({
        auditTemplateForm: {
          id: '', name: '', description: '',
          starterType: 'conditions',
          starterIdentityId: '', starterIdentityName: '',
          starterHrId: '', starterHrName: '',
          starterConditions: [],
          resubmitMode: 'fresh',
          steps: []
        },
        auditTemplateStepForm: {
          conditions: [],
          actionType: 'sign',
          editingIndex: -1
        },
        auditTemplateStepEditorVisible: false,
        auditStarterConditionEditorVisible: false
      });
    },

    editAuditTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const template = this.data.auditFlowTemplates.find(function (t) { return t.id === id; });
      if (!template) return;
      let that = this;
      // Resolve starter conditions
      let starterConds = (template.starterConditions || []).map(function(c) { return that._auditResolveCondition(c); });
      this.setData({
        auditTemplateForm: {
          id: template.id,
          name: template.name,
          description: template.description,
          starterType: template.starterType || 'conditions',
          starterIdentityId: template.starterIdentityId || '',
          starterIdentityName: this._auditIdentityName(template.starterIdentityId),
          starterHrId: template.starterHrId || '',
          starterHrName: this._auditHrName(template.starterHrId),
          starterConditions: starterConds,
          resubmitMode: template.resubmitMode || 'fresh',
          steps: (template.steps || []).map(function(s) {
            return {
              conditions: (s.conditions || []).map(function(c) { return that._auditResolveCondition(c); }),
              actionType: s.actionType || 'sign'
            };
          })
        },
        auditTemplateStepEditorVisible: false,
        auditStarterConditionEditorVisible: false
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
            name: step.name || '',
            conditions: (step.conditions || []).map(function(c) { return Object.assign({}, c); }),
            actionType: step.actionType || 'sign',
            editingIndex: index
          },
          auditTemplateStepEditorVisible: true
        });
      } else {
        this.setData({
          auditTemplateStepForm: {
            name: '',
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
      const stepName = (step.name || '').trim();
      if (!stepName) {
        showShortToast('请输入步骤名称');
        return;
      }
      if (!step.conditions || !step.conditions.length) {
        showShortToast('请至少添加一个审批条件');
        return;
      }

      const steps = [...this.data.auditTemplateForm.steps];
      const newStep = {
        name: stepName,
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
            specificDepartmentName: cond._deptName || cond.specificDepartmentName || this._auditDeptName(cond.specificDepartmentId),
            workGroupScope: cond.workGroupScope || 'all',
            specificWorkGroupId: cond.specificWorkGroupId || '',
            specificWorkGroupName: cond._wgName || cond.specificWorkGroupName || this._auditWgName(cond.specificWorkGroupId),
            identityScope: cond.identityScope || 'all',
            specificIdentityId: cond.specificIdentityId || '',
            specificIdentityName: cond._identName || cond.specificIdentityName || this._auditIdentityName(cond.specificIdentityId),
            personHrIds: cond.personHrIds || '',
            personHrNames: cond.personHrNames || (cond._personNames ? cond._personNames.join('、') : '')
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
      let field = e.currentTarget.dataset.field;
      let scopes = ['all', 'specific', 'own'];
      let scopeLabels = ['全部', '指定', '自己所在'];
      let idx = parseInt(e.detail.value);
      this.setData({ ['auditStepConditionForm.' + field]: scopes[idx] || 'all' });
    },

    confirmStepCondition() {
      let cond = this.data.auditStepConditionForm;
      let newCond = {
        conditionType: cond.conditionType
      };

      if (cond.conditionType === 'person') {
        if (!cond.personHrIds) {
          showShortToast('请选择人员');
          return;
        }
        newCond.personHrIds = cond.personHrIds;
        // Resolve names from master hrList
        let ids = cond.personHrIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        newCond.personHrNames = ids.map(function (hid) { return this._auditHrName(hid); }.bind(this)).join('、');
        newCond._personNames = ids.map(function (hid) { return this._auditHrName(hid); }.bind(this));
      } else {
        // identity_scope — always resolve names from master lists, handling comma-separated IDs
        newCond.departmentScope = cond.departmentScope;
        newCond.specificDepartmentId = cond.departmentScope === 'specific' ? cond.specificDepartmentId : '';
        if (newCond.specificDepartmentId) {
          let deptIds = newCond.specificDepartmentId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          newCond._deptNames = deptIds.map(function(did) { return this._auditDeptName(did); }.bind(this)).filter(Boolean);
          newCond._deptName = newCond._deptNames.join('、');
        } else { newCond._deptNames = []; newCond._deptName = ''; }
        newCond.workGroupScope = cond.workGroupScope;
        newCond.specificWorkGroupId = cond.workGroupScope === 'specific' ? cond.specificWorkGroupId : '';
        if (newCond.specificWorkGroupId) {
          let wgIds = newCond.specificWorkGroupId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          newCond._wgNames = wgIds.map(function(wid) { return this._auditWgName(wid); }.bind(this)).filter(Boolean);
          newCond._wgName = newCond._wgNames.join('、');
        } else { newCond._wgNames = []; newCond._wgName = ''; }
        newCond.identityScope = cond.identityScope;
        newCond.specificIdentityId = cond.identityScope === 'specific' ? cond.specificIdentityId : '';
        if (newCond.specificIdentityId) {
          let identIds = newCond.specificIdentityId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          newCond._identNames = identIds.map(function(iid) { return this._auditIdentityName(iid); }.bind(this)).filter(Boolean);
          newCond._identName = newCond._identNames.join('、');
        } else { newCond._identNames = []; newCond._identName = ''; }
      }
      // Pre-compute display summary
      newCond._summary = this._auditConditionSummary(newCond);

      let conditions = [...this.data.auditTemplateStepForm.conditions];
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
      let index = parseInt(e.currentTarget.dataset.index);
      let conditions = [...this.data.auditTemplateStepForm.conditions];
      conditions.splice(index, 1);
      this.setData({ 'auditTemplateStepForm.conditions': conditions });
    },

    // ── Build a human-readable summary for a single condition ──
    _auditConditionSummary(c) {
      if (!c) return '未知条件';
      if (c.conditionType === 'person') {
        if (c.personHrIds) {
          let names = c.personHrIds.split(',').map(function (hid) {
            return this._auditHrName(hid.trim());
          }.bind(this)).filter(function (n) { return n; });
          return names.length ? names.join('、') : '未选择人员';
        }
        return '未设置人员';
      }
      // identity_scope — only show what's restricted, skip 'all'
      let parts = [];
      if (c.departmentScope === 'own') {
        parts.push('同部门');
      } else if (c.departmentScope === 'specific' && c.specificDepartmentId) {
        parts.push(this._auditDeptName(c.specificDepartmentId) || '指定部门');
      }
      if (c.workGroupScope === 'own') {
        parts.push('同职能组');
      } else if (c.workGroupScope === 'specific' && c.specificWorkGroupId) {
        parts.push(this._auditWgName(c.specificWorkGroupId) || '指定职能组');
      }
      if (c.identityScope === 'own') {
        parts.push('同身份');
      } else if (c.identityScope === 'specific' && c.specificIdentityId) {
        parts.push(this._auditIdentityName(c.specificIdentityId) || '指定身份');
      }
      if (!parts.length) return '不限（所有人）';
      return parts.join(' · ');
    },

    /**
     * Resolve ALL names in a condition from master lists into _d* fields.
     * Handles comma-separated IDs (multi-select).
     * Returns a new object suitable for WXML bubble rendering.
     */
    _auditResolveCondition(c) {
      let r = Object.assign({}, c);
      if (c.conditionType === 'person') {
        if (c.personHrIds) {
          let ids = c.personHrIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          r._personNames = ids.map(function (hid) { return this._auditHrName(hid); }.bind(this)).filter(Boolean);
        } else {
          r._personNames = [];
        }
      } else {
        // Handle comma-separated IDs for specific fields
        if (c.departmentScope === 'specific' && c.specificDepartmentId) {
          let deptIds = c.specificDepartmentId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          r._deptNames = deptIds.map(function(did) { return this._auditDeptName(did); }.bind(this)).filter(Boolean);
          r._deptName = r._deptNames.join('、');
        } else {
          r._deptNames = [];
          r._deptName = '';
        }
        if (c.workGroupScope === 'specific' && c.specificWorkGroupId) {
          let wgIds = c.specificWorkGroupId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          r._wgNames = wgIds.map(function(wid) { return this._auditWgName(wid); }.bind(this)).filter(Boolean);
          r._wgName = r._wgNames.join('、');
        } else {
          r._wgNames = [];
          r._wgName = '';
        }
        if (c.identityScope === 'specific' && c.specificIdentityId) {
          let identIds = c.specificIdentityId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          r._identNames = identIds.map(function(iid) { return this._auditIdentityName(iid); }.bind(this)).filter(Boolean);
          r._identName = r._identNames.join('、');
        } else {
          r._identNames = [];
          r._identName = '';
        }
      }
      return r;
    },

    // ── Open unified multi-picker for step condition fields ──
    openStepConditionPicker(e) {
      let target = e.currentTarget.dataset.target;
      let title = e.currentTarget.dataset.title || '选择';
      let list = [];
      let deptOpts = this._auditBuildDeptOptions();
      let identOpts = this._auditBuildIdentOptions();

      // Determine which list to show
      switch (target) {
        case 'specificDepartmentId':
          list = (this.data.departmentList || []).map(function(d) { return { id: d.id, name: d.name, extra: d.description || '' }; });
          break;
        case 'specificWorkGroupId':
          list = (this.data.workGroupList || []).map(function(w) { return { id: w.id, name: w.name, extra: w.departmentName || '', deptId: w.departmentId || '' }; });
          break;
        case 'specificIdentityId':
          list = (this.data.identityList || []).map(function(i) { return { id: i.id, name: i.name, extra: i.description || '' }; });
          break;
        case 'personHrIds':
          list = (this.data.hrList || []).map(function(h) { return { id: h.id, name: h.name, extra: (h.studentId || '') + ' · ' + (h.department || '') }; });
          break;
      }

      // Build department tabs for work group picker when specific depts are selected
      let deptTabs = [];
      let activeDeptTab = '';
      if (target === 'specificWorkGroupId') {
        let condForm = this.data.auditStepConditionForm || {};
        if (condForm.departmentScope === 'specific' && condForm.specificDepartmentId) {
          let selectedDeptIds = condForm.specificDepartmentId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          let deptMap = {};
          list.forEach(function(wg) {
            if (wg.deptId && selectedDeptIds.indexOf(wg.deptId) >= 0) {
              if (!deptMap[wg.deptId]) deptMap[wg.deptId] = { deptId: wg.deptId, deptName: wg.extra || wg.deptId, workGroups: [], selectedCount: 0 };
              deptMap[wg.deptId].workGroups.push(wg);
            }
          });
          deptTabs = selectedDeptIds.map(function(did) {
            return deptMap[did] || { deptId: did, deptName: did, workGroups: [], selectedCount: 0 };
          });
          if (deptTabs.length) activeDeptTab = deptTabs[0].deptId;
        }
      }

      // Pre-populate selected IDs
      let selectedIds = {};
      let currentVal = this.data.auditStepConditionForm[target] || '';
      if (currentVal) {
        currentVal.split(',').forEach(function(id) {
          let trimmed = id.trim();
          if (trimmed) selectedIds[String(trimmed)] = true;
        });
      }

      // Initialize per-tab selected counts
      if (deptTabs.length) {
        deptTabs = deptTabs.map(function(tab) {
          let count = tab.workGroups.filter(function(wg) { return selectedIds[String(wg.id)]; }).length;
          return Object.assign({}, tab, { selectedCount: count });
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
        auditMultiPickerFilteredList: [],
        auditMultiPickerDeptTabs: deptTabs,
        auditMultiPickerActiveDeptTab: activeDeptTab
      });
      this._applyAuditMultiPickerFilters();
    },

    closeAuditMultiPicker() {
      this.setData({ auditMultiPickerVisible: false });
    },

    onAuditMultiPickerDeptTab(e) {
      this.setData({ auditMultiPickerActiveDeptTab: e.currentTarget.dataset.dept });
      this._applyAuditMultiPickerFilters();
    },

    onAuditMultiPickerSearch(e) {
      this.setData({ auditMultiPickerSearchKeyword: e.detail.value });
      this._applyAuditMultiPickerFilters();
    },

    onAuditMultiPickerFilterDept(e) {
      let idx = e.detail.value;
      let options = this.data.auditMultiPickerDeptOptions;
      this.setData({ auditMultiPickerFilterDept: options[idx] || '全部' });
      this._applyAuditMultiPickerFilters();
    },

    onAuditMultiPickerFilterIdent(e) {
      let idx = e.detail.value;
      let options = this.data.auditMultiPickerIdentOptions;
      this.setData({ auditMultiPickerFilterIdent: options[idx] || '全部' });
      this._applyAuditMultiPickerFilters();
    },

    _applyAuditMultiPickerFilters() {
      let items = this.data.auditMultiPickerItems;
      let target = this.data.auditMultiPickerTarget;
      let keyword = (this.data.auditMultiPickerSearchKeyword || '').trim().toLowerCase();
      let filterDept = this.data.auditMultiPickerFilterDept;
      let filterIdent = this.data.auditMultiPickerFilterIdent;

      // Department/identity filters only apply to personnel picker
      if (target === 'personHrIds') {
        let hrList = this.data.hrList || [];
        if (filterDept !== '全部') {
          let deptId = this._auditDeptIdByName(filterDept);
          let filteredIds = {};
          hrList.filter(function(h) { return h.departmentId === deptId; }).forEach(function(h) { filteredIds[h.id] = true; });
          items = items.filter(function(item) { return filteredIds[item.id]; });
        }
        if (filterIdent !== '全部') {
          let identId = this._auditIdentIdByName(filterIdent);
          let filteredIds2 = {};
          hrList.filter(function(h) { return h.identityId === identId; }).forEach(function(h) { filteredIds2[h.id] = true; });
          items = items.filter(function(item) { return filteredIds2[item.id]; });
        }
      }

      // Department tab filter for work group picker
      if (target === 'specificWorkGroupId' && this.data.auditMultiPickerDeptTabs.length) {
        let activeTab = this.data.auditMultiPickerActiveDeptTab;
        items = items.filter(function(item) { return item.deptId === activeTab; });
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
      let found = (this.data.departmentList || []).find(function(d) { return d.name === name; });
      return found ? found.id : '';
    },

    _auditIdentIdByName(name) {
      let found = (this.data.identityList || []).find(function(i) { return i.name === name; });
      return found ? found.id : '';
    },

    onAuditMultiPickerToggle(e) {
      let id = String(e.currentTarget.dataset.id);
      let selected = Object.assign({}, this.data.auditMultiPickerSelectedIds);
      // All pickers support multi-select
      if (selected[id]) {
        delete selected[id];
      } else {
        selected[id] = true;
      }

      // Update per-tab selected counts
      let deptTabs = this.data.auditMultiPickerDeptTabs;
      if (deptTabs.length) {
        deptTabs = deptTabs.map(function(tab) {
          let count = tab.workGroups.filter(function(wg) {
            return selected[String(wg.id)];
          }).length;
          return Object.assign({}, tab, { selectedCount: count });
        });
      }

      this.setData({
        auditMultiPickerSelectedIds: selected,
        auditMultiPickerSelectedCount: Object.keys(selected).length,
        auditMultiPickerDeptTabs: deptTabs
      });
    },

    onAuditMultiPickerSelectAll() {
      let filtered = this.data.auditMultiPickerFilteredList;
      if (!filtered.length) return;
      let selected = Object.assign({}, this.data.auditMultiPickerSelectedIds);
      filtered.forEach(function(item) {
        selected[String(item.id)] = true;
      });

      // Update per-tab selected counts
      let deptTabs = this.data.auditMultiPickerDeptTabs;
      if (deptTabs.length) {
        deptTabs = deptTabs.map(function(tab) {
          let count = tab.workGroups.filter(function(wg) {
            return selected[String(wg.id)];
          }).length;
          return Object.assign({}, tab, { selectedCount: count });
        });
      }

      this.setData({
        auditMultiPickerSelectedIds: selected,
        auditMultiPickerSelectedCount: Object.keys(selected).length,
        auditMultiPickerDeptTabs: deptTabs
      });
    },

    onAuditMultiPickerDeselectAll() {
      // When dept tabs active, only deselect current tab
      let deptTabs = this.data.auditMultiPickerDeptTabs;
      let selected = Object.assign({}, this.data.auditMultiPickerSelectedIds);
      if (deptTabs.length) {
        let activeTab = this.data.auditMultiPickerActiveDeptTab;
        // Remove selections for the active tab only
        deptTabs.forEach(function(tab) {
          if (tab.deptId === activeTab) {
            tab.workGroups.forEach(function(wg) {
              delete selected[String(wg.id)];
            });
          }
        });
        deptTabs = deptTabs.map(function(tab) {
          let count = tab.workGroups.filter(function(wg) {
            return selected[String(wg.id)];
          }).length;
          return Object.assign({}, tab, { selectedCount: count });
        });
      } else {
        selected = {};
      }
      this.setData({
        auditMultiPickerSelectedIds: selected,
        auditMultiPickerSelectedCount: Object.keys(selected).length,
        auditMultiPickerDeptTabs: deptTabs
      });
    },

    confirmAuditMultiPicker() {
      let target = this.data.auditMultiPickerTarget;
      let selectedIds = this.data.auditMultiPickerSelectedIds;
      let ids = Object.keys(selectedIds);
      let items = this.data.auditMultiPickerItems;
      let condTarget = this.data._auditConditionTarget || 'step';
      let formPrefix = condTarget === 'starter' ? 'auditStarterConditionForm' : 'auditStepConditionForm';

      if (!ids.length) {
        showShortToast('请至少选择一项');
        return;
      }

      // Per-department validation for work group picker with department tabs
      if (target === 'specificWorkGroupId' && this.data.auditMultiPickerDeptTabs.length) {
        let tabs = this.data.auditMultiPickerDeptTabs;
        for (let i = 0; i < tabs.length; i++) {
          let tab = tabs[i];
          if (!tab.workGroups.length) continue; // skip empty depts
          let hasSelection = tab.workGroups.some(function(wg) { return selectedIds[String(wg.id)]; });
          if (!hasSelection) {
            showShortToast((tab.deptName || tab.deptId) + ' 至少需要选择一个职能组');
            return;
          }
        }
      }

      let names = ids.map(function(id) {
        let found = items.find(function(item) { return String(item.id) === String(id); });
        return found ? found.name : '';
      }).filter(Boolean).join('、');

      let updateObj = {};
      updateObj[formPrefix + '.' + target] = ids.join(',');
      updateObj[formPrefix + '.' + target.replace('Id', 'Name')] = names;
      this.setData(updateObj);
      this.closeAuditMultiPicker();
    },

    // Clear a field in the condition form (e.g., personHrIds)
    onStepConditionFieldClear(e) {
      let field = e.currentTarget.dataset.field;
      let update = {};
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

    // ═══════════════════════════════════════════════
    // ── Starter Condition Editor ──
    // ═══════════════════════════════════════════════

    openStarterConditionEditor(e) {
      let index = e && e.currentTarget ? parseInt(e.currentTarget.dataset.index) : -1;
      if (index >= 0 && this.data.auditTemplateForm.starterConditions[index]) {
        let c = this.data.auditTemplateForm.starterConditions[index];
        this.setData({
          auditStarterConditionForm: {
            conditionType: c.conditionType || 'identity_scope',
            departmentScope: c.departmentScope || 'all',
            specificDepartmentId: c.specificDepartmentId || '',
            specificDepartmentName: c._deptName || c.specificDepartmentName || this._auditDeptName(c.specificDepartmentId),
            workGroupScope: c.workGroupScope || 'all',
            specificWorkGroupId: c.specificWorkGroupId || '',
            specificWorkGroupName: c._wgName || c.specificWorkGroupName || this._auditWgName(c.specificWorkGroupId),
            identityScope: c.identityScope || 'all',
            specificIdentityId: c.specificIdentityId || '',
            specificIdentityName: c._identName || c.specificIdentityName || this._auditIdentityName(c.specificIdentityId),
            personHrIds: c.personHrIds || '',
            personHrNames: c.personHrNames || (c._personNames ? c._personNames.join('、') : '')
          },
          auditStarterConditionEditingIndex: index,
          auditStarterConditionEditorVisible: true
        });
      } else {
        this.setData({
          auditStarterConditionForm: {
            conditionType: 'identity_scope',
            departmentScope: 'all', specificDepartmentId: '', specificDepartmentName: '',
            workGroupScope: 'all', specificWorkGroupId: '', specificWorkGroupName: '',
            identityScope: 'all', specificIdentityId: '', specificIdentityName: '',
            personHrIds: '', personHrNames: ''
          },
          auditStarterConditionEditingIndex: -1,
          auditStarterConditionEditorVisible: true
        });
      }
      this.setData({ _auditConditionTarget: 'starter' });
    },

    closeStarterConditionEditor() {
      this.setData({ auditStarterConditionEditorVisible: false });
    },

    onStarterConditionTypeChange(e) {
      this.setData({ 'auditStarterConditionForm.conditionType': ['identity_scope', 'person'][e.detail.value] || 'identity_scope' });
    },

    onStarterConditionScopeChange(e) {
      let field = e.currentTarget.dataset.field;
      let scopes = ['all', 'specific']; // starter has no 'own' — starter IS the submitter
      let idx = parseInt(e.detail.value);
      this.setData({ ['auditStarterConditionForm.' + field]: scopes[idx] || 'all' });
    },

    confirmStarterCondition() {
      let cond = this.data.auditStarterConditionForm;
      let newCond = { conditionType: cond.conditionType };

      if (cond.conditionType === 'person') {
        if (!cond.personHrIds) { showShortToast('请选择人员'); return; }
        newCond.personHrIds = cond.personHrIds;
        let ids = cond.personHrIds.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        newCond.personHrNames = ids.map(function(hid) { return this._auditHrName(hid); }.bind(this)).join('、');
        newCond._personNames = ids.map(function(hid) { return this._auditHrName(hid); }.bind(this));
      } else {
        newCond.departmentScope = cond.departmentScope;
        newCond.specificDepartmentId = cond.departmentScope === 'specific' ? cond.specificDepartmentId : '';
        if (newCond.specificDepartmentId) {
          let deptIds = newCond.specificDepartmentId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          newCond._deptNames = deptIds.map(function(did) { return this._auditDeptName(did); }.bind(this)).filter(Boolean);
          newCond._deptName = newCond._deptNames.join('、');
        } else { newCond._deptNames = []; newCond._deptName = ''; }
        newCond.workGroupScope = cond.workGroupScope;
        newCond.specificWorkGroupId = cond.workGroupScope === 'specific' ? cond.specificWorkGroupId : '';
        if (newCond.specificWorkGroupId) {
          let wgIds = newCond.specificWorkGroupId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          newCond._wgNames = wgIds.map(function(wid) { return this._auditWgName(wid); }.bind(this)).filter(Boolean);
          newCond._wgName = newCond._wgNames.join('、');
        } else { newCond._wgNames = []; newCond._wgName = ''; }
        newCond.identityScope = cond.identityScope;
        newCond.specificIdentityId = cond.identityScope === 'specific' ? cond.specificIdentityId : '';
        if (newCond.specificIdentityId) {
          let identIds = newCond.specificIdentityId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          newCond._identNames = identIds.map(function(iid) { return this._auditIdentityName(iid); }.bind(this)).filter(Boolean);
          newCond._identName = newCond._identNames.join('、');
        } else { newCond._identNames = []; newCond._identName = ''; }
      }

      let conditions = [...this.data.auditTemplateForm.starterConditions];
      if (this.data.auditStarterConditionEditingIndex >= 0) {
        conditions[this.data.auditStarterConditionEditingIndex] = newCond;
      } else {
        conditions.push(newCond);
      }
      this.setData({
        'auditTemplateForm.starterConditions': conditions,
        auditStarterConditionEditorVisible: false
      });
    },

    removeStarterCondition(e) {
      let index = parseInt(e.currentTarget.dataset.index);
      let conditions = [...this.data.auditTemplateForm.starterConditions];
      conditions.splice(index, 1);
      this.setData({ 'auditTemplateForm.starterConditions': conditions });
    },

    // Open the unified multi-picker for a starter condition field
    openStarterConditionPicker(e) {
      let target = e.currentTarget.dataset.target;
      let title = e.currentTarget.dataset.title || '选择';
      let list = [];
      let deptOpts = this._auditBuildDeptOptions();
      let identOpts = this._auditBuildIdentOptions();

      switch (target) {
        case 'specificDepartmentId':
          list = (this.data.departmentList || []).map(function(d) { return { id: d.id, name: d.name, extra: d.description || '' }; });
          break;
        case 'specificWorkGroupId':
          list = (this.data.workGroupList || []).map(function(w) { return { id: w.id, name: w.name, extra: w.departmentName || '', deptId: w.departmentId || '' }; });
          break;
        case 'specificIdentityId':
          list = (this.data.identityList || []).map(function(i) { return { id: i.id, name: i.name, extra: i.description || '' }; });
          break;
        case 'personHrIds':
          list = (this.data.hrList || []).map(function(h) { return { id: h.id, name: h.name, extra: (h.studentId || '') + ' · ' + (h.department || '') }; });
          break;
      }

      // Build department tabs for work group picker when specific depts are selected
      let deptTabs = [];
      let activeDeptTab = '';
      if (target === 'specificWorkGroupId') {
        let starterForm = this.data.auditStarterConditionForm || {};
        if (starterForm.departmentScope === 'specific' && starterForm.specificDepartmentId) {
          let selectedDeptIds = starterForm.specificDepartmentId.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          let deptMap = {};
          list.forEach(function(wg) {
            if (wg.deptId && selectedDeptIds.indexOf(wg.deptId) >= 0) {
              if (!deptMap[wg.deptId]) deptMap[wg.deptId] = { deptId: wg.deptId, deptName: wg.extra || wg.deptId, workGroups: [], selectedCount: 0 };
              deptMap[wg.deptId].workGroups.push(wg);
            }
          });
          deptTabs = selectedDeptIds.map(function(did) {
            return deptMap[did] || { deptId: did, deptName: did, workGroups: [], selectedCount: 0 };
          });
          if (deptTabs.length) activeDeptTab = deptTabs[0].deptId;
        }
      }

      let selectedIds = {};
      let currentVal = this.data.auditStarterConditionForm[target] || '';
      if (currentVal) {
        currentVal.split(',').forEach(function(id) {
          let trimmed = id.trim();
          if (trimmed) selectedIds[String(trimmed)] = true;
        });
      }

      // Initialize per-tab selected counts
      if (deptTabs.length) {
        deptTabs = deptTabs.map(function(tab) {
          let count = tab.workGroups.filter(function(wg) { return selectedIds[String(wg.id)]; }).length;
          return Object.assign({}, tab, { selectedCount: count });
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
        auditMultiPickerFilteredList: [],
        auditMultiPickerDeptTabs: deptTabs,
        auditMultiPickerActiveDeptTab: activeDeptTab,
        _auditConditionTarget: 'starter'
      });
      this._applyAuditMultiPickerFilters();
    },

    // Clear a field in the starter condition form
    onStarterConditionFieldClear(e) {
      let field = e.currentTarget.dataset.field;
      let update = {};
      update['auditStarterConditionForm.' + field] = '';
      update['auditStarterConditionForm.' + field.replace('Id', 'Name')] = '';
      this.setData(update);
    },

    // Build a human-readable summary for starter conditions
    _auditStarterSummary() {
      let conds = this.data.auditTemplateForm.starterConditions;
      if (!conds || !conds.length) return '任何人';
      return conds.map(function(c) { return this._auditConditionSummary(c); }.bind(this)).join(' 或 ');
    },

    async saveAuditFlowTemplate() {
      const form = this.data.auditTemplateForm;
      if (!form.name) { showShortToast('请输入模板名称'); return; }
      if (!form.steps.length) { showShortToast('请至少添加一个步骤'); return; }
      // Validate each step has at least one condition
      for (let i = 0; i < form.steps.length; i++) {
        if (!form.steps[i].conditions || !form.steps[i].conditions.length) {
          showShortToast('第' + (i + 1) + '步至少需要一个审批条件');
          return;
        }
      }

      this.setLoading('saveAuditTemplate', true);
      try {
        let stepsToSend = form.steps.map(function(s) {
          return {
            name: s.name || '',
            conditions: s.conditions.map(function(c) {
              let cond = { conditionType: c.conditionType };
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

        let starterCondsToSend = (form.starterConditions || []).map(function(c) {
          let cond = { conditionType: c.conditionType };
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
        });

        const res = await this.callCloud('saveAuditFlowTemplate', {
          id: form.id,
          name: form.name,
          description: form.description,
          starterType: form.starterType,
          starterIdentityId: form.starterIdentityId,
          starterHrId: form.starterHrId,
          starterConditions: starterCondsToSend,
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
      let id = e.currentTarget.dataset.id;
      let current = this.data.auditExpandedTemplateId;
      this.setData({ auditExpandedTemplateId: current === id ? '' : id });
    },

    // ═══════════════════════════════════════════════════════
    // Stamps Management
    // ═══════════════════════════════════════════════════════

    async loadStamps() {
      this.setLoading('auditStamps', true);
      try {
        const res = await this.callCloud('listStamps', {});
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
          const submissionStatus = res.submission.status;
          const currentStepIndex = res.submission.currentStepIndex || 0;
          const rawSteps = res.steps || [];

          // Build flow timeline from server events + steps
          let serverEvents = res.events || [];
          const flowTimeline = [];

          // 1. Build lifecycle nodes from REAL server events
          let lifecycleEvents = [];
          for (let ei = 0; ei < serverEvents.length; ei++) {
            let evt = serverEvents[ei];
            if (evt.eventType === 'submit' || evt.eventType === 'withdraw' || evt.eventType === 'resubmit') {
              lifecycleEvents.push(evt);
            }
          }

          // 2. Group steps by round
          const rounds = {};
          for (const s of rawSteps) {
            const r = s.round || 1;
            if (!rounds[r]) rounds[r] = [];
            rounds[r].push(s);
          }
          const roundKeys = Object.keys(rounds).sort((a, b) => Number(a) - Number(b));

          // 3. Find the first submit event (round 1)
          let initialSubmit = null;
          let usedEventIdx = 0;
          for (let ei2 = 0; ei2 < lifecycleEvents.length; ei2++) {
            if (lifecycleEvents[ei2].eventType === 'submit' && lifecycleEvents[ei2].round === 1) {
              initialSubmit = lifecycleEvents[ei2];
              usedEventIdx = ei2 + 1;
              break;
            }
          }

          // Only show submit if there IS a submit event
          if (initialSubmit) {
            flowTimeline.push({
              _key: 'lifecycle_submit',
              type: 'lifecycle', event: 'submit', label: '提交审核',
              time: formatAuditTime(initialSubmit.createdAt), icon: '📤'
            });
          }

          // 4. For each round, show steps with lifecycle events between
          let nextEventIdx = usedEventIdx;

          for (let ri = 0; ri < roundKeys.length; ri++) {
            const round = Number(roundKeys[ri]);
            const roundSteps = rounds[round].sort((a, b) => a.sort_order - b.sort_order);

            if (round > 1) {
              let resubmitEvt = null;
              for (let ei3 = nextEventIdx; ei3 < lifecycleEvents.length; ei3++) {
                if (lifecycleEvents[ei3].eventType === 'resubmit' && lifecycleEvents[ei3].round === round) {
                  resubmitEvt = lifecycleEvents[ei3];
                  nextEventIdx = ei3 + 1;
                  break;
                }
              }
              if (resubmitEvt) {
                flowTimeline.push({
                  _key: 'lifecycle_resubmit_r' + round,
                  type: 'lifecycle', event: 'resubmit', label: '重新提交',
                  subLabel: '第' + round + '轮',
                  time: formatAuditTime(resubmitEvt.createdAt),
                  icon: '🔄'
                });
              } else {
                flowTimeline.push({
                  _key: 'lifecycle_resubmit_r' + round,
                  type: 'lifecycle', event: 'resubmit', label: '重新提交',
                  subLabel: '第' + round + '轮', icon: '🔄'
                });
              }
            }

            let hasProcessedSteps = false;
            let hasFutureSteps = false;

            for (const s of roundSteps) {
              let flowNodeClass, flowDotClass, flowIcon, flowStatusLabel, flowTagClass;

              // Build approver description
              let approverDesc = s.approverDesc || '';
              if (!approverDesc) {
                if (s.approverType === 'specific_person' || s.approverName) {
                  approverDesc = '由 ' + (s.approverName || '未指定') + ' 审批';
                } else {
                  const identName = s.approverIdentityName || '未指定身份';
                  const scopeType = s.scopeType || 'all';
                  if (scopeType === 'all' || !scopeType) {
                    approverDesc = '由 全体 ' + identName + ' 审批';
                  } else if (scopeType === 'same_department') {
                    approverDesc = '由 同部门 ' + identName + ' 审批';
                  } else if (scopeType === 'same_work_group') {
                    approverDesc = '由 同职能组 ' + identName + ' 审批';
                  } else if (scopeType === 'specific_department') {
                    const deptName = s.scopeDepartmentName || s.scopeDepartmentId || '指定部门';
                    approverDesc = '由 ' + deptName + ' ' + identName + ' 审批';
                  } else if (scopeType === 'specific_work_group') {
                    const deptName = s.scopeDepartmentName || '';
                    const wgName = s.scopeWorkGroupName || '';
                    const location = [deptName, wgName].filter(Boolean).join('·') || '指定职能组';
                    approverDesc = '由 ' + location + ' ' + identName + ' 审批';
                  } else {
                    approverDesc = '由 ' + identName + ' 审批';
                  }
                }
              }

              const actionMap = { pass: '仅通过', sign: '签字', estamp: '盖章', both: '签字+盖章' };
              const actionLabel = actionMap[s.actionType] || s.actionType || '仅通过';

              if (s.status === 'rejected') {
                flowNodeClass = 'flow-node-rejected'; flowDotClass = 'flow-dot-rejected';
                flowIcon = 'cross'; flowStatusLabel = '✗ 已驳回'; flowTagClass = 'flow-tag-rejected';
              } else if (submissionStatus === 'approved') {
                flowNodeClass = 'flow-node-done'; flowDotClass = 'flow-dot-done';
                flowIcon = 'check'; flowStatusLabel = '✓ 已通过'; flowTagClass = 'flow-tag-done';
              } else if (submissionStatus === 'pending' || submissionStatus === 'draft') {
                flowNodeClass = 'flow-node-pending'; flowDotClass = 'flow-dot-pending';
                flowIcon = 'number'; flowStatusLabel = '○ 未开始'; flowTagClass = 'flow-tag-pending';
              } else if (s.status === 'approved') {
                flowNodeClass = 'flow-node-done'; flowDotClass = 'flow-dot-done';
                flowIcon = 'check'; flowStatusLabel = '✓ 已通过'; flowTagClass = 'flow-tag-done';
              } else if (s.sort_order === currentStepIndex && s.status === 'pending') {
                flowNodeClass = 'flow-node-active'; flowDotClass = 'flow-dot-active';
                flowIcon = 'number'; flowStatusLabel = '● 待处理'; flowTagClass = 'flow-tag-active';
                hasProcessedSteps = true;
              } else if (s.sort_order < currentStepIndex) {
                flowNodeClass = 'flow-node-done'; flowDotClass = 'flow-dot-done';
                flowIcon = 'check'; flowStatusLabel = '✓ 已通过'; flowTagClass = 'flow-tag-done';
                hasProcessedSteps = true;
              } else {
                flowNodeClass = 'flow-node-pending'; flowDotClass = 'flow-dot-pending';
                flowIcon = 'number'; flowStatusLabel = '○ 未到达'; flowTagClass = 'flow-tag-pending';
                hasFutureSteps = true;
              }

              if (s.status === 'approved' || s.status === 'rejected') {
                hasProcessedSteps = true;
              }

              flowTimeline.push({
                _key: 'step_' + s.id,
                type: 'step', ...s,
                flowNodeClass, flowDotClass, flowIcon, flowStatusLabel, flowTagClass,
                approverDesc, actionLabel,
                processedAt: s.processed_at ? formatAuditTime(s.processed_at) : ''
              });
            }

            // Inject separator
            if (hasProcessedSteps && hasFutureSteps) {
              let remainingCount = roundSteps.filter(function(rs) {
                return rs.status === 'pending' && rs.sort_order > currentStepIndex;
              }).length;
              if (remainingCount > 0) {
                let insertIdx = -1;
                for (let fi = 0; fi < flowTimeline.length; fi++) {
                  if (flowTimeline[fi].type === 'step' && flowTimeline[fi].flowStatusLabel === '○ 未到达') {
                    insertIdx = fi;
                    break;
                  }
                }
                if (insertIdx > 0) {
                  flowTimeline.splice(insertIdx, 0, {
                    _key: 'separator_r' + round + '_remaining',
                    type: 'separator',
                    label: '剩余 ' + remainingCount + ' 步待处理'
                  });
                }
              }
            }
          }

          // 5. Remaining lifecycle events after last round
          for (let ei4 = nextEventIdx; ei4 < lifecycleEvents.length; ei4++) {
            let lateEvt = lifecycleEvents[ei4];
            if (lateEvt.eventType === 'withdraw') {
              flowTimeline.push({
                _key: 'lifecycle_withdraw_' + lateEvt.id,
                type: 'lifecycle', event: 'withdraw', label: '撤回审核',
                time: formatAuditTime(lateEvt.createdAt), icon: '↩️'
              });
            } else if (lateEvt.eventType === 'resubmit') {
              flowTimeline.push({
                _key: 'lifecycle_resubmit_late_' + lateEvt.id,
                type: 'lifecycle', event: 'resubmit', label: '重新提交',
                subLabel: '第' + (lateEvt.round || 1) + '轮',
                time: formatAuditTime(lateEvt.createdAt), icon: '🔄'
              });
            }
          }

          this.setData({
            auditSubmissionDetail: { ...res, flowTimeline: flowTimeline },
auditSubmissionDetail: { ...res, flowTimeline: flowTimeline },
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

    previewAuditFile(e) {
      const fileId = e.currentTarget.dataset.fileId;
      const fileName = e.currentTarget.dataset.fileName || '';
      if (!fileId) return;
      openAuditFile({ fileId: fileId, fileName: fileName });
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
      let modes = ['number', 'id', 'file'];
      this.setData({ verificationMode: modes[e.detail.value] || 'number' });
    },

    async verifySubmissionChain() {
      let params = {};
      let mode = this.data.verificationMode || 'number';

      if (mode === 'number') {
        let number = this.data.verificationInputNumber;
        if (!number) { showShortToast('请输入提交编号'); return; }
        params.submissionNumber = number;
      } else if (mode === 'id') {
        let sid = this.data.verificationInputId;
        if (!sid) { showShortToast('请输入提交ID'); return; }
        params.submissionId = sid;
      } else if (mode === 'file') {
        let fileB64 = this.data.verificationFileBase64;
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
      let selectedId = '';
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
      let idx = e.detail.value;
      let options = this.data.auditPersonnelDeptOptions;
      this.setData({ auditPersonnelFilterDept: options[idx] || '全部' });
      this._applyAuditPersonnelFilters();
    },

    onAuditPersonnelFilterIdent(e) {
      let idx = e.detail.value;
      let options = this.data.auditPersonnelIdentOptions;
      this.setData({ auditPersonnelFilterIdent: options[idx] || '全部' });
      this._applyAuditPersonnelFilters();
    },

    _applyAuditPersonnelFilters() {
      let hrList = this.data.hrList || [];
      let keyword = (this.data.auditPersonnelSearchKeyword || '').trim().toLowerCase();
      let filterDept = this.data.auditPersonnelFilterDept;
      let filterIdent = this.data.auditPersonnelFilterIdent;

      let filtered = hrList;
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
      let hrId = String(e.currentTarget.dataset.hrId);
      let current = this.data.auditPersonnelPickerSelectedId;
      // Toggle: if already selected, deselect; otherwise select
      this.setData({ auditPersonnelPickerSelectedId: current === hrId ? '' : hrId });
    },

    confirmAuditPersonnelPicker() {
      let selectedId = this.data.auditPersonnelPickerSelectedId;
      if (!selectedId) {
        showShortToast('请先选择一名人员');
        return;
      }

      let hrList = this.data.hrList || [];
      let person = hrList.find(function (item) { return String(item.id) === String(selectedId); });
      let hrId = String(selectedId);
      let hrName = person ? person.name : selectedId;

      let target = this.data.auditPersonnelPickerTarget;
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
      let target = e.currentTarget.dataset.target;
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
      let target = e.currentTarget.dataset.target;
      let label = e.currentTarget.dataset.label || '选择身份';
      let multi = e.currentTarget.dataset.multi === 'true';

      // Pre-populate selected IDs from the current target field
      let selectedIds = {};
      let currentIds = '';
      if (target === 'starterIdentityId') {
        currentIds = this.data.auditTemplateForm.starterIdentityId || '';
      } else if (target === 'stepIdentityId') {
        currentIds = this.data.auditTemplateStepForm.approverIdentityId || '';
      }
      if (currentIds) {
        currentIds.split(',').forEach(function (id) {
          let trimmed = id.trim();
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
      let id = String(e.currentTarget.dataset.id);
      let selectedIds = Object.assign({}, this.data.auditIdentityPickerSelectedIds);

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
      let selectedIds = this.data.auditIdentityPickerSelectedIds;
      let identityList = this.data.identityList || [];
      let target = this.data.auditIdentityPickerTarget;
      let ids = Object.keys(selectedIds);

      if (!ids.length) {
        showShortToast('请至少选择一个身份');
        return;
      }

      let names = ids.map(function (id) {
        let found = identityList.find(function (item) { return String(item.id) === id; });
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
      let target = e.currentTarget.dataset.target;
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
