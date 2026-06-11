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
      approverType: 'identity',
      approverIdentityId: '',
      approverIdentityName: '',
      approverHrId: '',
      approverHrName: '',
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
    verificationGrantHrName: '',
    verificationResult: null,
    verificationInputNumber: '',

    // ── Personnel Picker (unified, single-select) ──
    auditPersonnelPickerVisible: false,
    auditPersonnelPickerTarget: '',
    auditPersonnelPickerLabel: '',
    auditPersonnelSearchKeyword: '',
    auditPersonnelFilterDept: '全部',
    auditPersonnelFilterIdent: '全部',
    auditPersonnelDeptOptions: ['全部'],
    auditPersonnelIdentOptions: ['全部'],
    auditPersonnelFilteredList: [],

    // ── Identity Picker (multi-select) ──
    auditIdentityPickerVisible: false,
    auditIdentityPickerTarget: '',
    auditIdentityPickerLabel: '',
    auditIdentityPickerMulti: false,
    auditIdentityPickerSelectedIds: {}
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
          // Hydrate step display names
          var templates = (res.templates || []).map((function (t) {
            t.steps = (t.steps || []).map((function (s) {
              s.approverIdentityName = this._auditIdentityName(s.approverIdentityId);
              s.approverHrName = this._auditHrName(s.approverHrId);
              return s;
            }).bind(this));
            return t;
          }).bind(this));
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
          approverType: 'identity',
          approverIdentityId: '', approverIdentityName: '',
          approverHrId: '', approverHrName: '',
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
            approverIdentityName: this._auditIdentityName(step.approverIdentityId),
            approverHrId: step.approverHrId || '',
            approverHrName: this._auditHrName(step.approverHrId),
            actionType: step.actionType || 'sign',
            editingIndex: index
          },
          auditTemplateStepEditorVisible: true
        });
      } else {
        this.setData({
          auditTemplateStepForm: {
            approverType: 'identity',
            approverIdentityId: '', approverIdentityName: '',
            approverHrId: '', approverHrName: '',
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

    onStepApproverTypeChange(e) {
      this.setData({ 'auditTemplateStepForm.approverType': ['identity', 'specific_person', 'related_to_starter'][e.detail.value] || 'identity' });
    },

    onStepActionTypeChange(e) {
      this.setData({ 'auditTemplateStepForm.actionType': ['sign', 'estamp', 'both'][e.detail.value] || 'sign' });
    },

    onStepFieldInput(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ ['auditTemplateStepForm.' + field]: e.detail.value });
    },

    confirmAuditTemplateStep() {
      const step = { ...this.data.auditTemplateStepForm };
      if (!step.approverIdentityId && step.approverType === 'identity') {
        showShortToast('请选择审批人身份');
        return;
      }

      const steps = [...this.data.auditTemplateForm.steps];
      const { approverType, approverIdentityId, approverIdentityName, approverHrId, approverHrName, actionType } = step;
      const newStep = { approverType, approverIdentityId, approverIdentityName, approverHrId, approverHrName, actionType };

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

      this.setLoading('saveAuditTemplate', true);
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

    async verifySubmissionChain() {
      const number = this.data.verificationInputNumber;
      if (!number) { showShortToast('请输入提交编号'); return; }
      this.setLoading('verifyChain', true);
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
        this.setLoading('verifyChain', false);
      }
    },

    // ═══════════════════════════════════════════════════════
    // Personnel Picker (unified single-select)
    // ═══════════════════════════════════════════════════════

    openAuditPersonnelPicker(e) {
      const target = e.currentTarget.dataset.target;
      const label = e.currentTarget.dataset.label || '选择人员';

      this.setData({
        auditPersonnelPickerVisible: true,
        auditPersonnelPickerTarget: target,
        auditPersonnelPickerLabel: label,
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
      const idx = e.detail.value;
      const options = this.data.auditPersonnelDeptOptions;
      this.setData({ auditPersonnelFilterDept: options[idx] || '全部' });
      this._applyAuditPersonnelFilters();
    },

    onAuditPersonnelFilterIdent(e) {
      const idx = e.detail.value;
      const options = this.data.auditPersonnelIdentOptions;
      this.setData({ auditPersonnelFilterIdent: options[idx] || '全部' });
      this._applyAuditPersonnelFilters();
    },

    _applyAuditPersonnelFilters() {
      const hrList = this.data.hrList || [];
      const keyword = (this.data.auditPersonnelSearchKeyword || '').trim().toLowerCase();
      const filterDept = this.data.auditPersonnelFilterDept;
      const filterIdent = this.data.auditPersonnelFilterIdent;

      let filtered = hrList;
      if (filterDept !== '全部') {
        filtered = filtered.filter(function (item) { return item.department === filterDept; });
      }
      if (filterIdent !== '全部') {
        filtered = filtered.filter(function (item) { return item.identity === filterIdent; });
      }
      if (keyword) {
        filtered = filtered.filter(function (item) {
          return [item.name, item.studentId, item.department, item.identity, item.workGroup]
            .map(function (v) { return String(v || '').toLowerCase(); })
            .some(function (v) { return v.indexOf(keyword) !== -1; });
        });
      }

      this.setData({ auditPersonnelFilteredList: filtered });
    },

    pickAuditPersonnel(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.auditPersonnelFilteredList[index];
      if (!item) return;

      const target = this.data.auditPersonnelPickerTarget;
      const hrId = String(item.id);

      switch (target) {
        case 'starterHrId':
          this.setData({
            'auditTemplateForm.starterHrId': hrId,
            'auditTemplateForm.starterHrName': item.name
          });
          break;
        case 'stepHrId':
          this.setData({
            'auditTemplateStepForm.approverHrId': hrId,
            'auditTemplateStepForm.approverHrName': item.name
          });
          break;
        case 'grantHrId':
          this.setData({
            verificationGrantHrId: hrId,
            verificationGrantHrName: item.name
          });
          break;
        default:
          break;
      }

      this.setData({ auditPersonnelPickerVisible: false });
      showShortToast('已选择：' + item.name);
    },

    clearAuditPersonnel(e) {
      const target = e.currentTarget.dataset.target;
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
        default:
          break;
      }
    },

    // ═══════════════════════════════════════════════════════
    // Identity Picker (supports multi-select)
    // ═══════════════════════════════════════════════════════

    openAuditIdentityPicker(e) {
      const target = e.currentTarget.dataset.target;
      const label = e.currentTarget.dataset.label || '选择身份';
      const multi = e.currentTarget.dataset.multi === 'true';

      // Pre-populate selected IDs from the current target field
      let selectedIds = {};
      if (multi) {
        // Multi-select: comma-separated ids
        let currentIds = '';
        if (target === 'starterIdentityId') {
          currentIds = this.data.auditTemplateForm.starterIdentityId;
        } else if (target === 'stepIdentityId') {
          currentIds = this.data.auditTemplateStepForm.approverIdentityId;
        }
        if (currentIds) {
          currentIds.split(',').forEach(function (id) {
            selectedIds[id.trim()] = true;
          });
        }
      } else {
        // Single select
        let currentId = '';
        if (target === 'starterIdentityId') {
          currentId = this.data.auditTemplateForm.starterIdentityId;
        } else if (target === 'stepIdentityId') {
          currentId = this.data.auditTemplateStepForm.approverIdentityId;
        }
        if (currentId) {
          selectedIds[currentId] = true;
        }
      }

      this.setData({
        auditIdentityPickerVisible: true,
        auditIdentityPickerTarget: target,
        auditIdentityPickerLabel: label,
        auditIdentityPickerMulti: multi,
        auditIdentityPickerSelectedIds: selectedIds
      });
    },

    closeAuditIdentityPicker() {
      this.setData({
        auditIdentityPickerVisible: false,
        auditIdentityPickerSelectedIds: {}
      });
    },

    toggleAuditIdentity(e) {
      const id = String(e.currentTarget.dataset.id);
      const selectedIds = { ...this.data.auditIdentityPickerSelectedIds };

      if (this.data.auditIdentityPickerMulti) {
        if (selectedIds[id]) {
          delete selectedIds[id];
        } else {
          selectedIds[id] = true;
        }
      } else {
        // Single select: clear all, then set
        if (selectedIds[id]) {
          delete selectedIds[id];
        } else {
          selectedIds = {};
          selectedIds[id] = true;
        }
      }

      this.setData({ auditIdentityPickerSelectedIds: selectedIds });

      // For single-select, auto-confirm immediately
      if (!this.data.auditIdentityPickerMulti) {
        this._confirmAuditIdentitySelection();
      }
    },

    _confirmAuditIdentitySelection() {
      const selectedIds = this.data.auditIdentityPickerSelectedIds;
      const identityList = this.data.identityList || [];
      const target = this.data.auditIdentityPickerTarget;

      if (this.data.auditIdentityPickerMulti) {
        // Build comma-separated IDs and names
        const ids = Object.keys(selectedIds);
        const names = ids.map(function (id) {
          const found = identityList.find(function (item) { return String(item.id) === id; });
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
      } else {
        // Single select
        const ids = Object.keys(selectedIds);
        const id = ids.length > 0 ? ids[0] : '';
        const name = id ? (function () {
          const found = identityList.find(function (item) { return String(item.id) === id; });
          return found ? found.name : id;
        })() : '';

        if (target === 'starterIdentityId') {
          this.setData({
            'auditTemplateForm.starterIdentityId': id,
            'auditTemplateForm.starterIdentityName': name
          });
        } else if (target === 'stepIdentityId') {
          this.setData({
            'auditTemplateStepForm.approverIdentityId': id,
            'auditTemplateStepForm.approverIdentityName': name
          });
        }
      }

      this.setData({
        auditIdentityPickerVisible: false,
        auditIdentityPickerSelectedIds: {}
      });
    },

    confirmAuditIdentityPicker() {
      this._confirmAuditIdentitySelection();
    },

    clearAuditIdentity(e) {
      const target = e.currentTarget.dataset.target;
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

    // ═══════════════════════════════════════════════════════
    // Helper: get identity name for display in step chips
    // ═══════════════════════════════════════════════════════

    _stepIdentityName(id) {
      if (!id) return id;
      const found = (this.data.identityList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : id;
    },

    _stepHrName(id) {
      if (!id) return id;
      const found = (this.data.hrList || []).find(function (item) {
        return String(item.id) === String(id);
      });
      return found ? found.name : id;
    }
  }
});
