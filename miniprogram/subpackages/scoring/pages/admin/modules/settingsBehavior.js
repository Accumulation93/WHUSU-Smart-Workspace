// Behavior: settings tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    applySystemDefaultOrganization(organizationId, organizationName) {
      this.setData({
        currentOrganizationId: organizationId,
        currentOrganizationName: organizationName
      });
    },

    async loadSystemConfig() {
      const request = orgSession.beginRequest(this, 'systemConfig');
      this.setLoading('settings', true);
      try {
        const result = await this.callCloud('getSystemConfig');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status === 'success' && result.config) {
          const timezone = result.config.timezone;
          const timezoneIndex = this.data.timezoneOptions.findIndex(function (item) {
            return item.value === timezone;
          });
          this.setData({
            systemConfig: { timezone: timezone },
            timezoneIndex: timezoneIndex >= 0 ? timezoneIndex : 20,
            currentOrganizationId: result.config.currentOrganization || null
          });
          this.resolveCurrentOrganizationName();
        }
      } catch (e) {
        if (!orgSession.isRequestCurrent(this, request) || (e && e.silent)) return;
        console.error('loadSystemConfig error:', e);
      } finally {
        if (orgSession.isRequestCurrent(this, request)) this.setLoading('settings', false);
      }
    },

    onTimezoneChange(e) {
      const idx = Number(e.detail.value);
      const option = this.data.timezoneOptions[idx];
      if (option) {
        this.setData({
          timezoneIndex: idx,
          systemConfig: { timezone: option.value }
        });
      }
    },

    async saveSystemConfig() {
      this.setLoading('saveSystemConfig', true);
      try {
        const result = await this.callCloud('saveSystemConfig', {
          timezone: this.data.systemConfig.timezone
        });
        if (result.status === 'success') {
          wx.showToast({ title: '配置已保存', icon: 'success' });
        } else {
          wx.showToast({ title: result.message || '保存失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
      this.setLoading('saveSystemConfig', false);
    },

    async loadOrganizations() {
      if (!this.data.isRootAdmin) return;
      const request = orgSession.beginRequest(this, 'organizationList');
      try {
        const result = await this.callCloud('listOrganizations');
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (result.status === 'success') {
          this.setData({ organizationList: result.list || [] });
          this.resolveCurrentOrganizationName();
        }
      } catch (e) {
        if (!orgSession.isRequestCurrent(this, request) || (e && e.silent)) return;
        console.error('loadOrganizations error:', e);
      }
    },

    resolveCurrentOrganizationName() {
      const orgId = this.data.currentOrganizationId;
      if (!orgId) {
        this.setData({ currentOrganizationName: '' });
        return;
      }
      const org = this.data.organizationList.find(function (o) { return o.id === orgId; });
      this.setData({ currentOrganizationName: org ? org.name : '' });
    },

    openOrgForm(e) {
      const id = e && e.currentTarget && e.currentTarget.dataset.id;
      if (id) {
        const org = this.data.organizationList.find(function (o) { return o.id === id; });
        this.setData({ orgFormVisible: true, orgFormData: { id, name: org ? org.name : '' } });
      } else {
        this.setData({ orgFormVisible: true, orgFormData: { name: '' } });
      }
    },

    closeOrgForm() {
      this.setData({ orgFormVisible: false, orgFormData: { name: '' } });
    },

    onOrgFieldInput(e) {
      this.setData({
        orgFormData: { ...this.data.orgFormData, name: e.detail.value.trim() }
      });
    },

    async saveOrganization() {
      if (!this.data.orgFormData.name) {
        wx.showToast({ title: '请填写组织名称', icon: 'none' });
        return;
      }
      this.setLoading('saveOrganization', true);
      try {
        const result = await this.callCloud('saveOrganization', this.data.orgFormData);
        if (result.status === 'success') {
          wx.showToast({ title: '组织已保存', icon: 'success' });
          this.closeOrgForm();
          await this.loadOrganizations();
        } else {
          wx.showToast({ title: result.message || '保存失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '保存组织失败', icon: 'none' });
      }
      this.setLoading('saveOrganization', false);
    },

    async deleteOrganization(e) {
      const organizationId = e.currentTarget.dataset.id;
      if (!organizationId) return;
      const confirm = await new Promise(function (resolve) {
        wx.showModal({
          title: '删除组织',
          content: '删除后将清除该组织的所有数据，不可恢复。确认删除？',
          confirmText: '删除',
          cancelText: '取消',
          success: function (res) { resolve(res.confirm); }
        });
      });
      if (!confirm) return;
      this.setLoading('deleteOrganization', true);
      wx.showLoading({ title: '正在删除组织...', mask: true });
      try {
        const result = await this.callCloud('deleteOrganization', { organizationId });
        if (result.status === 'success') {
          wx.showToast({ title: '组织已删除', icon: 'success' });
          await this.loadOrganizations();
        } else {
          wx.showToast({ title: result.message || '删除失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '删除组织失败', icon: 'none' });
      }
      wx.hideLoading();
      this.setLoading('deleteOrganization', false);
    },

    async switchOrganization(e) {
      const { id, name } = e.currentTarget.dataset;
      if (!id || !name) return;
      const confirm = await new Promise(function (resolve) {
        wx.showModal({
          title: '修改系统默认组织',
          content: '此操作会将「' + name + '」设为全系统默认组织，并影响其他用户后续登录。确认继续？',
          confirmText: '设为默认',
          cancelText: '取消',
          success: function (res) { resolve(res.confirm); }
        });
      });
      if (!confirm) return;
  
      this.setLoading('switchOrganization', true);
      wx.showLoading({ title: '正在修改默认组织...', mask: true });
  
      try {
        const result = await this.callCloud('switchOrganization', {
          organizationId: id,
          organizationName: name
        });
        if (result.status === 'success') {
          wx.showToast({ title: result.message || '切换成功', icon: 'success' });
          this.applySystemDefaultOrganization(id, name);
        } else {
          wx.showToast({ title: result.message || '切换失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '切换组织失败', icon: 'none' });
      }
      wx.hideLoading();
      this.setLoading('switchOrganization', false);
    },

    async createAndSwitchOrganization() {
      if (!this.data.orgFormData.name) {
        wx.showToast({ title: '请填写组织名称', icon: 'none' });
        return;
      }
      const organizationName = this.data.orgFormData.name;
      const confirm = await new Promise(function (resolve) {
        wx.showModal({
          title: '新建并设为默认',
          content: '将创建「' + organizationName + '」并设为全系统默认组织，这会影响其他用户后续登录。确认继续？',
          confirmText: '确认',
          cancelText: '取消',
          success: function (res) { resolve(res.confirm); }
        });
      }.bind(this));
      if (!confirm) return;
  
      this.setLoading('switchOrganization', true);
      wx.showLoading({ title: '正在创建默认组织...', mask: true });
  
      try {
        // 第一步：创建组织。
        const saveResult = await this.callCloud('saveOrganization', { name: organizationName });
        if (saveResult.status !== 'success') {
          wx.hideLoading();
          wx.showToast({ title: saveResult.message || '创建组织失败', icon: 'none' });
          this.setLoading('switchOrganization', false);
          return;
        }
  
        // 第二步：切换系统组织并刷新当前管理上下文。
        const result = await this.callCloud('switchOrganization', {
          organizationId: saveResult.organization.id,
          organizationName
        });
        if (result.status === 'success') {
          wx.showToast({ title: result.message || '切换成功', icon: 'success' });
          this.closeOrgForm();
          this.applySystemDefaultOrganization(saveResult.organization.id, organizationName);
        } else {
          wx.showToast({ title: result.message || '切换失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '切换失败，请重试', icon: 'none' });
      }
      wx.hideLoading();
      this.setLoading('switchOrganization', false);
    }
  }
});
