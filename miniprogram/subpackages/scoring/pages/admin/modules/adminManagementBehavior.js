const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/adminManagementBehavior');
// Behavior: adminManagement tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyAdminForm } = utils;
const { writeAndOpen } = require('../../../../../utils/filePreview');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    filterAdminCandidates(keyword) {
      const text = String(keyword || '').trim().toLowerCase();
      const sourceList = this.data.hrList || [];
  
      if (!text) {
        return sourceList;
      }
  
      return sourceList.filter((item) => {
        const fields = [
          item.name,
          item.studentId,
          item.department,
          item.identity,
          item.workGroup
        ].map((value) => String(value || '').toLowerCase());
  
        return fields.some((value) => value.indexOf(text) !== -1);
      });
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
      const index = Number(e.currentTarget.dataset.index);
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

    editAdmin(e) {
      if (!this.data.canWriteAdmins) {
        return;
      }
  
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.adminList[index];
      if (!item || !item.canManage) {
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
      if (!this.data.canWriteAdmins) {
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
      if (!form.name || !form.studentId) {
        wx.showToast({
          title: localeCopy.copy_98d4171816,
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveAdmin', true);
      try {
        const result = await this.callCloud('saveAdmin', form);
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
      if (!this.data.canReadAdmins) {
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
