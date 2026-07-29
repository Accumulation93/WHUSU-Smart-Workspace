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
          title: '请稍后刷新管理员',
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
          name: item.name,
          studentId: item.studentId
        }
      });
  
      wx.showToast({
        title: '已填入管理员信息',
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
          name: item.name,
          studentId: item.studentId,
          adminLevel
        },
        activeTab: 'admins'
      });
    },

    resetAdminForm() {
      const form = emptyAdminForm();
      form.adminLevel = this.data.adminLevelValues[0] || 'admin';
      this.setData({
        adminForm: form,
        adminLevelIndex: 0
      });
    },

    startCreateAdmin() {
      if (!this.data.canWriteAdmins) {
        return;
      }
  
      this.resetAdminForm();
      this.setData({ activeTab: 'admins' });
    },

    async saveAdmin() {
      if (!this.data.canWriteAdmins) {
        return;
      }
  
      const form = this.data.adminForm;
      if (!form.name || !form.studentId) {
        wx.showToast({
          title: '请填写管理员姓名和学号',
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveAdmin', true);
      try {
        const result = await this.callCloud('saveAdmin', form);
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '未保存，请重试',
            icon: 'none'
          });
          return;
        }
  
        this.resetAdminForm();
        await this.loadAdminList();
        wx.showToast({
          title: '管理员已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '未保存，请重试',
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
            title: result.message || '未导出，请重试',
            icon: 'none'
          });
          return;
        }
  
        const filePath = `${wx.env.USER_DATA_PATH}/admin_info_export_${Date.now()}.csv`;
        writeAndOpen({ filePath, data: result.csvContent, encoding: 'utf8', fileType: 'csv' });
      } catch (error) {
        wx.showToast({
          title: '未导出，请重试',
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
  
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除管理员',
        content: '删除后该账号将无法继续登录。是否继续？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          try {
            const result = await this.callCloud('deleteAdmin', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '未删除，请重试',
                icon: 'none'
              });
              return;
            }
            await this.loadAdminList();
            wx.showToast({
              title: '管理员已删除',
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
  
    // ─── Publication Management (类别-条款层级架构) ───
  }
});
