const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');

Page({
  data: {
    submissionId: '',
    action: '', // 'create' or 'view'
    submission: null,
    steps: [],
    files: [],
    signatures: [],
    loading: false,

    // Create mode
    createMode: 'template', // 'template' or 'ad_hoc'
    flowTemplates: [],
    selectedTemplateId: '',
    createTitle: '',
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

    // Approval mode
    approvalVisible: false,
    approvalStepId: '',
    approvalAction: '', // 'approve' or 'reject'
    approvalComment: '',
    rejectionReason: '',
    signaturePadVisible: false,
    currentSignatureFileId: '',
    pendingSignatures: [], // signatures to submit with approval

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
    this.setData({ selectedTemplateId: e.currentTarget.dataset.id });
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
        uploaded.push({
          fileId: fileId,
          fileName: tf.name || 'unknown',
          mimeType: tf.name ? (tf.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') : 'image/jpeg',
          fileSize: tf.size || 0,
          fileHash: '',
          tmpPath: tf.path,
          base64: base64
        });
      } catch (e) {
        errorCount++;
        console.error('文件读取失败:', tf.name, e);
      }
    }

    if (uploaded.length > this.data.uploadedFiles.length) {
      this.setData({ uploadedFiles: uploaded });
    } else if (errorCount > 0) {
      showShortToast('文件读取失败，请重试');
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
            tmpPath: uploadRes.tmpPath
          });
        }
      }
    } catch (e) {
      this.setData({ loading: false });
      showShortToast('文件上传失败');
      return;
    }

    try {
      let res;
      if (createMode === 'template') {
        if (!selectedTemplateId) { showShortToast('请选择审核流模板'); this.setData({ loading: false }); return; }
        res = await callFunction({
          name: 'startAuditSubmission',
          data: { templateId: selectedTemplateId, title: createTitle, files: serverFiles }
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
          data: { title: createTitle, resubmitMode, steps: cleanSteps, files: serverFiles }
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
        this.setData({
          submission: res.submission,
          steps: res.steps || [],
          files: res.files || [],
          signatures: res.signatures || []
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

  // Signature placement
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

  onSignatureConfirm(e) {
    const imageData = e.detail.imageData;
    const sigs = [...this.data.pendingSignatures];
    sigs.push({
      fileId: this.data.currentSignatureFileId,
      signatureType: 'signature',
      imageData: imageData,
      positionX: 0.5,
      positionY: 0.5
    });
    this.setData({
      pendingSignatures: sigs,
      signaturePadVisible: false
    });
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
