const { callFunction, getErrorText, showShortToast, formatAuditTime } = require('../../../../utils/api');

const AUDIT_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const AUDIT_MAX_FILE_SIZE = 10 * 1024 * 1024;

Page({
  data: {
    submissionId: '',
    action: '', // 'create' or 'view'
    submission: null,
    steps: [],  // kept for backward compat; prefer flowTimeline
    flowTimeline: [],
    files: [],
    signatures: [],
    loading: false,
    flowProgressPercent: 0,
    flowProgressText: '未开始',

    // Create mode
    createMode: 'template', // 'template' or 'ad_hoc'
    flowTemplates: [],
    selectedTemplateId: '',
    createTitle: '',
    createDesc: '',
    uploadedFiles: [], // { fileId, fileName, mimeType, fileSize, fileHash, tmpPath }
    adHocSteps: [],
    adHocStepForm: { approverType: 'identity', approverIdentityId: '', approverIdentityName: '', approverHrId: '', approverHrName: '', actionType: 'pass', scopeType: 'all', scopeDepartmentId: '', scopeDepartmentName: '', scopeWorkGroupId: '', scopeWorkGroupName: '' },
    adHocStepEditorVisible: false,
    resubmitMode: 'fresh',

    // Reference data for approver picker
    allDepartments: [],
    allIdentities: [],
    allWorkGroups: [],
    allHrPersons: [],

    // Approver picker — identity mode
    identityPickerScopeIndex: 0,
    identityPickerScopeOptions: ['全体成员', '同部门成员', '同职能组成员', '指定部门成员', '指定职能组成员'],
    identityPickerScopeValues: ['all', 'same_department', 'same_work_group', 'specific_department', 'specific_work_group'],
    identityPickerDeptIndex: 0,
    identityPickerDeptOptions: ['全部部门'],
    identityPickerWgIndex: 0,
    identityPickerWgOptions: ['全部职能组'],
    identityPickerIdentIndex: 0,
    identityPickerIdentOptions: ['全部身份'],

    // Template step preview (for overrides)
    templatePreviewSteps: [],
    templateStepOverrides: [],    // [{ stepIndex, mode: 'auto'|'specific', personHrIds: [], personHrNames: [] }]
    templateOverrideStepIndex: -1, // which step index is being edited in person picker

    // Approver picker — person mode (multi-select)
    personPickerVisible: false,
    personPickerDept: '全部',
    personPickerIdent: '全部',
    personPickerWg: '全部',
    personPickerDeptOpts: ['全部'],
    personPickerIdentOpts: ['全部'],
    personPickerWgOpts: ['全部'],
    personPickerKeyword: '',
    personPickerCandidates: [],
    personPickerSelectedIds: [],
    personPickerSelectedList: [],
    personPickerStepActionType: 'sign',
    personPickerMode: '',  // '' | 'designateNext'

    // Edit mode (for editable submissions)
    editMode: false,
    editTitle: '',
    editDesc: '',
    editType: '',        // 'template' or 'ad_hoc'
    editResubmitMode: 'fresh',
    editTemplateId: '',
    editSteps: [],       // for ad_hoc type
    editFiles: [],       // current files (display)
    editNewFiles: [],    // newly uploaded files
    editStepEditorVisible: false,
    editStepForm: { approverType: 'identity', approverIdentityId: '', approverIdentityName: '', approverHrId: '', approverHrName: '', actionType: 'pass', scopeType: 'all', scopeDepartmentId: '', scopeDepartmentName: '', scopeWorkGroupId: '', scopeWorkGroupName: '' },
    editIdentityPickerScopeIndex: 0,
    editIdentityPickerDeptIndex: 0,
    editIdentityPickerWgIndex: 0,
    editIdentityPickerIdentIndex: 0,
    editPersonPickerVisible: false,
    editPersonPickerDept: '全部',
    editPersonPickerIdent: '全部',
    editPersonPickerWg: '全部',
    editPersonPickerKeyword: '',
    editPersonPickerCandidates: [],
    editPersonPickerSelectedIds: [],
    editPersonPickerSelectedList: [],
    editPersonPickerStepActionType: 'pass',
    editUploading: false,

    // Approval mode
    approvalVisible: false,
    approvalStepId: '',
    approvalAction: '', // 'approve' or 'reject'
    approvalComment: '',
    rejectionReason: '',
    signaturePadVisible: false,
    currentSignatureFileId: '',
    pendingSignatures: [], // signatures to submit with approval

    // Inline approval card
    activeApprovalStepId: '',
    activeApprovalStep: null,
    designatedNextPersons: [], // [{id, name}] for next-step designation
    nextStepInfo: null,        // {sortOrder, approverDesc} of next step
    approvalWarning: '',       // warning text for incomplete sign+stamp

    // Stamp picker
    stampPickerVisible: false,
    availableStamps: [],
    stampPickFileId: '',
    stampPickFileName: '',

    // Signature source picker (saved sigs + new drawing + save option)
    sigSourcePickerVisible: false,
    sigSourceFileId: '',
    sigSourceFileName: '',
    mySignatures: [],
    sigSaveNew: false,
    sigSaveName: '',

    // Placement / File Preview popup (positioning sig/stamp on file)
    placementVisible: false,
    placementType: '',        // 'signature' or 'stamp'
    placementFileName: '',
    placementFileImage: '',   // base64 image data for preview (with data URI prefix)
    placementItems: [],       // all sigs/stamps on the current file
    placementActiveIdx: -1,   // index of the item being repositioned
    placementPreviewX: -1,    // preview crosshair X (0-1)
    placementPreviewY: -1,    // preview crosshair Y (0-1)
    placementFileId: '',
    placementFileMime: '',       // mime type of the file being previewed
    placementTotalPages: 1,      // total pages (for PDFs)
    placementCurrentPage: 1,     // current page being shown
    placementLoading: false,     // loading page preview
    placementPosText: '',        // formatted position text for display

    // User role flags
    userIsSubmitter: false,
    userIsApprover: false,
    userIsAdmin: false,

    // Flow node expansion
    expandedNodeKey: '',

    // Uploading
    uploading: false
  },

  // Empty handler for catchtap to prevent event bubbling through popups
  noop() {},

  onLoad(options) {
    if (options.action === 'create') {
      this.setData({ action: 'create' });
      this.loadFlowTemplates();
      this.loadReferenceData();
    } else if (options.id) {
      this.setData({ submissionId: options.id, action: 'view' });
      this.loadDetail();
    }
  },

  // ═══════════════════════════════════════════════
  // Reference Data Loading
  // ═══════════════════════════════════════════════

  async loadReferenceData() {
    try {
      const [deptRes, identRes, hrRes, wgRes] = await Promise.all([
        callFunction({ name: 'listDepartments', data: {} }),
        callFunction({ name: 'listIdentities', data: {} }),
        callFunction({ name: 'listHrInfo', data: {} }),
        callFunction({ name: 'listWorkGroups', data: {} })
      ]);

      const departments = (deptRes.status === 'success' ? deptRes.departments : []) || [];
      const identities = (identRes.status === 'success' ? identRes.identities : []) || [];
      const hrPersons = (hrRes.status === 'success' ? hrRes.list : []) || [];
      const workGroups = (wgRes.status === 'success' ? wgRes.workGroups : []) || [];

      const deptNames = departments.map(d => d.name).sort((a, b) => a.localeCompare(b, 'zh-CN'));
      const identNames = identities.map(i => i.name);
      // Use HR persons' actual work groups for filter consistency
      const wgNames = [...new Set(hrPersons.map(p => p.workGroup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));

      this.setData({
        allDepartments: departments,
        allIdentities: identities,
        allWorkGroups: workGroups,
        allHrPersons: hrPersons,
        identityPickerDeptOptions: ['全部部门', ...deptNames],
        identityPickerWgOptions: ['全部职能组', ...wgNames],
        identityPickerIdentOptions: ['全部身份', ...identNames],
        personPickerDeptOpts: ['全部', ...deptNames],
        personPickerIdentOpts: ['全部', ...identNames],
        personPickerWgOpts: ['全部', ...wgNames]
      });
    } catch (e) {
      // Non-fatal; picker will just show fewer options
    }
  },

  // ═══════════════════════════════════════════════
  // Create Mode
  // ═══════════════════════════════════════════════

  async loadFlowTemplates() {
    try {
      const res = await callFunction({ name: 'listAvailableFlowTemplates', data: {} });
      if (res.status === 'success') {
        this.setData({ flowTemplates: res.templates || [] });
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载模板失败'));
    }
  },

  onTemplateSelect(e) {
    var id = e.currentTarget.dataset.id;
    // Toggle: tap selected item to deselect
    var newId = this.data.selectedTemplateId === id ? '' : id;
    this.setData({
      selectedTemplateId: newId,
      templatePreviewSteps: [],
      templateStepOverrides: []
    });
    if (newId) {
      this.loadTemplatePreview(newId);
    }
  },

  // Load template steps preview for step-level person override
  async loadTemplatePreview(templateId) {
    try {
      var res = await callFunction({ name: 'previewTemplateSteps', data: { templateId: templateId } });
      if (res.status === 'success') {
        var steps = res.steps || [];
        // Initialize overrides: auto mode for all steps
        var overrides = steps.map(function(s) {
          return {
            stepIndex: s.stepIndex,
            mode: 'auto',
            personHrIds: [],
            personHrNames: []
          };
        });
        this.setData({
          templatePreviewSteps: steps,
          templateStepOverrides: overrides
        });
      }
    } catch (e) {
      console.error('[audit] loadTemplatePreview failed:', e);
      showShortToast('模板步骤预览加载失败，但仍可提交');
    }
  },

  // Toggle step override mode between 'auto' (anyone with role) and 'specific' (chosen persons)
  onTemplateStepModeToggle(e) {
    var stepIndex = parseInt(e.currentTarget.dataset.stepIndex);
    var overrides = [...this.data.templateStepOverrides];
    var entry = overrides.find(function(o) { return o.stepIndex === stepIndex; });
    if (entry) {
      entry.mode = entry.mode === 'auto' ? 'specific' : 'auto';
      if (entry.mode === 'auto') {
        entry.personHrIds = [];
        entry.personHrNames = [];
      }
    }
    this.setData({ templateStepOverrides: overrides });
  },

  // Open person picker for a specific template step override
  openTemplateStepPersonPicker(e) {
    var stepIndex = parseInt(e.currentTarget.dataset.stepIndex);
    // Pre-populate selected persons from existing override
    var entry = (this.data.templateStepOverrides || []).find(function(o) { return o.stepIndex === stepIndex; });
    var preSelectedIds = [];
    var preSelectedList = [];
    if (entry && entry.personHrIds && entry.personHrIds.length) {
      preSelectedIds = entry.personHrIds.slice();
      preSelectedList = this.data.allHrPersons.filter(function(p) {
        return preSelectedIds.indexOf(p.id) >= 0;
      });
    }
    this.setData({
      personPickerVisible: true,
      templateOverrideStepIndex: stepIndex,
      personPickerDept: '全部',
      personPickerIdent: '全部',
      personPickerWg: '全部',
      personPickerKeyword: '',
      personPickerSelectedIds: preSelectedIds,
      personPickerSelectedList: preSelectedList,
      personPickerStepActionType: 'pass'
    });
    this.applyPersonPickerFilters();
  },

  // Confirm person picker for template step override
  confirmTemplateStepPersonPicker() {
    var selected = this.data.personPickerSelectedList;
    var stepIndex = this.data.templateOverrideStepIndex;
    if (stepIndex < 0) return;
    var overrides = [...this.data.templateStepOverrides];
    var entry = overrides.find(function(o) { return o.stepIndex === stepIndex; });
    if (!entry) {
      entry = { stepIndex: stepIndex, mode: 'specific', personHrIds: [], personHrNames: [] };
      overrides.push(entry);
    }
    entry.personHrIds = selected.map(function(p) { return p.id; });
    entry.personHrNames = selected.map(function(p) { return p.name; });
    this.setData({
      templateStepOverrides: overrides,
      personPickerVisible: false,
      templateOverrideStepIndex: -1
    });
  },

  // Remove a person from a template step override
  removeTemplateStepOverridePerson(e) {
    var stepIndex = parseInt(e.currentTarget.dataset.stepIndex);
    var hrId = e.currentTarget.dataset.hrId;
    var overrides = [...this.data.templateStepOverrides];
    var entry = overrides.find(function(o) { return o.stepIndex === stepIndex; });
    if (entry) {
      var idx = entry.personHrIds.indexOf(hrId);
      if (idx >= 0) {
        entry.personHrIds.splice(idx, 1);
        entry.personHrNames.splice(idx, 1);
      }
      if (!entry.personHrIds.length) {
        entry.mode = 'auto';
      }
    }
    this.setData({ templateStepOverrides: overrides });
  },

  onCreateModeChange(e) {
    this.setData({ createMode: e.currentTarget.dataset.mode });
  },

  onResubmitModeChange(e) {
    this.setData({ resubmitMode: ['fresh', 'from_rejector'][e.detail.value] || 'fresh' });
  },

  onTitleInput(e) {
    this.setData({ createTitle: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ createDesc: e.detail.value });
  },

  // ── Ad-hoc Step Editor ──

  openAdHocStepEditor() {
    this.setData({
      adHocStepEditorVisible: true,
      adHocStepForm: { approverType: 'identity', approverIdentityId: '', approverIdentityName: '', approverHrId: '', approverHrName: '', actionType: 'pass', scopeType: 'all', scopeDepartmentId: '', scopeDepartmentName: '', scopeWorkGroupId: '', scopeWorkGroupName: '' },
      identityPickerScopeIndex: 0,
      identityPickerDeptIndex: 0,
      identityPickerWgIndex: 0,
      identityPickerIdentIndex: 0
    });
  },

  closeAdHocStepEditor() {
    this.setData({ adHocStepEditorVisible: false, personPickerVisible: false });
  },

  onAdHocStepTypeChange(e) {
    const type = ['identity', 'specific_person'][e.detail.value] || 'identity';
    this.setData({
      'adHocStepForm.approverType': type,
      'adHocStepForm.approverIdentityId': '',
      'adHocStepForm.approverIdentityName': '',
      'adHocStepForm.approverHrId': '',
      'adHocStepForm.approverHrName': ''
    });
  },

  onAdHocActionTypeChange(e) {
    const val = ['pass', 'sign', 'estamp', 'both'][e.detail.value] || 'pass';
    this.setData({ 'adHocStepForm.actionType': val });
  },

  // ── Identity mode picker ──

  onIdentityScopeChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ identityPickerScopeIndex: idx });
  },

  onIdentityDeptChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ identityPickerDeptIndex: idx });
  },

  onIdentityWgChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ identityPickerWgIndex: idx });
  },

  onIdentityIdentChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ identityPickerIdentIndex: idx });
  },

  // ── Person picker popup (multi-select) ──

  openPersonPicker() {
    // Reset filters (options already loaded in loadReferenceData)
    this.setData({
      personPickerVisible: true,
      personPickerDept: '全部',
      personPickerIdent: '全部',
      personPickerWg: '全部',
      personPickerKeyword: '',
      personPickerSelectedIds: [],
      personPickerSelectedList: [],
      personPickerStepActionType: 'pass'
    });
    this.applyPersonPickerFilters();
  },

  closePersonPicker() {
    this.setData({ personPickerVisible: false });
  },

  onPersonPickerDeptChange(e) {
    const opts = this.data.personPickerDeptOpts;
    this.setData({ personPickerDept: opts[parseInt(e.detail.value)] || '全部' });
    this.applyPersonPickerFilters();
  },

  onPersonPickerIdentChange(e) {
    const opts = this.data.personPickerIdentOpts;
    this.setData({ personPickerIdent: opts[parseInt(e.detail.value)] || '全部' });
    this.applyPersonPickerFilters();
  },

  onPersonPickerWgChange(e) {
    const opts = this.data.personPickerWgOpts;
    this.setData({ personPickerWg: opts[parseInt(e.detail.value)] || '全部' });
    this.applyPersonPickerFilters();
  },

  onPersonPickerSearch(e) {
    this.setData({ personPickerKeyword: e.detail.value });
    this.applyPersonPickerFilters();
  },

  applyPersonPickerFilters() {
    let list = [...this.data.allHrPersons];
    const dept = this.data.personPickerDept;
    const ident = this.data.personPickerIdent;
    const wg = this.data.personPickerWg;
    const kw = (this.data.personPickerKeyword || '').trim().toLowerCase();

    if (dept !== '全部') list = list.filter(p => p.department === dept);
    if (ident !== '全部') list = list.filter(p => p.identity === ident);
    if (wg !== '全部') list = list.filter(p => p.workGroup === wg);
    if (kw) list = list.filter(p =>
      (p.name || '').toLowerCase().includes(kw) ||
      (p.studentId || '').toLowerCase().includes(kw)
    );

    const selectedIds = this.data.personPickerSelectedIds;
    const candidates = list.map(p => ({
      ...p,
      isSelected: selectedIds.includes(p.id)
    }));

    const selectedList = candidates.filter(p => p.isSelected);

    this.setData({
      personPickerCandidates: candidates,
      personPickerSelectedList: selectedList
    });
  },

  onPersonToggle(e) {
    const hrId = e.currentTarget.dataset.hrId;
    let sel = [...this.data.personPickerSelectedIds];
    const idx = sel.indexOf(hrId);
    if (idx >= 0) sel.splice(idx, 1); else sel.push(hrId);
    this.setData({ personPickerSelectedIds: sel });
    this.applyPersonPickerFilters();
  },

  onPersonPickerActionTypeChange(e) {
    this.setData({ personPickerStepActionType: ['pass', 'sign', 'estamp', 'both'][e.detail.value] || 'pass' });
  },

  confirmPersonPicker() {
    // If we're in template step override mode, delegate
    if (this.data.templateOverrideStepIndex >= 0) {
      this.confirmTemplateStepPersonPicker();
      return;
    }

    // If we're in next-step designation mode, save to designatedNextPersons
    if (this.data.personPickerMode === 'designateNext') {
      var designatedList = this.data.personPickerSelectedList;
      this.setData({
        designatedNextPersons: designatedList.map(function(p) { return { id: p.id, name: p.name }; }),
        personPickerVisible: false,
        personPickerMode: ''
      });
      return;
    }

    const selected = this.data.personPickerSelectedList;
    if (!selected.length) {
      showShortToast('请至少选择一个人');
      return;
    }

    const steps = [...this.data.adHocSteps];
    const actionType = this.data.personPickerStepActionType;
    for (const p of selected) {
      steps.push({
        approverType: 'specific_person',
        approverHrId: p.id,
        approverHrName: p.name,
        approverIdentityId: '',
        approverIdentityName: '',
        actionType
      });
    }

    this.setData({
      adHocSteps: steps,
      personPickerVisible: false
    });
  },

  // ── Confirm single identity step ──

  confirmAdHocStep() {
    const sf = this.data.adHocStepForm;
    const identities = this.data.allIdentities;
    const departments = this.data.allDepartments;
    const workGroups = this.data.allWorkGroups;

    // Resolve identity from picker
    const identIdx = this.data.identityPickerIdentIndex;
    const identOpts = this.data.identityPickerIdentOptions;

    if (identIdx <= 0) {
      showShortToast('请选择身份');
      return;
    }

    const identName = identOpts[identIdx];
    const identity = identities.find(i => i.name === identName);
    if (!identity) {
      showShortToast('身份数据异常，请重试');
      return;
    }

    // Resolve scope
    const scopeIdx = this.data.identityPickerScopeIndex;
    const scopeValues = this.data.identityPickerScopeValues;
    const scopeType = scopeValues[scopeIdx] || 'all';

    let scopeDepartmentId = '';
    let scopeDepartmentName = '';
    let scopeWorkGroupId = '';
    let scopeWorkGroupName = '';

    if (scopeType === 'specific_department' || scopeType === 'specific_work_group') {
      const deptIdx = this.data.identityPickerDeptIndex;
      const deptOpts = this.data.identityPickerDeptOptions;
      if (deptIdx <= 0) {
        showShortToast('请选择部门');
        return;
      }
      const deptName = deptOpts[deptIdx];
      const dept = departments.find(d => d.name === deptName);
      if (!dept) { showShortToast('部门数据异常'); return; }
      scopeDepartmentId = dept.id;
      scopeDepartmentName = dept.name;
    }

    if (scopeType === 'specific_work_group') {
      const wgIdx = this.data.identityPickerWgIndex;
      const wgOpts = this.data.identityPickerWgOptions;
      if (wgIdx <= 0) {
        showShortToast('请选择职能组');
        return;
      }
      const wgName = wgOpts[wgIdx];
      const wg = workGroups.find(w => w.name === wgName);
      if (!wg) { showShortToast('职能组数据异常'); return; }
      scopeWorkGroupId = wg.id;
      scopeWorkGroupName = wg.name;
    }

    const steps = [...this.data.adHocSteps];
    steps.push({
      approverType: 'identity',
      approverIdentityId: identity.id,
      approverIdentityName: identity.name,
      approverHrId: '',
      approverHrName: '',
      actionType: sf.actionType,
      scopeType: scopeType,
      scopeDepartmentId: scopeDepartmentId,
      scopeDepartmentName: scopeDepartmentName,
      scopeWorkGroupId: scopeWorkGroupId,
      scopeWorkGroupName: scopeWorkGroupName
    });

    this.setData({
      adHocSteps: steps,
      adHocStepForm: { approverType: 'identity', approverIdentityId: '', approverIdentityName: '', approverHrId: '', approverHrName: '', actionType: 'pass', scopeType: 'all', scopeDepartmentId: '', scopeDepartmentName: '', scopeWorkGroupId: '', scopeWorkGroupName: '' },
      adHocStepEditorVisible: false,
      identityPickerScopeIndex: 0,
      identityPickerDeptIndex: 0,
      identityPickerWgIndex: 0,
      identityPickerIdentIndex: 0
    });
  },

  removeAdHocStep(e) {
    const idx = e.currentTarget.dataset.index;
    const steps = [...this.data.adHocSteps];
    steps.splice(idx, 1);
    this.setData({ adHocSteps: steps });
  },

  // ── Helpers for step display ──

  getApproverLabel(step) {
    if (step.approverType === 'specific_person' && step.approverHrName) {
      return step.approverHrName;
    }
    if (step.approverIdentityName) {
      return step.approverIdentityName;
    }
    if (step.approverIdentityId) {
      const ident = this.data.allIdentities.find(i => i.id === step.approverIdentityId);
      return ident ? ident.name : step.approverIdentityId;
    }
    if (step.approverHrId) {
      const hr = this.data.allHrPersons.find(p => p.id === step.approverHrId);
      return hr ? hr.name : step.approverHrId;
    }
    return '未指定';
  },

  getActionLabel(actionType) {
    if (actionType === 'pass') return '仅通过';
    if (actionType === 'sign') return '签字';
    if (actionType === 'estamp') return '盖章';
    if (actionType === 'both') return '签字+盖章';
    return actionType || '仅通过';
  },

  getScopeLabel(scopeType, scopeDepartmentName, scopeWorkGroupName) {
    if (scopeType === 'same_department') return '同部门';
    if (scopeType === 'same_work_group') return '同职能组';
    if (scopeType === 'specific_department' && scopeDepartmentName) return scopeDepartmentName;
    if (scopeType === 'specific_work_group' && scopeWorkGroupName) return (scopeDepartmentName || '') + ' · ' + scopeWorkGroupName;
    return '全体';
  },

  inferAuditFileMime(fileName, base64) {
    var head = String(base64 || '').slice(0, 16);
    if (head.indexOf('iVBOR') === 0) return 'image/png';
    if (head.indexOf('/9j') === 0) return 'image/jpeg';
    if (head.indexOf('UklGR') === 0) return 'image/webp';
    if (head.indexOf('JVBER') === 0) return 'application/pdf';

    var lowerName = String(fileName || '').toLowerCase();
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.pdf')) return 'application/pdf';
    return '';
  },

  validateAuditUploadFile(fileName, fileSize, base64) {
    var mimeType = this.inferAuditFileMime(fileName, base64);
    if (!mimeType || AUDIT_ALLOWED_MIMES.indexOf(mimeType) < 0) {
      return { ok: false, message: '仅支持 PNG/JPG/WEBP 图片或 PDF 文件' };
    }
    if ((fileSize || 0) > AUDIT_MAX_FILE_SIZE) {
      return { ok: false, message: '文件过大，最大支持 10MB' };
    }
    if (String(base64 || '').length > Math.ceil(AUDIT_MAX_FILE_SIZE * 4 / 3) + 1024) {
      return { ok: false, message: '文件过大，最大支持 10MB' };
    }
    return { ok: true, mimeType: mimeType };
  },

  // File upload
  chooseFile() {
    const that = this;
    wx.chooseMessageFile({
      count: 3,
      type: 'file',
      success(res) {
        that.uploadFiles(res.tempFiles);
      }
    });
  },

  chooseImage() {
    const that = this;
    wx.chooseImage({
      count: 3,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFiles = res.tempFilePaths.map((p, i) => ({
          path: p,
          name: `image_${Date.now()}_${i}.jpg`,
          size: res.tempFiles ? (res.tempFiles[i] ? res.tempFiles[i].size : 0) : 0
        }));
        that.uploadFiles(tempFiles);
      }
    });
  },

  async uploadFiles(tempFiles) {
    if (!tempFiles || !tempFiles.length) return;
    this.setData({ uploading: true });
    const that = this;
    const uploaded = [...this.data.uploadedFiles];
    let errorCount = 0;
    let firstError = '';

    // Use async readFile per file, handled sequentially
    for (let i = 0; i < tempFiles.length; i++) {
      const tf = tempFiles[i];
      try {
        const base64 = await new Promise(function(resolve, reject) {
          wx.getFileSystemManager().readFile({
            filePath: tf.path,
            encoding: 'base64',
            success: function(r) { resolve(r.data); },
            fail: function(err) { reject(err); }
          });
        });
        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const validation = this.validateAuditUploadFile(tf.name, tf.size || 0, base64);
        if (!validation.ok) {
          throw new Error((tf.name || '文件') + ': ' + validation.message);
        }
        uploaded.push({
          fileId: fileId,
          fileName: tf.name || 'unknown',
          mimeType: validation.mimeType,
          fileSize: tf.size || 0,
          fileHash: '',
          tmpPath: tf.path,
          base64: base64
        });
      } catch (e) {
        errorCount++;
        if (!firstError) firstError = getErrorText(e, '文件读取失败');
        console.error('文件读取失败:', tf.name, e);
      }
    }

    if (uploaded.length > this.data.uploadedFiles.length) {
      this.setData({ uploadedFiles: uploaded });
    } else if (errorCount > 0) {
      showShortToast(firstError || '文件读取失败，请重试');
    }
    this.setData({ uploading: false });
  },

  removeUploadedFile(e) {
    const idx = e.currentTarget.dataset.index;
    const uploaded = [...this.data.uploadedFiles];
    uploaded.splice(idx, 1);
    this.setData({ uploadedFiles: uploaded });
  },

  async submitAudit() {
    const { createMode, selectedTemplateId, createTitle, uploadedFiles, adHocSteps, resubmitMode } = this.data;

    if (!createTitle) { showShortToast('请输入标题'); return; }
    if (!uploadedFiles.length) { showShortToast('请上传至少一份文件'); return; }

    this.setData({ loading: true });
    const serverFiles = [];
    try {
      for (const uf of uploadedFiles) {
        const uploadRes = await callFunction({
          name: 'uploadAuditFile',
          data: {
            fileBase64: uf.base64,
            fileName: uf.fileName,
            mimeType: uf.mimeType
          }
        });
        if (uploadRes.status === 'success') {
          serverFiles.push({
            fileId: uploadRes.fileId,
            fileName: uploadRes.fileName,
            mimeType: uploadRes.mimeType,
            fileSize: uploadRes.fileSize,
            fileHash: uploadRes.fileHash,
            tmpPath: uploadRes.tmpPath,
            fileToken: uploadRes.fileToken
          });
        } else {
          throw new Error(uploadRes.message || '文件上传失败');
        }
      }
    } catch (e) {
      this.setData({ loading: false });
      showShortToast(getErrorText(e, '文件上传失败'));
      return;
    }

    try {
      let res;
      if (createMode === 'template') {
        if (!selectedTemplateId) { showShortToast('请选择审核流模板'); this.setData({ loading: false }); return; }
        // Collect step overrides from template step preview
        var stepOverrides = (this.data.templateStepOverrides || [])
          .filter(function(o) { return o.mode === 'specific' && o.personHrIds && o.personHrIds.length; })
          .map(function(o) { return { stepIndex: o.stepIndex, personHrIds: o.personHrIds }; });
        res = await callFunction({
          name: 'startAuditSubmission',
          data: { templateId: selectedTemplateId, title: createTitle, description: this.data.createDesc, files: serverFiles, stepOverrides: stepOverrides }
        });
      } else {
        if (!adHocSteps.length) { showShortToast('请添加审批步骤'); this.setData({ loading: false }); return; }
        // Strip display-only fields before sending
        const cleanSteps = adHocSteps.map(s => ({
          approverType: s.approverType,
          approverIdentityId: s.approverIdentityId || '',
          approverHrId: s.approverHrId || '',
          actionType: s.actionType || 'pass',
          scopeType: s.scopeType || 'all',
          scopeDepartmentId: s.scopeDepartmentId || '',
          scopeWorkGroupId: s.scopeWorkGroupId || ''
        }));
        res = await callFunction({
          name: 'startAdHocAudit',
          data: { title: createTitle, description: this.data.createDesc, resubmitMode, steps: cleanSteps, files: serverFiles }
        });
      }

      if (res.status === 'success') {
        showShortToast('提交成功');
        wx.redirectTo({ url: `/subpackages/audit/pages/submissionDetail/submissionDetail?id=${res.id}` });
      } else {
        showShortToast(res.message || '提交失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '提交失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // ═══════════════════════════════════════════════
  // View Detail
  // ═══════════════════════════════════════════════

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'getSubmissionDetail',
        data: { submissionId: this.data.submissionId }
      });
      if (res.status === 'success') {
        const submissionStatus = res.submission.status;
        const currentStepIndex = res.submission.currentStepIndex || 0;

        // Build flow timeline from server events + steps
        var serverEvents = res.events || [];
        var rawSteps = res.steps || [];
        var flowTimeline = [];

        console.log('[audit:loadDetail] submissionId=' + this.data.submissionId +
          ' rawSteps.length=' + rawSteps.length +
          ' serverEvents.length=' + serverEvents.length +
          ' diag=' + JSON.stringify(res._diag || {}));
        // Debug: log sortOrder of first few steps
        for (var dsi = 0; dsi < Math.min(rawSteps.length, 4); dsi++) {
          console.log('[audit:loadDetail] rawStep[' + dsi + '] sortOrder=' + rawSteps[dsi].sortOrder +
            ' sort_order=' + rawSteps[dsi].sort_order +
            ' round=' + rawSteps[dsi].round +
            ' status=' + rawSteps[dsi].status +
            ' id=' + rawSteps[dsi].id);
        }

        // 1. Build lifecycle nodes from ALL server events — no filtering
        //    Every event (submit/withdraw/resubmit/approve/reject/edit) is part of the audit trail
        var lifecycleEvents = serverEvents;

        // Build a lookup map: key = round_stepIndex_eventType → operatorName
        // Used to resolve the ACTUAL operator (not the designated approver) for step nodes
        var eventOperatorMap = {};
        for (var eomi = 0; eomi < lifecycleEvents.length; eomi++) {
          var eo = lifecycleEvents[eomi];
          if ((eo.eventType === 'approve' || eo.eventType === 'reject') && eo.stepIndex != null) {
            var eoKey = (eo.round || 1) + '_' + eo.stepIndex + '_' + eo.eventType;
            eventOperatorMap[eoKey] = {
              operatorName: eo.operatorName || '',
              comment: eo.comment || '',
              time: formatAuditTime(eo.createdAt)
            };
          }
        }

        // 2. Group steps by round
        var rounds = {};
        for (var si = 0; si < rawSteps.length; si++) {
          var s = rawSteps[si];
          var r = s.round || 1;
          if (!rounds[r]) rounds[r] = [];
          rounds[r].push(s);
        }
        var roundKeys = Object.keys(rounds).sort(function(a, b) { return Number(a) - Number(b); });

        // 3. Find the first submit event (round 1)
        var initialSubmit = null;
        var usedEventIdx = 0;
        for (var ei2 = 0; ei2 < lifecycleEvents.length; ei2++) {
          if (lifecycleEvents[ei2].eventType === 'submit' && lifecycleEvents[ei2].round === 1) {
            initialSubmit = lifecycleEvents[ei2];
            usedEventIdx = ei2 + 1;
            break;
          }
        }

        // Only show submit if there IS a submit event (not for drafts with no events)
        if (initialSubmit) {
          flowTimeline.push({
            _key: 'lifecycle_submit',
            type: 'lifecycle',
            event: 'submit',
            label: '提交审核',
            time: formatAuditTime(initialSubmit.createdAt),
            icon: '📤',
            operatorName: initialSubmit.operatorName || '',
            comment: ''
          });
        }

        // 4. For each round, show steps with lifecycle events between
        var nextEventIdx = usedEventIdx;

        for (var ri = 0; ri < roundKeys.length; ri++) {
          var round = Number(roundKeys[ri]);
          var roundSteps = rounds[round].sort(function(a, b) { return a.sortOrder - b.sortOrder; });

          // If round > 1, show ALL lifecycle events between previous round and this round's resubmit
          if (round > 1) {
            // Find the resubmit event index for this round
            var resubmitEvtIdx = -1;
            for (var ei3 = nextEventIdx; ei3 < lifecycleEvents.length; ei3++) {
              if (lifecycleEvents[ei3].eventType === 'resubmit' && lifecycleEvents[ei3].round === round) {
                resubmitEvtIdx = ei3;
                break;
              }
            }

            // Show ALL events BEFORE the resubmit (e.g., withdraw, edit)
            // that happened between the previous round and this resubmit
            var untilIdx = resubmitEvtIdx >= 0 ? resubmitEvtIdx : lifecycleEvents.length;
            for (var eiPre = nextEventIdx; eiPre < untilIdx; eiPre++) {
              var interEvt = lifecycleEvents[eiPre];
              var interIconMap = { withdraw: '↩️', resubmit: '🔄', submit: '📤', edit: '✏️', approve: '✅', reject: '❌' };
              var interLabelMap = { withdraw: '撤回审核', resubmit: '重新提交', submit: '提交审核', edit: '编辑审核', approve: '审批通过', reject: '审批驳回' };
              var interStepLabel = '';
              if ((interEvt.eventType === 'approve' || interEvt.eventType === 'reject') && interEvt.stepIndex) {
                interStepLabel = '第' + interEvt.stepIndex + '步';
              }
              flowTimeline.push({
                _key: 'lifecycle_inter_' + interEvt.id,
                type: 'lifecycle',
                event: interEvt.eventType,
                label: interLabelMap[interEvt.eventType] || interEvt.eventType,
                subLabel: (interEvt.round > 1 ? '第' + interEvt.round + '轮 ' : '') + interStepLabel,
                time: formatAuditTime(interEvt.createdAt),
                icon: interIconMap[interEvt.eventType] || '📌',
                comment: interEvt.comment || '',
                operatorName: interEvt.operatorName || ''
              });
            }

            if (resubmitEvtIdx >= 0) {
              var resubmitEvt = lifecycleEvents[resubmitEvtIdx];
              flowTimeline.push({
                _key: 'lifecycle_resubmit_r' + round,
                type: 'lifecycle',
                event: 'resubmit',
                label: '重新提交',
                subLabel: '第' + round + '轮',
                time: formatAuditTime(resubmitEvt.createdAt),
                icon: '🔄',
                operatorName: resubmitEvt.operatorName || '',
                comment: ''
              });
              nextEventIdx = resubmitEvtIdx + 1;
            } else {
              // Fallback: still show round marker even if no event
              flowTimeline.push({
                _key: 'lifecycle_resubmit_r' + round,
                type: 'lifecycle',
                event: 'resubmit',
                label: '重新提交',
                subLabel: '第' + round + '轮',
                icon: '🔄',
                operatorName: '',
                comment: ''
              });
              nextEventIdx = lifecycleEvents.length;
            }
          }

          var hasProcessedSteps = false;
          var hasFutureSteps = false;

          // Determine the max round for hiding stale pending steps
          var maxRoundForSteps = Math.max.apply(null, roundKeys.map(function(k) { return Number(k); }));

          for (var si2 = 0; si2 < roundSteps.length; si2++) {
            var step = roundSteps[si2];
            var flowNodeClass, flowDotClass, flowIcon, flowStatusLabel, flowTagClass;

            // For non-last rounds, skip pending steps that were never reached
            // (they belong to a completed/abandoned round and would show as confusing "○ 未到达")
            if (round < maxRoundForSteps && step.status === 'pending') {
              // Only skip if the step was beyond what was processed in that round
              // Keep rejected/approved steps from old rounds
              continue;
            }

            var approverDesc = step.approverDesc || '';
            var conditionsDisplay = step.stepConditionsDisplay || [];

            // If the server approverDesc is empty or looks incomplete (no actual names),
            // try to build a better description from individual fields or conditions display
            if (!approverDesc || approverDesc.indexOf('未指定') >= 0) {
              // Try conditions display first (multi-condition, more detailed)
              if (conditionsDisplay.length) {
                approverDesc = conditionsDisplay.join(' 或 ');
              }
              // If still empty, fall back to individual fields
              if (!approverDesc || approverDesc.indexOf('未指定') >= 0) {
                if (step.approverType === 'specific_person' || (step.approverName && step.approverName !== '未指定')) {
                  approverDesc = '由 ' + (step.approverName || '未指定') + ' 审批';
                } else {
                  var identName = step.approverIdentityName || '未指定身份';
                  var scopeType = step.scopeType || 'all';
                  if (scopeType === 'all' || !scopeType) {
                    approverDesc = '由 全体 ' + identName + ' 审批';
                  } else if (scopeType === 'same_department') {
                    approverDesc = '由 同部门 ' + identName + ' 审批';
                  } else if (scopeType === 'same_work_group') {
                    approverDesc = '由 同职能组 ' + identName + ' 审批';
                  } else if (scopeType === 'specific_department') {
                    var deptName = step.scopeDepartmentName || step.scopeDepartmentId || '指定部门';
                    approverDesc = '由 ' + deptName + ' ' + identName + ' 审批';
                  } else if (scopeType === 'specific_work_group') {
                    var deptName2 = step.scopeDepartmentName || '';
                    var wgName = step.scopeWorkGroupName || '';
                    var location = [deptName2, wgName].filter(Boolean).join('·') || '指定职能组';
                    approverDesc = '由 ' + location + ' ' + identName + ' 审批';
                  } else {
                    approverDesc = '由 ' + identName + ' 审批';
                  }
                }
              }
            }

            var actionMap = { pass: '仅通过', sign: '签字', estamp: '盖章', both: '签字+盖章' };
            var actionLabel = actionMap[step.actionType] || step.actionType || '仅通过';

            if (step.status === 'rejected') {
              flowNodeClass = 'flow-node-rejected';
              flowDotClass = 'flow-dot-rejected';
              flowIcon = 'cross';
              flowStatusLabel = '✗ 已驳回';
              flowTagClass = 'flow-tag-rejected';
            } else if (submissionStatus === 'approved') {
              flowNodeClass = 'flow-node-done';
              flowDotClass = 'flow-dot-done';
              flowIcon = 'check';
              flowStatusLabel = '✓ 已通过';
              flowTagClass = 'flow-tag-done';
            } else if (submissionStatus === 'pending' || submissionStatus === 'draft') {
              flowNodeClass = 'flow-node-pending';
              flowDotClass = 'flow-dot-pending';
              flowIcon = 'number';
              flowStatusLabel = '○ 未开始';
              flowTagClass = 'flow-tag-pending';
            } else if (step.status === 'approved') {
              flowNodeClass = 'flow-node-done';
              flowDotClass = 'flow-dot-done';
              flowIcon = 'check';
              flowStatusLabel = '✓ 已通过';
              flowTagClass = 'flow-tag-done';
            } else if (step.sortOrder === currentStepIndex && step.status === 'pending' && submissionStatus === 'in_progress') {
              flowNodeClass = 'flow-node-active';
              flowDotClass = 'flow-dot-active';
              flowIcon = 'number';
              flowStatusLabel = '● 待处理';
              flowTagClass = 'flow-tag-active';
            } else if (step.sortOrder < currentStepIndex) {
              flowNodeClass = 'flow-node-done';
              flowDotClass = 'flow-dot-done';
              flowIcon = 'check';
              flowStatusLabel = '✓ 已通过';
              flowTagClass = 'flow-tag-done';
            } else {
              flowNodeClass = 'flow-node-pending';
              flowDotClass = 'flow-dot-pending';
              flowIcon = 'number';
              flowStatusLabel = '○ 未到达';
              flowTagClass = 'flow-tag-pending';
              hasFutureSteps = true;
            }

            if (step.status === 'approved' || step.status === 'rejected' ||
                (step.sortOrder === currentStepIndex && step.status === 'pending' && submissionStatus === 'in_progress')) {
              hasProcessedSteps = true;
            }

            // Look up the ACTUAL operator from the audit event (not the designated approver)
            var eventKey = (step.round || 1) + '_' + step.sortOrder + '_' + (step.status === 'approved' ? 'approve' : 'reject');
            var eventInfo = eventOperatorMap[eventKey] || {};
            var actualOperatorName = eventInfo.operatorName || '';
            var actualComment = eventInfo.comment || step.comment || '';
            var actualProcessedAt = eventInfo.time || (step.processedAt ? formatAuditTime(step.processedAt) : '');

            flowTimeline.push({
              _key: 'step_' + step.id,
              type: 'step',
              id: step.id,
              sortOrder: step.sortOrder || (si2 + 1),
              approverType: step.approverType,
              approverHrId: step.approverHrId,
              approverName: step.approverName,
              operatorName: actualOperatorName || step.approverName,
              approverIdentityId: step.approverIdentityId,
              approverIdentityName: step.approverIdentityName,
              scopeType: step.scopeType,
              scopeDepartmentId: step.scopeDepartmentId,
              scopeDepartmentName: step.scopeDepartmentName,
              scopeWorkGroupId: step.scopeWorkGroupId,
              scopeWorkGroupName: step.scopeWorkGroupName,
              actionType: step.actionType,
              status: step.status,
              comment: actualComment,
              rejectionReason: step.status === 'rejected' ? (eventInfo.comment || step.rejectionReason || '') : step.rejectionReason,
              round: step.round,
              processedAt: actualProcessedAt,
              flowNodeClass: flowNodeClass,
              flowDotClass: flowDotClass,
              flowIcon: flowIcon,
              flowStatusLabel: flowStatusLabel,
              flowTagClass: flowTagClass,
              approverDesc: approverDesc,
              actionLabel: actionLabel,
              conditionsDisplay: conditionsDisplay
            });
          }

          // Inject separator — only for the LAST round
          var maxRound = Math.max.apply(null, roundKeys.map(function(k) { return Number(k); }));
          if (hasProcessedSteps && hasFutureSteps && round === maxRound) {
            var remainingCount = roundSteps.filter(function(rs) {
              return rs.status === 'pending' && rs.sortOrder > currentStepIndex;
            }).length;
            if (remainingCount > 0) {
              var insertIdx = -1;
              for (var fi = 0; fi < flowTimeline.length; fi++) {
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

        // 5. Remaining lifecycle events after last round — show ALL event types
        var lateIconMap = { withdraw: '↩️', resubmit: '🔄', submit: '📤', edit: '✏️', approve: '✅', reject: '❌' };
        var lateLabelMap = { withdraw: '撤回审核', resubmit: '重新提交', submit: '提交审核', edit: '编辑审核', approve: '审批通过', reject: '审批驳回' };
        for (var ei4 = nextEventIdx; ei4 < lifecycleEvents.length; ei4++) {
          var lateEvt = lifecycleEvents[ei4];
          flowTimeline.push({
            _key: 'lifecycle_late_' + lateEvt.id,
            type: 'lifecycle',
            event: lateEvt.eventType,
            label: lateLabelMap[lateEvt.eventType] || lateEvt.eventType,
            subLabel: lateEvt.round > 1 ? '第' + lateEvt.round + '轮' : '',
            time: formatAuditTime(lateEvt.createdAt),
            icon: lateIconMap[lateEvt.eventType] || '📌',
            operatorName: lateEvt.operatorName || '',
            comment: lateEvt.comment || ''
          });
        }


        // ── Store diagnostic data for debugging ──
        var diagInfo = res._diag || {};
        console.log('[audit:loadDetail] DIAG: stepCount=' + diagInfo.stepCount +
          ' submissionStatus=' + diagInfo.submissionStatus +
          ' currentStepIndex=' + diagInfo.currentStepIndex);

        // ── Compute flow progress ──
        // Use unique sortOrders (steps per round), not total row count across all rounds
        var sortOrderSet = new Set();
        for (var spi = 0; spi < rawSteps.length; spi++) {
          sortOrderSet.add(rawSteps[spi].sortOrder);
        }
        var stepsPerRound = sortOrderSet.size || 1;
        // Count approved steps from the latest round only
        var maxRound = 0;
        for (var sri = 0; sri < rawSteps.length; sri++) {
          maxRound = Math.max(maxRound, rawSteps[sri].round || 1);
        }
        var currentRoundApproved = 0;
        for (var sri2 = 0; sri2 < rawSteps.length; sri2++) {
          if ((rawSteps[sri2].round || 1) === maxRound && rawSteps[sri2].status === 'approved') {
            currentRoundApproved++;
          }
        }
        let flowProgressPercent, flowProgressText;

        if (submissionStatus === 'approved') {
          flowProgressPercent = 100;
          flowProgressText = '全部完成（共' + stepsPerRound + '步）';
        } else if (submissionStatus === 'rejected') {
          const rejectedStep = rawSteps.find(s => s.status === 'rejected');
          flowProgressPercent = Math.round((currentRoundApproved / stepsPerRound) * 100);
          flowProgressText = rejectedStep ? '第' + rejectedStep.sortOrder + '/' + stepsPerRound + '步被驳回' : '已驳回';
        } else if (submissionStatus === 'pending') {
          flowProgressPercent = 0;
          flowProgressText = '待提交（共' + stepsPerRound + '步）';
        } else if (submissionStatus === 'withdrawn') {
          flowProgressPercent = Math.round((currentRoundApproved / stepsPerRound) * 100);
          flowProgressText = '已撤回（共' + stepsPerRound + '步）';
        } else {
          // in_progress
          flowProgressPercent = Math.round((currentRoundApproved / stepsPerRound) * 100);
          flowProgressText = '第' + currentStepIndex + '/' + stepsPerRound + '步待处理';
        }

        // Debug: log step nodes in flowTimeline
        console.log('[audit:loadDetail] flowTimeline built, total nodes=' + flowTimeline.length);
        for (var fti = 0; fti < flowTimeline.length; fti++) {
          var ftn = flowTimeline[fti];
          if (ftn.type === 'step') {
            console.log('[audit:loadDetail] flowTimeline[' + fti + '] step sortOrder=' + ftn.sortOrder +
              ' flowNodeClass=' + ftn.flowNodeClass +
              ' id=' + ftn.id +
              ' round=' + ftn.round);
          }
        }

        // Detect active step for inline approval UI
        var activeApprovalStep = null;
        var nextStepInfo = null;
        for (var fi = 0; fi < flowTimeline.length; fi++) {
          if (flowTimeline[fi].type === 'step') {
            if (flowTimeline[fi].flowNodeClass === 'flow-node-active') {
              activeApprovalStep = flowTimeline[fi];
            }
            // The first future step right after the active one is the "next step"
            if (!nextStepInfo && activeApprovalStep && flowTimeline[fi].sortOrder === (activeApprovalStep.sortOrder + 1)) {
              nextStepInfo = {
                sortOrder: flowTimeline[fi].sortOrder,
                approverDesc: flowTimeline[fi].approverDesc
              };
            }
          }
        }

        // Fallback: if active step not found via flowTimeline, find it from rawSteps
        // (handles edge cases where the flowTimeline filtering skips the active step)
        var computedActiveStepId = activeApprovalStep ? activeApprovalStep.id : '';
        if (!activeApprovalStep && rawSteps.length > 0 && submissionStatus === 'in_progress') {
          var actionMap2 = { pass: '仅通过', sign: '签字', estamp: '盖章', both: '签字+盖章' };
          // Find max round first
          var maxRound2 = 0;
          for (var si3 = 0; si3 < rawSteps.length; si3++) {
            maxRound2 = Math.max(maxRound2, rawSteps[si3].round || 1);
          }
          // Find pending step matching currentStepIndex from latest round
          for (var si4 = 0; si4 < rawSteps.length; si4++) {
            var rawStep = rawSteps[si4];
            if ((rawStep.round || 1) === maxRound2 &&
                rawStep.sortOrder === currentStepIndex &&
                rawStep.status === 'pending') {
              activeApprovalStep = {
                id: rawStep.id,
                sortOrder: rawStep.sortOrder,
                actionLabel: actionMap2[rawStep.actionType] || rawStep.actionType || '仅通过',
                approverDesc: rawStep.approverDesc || '由未指定审批人审批',
                round: rawStep.round || 1,
                conditionsDisplay: rawStep.stepConditionsDisplay || []
              };
              computedActiveStepId = rawStep.id;
              console.log('[audit:loadDetail] fallback activeStep found: id=' + rawStep.id +
                ' sortOrder=' + rawStep.sortOrder);
              break;
            }
          }
        }
        if (!computedActiveStepId && !activeApprovalStep && submissionStatus === 'in_progress') {
          console.log('[audit:loadDetail] WARNING: active step NOT found via any method!' +
            ' maxRound2=' + (typeof maxRound2 !== 'undefined' ? maxRound2 : 'N/A') +
            ' currentStepIndex=' + currentStepIndex +
            ' rawSteps.length=' + rawSteps.length);
        }

        this.setData({
          submission: res.submission,
          flowTimeline: flowTimeline,
          rawStepCount: rawSteps.length,
          steps: rawSteps,
          files: res.files || [],
          signatures: res.signatures || [],
          flowProgressPercent: flowProgressPercent,
          flowProgressText: flowProgressText,
          activeApprovalStepId: computedActiveStepId,
          activeApprovalStep: activeApprovalStep,
          designatedNextPersons: [],
          nextStepInfo: nextStepInfo,
          approvalVisible: false,
          approvalAction: '',
          approvalComment: '',
          rejectionReason: '',
          pendingSignatures: [],
          approvalWarning: '',
          // User role flags for conditional UI
          userIsSubmitter: res.userIsSubmitter || false,
          userIsApprover: res.userIsApprover || false,
          userIsAdmin: res.userIsAdmin || false,
          expandedNodeKey: ''
        });
      } else {
        showShortToast(res.message || '加载失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '加载失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // ═══════════════════════════════════════════════
  // Approval Actions
  // ═══════════════════════════════════════════════

  openApprove(e) {
    const stepId = e.currentTarget.dataset.stepId;
    this.setData({
      approvalVisible: true,
      approvalStepId: stepId,
      approvalAction: 'approve',
      approvalComment: '',
      pendingSignatures: []
    });
  },

  openReject(e) {
    const stepId = e.currentTarget.dataset.stepId;
    this.setData({
      approvalVisible: true,
      approvalStepId: stepId,
      approvalAction: 'reject',
      rejectionReason: '',
      pendingSignatures: []
    });
  },

  closeApproval() {
    this.setData({ approvalVisible: false, signaturePadVisible: false });
  },

  onApprovalCommentInput(e) {
    this.setData({ approvalComment: e.detail.value });
  },

  onRejectionReasonInput(e) {
    this.setData({ rejectionReason: e.detail.value });
  },

  // ═══════════════════════════════════════════════
  // Signature Source Picker (saved signatures + new drawing)
  // ═══════════════════════════════════════════════

  // Open signature source picker for a specific file
  addSignatureForFile(e) {
    var fileId = e.currentTarget.dataset.fileId;
    var fileName = e.currentTarget.dataset.fileName;
    this.setData({
      sigSourceFileId: fileId,
      sigSourceFileName: fileName,
      sigSourcePickerVisible: true,
      sigSaveNew: false,
      sigSaveName: ''
    });
    this.loadMySignatures();
  },

  closeSigSourcePicker() {
    this.setData({ sigSourcePickerVisible: false });
  },

  // Load user's saved signatures
  async loadMySignatures() {
    try {
      var res = await callFunction({ name: 'listMySignatures', data: {} });
      if (res.status === 'success') {
        this.setData({ mySignatures: res.signatures || [] });
      }
    } catch (e) {
      console.error('[audit] loadMySignatures failed:', e);
      this.setData({ mySignatures: [] });
    }
  },

  // User selected a saved signature template — auto-open placement
  onSelectSavedSignature(e) {
    var that = this;
    var sigImage = e.currentTarget.dataset.sigImage;
    var fileId = this.data.sigSourceFileId;
    var sigs = [...this.data.pendingSignatures];
    var newSigIdx = sigs.length;
    sigs.push({
      _idx: 'sig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      fileId: fileId,
      signatureType: 'signature',
      stampName: '',
      stampId: '',
      imageData: sigImage,
      positionX: 0.5,
      positionY: 0.3,
      page: 1
    });
    this.setData({
      pendingSignatures: sigs,
      sigSourcePickerVisible: false,
      approvalWarning: ''
    });
    this.updateApprovalWarning();

    // Auto-open placement popup for positioning
    wx.nextTick(() => {
      that._openPlacementForIdx(newSigIdx);
    });
  },

  // User wants to draw a new signature — open signature pad from picker
  onOpenNewSignaturePad() {
    var fileId = this.data.sigSourceFileId;
    this.setData({
      currentSignatureFileId: fileId,
      signaturePadVisible: true,
      sigSourcePickerVisible: false  // Close picker to avoid double-popup
    });
  },

  // Toggle save-new-signature checkbox
  onSigSaveToggle() {
    this.setData({ sigSaveNew: !this.data.sigSaveNew });
  },

  // Input for new signature name
  onSigSaveNameInput(e) {
    this.setData({ sigSaveName: e.detail.value });
  },

  // Signature drawing confirmed — auto-open placement popup
  onSignatureConfirm(e) {
    var that = this;
    var imageData = e.detail.imageData;
    var fileId = this.data.currentSignatureFileId;

    // If user wants to save this signature to library
    if (this.data.sigSaveNew) {
      var saveName = this.data.sigSaveName || ('签名 ' + new Date().toLocaleDateString());
      callFunction({
        name: 'saveSignature',
        data: { id: '', name: saveName, imageData: imageData }
      }).then(function(saveRes) {
        if (saveRes.status === 'success') {
          showShortToast('签名已保存到我的签名库');
        }
      }).catch(function() {
        // Non-critical; signature still used for this approval
      });
    }

    var newIdx = '_sig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    var sigs = [...this.data.pendingSignatures];
    var newSigIdx = sigs.length;
    sigs.push({
      _idx: newIdx,
      fileId: fileId,
      signatureType: 'signature',
      stampName: '',
      stampId: '',
      imageData: imageData,
      positionX: 0.5,
      positionY: 0.3,
      page: 1
    });
    this.setData({
      pendingSignatures: sigs,
      signaturePadVisible: false,
      sigSourcePickerVisible: false,
      sigSaveNew: false,
      sigSaveName: '',
      approvalWarning: ''
    });
    this.updateApprovalWarning();

    // Auto-open placement popup for this new signature
    wx.nextTick(() => {
      that._openPlacementForIdx(newSigIdx);
    });
  },

  // Utility: open placement popup for a pending signature at given index
  _openPlacementForIdx(idx) {
    var that = this;
    var sig = this.data.pendingSignatures[idx];
    if (!sig) return;
    var fileId = sig.fileId;
    var files = this.data.files || [];
    var file = files.find(function(f) { return f.id === fileId; });
    var fileName = file ? file.fileName : '未知文件';
    var fileMime = file ? file.mimeType : '';

    // Collect all sigs/stamps on the same file
    var fileItems = [];
    for (var i = 0; i < this.data.pendingSignatures.length; i++) {
      var s = this.data.pendingSignatures[i];
      if (s.fileId === fileId) {
        fileItems.push({
          dispIdx: i,
          imageData: s.imageData,
          previewSrc: s.previewSrc || s.imageData || '',
          positionX: s.positionX != null ? s.positionX : 0.5,
          positionY: s.positionY != null ? s.positionY : 0.3,
          page: s.page || 1,
          signatureType: s.signatureType
        });
      }
    }

    var currentPage = sig.page || 1;

    this.setData({
      placementVisible: true,
      placementType: sig.signatureType,
      placementFileName: fileName,
      placementFileId: fileId,
      placementFileMime: fileMime,
      placementItems: fileItems,
      placementActiveIdx: idx,
      placementPreviewX: sig.positionX != null ? sig.positionX : -1,
      placementPreviewY: sig.positionY != null ? sig.positionY : -1,
      placementCurrentPage: currentPage,
      placementTotalPages: 1,
      placementFileImage: '',
      placementLoading: true,
      placementPosText: sig.positionX != null ? (sig.positionX * 100).toFixed(1) + '%, ' + (sig.positionY * 100).toFixed(1) + '%' : ''
    });

    this._preparePlacementItemPreviews(fileItems).then(function(items) {
      if (that.data.placementVisible && that.data.placementFileId === fileId) {
        that.setData({ placementItems: items });
      }
    });

    this.loadFilePreview(fileId, currentPage);
  },

  _dataUrlToTempFile(dataUrl, prefix) {
    return new Promise(function(resolve, reject) {
      if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
        resolve(dataUrl || '');
        return;
      }
      var match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        resolve(dataUrl);
        return;
      }
      var mime = match[1];
      var ext = mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0 ? 'jpg'
        : mime.indexOf('png') >= 0 ? 'png'
          : mime.indexOf('webp') >= 0 ? 'webp' : 'bin';
      var filePath = wx.env.USER_DATA_PATH + '/' + prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      wx.getFileSystemManager().writeFile({
        filePath: filePath,
        data: match[2],
        encoding: 'base64',
        success: function() { resolve(filePath); },
        fail: reject
      });
    });
  },

  async _preparePlacementItemPreviews(items) {
    var result = [];
    for (var i = 0; i < items.length; i++) {
      var item = Object.assign({}, items[i]);
      if ((!item.previewSrc || item.previewSrc.indexOf('data:') === 0) && item.imageData) {
        try {
          item.previewSrc = await this._dataUrlToTempFile(item.imageData, 'audit_sign_preview');
        } catch (e) {
          console.error('[audit] prepare signature preview failed:', e);
          item.previewSrc = item.imageData;
        }
      }
      result.push(item);
    }
    return result;
  },

  // Legacy: open signature pad directly (used in old approval dialog)
  openSignaturePad(e) {
    const fileId = e.currentTarget.dataset.fileId;
    this.setData({
      signaturePadVisible: true,
      currentSignatureFileId: fileId
    });
  },

  closeSignaturePad() {
    this.setData({ signaturePadVisible: false });
  },

  removePendingSignature(e) {
    const idx = e.currentTarget.dataset.index;
    const sigs = [...this.data.pendingSignatures];
    sigs.splice(idx, 1);
    this.setData({ pendingSignatures: sigs });
  },

  async confirmApproval() {
    const { approvalAction, approvalStepId, approvalComment, rejectionReason, pendingSignatures, submissionId } = this.data;

    if (approvalAction === 'reject' && !rejectionReason) {
      showShortToast('请填写驳回理由');
      return;
    }

    this.setData({ loading: true });
    try {
      let res;
      if (approvalAction === 'approve') {
        res = await callFunction({
          name: 'approveStep',
          data: { submissionId, stepId: approvalStepId, comment: approvalComment, signatures: pendingSignatures }
        });
      } else {
        res = await callFunction({
          name: 'rejectStep',
          data: { submissionId, stepId: approvalStepId, rejectionReason }
        });
      }

      if (res.status === 'success') {
        showShortToast(res.message || '操作成功');
        this.closeApproval();
        this.loadDetail();
      } else {
        showShortToast(res.message || '操作失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '操作失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // ── Next-step person designation ──

  openDesignateNextPersonPicker() {
    // Pre-populate with current designation
    var preIds = (this.data.designatedNextPersons || []).map(function(p) { return p.id; });
    var preList = this.data.allHrPersons.filter(function(p) {
      return preIds.indexOf(p.id) >= 0;
    });
    this.setData({
      personPickerVisible: true,
      personPickerDept: '全部',
      personPickerIdent: '全部',
      personPickerWg: '全部',
      personPickerKeyword: '',
      personPickerSelectedIds: preIds,
      personPickerSelectedList: preList,
      personPickerStepActionType: 'pass',
      personPickerMode: 'designateNext'  // signals confirmPersonPicker to save to designatedNextPersons
    });
    this.applyPersonPickerFilters();
  },

  removeDesignatedNextPerson(e) {
    var hrId = e.currentTarget.dataset.hrId;
    var list = (this.data.designatedNextPersons || []).filter(function(p) { return p.id !== hrId; });
    this.setData({ designatedNextPersons: list });
  },

  // ═══════════════════════════════════════════════
  // Signature & Stamp Actions
  // ═══════════════════════════════════════════════

  // Open stamp picker for a specific file
  addStampForFile(e) {
    var fileId = e.currentTarget.dataset.fileId;
    var fileName = e.currentTarget.dataset.fileName;
    this.setData({
      stampPickFileId: fileId,
      stampPickFileName: fileName,
      stampPickerVisible: true
    });
    this.loadAvailableStamps();
  },

  // Load stamps available to the current user
  async loadAvailableStamps() {
    try {
      var res = await callFunction({ name: 'listMyStamps', data: {} });
      if (res.status === 'success') {
        this.setData({ availableStamps: res.stamps || [] });
      }
    } catch (e) {
      console.error('[audit] loadAvailableStamps failed:', e);
    }
  },

  closeStampPicker() {
    this.setData({ stampPickerVisible: false });
  },

  // User selected a stamp from the picker
  onStampSelect(e) {
    var that = this;
    var stampId = e.currentTarget.dataset.stampId;
    var stampName = e.currentTarget.dataset.stampName;
    var stampImage = e.currentTarget.dataset.stampImage;
    var fileId = this.data.stampPickFileId;
    var sigs = [...this.data.pendingSignatures];
    var newSigIdx = sigs.length;
    sigs.push({
      _idx: 'stamp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      fileId: fileId,
      signatureType: 'stamp',
      stampName: stampName,
      stampId: stampId,
      imageData: stampImage,
      positionX: 0.5,
      positionY: 0.3,
      page: 1
    });
    this.setData({
      pendingSignatures: sigs,
      stampPickerVisible: false,
      approvalWarning: ''
    });
    this.updateApprovalWarning();

    // Auto-open placement popup
    wx.nextTick(() => {
      that._openPlacementForIdx(newSigIdx);
    });
  },

  // Remove a pending signature/stamp
  removePendingSign(e) {
    var idx = parseInt(e.currentTarget.dataset.sigIdx);
    var sigs = [...this.data.pendingSignatures];
    if (idx >= 0 && idx < sigs.length) {
      sigs.splice(idx, 1);
    }
    this.setData({ pendingSignatures: sigs, approvalWarning: '' });
    this.updateApprovalWarning();
  },

  // Open placement popup (called from "调整位置" button on pending signatures)
  openPlacement(e) {
    var idx = parseInt(e.currentTarget.dataset.sigIdx);
    this._openPlacementForIdx(idx);
  },

  // Load file preview (image or PDF page) from server
  async loadFilePreview(fileId, page) {
    var that = this;
    try {
      var res = await callFunction({
        name: 'getAuditFilePreview',
        data: { fileId: fileId, page: page || 1 }
      });
      if (res.status === 'success') {
        var updateData = {
          placementTotalPages: res.totalPages || 1,
          placementCurrentPage: res.page || 1,
          placementFileMime: res.mimeType || that.data.placementFileMime,
          placementLoading: false
        };
        if (res.data) {
          var previewDataUrl = 'data:' + (res.previewMime || 'image/png') + ';base64,' + res.data;
          try {
            updateData.placementFileImage = await that._dataUrlToTempFile(previewDataUrl, 'audit_file_preview');
          } catch (writeErr) {
            console.error('[audit] write preview temp file failed:', writeErr);
            updateData.placementFileImage = previewDataUrl;
          }
        } else if (res.fallback) {
          // No preview available — show placeholder
          updateData.placementFileImage = '';
        }
        that.setData(updateData);
      } else {
        that.setData({ placementLoading: false });
      }
    } catch (e) {
      console.error('[audit] loadFilePreview failed:', e);
      // Fall back to old method for images
      try {
        var fallbackRes = await callFunction({ name: 'getAuditFile', data: { fileId: fileId } });
        if (fallbackRes.status === 'success' && fallbackRes.mimeType && fallbackRes.mimeType.indexOf('image/') === 0) {
          var fallbackDataUrl = 'data:' + fallbackRes.mimeType + ';base64,' + fallbackRes.data;
          var fallbackSrc = fallbackDataUrl;
          try {
            fallbackSrc = await that._dataUrlToTempFile(fallbackDataUrl, 'audit_file_preview');
          } catch (writeErr) {
            console.error('[audit] write fallback preview temp file failed:', writeErr);
          }
          that.setData({
            placementFileImage: fallbackSrc,
            placementLoading: false
          });
        } else {
          that.setData({ placementLoading: false });
        }
      } catch (_) {
        that.setData({ placementLoading: false });
      }
    }
  },

  // Switch PDF page in placement preview
  onPlacementPageChange(e) {
    var direction = e.currentTarget.dataset.dir; // 'prev' or 'next'
    var newPage = this.data.placementCurrentPage;
    if (direction === 'prev') {
      newPage = Math.max(1, newPage - 1);
    } else {
      newPage = Math.min(this.data.placementTotalPages, newPage + 1);
    }
    if (newPage !== this.data.placementCurrentPage) {
      this.setData({
        placementCurrentPage: newPage,
        placementFileImage: '',
        placementLoading: true
      });
      this.loadFilePreview(this.data.placementFileId, newPage);
    }
  },

  // Legacy: load file for placement (called from openPlacement)
  async loadFileForPlacement(fileId) {
    try {
      var res = await callFunction({ name: 'getAuditFile', data: { fileId: fileId } });
      if (res.status === 'success' && res.mimeType && res.mimeType.indexOf('image/') === 0) {
        var dataUrl = 'data:' + res.mimeType + ';base64,' + res.data;
        var src = await this._dataUrlToTempFile(dataUrl, 'audit_file_preview').catch(function() { return dataUrl; });
        this.setData({ placementFileImage: src });
      }
    } catch (e) {
      // Non-fatal; placement works without image preview
    }
  },

  closePlacement() {
    this.setData({ placementVisible: false });
  },

  onPlacementItemTap(e) {
    var idx = parseInt(e.currentTarget.dataset.sigIdx);
    var sigs = this.data.pendingSignatures || [];
    var sig = sigs[idx];
    if (!sig) return;

    var oldPage = this.data.placementCurrentPage;
    var px = sig.positionX != null ? sig.positionX : 0.5;
    var py = sig.positionY != null ? sig.positionY : 0.3;
    var page = sig.page || oldPage || 1;
    this.setData({
      placementActiveIdx: idx,
      placementType: sig.signatureType || this.data.placementType,
      placementPreviewX: px,
      placementPreviewY: py,
      placementCurrentPage: page,
      placementPosText: (px * 100).toFixed(1) + '%, ' + (py * 100).toFixed(1) + '%'
    });

    if (this.data.placementFileMime === 'application/pdf' && page !== oldPage) {
      this.setData({ placementFileImage: '', placementLoading: true });
      this.loadFilePreview(this.data.placementFileId, page);
    }
  },

  // Handle tap on placement canvas — update position relative to the preview image
  onPlacementTap(e) {
    var that = this;
    var point = that._getTapClientPoint(e);
    if (!point) return;
    // Query the preview image element to get its display dimensions (not the scroll container)
    wx.createSelectorQuery().select('#placementPreviewImage').boundingClientRect(function(rect) {
      // Fallback to canvas if image not found (placeholder mode)
      if (!rect) {
        wx.createSelectorQuery().select('#placementCanvas').boundingClientRect(function(canvasRect) {
          if (!canvasRect) return;
          var px = Math.max(0, Math.min(1, (point.x - canvasRect.left) / (canvasRect.width || 1)));
          var py = Math.max(0, Math.min(1, (point.y - canvasRect.top) / (canvasRect.height || 1)));
          that._applyPlacementPosition(px, py);
        }).exec();
        return;
      }
      var px = Math.max(0, Math.min(1, (point.x - rect.left) / (rect.width || 1)));
      var py = Math.max(0, Math.min(1, (point.y - rect.top) / (rect.height || 1)));
      that._applyPlacementPosition(px, py);
    }).exec();
  },

  addPlacementCopy() {
    var baseIdx = this.data.placementActiveIdx;
    var sigs = [...(this.data.pendingSignatures || [])];
    var base = sigs[baseIdx];
    if (!base) {
      showShortToast('请先选择一个签名或印章');
      return;
    }

    var px = this.data.placementPreviewX >= 0
      ? this.data.placementPreviewX
      : (base.positionX != null ? base.positionX : 0.5);
    var py = this.data.placementPreviewY >= 0
      ? this.data.placementPreviewY
      : (base.positionY != null ? base.positionY : 0.3);
    var page = this.data.placementCurrentPage || base.page || 1;
    var newSig = Object.assign({}, base, {
      _idx: (base.signatureType || 'signature') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      positionX: px,
      positionY: py,
      page: page
    });
    sigs.push(newSig);

    var newIdx = sigs.length - 1;
    var items = [...(this.data.placementItems || []), {
      dispIdx: newIdx,
      imageData: newSig.imageData,
      previewSrc: newSig.previewSrc || newSig.imageData || '',
      positionX: px,
      positionY: py,
      page: page,
      signatureType: newSig.signatureType
    }];

    this.setData({
      pendingSignatures: sigs,
      placementItems: items,
      placementActiveIdx: newIdx,
      placementType: newSig.signatureType || this.data.placementType,
      placementPreviewX: px,
      placementPreviewY: py,
      placementPosText: (px * 100).toFixed(1) + '%, ' + (py * 100).toFixed(1) + '%',
      approvalWarning: ''
    });

    this._preparePlacementItemPreviews(items).then((prepared) => {
      if (this.data.placementVisible) {
        this.setData({ placementItems: prepared });
      }
    });
    this.updateApprovalWarning();
  },

  _getTapClientPoint(e) {
    var touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (touch) {
      return {
        x: touch.clientX != null ? touch.clientX : touch.x,
        y: touch.clientY != null ? touch.clientY : touch.y
      };
    }
    if (e.detail && e.detail.x != null && e.detail.y != null) {
      return { x: e.detail.x, y: e.detail.y };
    }
    return null;
  },

  // Apply placement position to active signature
  _applyPlacementPosition(px, py) {
    var that = this;
    var idx = that.data.placementActiveIdx;
    var sigs = [...that.data.pendingSignatures];
    var items = [...that.data.placementItems];
    var page = that.data.placementCurrentPage;

    if (idx >= 0 && idx < sigs.length) {
      sigs[idx].positionX = px;
      sigs[idx].positionY = py;
      sigs[idx].page = page;
    }

    // Update placementItems for visual preview
    for (var i = 0; i < items.length; i++) {
      if (items[i].dispIdx === idx) {
        items[i].positionX = px;
        items[i].positionY = py;
        items[i].page = page;
        break;
      }
    }

    that.setData({
      placementPreviewX: px,
      placementPreviewY: py,
      placementPosText: (px * 100).toFixed(1) + '%, ' + (py * 100).toFixed(1) + '%',
      pendingSignatures: sigs,
      placementItems: items
    });
  },

  // Save the adjusted position and page
  confirmPlacement() {
    var idx = this.data.placementActiveIdx;
    var px = this.data.placementPreviewX;
    var py = this.data.placementPreviewY;
    var page = this.data.placementCurrentPage;
    if (idx < 0 || px < 0 || py < 0) {
      this.setData({ placementVisible: false });
      return;
    }
    var sigs = [...this.data.pendingSignatures];
    if (idx < sigs.length) {
      sigs[idx].positionX = px;
      sigs[idx].positionY = py;
      sigs[idx].page = page;
    }
    this.setData({
      pendingSignatures: sigs,
      placementVisible: false
    });
  },

  // Check if signature/stamp requirements are met and set warning
  updateApprovalWarning() {
    var actionType = this.data.activeApprovalStep ? this.data.activeApprovalStep.actionType : '';
    var sigs = this.data.pendingSignatures || [];
    var hasSignature = sigs.some(function(s) { return s.signatureType === 'signature'; });
    var hasStamp = sigs.some(function(s) { return s.signatureType === 'stamp'; });
    var warning = '';
    if (actionType === 'both') {
      if (!hasSignature && !hasStamp) {
        warning = '此环节需要签名和盖章，请至少添加一项';
      } else if (!hasSignature) {
        warning = '此环节需要签名和盖章，建议添加签名（不强制）';
      } else if (!hasStamp) {
        warning = '此环节需要签名和盖章，建议添加盖章（不强制）';
      }
    }
    if (warning !== this.data.approvalWarning) {
      this.setData({ approvalWarning: warning });
    }
  },

  // Toggle flow node detail expansion
  toggleFlowNode(e) {
    var key = e.currentTarget.dataset.nodeKey;
    var current = this.data.expandedNodeKey;
    this.setData({ expandedNodeKey: current === key ? '' : key });
  },

  // Direct approval from the inline approval card (no popup)
  async confirmApprovalDirect(e) {
    var action = e.currentTarget.dataset.action;
    var stepId = this.data.activeApprovalStepId;
    var comment = this.data.approvalComment;
    var reason = this.data.rejectionReason;

    // Fallback: if activeApprovalStepId is not set, find the pending step from latest round
    if (!stepId) {
      var steps = this.data.steps || [];
      var submission = this.data.submission;
      if (submission && steps.length && submission.status === 'in_progress') {
        var maxRound = 0;
        for (var i = 0; i < steps.length; i++) maxRound = Math.max(maxRound, steps[i].round || 1);
        for (var i = 0; i < steps.length; i++) {
          if ((steps[i].round || 1) === maxRound &&
              steps[i].sortOrder === submission.currentStepIndex &&
              steps[i].status === 'pending') {
            stepId = steps[i].id;
            console.log('[audit:confirmApprovalDirect] fallback stepId=' + stepId);
            break;
          }
        }
      }
    }

    if (!stepId) {
      showShortToast('未找到待审批步骤');
      return;
    }
    if (action === 'reject' && !reason) {
      showShortToast('请填写驳回理由');
      return;
    }

    // Check approval warning for sign+stamp steps
    if (action === 'approve') {
      this.updateApprovalWarning();
      var warn = this.data.approvalWarning;
      if (warn && warn.indexOf('不强制') < 0) {
        // Only block if neither signature nor stamp was added to a "both" step
        var actionType = this.data.activeApprovalStep ? this.data.activeApprovalStep.actionType : '';
        if (actionType === 'both') {
          var sigs = this.data.pendingSignatures || [];
          var hasSignature = sigs.some(function(s) { return s.signatureType === 'signature'; });
          var hasStamp = sigs.some(function(s) { return s.signatureType === 'stamp'; });
          if (!hasSignature && !hasStamp) {
            showShortToast('此环节需要签名和盖章，请至少添加签名或盖章');
            return;
          }
        }
      }
    }

    this.setData({ loading: true });
    try {
      var res;
      if (action === 'approve') {
        var designatedPersons = (this.data.designatedNextPersons || []).map(function(p) { return p.id; });
        var sigs = (this.data.pendingSignatures || []).map(function(s) {
          return {
            fileId: s.fileId,
            signatureType: s.signatureType,
            imageData: s.imageData,
            positionX: s.positionX,
            positionY: s.positionY,
            page: s.page || 1
          };
        });
        res = await callFunction({
          name: 'approveStep',
          data: {
            submissionId: this.data.submissionId,
            stepId: stepId,
            comment: comment,
            signatures: sigs,
            designatedNextPersonIds: designatedPersons
          }
        });
      } else {
        res = await callFunction({
          name: 'rejectStep',
          data: { submissionId: this.data.submissionId, stepId: stepId, rejectionReason: reason }
        });
      }

      if (res.status === 'success') {
        showShortToast(res.message || '操作成功');
        this.setData({ approvalComment: '', rejectionReason: '', designatedNextPersons: [], nextStepInfo: null });
        this.loadDetail();
      } else {
        showShortToast(res.message || '操作失败');
      }
    } catch (err) {
      showShortToast(getErrorText(err, '操作失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // ═══════════════════════════════════════════════
  // Edit Mode (for draft/pending/rejected/withdrawn)
  // ═══════════════════════════════════════════════

  // Check if submission is editable
  isEditableStatus(status) {
    return status === 'draft' || status === 'pending' || status === 'rejected' || status === 'withdrawn';
  },

  enterEditMode() {
    var submission = this.data.submission;
    var files = this.data.files || [];
    var steps = this.data.steps || [];

    if (!this.isEditableStatus(submission.status)) {
      showShortToast('当前状态不允许编辑');
      return;
    }

    // Load reference data if not loaded
    if (!this.data.allIdentities.length && !this.data.allDepartments.length) {
      this.loadReferenceData();
    }

    this.setData({
      editMode: true,
      editTitle: submission.title || '',
      editDesc: submission.description || '',
      editType: submission.type || 'template',
      editResubmitMode: submission.resubmitMode || 'fresh',
      editTemplateId: submission.templateId || '',
      editSteps: submission.type === 'ad_hoc' ? steps.map(function(s) {
        return {
          approverType: s.approverType || 'identity',
          approverHrId: s.approverHrId || '',
          approverHrName: s.approverName || '',
          approverIdentityId: s.approverIdentityId || '',
          approverIdentityName: s.approverIdentityName || '',
          actionType: s.actionType || 'pass',
          scopeType: s.scopeType || 'all',
          scopeDepartmentId: s.scopeDepartmentId || '',
          scopeDepartmentName: s.scopeDepartmentName || '',
          scopeWorkGroupId: s.scopeWorkGroupId || '',
          scopeWorkGroupName: s.scopeWorkGroupName || '',
          // Include conditions for multi-select / OR display
          stepConditionsJson: s.stepConditionsJson || null,
          stepConditionsDisplay: s.stepConditionsDisplay || [],
          approverDesc: s.approverDesc || ''
        };
      }) : [],
      editFiles: files,
      editNewFiles: []
    });
  },

  cancelEdit() {
    this.setData({ editMode: false });
  },

  onEditTitleInput(e) {
    this.setData({ editTitle: e.detail.value });
  },

  onEditDescInput(e) {
    this.setData({ editDesc: e.detail.value });
  },

  onEditTypeChange(e) {
    this.setData({ editType: e.currentTarget.dataset.type });
  },

  onEditResubmitModeChange(e) {
    this.setData({ editResubmitMode: ['fresh', 'from_rejector'][e.detail.value] || 'fresh' });
  },

  // ── Edit: Ad-hoc step editor ──

  openEditStepEditor() {
    this.setData({
      editStepEditorVisible: true,
      editStepForm: { approverType: 'identity', approverIdentityId: '', approverIdentityName: '', approverHrId: '', approverHrName: '', actionType: 'pass', scopeType: 'all', scopeDepartmentId: '', scopeDepartmentName: '', scopeWorkGroupId: '', scopeWorkGroupName: '' },
      editIdentityPickerScopeIndex: 0,
      editIdentityPickerDeptIndex: 0,
      editIdentityPickerWgIndex: 0,
      editIdentityPickerIdentIndex: 0
    });
  },

  closeEditStepEditor() {
    this.setData({ editStepEditorVisible: false, editPersonPickerVisible: false });
  },

  onEditStepTypeChange(e) {
    var type = ['identity', 'specific_person'][e.detail.value] || 'identity';
    this.setData({
      'editStepForm.approverType': type,
      'editStepForm.approverIdentityId': '',
      'editStepForm.approverIdentityName': '',
      'editStepForm.approverHrId': '',
      'editStepForm.approverHrName': ''
    });
  },

  onEditActionTypeChange(e) {
    var val = ['pass', 'sign', 'estamp', 'both'][e.detail.value] || 'pass';
    this.setData({ 'editStepForm.actionType': val });
  },

  onEditIdentityScopeChange(e) { this.setData({ editIdentityPickerScopeIndex: parseInt(e.detail.value) }); },
  onEditIdentityDeptChange(e) { this.setData({ editIdentityPickerDeptIndex: parseInt(e.detail.value) }); },
  onEditIdentityWgChange(e) { this.setData({ editIdentityPickerWgIndex: parseInt(e.detail.value) }); },
  onEditIdentityIdentChange(e) { this.setData({ editIdentityPickerIdentIndex: parseInt(e.detail.value) }); },

  confirmEditIdentityStep() {
    var sf = this.data.editStepForm;
    var identities = this.data.allIdentities;
    var departments = this.data.allDepartments;
    var workGroups = this.data.allWorkGroups;
    var identIdx = this.data.editIdentityPickerIdentIndex;
    var identOpts = this.data.identityPickerIdentOptions;
    var scopeIdx = this.data.editIdentityPickerScopeIndex;
    var scopeValues = this.data.identityPickerScopeValues;

    if (identIdx <= 0) { showShortToast('请选择身份'); return; }
    var identName = identOpts[identIdx];
    var identity = identities.find(function(i) { return i.name === identName; });
    if (!identity) { showShortToast('身份数据异常，请重试'); return; }

    var scopeType = scopeValues[scopeIdx] || 'all';
    var scopeDepartmentId = '', scopeDepartmentName = '', scopeWorkGroupId = '', scopeWorkGroupName = '';

    if (scopeType === 'specific_department' || scopeType === 'specific_work_group') {
      var deptIdx = this.data.editIdentityPickerDeptIndex;
      var deptOpts = this.data.identityPickerDeptOptions;
      if (deptIdx <= 0) { showShortToast('请选择部门'); return; }
      var deptName = deptOpts[deptIdx];
      var dept = departments.find(function(d) { return d.name === deptName; });
      if (!dept) { showShortToast('部门数据异常'); return; }
      scopeDepartmentId = dept.id;
      scopeDepartmentName = dept.name;
    }
    if (scopeType === 'specific_work_group') {
      var wgIdx = this.data.editIdentityPickerWgIndex;
      var wgOpts = this.data.identityPickerWgOptions;
      if (wgIdx <= 0) { showShortToast('请选择职能组'); return; }
      var wgName = wgOpts[wgIdx];
      var wg = workGroups.find(function(w) { return w.name === wgName; });
      if (!wg) { showShortToast('职能组数据异常'); return; }
      scopeWorkGroupId = wg.id;
      scopeWorkGroupName = wg.name;
    }

    var steps = [...this.data.editSteps];
    steps.push({
      approverType: 'identity',
      approverIdentityId: identity.id,
      approverIdentityName: identity.name,
      approverHrId: '',
      approverHrName: '',
      actionType: sf.actionType,
      scopeType: scopeType,
      scopeDepartmentId: scopeDepartmentId,
      scopeDepartmentName: scopeDepartmentName,
      scopeWorkGroupId: scopeWorkGroupId,
      scopeWorkGroupName: scopeWorkGroupName
    });

    this.setData({
      editSteps: steps,
      editStepEditorVisible: false,
      editStepForm: { approverType: 'identity', approverIdentityId: '', approverIdentityName: '', approverHrId: '', approverHrName: '', actionType: 'pass', scopeType: 'all', scopeDepartmentId: '', scopeDepartmentName: '', scopeWorkGroupId: '', scopeWorkGroupName: '' }
    });
  },

  // ── Edit: Person picker ──

  openEditPersonPicker() {
    this.setData({
      editPersonPickerVisible: true,
      editPersonPickerDept: '全部',
      editPersonPickerIdent: '全部',
      editPersonPickerWg: '全部',
      editPersonPickerKeyword: '',
      editPersonPickerSelectedIds: [],
      editPersonPickerSelectedList: [],
      editPersonPickerStepActionType: 'pass'
    });
    this.applyEditPersonPickerFilters();
  },

  closeEditPersonPicker() { this.setData({ editPersonPickerVisible: false }); },

  onEditPersonPickerDeptChange(e) {
    var opts = this.data.personPickerDeptOpts;
    this.setData({ editPersonPickerDept: opts[parseInt(e.detail.value)] || '全部' });
    this.applyEditPersonPickerFilters();
  },

  onEditPersonPickerIdentChange(e) {
    var opts = this.data.personPickerIdentOpts;
    this.setData({ editPersonPickerIdent: opts[parseInt(e.detail.value)] || '全部' });
    this.applyEditPersonPickerFilters();
  },

  onEditPersonPickerWgChange(e) {
    var opts = this.data.personPickerWgOpts;
    this.setData({ editPersonPickerWg: opts[parseInt(e.detail.value)] || '全部' });
    this.applyEditPersonPickerFilters();
  },

  onEditPersonPickerSearch(e) {
    this.setData({ editPersonPickerKeyword: e.detail.value });
    this.applyEditPersonPickerFilters();
  },

  applyEditPersonPickerFilters() {
    var list = [...this.data.allHrPersons];
    var dept = this.data.editPersonPickerDept;
    var ident = this.data.editPersonPickerIdent;
    var wg = this.data.editPersonPickerWg;
    var kw = (this.data.editPersonPickerKeyword || '').trim().toLowerCase();

    if (dept !== '全部') list = list.filter(function(p) { return p.department === dept; });
    if (ident !== '全部') list = list.filter(function(p) { return p.identity === ident; });
    if (wg !== '全部') list = list.filter(function(p) { return p.workGroup === wg; });
    if (kw) list = list.filter(function(p) {
      return (p.name || '').toLowerCase().includes(kw) || (p.studentId || '').toLowerCase().includes(kw);
    });

    var selectedIds = this.data.editPersonPickerSelectedIds;
    var candidates = list.map(function(p) { return { ...p, isSelected: selectedIds.indexOf(p.id) >= 0 }; });
    var selectedList = candidates.filter(function(p) { return p.isSelected; });

    this.setData({ editPersonPickerCandidates: candidates, editPersonPickerSelectedList: selectedList });
  },

  onEditPersonToggle(e) {
    var hrId = e.currentTarget.dataset.hrId;
    var sel = [...this.data.editPersonPickerSelectedIds];
    var idx = sel.indexOf(hrId);
    if (idx >= 0) sel.splice(idx, 1); else sel.push(hrId);
    this.setData({ editPersonPickerSelectedIds: sel });
    this.applyEditPersonPickerFilters();
  },

  onEditPersonPickerActionTypeChange(e) {
    this.setData({ editPersonPickerStepActionType: ['pass', 'sign', 'estamp', 'both'][e.detail.value] || 'pass' });
  },

  confirmEditPersonPicker() {
    var selected = this.data.editPersonPickerSelectedList;
    if (!selected.length) { showShortToast('请至少选择一个人'); return; }
    var steps = [...this.data.editSteps];
    var actionType = this.data.editPersonPickerStepActionType;
    for (var i = 0; i < selected.length; i++) {
      var p = selected[i];
      steps.push({
        approverType: 'specific_person',
        approverHrId: p.id,
        approverHrName: p.name,
        approverIdentityId: '',
        approverIdentityName: '',
        actionType: actionType
      });
    }
    this.setData({ editSteps: steps, editPersonPickerVisible: false });
  },

  removeEditStep(e) {
    var idx = e.currentTarget.dataset.index;
    var steps = [...this.data.editSteps];
    steps.splice(idx, 1);
    this.setData({ editSteps: steps });
  },

  // ── Edit: File management ──

  editChooseFile() {
    var that = this;
    wx.chooseMessageFile({
      count: 3,
      type: 'file',
      success: function(res) { that.uploadEditFiles(res.tempFiles); }
    });
  },

  editChooseImage() {
    var that = this;
    wx.chooseImage({
      count: 3,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        var tempFiles = res.tempFilePaths.map(function(p, i) {
          return { path: p, name: 'image_' + Date.now() + '_' + i + '.jpg', size: res.tempFiles ? (res.tempFiles[i] ? res.tempFiles[i].size : 0) : 0 };
        });
        that.uploadEditFiles(tempFiles);
      }
    });
  },

  async uploadEditFiles(tempFiles) {
    if (!tempFiles || !tempFiles.length) return;
    this.setData({ editUploading: true });
    var newFiles = [...this.data.editNewFiles];
    var firstError = '';
    for (var i = 0; i < tempFiles.length; i++) {
      var tf = tempFiles[i];
      try {
        var base64 = await new Promise(function(resolve, reject) {
          wx.getFileSystemManager().readFile({
            filePath: tf.path, encoding: 'base64',
            success: function(r) { resolve(r.data); },
            fail: function(err) { reject(err); }
          });
        });
        var fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        var validation = this.validateAuditUploadFile(tf.name, tf.size || 0, base64);
        if (!validation.ok) {
          throw new Error((tf.name || '文件') + ': ' + validation.message);
        }
        newFiles.push({
          fileId: fileId, fileName: tf.name || 'unknown',
          mimeType: validation.mimeType,
          fileSize: tf.size || 0, fileHash: '', tmpPath: tf.path, base64: base64
        });
      } catch (e) {
        if (!firstError) firstError = getErrorText(e, '文件读取失败');
        console.error('文件读取失败:', tf.name, e);
      }
    }
    if (firstError && newFiles.length === this.data.editNewFiles.length) {
      showShortToast(firstError);
    }
    this.setData({ editNewFiles: newFiles, editUploading: false });
  },

  removeEditFile(e) {
    var idx = e.currentTarget.dataset.index;
    var files = [...this.data.editFiles];
    files.splice(idx, 1);
    this.setData({ editFiles: files });
  },

  removeEditNewFile(e) {
    var idx = e.currentTarget.dataset.index;
    var files = [...this.data.editNewFiles];
    files.splice(idx, 1);
    this.setData({ editNewFiles: files });
  },

  async saveEdit() {
    var _editTitle = this.data.editTitle;
    if (!_editTitle) { showShortToast('请输入标题'); return; }

    this.setData({ loading: true });

    try {
      // Upload new files first
      var serverNewFiles = [];
      var editNewFiles = this.data.editNewFiles;
      for (var i = 0; i < editNewFiles.length; i++) {
        var uf = editNewFiles[i];
        var uploadRes = await callFunction({
          name: 'uploadAuditFile',
          data: { fileBase64: uf.base64, fileName: uf.fileName, mimeType: uf.mimeType }
        });
        if (uploadRes.status === 'success') {
          serverNewFiles.push({
            fileId: uploadRes.fileId, fileName: uploadRes.fileName,
            mimeType: uploadRes.mimeType, fileSize: uploadRes.fileSize,
            fileHash: uploadRes.fileHash, tmpPath: uploadRes.tmpPath,
            fileToken: uploadRes.fileToken
          });
        } else {
          throw new Error(uploadRes.message || '文件上传失败');
        }
      }

      // Build steps data
      var stepsData = null;
      if (this.data.editType === 'ad_hoc' && this.data.editSteps.length) {
        stepsData = this.data.editSteps.map(function(s) {
          return {
            approverType: s.approverType,
            approverIdentityId: s.approverIdentityId || '',
            approverHrId: s.approverHrId || '',
            actionType: s.actionType || 'pass',
            scopeType: s.scopeType || 'all',
            scopeDepartmentId: s.scopeDepartmentId || '',
            scopeWorkGroupId: s.scopeWorkGroupId || ''
          };
        });
      }

      // All files to send (existing + new)
      var allFiles = serverNewFiles.length > 0 ? serverNewFiles : null;

      var res = await callFunction({
        name: 'updateAuditSubmission',
        data: {
          submissionId: this.data.submissionId,
          title: _editTitle,
          description: this.data.editDesc,
          type: this.data.editType,
          templateId: this.data.editTemplateId || '',
          resubmitMode: this.data.editResubmitMode,
          steps: stepsData,
          files: allFiles
        }
      });

      if (res.status === 'success') {
        showShortToast('修改已保存');
        this.setData({ editMode: false });
        this.loadDetail();
      } else {
        showShortToast(res.message || '保存失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '保存失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // Resubmit after rejection
  async resubmit() {
    this.setData({ loading: true });
    try {
      const res = await callFunction({
        name: 'resubmitAudit',
        data: { submissionId: this.data.submissionId }
      });
      if (res.status === 'success') {
        showShortToast(res.message || '已重提交');
        this.loadDetail();
      } else {
        showShortToast(res.message || '重提交失败');
      }
    } catch (e) {
      showShortToast(getErrorText(e, '重提交失败'));
    } finally {
      this.setData({ loading: false });
    }
  },

  // ── File preview ──
  async previewFile(e) {
    const fileId = e.currentTarget.dataset.fileId;
    const fileName = e.currentTarget.dataset.fileName || '';
    if (!fileId) return;

    wx.showLoading({ title: '加载中...' });
    try {
      const res = await callFunction({
        name: 'getAuditFile',
        data: { fileId: fileId }
      });
      if (res.status !== 'success' || !res.data) {
        wx.hideLoading();
        showShortToast(res.message || '文件加载失败');
        return;
      }

      // Write base64 to temp file
      const fs = wx.getFileSystemManager();
      const ext = (res.fileName || fileName).split('.').pop() || 'bin';
      const tmpPath = `${wx.env.USER_DATA_PATH}/${fileId}.${ext}`;

      fs.writeFile({
        filePath: tmpPath,
        data: res.data,
        encoding: 'base64',
        success: () => {
          wx.hideLoading();
          // Open with appropriate viewer
          const mime = res.mimeType || '';
          if (mime.startsWith('image/')) {
            wx.previewImage({
              urls: [tmpPath],
              current: tmpPath
            });
          } else {
            wx.openDocument({
              filePath: tmpPath,
              showMenu: true,
              fail: () => {
                // Fallback: show file info
                wx.showModal({
                  title: '文件信息',
                  content: `文件名：${res.fileName}\n类型：${res.mimeType}\n大小：${(res.fileSize / 1024).toFixed(1)} KB`,
                  showCancel: false
                });
              }
            });
          }
        },
        fail: () => {
          wx.hideLoading();
          showShortToast('文件写入失败');
        }
      });
    } catch (e) {
      wx.hideLoading();
      showShortToast(getErrorText(e, '预览失败'));
    }
  },

  // Withdraw
  async withdraw() {
    const that = this;
    wx.showModal({
      title: '确认撤回',
      content: '确定撤回此审核申请吗？',
      success: async (modalRes) => {
        if (!modalRes.confirm) return;
        try {
          const res = await callFunction({
            name: 'withdrawSubmission',
            data: { submissionId: that.data.submissionId }
          });
          if (res.status === 'success') {
            showShortToast('已撤回');
            wx.navigateBack();
          } else {
            showShortToast(res.message || '撤回失败');
          }
        } catch (e) {
          showShortToast(getErrorText(e, '撤回失败'));
        }
      }
    });
  }
});
