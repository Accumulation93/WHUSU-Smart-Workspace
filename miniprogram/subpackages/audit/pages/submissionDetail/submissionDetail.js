const { callFunction } = require('../../../../../utils/api');
const { getErrorText, showShortToast } = require('../../../scoring/pages/admin/modules/adminUtils');

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
    adHocStepForm: { approverType: 'identity', approverIdentityId: '', approverHrId: '', actionType: 'sign' },
    adHocStepEditorVisible: false,
    resubmitMode: 'fresh',

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

  onLoad(options) {
    if (options.action === 'create') {
      this.setData({ action: 'create' });
      this.loadFlowTemplates();
    } else if (options.id) {
      this.setData({ submissionId: options.id, action: 'view' });
      this.loadDetail();
    }
  },

  // ═══════════════════════════════════════════════
  // Create Mode
  // ═══════════════════════════════════════════════

  async loadFlowTemplates() {
    try {
      const res = await callFunction({ name: 'listAuditFlowTemplates', data: {} });
      if (res.status === 'success') {
        this.setData({ flowTemplates: (res.templates || []).filter((t) => t.isActive) });
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

  // Ad-hoc step management
  openAdHocStepEditor() {
    this.setData({ adHocStepEditorVisible: true });
  },

  closeAdHocStepEditor() {
    this.setData({ adHocStepEditorVisible: false });
  },

  onAdHocStepFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`adHocStepForm.${field}`]: e.detail.value });
  },

  onAdHocStepTypeChange(e) {
    this.setData({ 'adHocStepForm.approverType': ['identity', 'specific_person'][e.detail.value] || 'identity' });
  },

  confirmAdHocStep() {
    const sf = this.data.adHocStepForm;
    if (!sf.approverIdentityId && !sf.approverHrId) {
      showShortToast('请指定审批人');
      return;
    }
    const steps = [...this.data.adHocSteps];
    steps.push({ ...sf });
    this.setData({
      adHocSteps: steps,
      adHocStepForm: { approverType: 'identity', approverIdentityId: '', approverHrId: '', actionType: 'sign' },
      adHocStepEditorVisible: false
    });
  },

  removeAdHocStep(e) {
    const idx = e.currentTarget.dataset.index;
    const steps = [...this.data.adHocSteps];
    steps.splice(idx, 1);
    this.setData({ adHocSteps: steps });
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
        // Convert tempFilePaths to tempFiles format
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
    this.setData({ uploading: true });
    const uploaded = [...this.data.uploadedFiles];
    try {
      for (const tf of tempFiles) {
        // Read file as base64 and upload via API
        const fs = wx.getFileSystemManager();
        const base64 = fs.readFileSync(tf.path, 'base64');
        // For simplicity, store file metadata; actual upload happens on submit
        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        uploaded.push({
          fileId,
          fileName: tf.name || 'unknown',
          mimeType: tf.name ? (tf.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg') : 'image/jpeg',
          fileSize: tf.size || 0,
          fileHash: '', // Will be computed server-side
          tmpPath: tf.path,
          base64: base64
        });
      }
      this.setData({ uploadedFiles: uploaded });
    } catch (e) {
      showShortToast('上传失败: ' + (e.errMsg || e.message));
    } finally {
      this.setData({ uploading: false });
    }
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

    // Upload files to server first
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
        res = await callFunction({
          name: 'startAdHocAudit',
          data: { title: createTitle, resubmitMode, steps: adHocSteps, files: serverFiles }
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
