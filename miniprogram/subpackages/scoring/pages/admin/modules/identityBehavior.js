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
          throw new Error(result.message || '加载身份类别列表失败');
        }
        this.setData({
          identityList: result.identities || []
        });
      } catch (error) {
        if (!orgSession.isRequestCurrent(this, request) || (error && error.silent)) return;
        console.error('加载身份类别列表失败:', error);
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
          title: '请填写身份类别名称',
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
            title: result.message || '保存身份类别失败',
            icon: 'none'
          });
          return;
        }
  
        this.setData({ identityForm: emptyIdentityForm() });
        await this.loadIdentityList();
        wx.showToast({
          title: '身份类别信息已保存',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '保存身份类别失败',
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
          title: '删除身份类别',
          content: '确认删除这个身份类别吗？',
          confirmText: '确认删除',
          cancelText: '取消',
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
            title: result.message || '删除身份类别失败',
            icon: 'none'
          });
          return;
        }
  
        await this.loadIdentityList();
        this.updateHrFormOptions();
        wx.showToast({
          title: '身份类别已删除',
          icon: 'success'
        });
      } catch (error) {
        wx.showToast({
          title: '删除身份类别失败',
          icon: 'none'
        });
      }
    }
  }
});
