const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/identityBehavior');
// Behavior: identity tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const { emptyIdentityForm } = utils;
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    async loadIdentityList() {
      const request = orgSession.beginRequest(this, 'identityList');
      this.setLoading('identities', true);
      try {
        const result = await this.callCloud('listIdentities');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status !== 'success') {
          throw new Error(result.message || localeCopy.copy_f878df1668);
        }
        this.setData({
          identityList: result.identities || []
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        console.error(localeCopy.copy_b538d2281a, error);
        // 不再显示错误提示，因为空数据库是正常情况
        this.setData({
          identityList: []
        });
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('identities', false);
      }
    },

    onIdentityFieldInput(e) {
      const { field } = e.currentTarget.dataset;
      const rawValue = e.detail.value;
      const value = field === 'description' ? rawValue : rawValue.trim();
      this.setData({
        identityForm: {
          ...this.data.identityForm,
          [field]: value
        }
      });
    },

    startCreateIdentity() {
      this.setData({
        identityForm: emptyIdentityForm(),
        activeTab: 'identities'
      });
    },

    editIdentity(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.identityList[index];
      if (!item) {
        return;
      }
  
      this.setData({
        identityForm: {
          id: item.id,
          name: item.name,
          description: item.description || ''
        },
        activeTab: 'identities'
      });
    },

    async saveIdentity() {
      const form = this.data.identityForm;
      if (!form.name) {
        wx.showToast({
          title: localeCopy.copy_f5b2fb24f1,
          icon: 'none'
        });
        return;
      }
  
      this.setLoading('saveIdentity', true);
      try {
        const result = await this.callCloud('saveIdentity', {
          id: form.id,
          name: form.name,
          description: form.description
        });
  
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_215e3c57da,
            icon: 'none'
          });
          return;
        }
  
        this.setData({ identityForm: emptyIdentityForm() });
        await this.loadIdentityList();
        wx.showToast({
          title: localeCopy.copy_437b04668d,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_215e3c57da,
          icon: 'none'
        });
      } finally {
        this.setLoading('saveIdentity', false);
      }
    },

    async deleteIdentity(e) {
      const { id } = e.currentTarget.dataset;
      if (!id) {
        return;
      }
  
      const confirm = await new Promise((resolve) => {
        wx.showModal({
          title: localeCopy.copy_9167d1395d,
          content: localeCopy.copy_30267845ce,
          confirmText: localeCopy.copy_7f31eec657,
          cancelText: localeCopy.copy_4b213fd88a,
          success: (res) => resolve(!!res.confirm),
          fail: () => resolve(false)
        });
      });
  
      if (!confirm) {
        return;
      }
  
      try {
        const result = await this.callCloud('deleteIdentity', { id });
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || localeCopy.copy_076bb5d383,
            icon: 'none'
          });
          return;
        }
  
        await this.loadIdentityList();
        this.updateHrFormOptions();
        wx.showToast({
          title: localeCopy.copy_e000ed06dd,
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: localeCopy.copy_076bb5d383,
          icon: 'none'
        });
      }
    }
  }
});
