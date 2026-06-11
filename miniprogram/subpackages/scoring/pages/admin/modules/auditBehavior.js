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
      starterHrId: '',
      resubmitMode: 'fresh',
      steps: []
    },
    auditTemplateStepForm: {
      approverType: 'identity',
      approverIdentityId: '',
      approverHrId: '',
      actionType: 'sign',
      editingIndex: -1
    },
    auditTemplateStepEditorVisible: false,

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
    verificationResult: null,
    verificationInputNumber: ''
  },

  methods: {
    // ═══════════════════════════════════════════════════════
    // Audit Flow Templates
    // ═══════════════════════════════════════════════════════

    async loadAuditFlowTemplates() {
      this.setData({ 'loadingMap.auditTemplates': true });
      try {
        const res = await this.callCloud('listAuditFlowTemplates', {});
        if (res.status === 'success') {
          this.setData({ auditFlowTemplates: res.templates || [] });
        }
      } catch (e) {
        showShortToast(getErrorText(e, '加载审核流模板失败'));
      } finally {
        this.setData({ 'loadingMap.auditTemplates': false });
      }
    },

    onAuditTemplateFieldInput(e) {
      const field = e.currentTarget.dataset.field;
      const value = e.detail.value;
      this.setData({ [`auditTemplateForm.${field}`]: value });
    },

    startCreateAuditTemplate() {
      this.setData({
        auditTemplateForm: { id: '', name: '', description: '', starterType: 'self', starterIdentityId: '', starterHrId: '', resubmitMode: 'fresh', steps: [] },
        auditTemplateStepForm: { approverType: 'identity', approverIdentityId: '', approverHrId: '', actionType: 'sign', editingIndex: -1 },
        auditTemplateStepEditorVisible: false
      });
    },

    editAuditTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const template = this.data.auditFlowTemplates.find((t) => t.id === id);
      if (!template) return;
      this.setData({
        auditTemplateForm: {
          id: template.id,
          name: template.name,
          description: template.description,
          starterType: template.starterType || 'self',
          starterIdentityId: template.starterIdentityId || '',
          starterHrId: template.starterHrId || '',
          resubmitMode: template.resubmitMode || 'fresh',
          steps: template.steps || []
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

    // Step editor
    openAuditTemplateStepEditor(e) {
      const index = e && e.currentTarget ? parseInt(e.currentTarget.dataset.index) : -1;
      if (index >= 0 && this.data.auditTemplateForm.steps[index]) {
        const step = this.data.auditTemplateForm.steps[index];
        this.setData({
          auditTemplateStepForm: {
            approverType: step.approverType || 'identity',
            approverIdentityId: step.approverIdentityId || '',
            approverHrId: step.approverHrId || '',
            actionType: step.actionType || 'sign',
            editingIndex: index
          },
          auditTemplateStepEditorVisible: true
        });
      } else {
        this.setData({
          auditTemplateStepForm: { approverType: 'identity', approverIdentityId: '', approverHrId: '', actionType: 'sign', editingIndex: -1 },
          auditTemplateStepEditorVisible: true
        });
      }
    },

    closeAuditTemplateStepEditor() {
      this.setData({ auditTemplateStepEditorVisible: false });
    },

    onStepApproverTypeChange(e) {
      this.setData({ 'auditTemplateStepForm.approverType': ['identity', 'specific_person', 'related_to_starter'][e.detail.value] || 'identity' });
    },

    onStepActionTypeChange(e) {
      this.setData({ 'auditTemplateStepForm.actionType': ['sign', 'estamp', 'both'][e.detail.value] || 'sign' });
    },

    onStepFieldInput(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ [`auditTemplateStepForm.${field}`]: e.detail.value });
    },

    confirmAuditTemplateStep() {
      const step = { ...this.data.auditTemplateStepForm };
      if (!step.approverIdentityId && step.approverType === 'identity') {
        showShortToast('请选择审批人身份');
        return;
      }

      const steps = [...this.data.auditTemplateForm.steps];
      const { approverType, approverIdentityId, approverHrId, actionType } = step;
      const newStep = { approverType, approverIdentityId, approverHrId, actionType };

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

    async saveAuditFlowTemplate() {
      const form = this.data.auditTemplateForm;
      if (!form.name) { showShortToast('请输入模板名称'); return; }
      if (!form.steps.length) { showShortToast('请至少添加一个步骤'); return; }

      this.setData({ 'loadingMap.saveAuditTemplate': true });
      try {
        const res = await this.callCloud('saveAuditFlowTemplate', {
          id: form.id,
          name: form.name,
          description: form.description,
          starterType: form.starterType,
          starterIdentityId: form.starterIdentityId,
          starterHrId: form.starterHrId,
          resubmitMode: form.resubmitMode,
          steps: form.steps
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
        this.setData({ 'loadingMap.saveAuditTemplate': false });
      }
    },

    async deleteAuditFlowTemplate(e) {
      const id = e.currentTarget.dataset.id;
      const that = this;
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，确定删除此审核流模板吗？',
        success: async (modalRes) => {
          if (!modalRes.confirm) return;
          try {
            const res = await that.callCloud('deleteAuditFlowTemplate', { id });
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

    // ═══════════════════════════════════════════════════════
    // Stamps Management
    // ═══════════════════════════════════════════════════════

    async loadStamps() {
      this.setData({ 'loadingMap.auditStamps': true });
      try {
        const res = await this.callCloud('listStamps', {});
        if (res.status === 'success') {
          this.setData({ stamps: res.stamps || [] });
        }
      } catch (e) {
        showShortToast(getErrorText(e, '加载印章失败'));
      } finally {
        this.setData({ 'loadingMap.auditStamps': false });
      }
    },

    startCreateStamp() {
      this.setData({ stampForm: { id: '', name: '', imageData: '' } });
    },

    editStamp(e) {
      const id = e.currentTarget.dataset.id;
      const stamp = this.data.stamps.find((s) => s.id === id);
      if (!stamp) return;
      this.setData({ stampForm: { id: stamp.id, name: stamp.name, imageData: stamp.imageData } });
    },

    onStampFieldInput(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ [`stampForm.${field}`]: e.detail.value });
    },

    chooseStampImage() {
      const that = this;
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success(res) {
          const tempFilePath = res.tempFilePaths[0];
          // Convert to base64
          wx.getFileSystemManager().readFile({
            filePath: tempFilePath,
            encoding: 'base64',
            success(fileRes) {
              const ext = tempFilePath.split('.').pop().toLowerCase();
              const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
              const mime = mimeMap[ext] || 'image/png';
              const base64 = `data:${mime};base64,${fileRes.data}`;
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

      this.setData({ 'loadingMap.saveStamp': true });
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
        this.setData({ 'loadingMap.saveStamp': false });
      }
    },

    async deleteStamp(e) {
      const id = e.currentTarget.dataset.id;
      const that = this;
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，已分配的印章权限也会失效。确定删除吗？',
        success: async (modalRes) => {
          if (!modalRes.confirm) return;
          try {
            const res = await that.callCloud('deleteStamp', { id });
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
      // Find currently assigned stamp IDs for this identity
      const stamp = this.data.stamps.find((s) =>
        (s.assignedIdentities || []).some((a) => a.identityId === identityId)
      );
      const selectedIds = (this.data.stamps || [])
        .filter((s) => (s.assignedIdentities || []).some((a) => a.identityId === identityId))
        .map((s) => s.id);

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
      this.setData({ 'loadingMap.auditSubmissions': true });
      try {
        const filters = this.data.auditSubmissionFilters;
        const res = await this.callCloud('listAllAuditSubmissions', {
          status: filters.status || '',
          limit: 50,
          offset: 0
        });
        if (res.status === 'success') {
          this.setData({ auditSubmissions: res.submissions || [] });
        }
      } catch (e) {
        showShortToast(getErrorText(e, '加载审核记录失败'));
      } finally {
        this.setData({ 'loadingMap.auditSubmissions': false });
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
      this.setData({ 'loadingMap.auditProgress': true });
      try {
        const res = await this.callCloud('getAuditProgress', { submissionId });
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
        this.setData({ 'loadingMap.auditProgress': false });
      }
    },

    closeAuditSubmissionDetail() {
      this.setData({ auditSubmissionDetailVisible: false });
    },

    // ═══════════════════════════════════════════════════════
    // Verification Management
    // ═══════════════════════════════════════════════════════

    async loadVerificationPermissions() {
      this.setData({ 'loadingMap.auditVerification': true });
      try {
        const res = await this.callCloud('listVerificationPermissions', {});
        if (res.status === 'success') {
          this.setData({ verificationPermissions: res.permissions || [] });
        }
      } catch (e) {
        showShortToast(getErrorText(e, '加载验签权限失败'));
      } finally {
        this.setData({ 'loadingMap.auditVerification': false });
      }
    },

    onVerificationGrantHrInput(e) {
      this.setData({ verificationGrantHrId: e.detail.value });
    },

    async grantVerificationPermission() {
      const hrId = this.data.verificationGrantHrId;
      if (!hrId) { showShortToast('请输入人员ID'); return; }
      try {
        const res = await this.callCloud('saveVerificationPermission', {
          granteeHrId: hrId,
          action: 'grant'
        });
        if (res.status === 'success') {
          showShortToast('验签权限已授予');
          this.setData({ verificationGrantHrId: '' });
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
        success: async (modalRes) => {
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

    async verifySubmissionChain() {
      const number = this.data.verificationInputNumber;
      if (!number) { showShortToast('请输入提交编号'); return; }
      this.setData({ 'loadingMap.verifyChain': true });
      try {
        const res = await this.callCloud('verifySignatureChain', { submissionNumber: number });
        if (res.status === 'success') {
          this.setData({ verificationResult: res });
        } else {
          showShortToast(res.message || '验证失败');
        }
      } catch (e) {
        showShortToast(getErrorText(e, '验证失败'));
      } finally {
        this.setData({ 'loadingMap.verifyChain': false });
      }
    }
  }
});
