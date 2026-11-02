const localeCopy = require('../../../package-resources/locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/adminManagementBehavior');
// Behavior: adminManagement tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyAdminForm } = utils;
const { writeAndOpen } = require('../../../package-resources/utils/filePreview');
const orgSession = require('../../../../../utils/orgSession');
const personnelCopy = require('../../../package-resources/locales/zh-CN/adminPersonnel');
const { filterAdminCandidates } = require('./adminCandidateView');

const ADMIN_CANDIDATE_RENDER_LIMIT = 80;

module.exports = Behavior({
  data: {
    adminCandidatePickerVisible: false,
    adminAccountCandidates: [],
    adminAccountCandidateValue: [],
    adminAccountCandidatesLoading: false,
    adminAccountCandidatesError: '',
    canCreateAdmins: false,
    canExportAdmins: false
  },
  methods: {
    filterAdminCandidates(keyword) {
      const sourceList = this._hrList || [];
      return filterAdminCandidates(
        sourceList,
        keyword,
        ADMIN_CANDIDATE_RENDER_LIMIT,
        personnelCopy
      );
    },

    refreshAdminCandidates(keyword = this.data.adminCandidateKeyword) {
      this.setData({
        adminCandidateKeyword: keyword,
        adminCandidateList: this.filterAdminCandidates(keyword)
      });
    },

    async loadAdminList() {
      const request = orgSession.beginRequest(this, 'adminList');
      this.setLoading('admins', true);
      try {
        const result = await this.callCloud('listAdmins');
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          adminList: result.list || [],
          canManageAdmins: !!result.canWrite,
          canReadAdmins: !!result.canRead,
          canWriteAdmins: !!result.canWrite,
          canCreateAdmins: this.data.authorizationEnforced ? result.canCreate === true : !!result.canWrite,
          canExportAdmins: this.data.authorizationEnforced ? this.data.actionCapabilities['system.adminAccounts.export'] === true : !!result.canRead,
          manageableAdminLevel: result.manageableLevel || '',
          adminLevelOptions: (result.creatableLevels || []).map((item) => item.label),
          adminLevelValues: (result.creatableLevels || []).map((item) => item.value)
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        wx.showToast({
          title: localeCopy.copy_6026566679,
          icon: 'none'
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('admins', false);
      }
    },

    onAdminFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = e.detail.value.trim();

      this.setData({
        adminForm: {
          ...this.data.adminForm,
          [field]: value
        }
      });
    },

    onAdminLevelChange(e) {
      const idx = Number(e.detail.value) || 0;
      const adminLevel = this.data.adminLevelValues[idx] || 'admin';
      this.setData({
        adminLevelIndex: idx,
        adminForm: {
          ...this.data.adminForm,
          adminLevel
        }
      });
    },

    onAdminCandidateKeyword(e) {
      this.refreshAdminCandidates(e.detail.value);
    },

    onAdminCandidateConfirm(e) {
      this.refreshAdminCandidates(e.detail.value);
    },

    pickAdminCandidate(e) {
      const detailIndex = e && e.detail ? e.detail.index : undefined;
      const datasetIndex = e && e.currentTarget && e.currentTarget.dataset
        ? e.currentTarget.dataset.index
        : undefined;
      const index = Number(detailIndex !== undefined ? detailIndex : datasetIndex);
      const item = this.data.adminCandidateList[index];
      if (!item) {
        return;
      }

      this.setData({
        adminForm: {
          ...this.data.adminForm,
          hrId: item.id,
          name: item.name,
          studentId: item.studentId
        }
      });

      wx.showToast({
        title: localeCopy.copy_87c8c6a02a,
        icon: 'none'
      });
    },

    async openAdminCandidatePicker() {
      if (!this.data.authorizationEnforced || !this.data.canCreateAdmins || this.data.adminForm.id) return;
      const request = orgSession.beginRequest(this, 'adminAccountCandidates');
      this.setData({ adminCandidatePickerVisible: true, adminAccountCandidates: [], adminAccountCandidatesLoading: true,
        adminAccountCandidatesError: '', adminAccountCandidateValue: this.data.adminForm.hrId ? [this.data.adminForm.hrId] : [] });
      try {
        const result = await this.callCloud('getAdminAccountCandidates', {});
        if (!orgSession.isRequestCurrent(this, request) || !this.data.adminCandidatePickerVisible) return;
        if (result.status !== 'success') { this.setData({ adminAccountCandidatesError: result.message || localeCopy.copy_6026566679 }); return; }
        this.setData({ adminAccountCandidates: (result.list || []).map(item => ({ id: item.hrId, hrId: item.hrId, name: item.name })) });
      } catch (_) {
        if (orgSession.isRequestCurrent(this, request)) this.setData({ adminAccountCandidatesError: localeCopy.copy_6026566679 });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setData({ adminAccountCandidatesLoading: false });
      }
    },

    closeAdminCandidatePicker() {
      orgSession.beginRequest(this, 'adminAccountCandidates');
      this.setData({ adminCandidatePickerVisible: false, adminAccountCandidates: [], adminAccountCandidateValue: [] });
    },

    confirmAdminCandidatePicker(e) {
      if (!this.data.canCreateAdmins || this.data.adminForm.id) return;
      const key = (e.detail.keys || [])[0];
      const item = (this.data.adminAccountCandidates || []).find(candidate => candidate.id === key);
      this.setData({ 'adminForm.hrId': item ? item.hrId : '', 'adminForm.name': item ? item.name : '', 'adminForm.studentId': '' });
      this.closeAdminCandidatePicker();
    },

    editAdmin(e) {
      if (!this.data.canWriteAdmins) {
        return;
      }

      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.adminList[index];
      if (!item || !(this.data.authorizationEnforced ? item.canEdit : item.canManage)) {
        return;
      }

      const adminLevel = item.adminLevel || 'admin';
      const adminLevelIndex = Math.max(0, this.data.adminLevelValues.indexOf(adminLevel));

      this.setData({
        adminLevelIndex,
        adminForm: {
          id: item.id,
          hrId: '',
          name: item.name,
          studentId: item.studentId,
          adminLevel
        },
        adminFormVisible: true,
        activeTab: 'admins'
      });
    },

    resetAdminForm() {
      const form = emptyAdminForm();
      form.adminLevel = this.data.adminLevelValues[0] || 'admin';
      this.setData({
        adminForm: form,
        adminLevelIndex: 0,
        adminFormVisible: false
      });
    },

    startCreateAdmin() {
      if (!(this.data.authorizationEnforced ? this.data.canCreateAdmins : this.data.canWriteAdmins)) {
        return;
      }

      this.resetAdminForm();
      this.setData({ activeTab: 'admins', adminFormVisible: true });
    },

    async saveAdmin() {
      if (!this.data.canWriteAdmins) {
        return;
      }

      const form = this.data.adminForm;
      if (this.data.authorizationEnforced && (form.id
        ? !(this.data.adminList || []).some(item => item.id === form.id && item.canEdit)
        : !this.data.canCreateAdmins)) return;
      if (!form.name || (!form.studentId && !(this.data.authorizationEnforced && (form.id || form.hrId)))) {
        wx.showToast({
          title: localeCopy.copy_98d4171816,
          icon: 'none'
        });
        return;
      }

      this.setLoading('saveAdmin', true);
      try {
        const payload = this.data.authorizationEnforced && form.id
          ? { id: form.id, name: form.name, adminLevel: form.adminLevel } : form;
        const result = await this.callCloud('saveAdmin', payload);
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_215e3c57da,
            icon: 'none'
          });
          return;
        }

        this.resetAdminForm();
        await this.loadAdminList();
        wx.showToast({
          title: localeCopy.copy_99539c496e,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_215e3c57da,
          icon: 'none'
        });
      } finally {
        this.setLoading('saveAdmin', false);
      }
    },

    async exportAdmins() {
      if (!(this.data.authorizationEnforced ? this.data.canExportAdmins : this.data.canReadAdmins)) {
        return;
      }

      this.setLoading('exportAdmins', true);
      try {
        const result = await this.callCloud('exportAdmins');
        if (result.status !== 'success' || !result.csvContent) {
          wx.showToast({
            title: result.message || localeCopy.copy_2b61466286,
            icon: 'none'
          });
          return;
        }

        const filePath = `${wx.env.USER_DATA_PATH}/admin_info_export_${Date.now()}.csv`;
        writeAndOpen({ filePath, data: result.csvContent, encoding: 'utf8', fileType: 'csv' });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_2b61466286,
          icon: 'none'
        });
      } finally {
        this.setLoading('exportAdmins', false);
      }
    },

    deleteAdmin(e) {
      if (!this.data.canWriteAdmins) {
        return;
      }

      const id = String(e.currentTarget.dataset.id || '');
      const target = (this.data.adminList || []).find((item) => String(item.id) === id);
      if (!id) return;
      if (this.data.authorizationEnforced && !(target && target.canDelete)) return;
      this.setData({
        adminDeleteConfirmVisible: true,
        adminDeleteConfirmId: id,
        adminDeleteConfirmName: target ? target.name : ''
      });
    },

    closeAdminDeleteConfirm() {
      this.setData({
        adminDeleteConfirmVisible: false,
        adminDeleteConfirmId: '',
        adminDeleteConfirmName: ''
      });
    },

    async confirmDeleteAdmin() {
      const id = this.data.adminDeleteConfirmId;
      if (!id) return;
      if (this.data.authorizationEnforced && !(this.data.adminList || []).some(item => item.id === id && item.canDelete)) return;
      this.closeAdminDeleteConfirm();
      try {
        const result = await this.callCloud('deleteAdmin', { id });
        if (result.status !== 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_076bb5d383, icon: 'none' });
          return;
        }
        await this.loadAdminList();
        wx.showToast({ title: localeCopy.copy_ab0b962d3e, icon: 'success' });
      } catch (error) {
        wx.showToast({ title: localeCopy.copy_076bb5d383, icon: 'none' });
      }
    },

    // ─── Publication Management (类别-条款层级架构) ───
  }
});
