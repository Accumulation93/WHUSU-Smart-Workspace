// Behavior: adminManagement tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyAdminForm, createLocalInviteCode } = utils;

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
      this.setLoading('admins', true);
      try {
        const result = await this.callCloud('listAdmins');
        this.setData({
          adminList: result.list || [],
          canManageAdmins: !!result.canManage
        });
      } catch (error) {
        wx.showToast({
          title: '加载管理员失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('admins', false);
      }
    },

    onAdminFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const value = field === 'inviteCode'
        ? e.detail.value.trim().toUpperCase()
        : e.detail.value.trim();
  
      this.setData({
        adminForm: {
          ...this.data.adminForm,
          [field]: value
        }
      });
    },

    generateInviteCode() {
      if (!this.data.canManageAdmins) {
        return;
      }
  
      const inviteCode = createLocalInviteCode();
      this.setData({
        adminForm: {
          ...this.data.adminForm,
          inviteCode
        },
        latestInviteCode: inviteCode
      });
  
      wx.showToast({
        title: '邀请码已生成',
        icon: 'success'
      });
    },

    onAdminLevelChange(e) {
      const idx = Number(e.detail.value);
      let adminLevel;
      if (this.data.isRootAdmin) {
        adminLevel = idx === 0 ? 'admin' : (idx === 1 ? 'super_admin' : 'root_admin');
      } else {
        adminLevel = idx === 0 ? 'admin' : 'super_admin';
      }
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
      if (!this.data.canManageAdmins) {
        return;
      }
  
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.adminList[index];
      if (!item) {
        return;
      }
  
      const adminLevel = item.adminLevel || 'admin';
      const idx = this.data.isRootAdmin
        ? (adminLevel === 'root_admin' ? 2 : (adminLevel === 'super_admin' ? 1 : 0))
        : (adminLevel === 'super_admin' ? 1 : 0);
  
      this.setData({
        adminLevelIndex: idx,
        adminForm: {
          id: item.id,
          name: item.name,
          studentId: item.studentId,
          adminLevel,
          inviteCode: item.inviteCode || ''
        },
        latestInviteCode: '',
        activeTab: 'admins'
      });
    },

    resetAdminForm() {
      this.setData({
        adminForm: emptyAdminForm(),
        adminLevelIndex: 0,
        latestInviteCode: ''
      });
    },

    startCreateAdmin() {
      if (!this.data.canManageAdmins) {
        return;
      }
  
      this.resetAdminForm();
      this.setData({ activeTab: 'admins' });
    },

    async saveAdmin() {
      if (!this.data.canManageAdmins) {
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
  
      let inviteCode = String(form.inviteCode || '').trim().toUpperCase();
      if (!inviteCode) {
        inviteCode = createLocalInviteCode();
        this.setData({
          adminForm: {
            ...this.data.adminForm,
            inviteCode
          },
          latestInviteCode: inviteCode
        });
      }
  
      this.setLoading('saveAdmin', true);
      try {
        const result = await this.callCloud('saveAdmin', {
          ...form,
          inviteCode
        });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || '保存失败',
            icon: 'none'
          });
          return;
        }
  
        this.resetAdminForm();
        this.setData({
          latestInviteCode: result.inviteCode || ''
        });
        await this.loadAdminList();
        wx.showToast({
          title: '管理员已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存管理员失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('saveAdmin', false);
      }
    },

    async exportAdmins() {
      if (!this.data.isSuperAdmin && !this.data.isRootAdmin) {
        return;
      }
  
      this.setLoading('exportAdmins', true);
      try {
        const result = await this.callCloud('exportAdmins');
        if (result.status !== 'success' || !result.csvContent) {
          wx.showToast({
            title: result.message || '导出失败',
            icon: 'none'
          });
          return;
        }
  
        const filePath = `${wx.env.USER_DATA_PATH}/admin_info_export_${Date.now()}.csv`;
        await new Promise((resolve, reject) => {
          wx.getFileSystemManager().writeFile({
            filePath,
            data: result.csvContent,
            encoding: 'utf8',
            success: resolve,
            fail: reject
          });
        });
  
        wx.openDocument({
          filePath,
          fileType: 'csv',
          showMenu: true,
          fail: () => {
            wx.showToast({
              title: '已导出到本地文件',
              icon: 'none'
            });
          }
        });
      } catch (error) {
        wx.showToast({
          title: '导出管理员失败',
          icon: 'none'
        });
      } finally {
        this.setLoading('exportAdmins', false);
      }
    },

    deleteAdmin(e) {
      if (!this.data.canManageAdmins) {
        return;
      }
  
      const { id } = e.currentTarget.dataset;
      wx.showModal({
        title: '删除管理员',
        content: '删除后如果没有其他至高权限管理员，将被阻止。是否继续？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          try {
            const result = await this.callCloud('deleteAdmin', { id });
            if (result.status !== 'success') {
              wx.showToast({
                title: result.message || '删除失败',
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
              title: '删除管理员失败',
              icon: 'none'
            });
          }
        }
      });
    },
  
    // ─── Publication Management (类别-条款层级架构) ───
  }
});
