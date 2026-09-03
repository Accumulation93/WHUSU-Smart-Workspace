const localeCopy = require('../../../../../locales/zh-CN/generated/subpackages/scoring/pages/admin/modules/settingsBehavior');
// Behavior: settings tab — auto-extracted from admin.js
// Zero functional changes. All methods preserved exactly.
const utils = require('./adminUtils');
const orgSession = require('../../../../../utils/orgSession');
const dateTime = require('../../../../../utils/dateTime');

module.exports = Behavior({
  methods: {
    applySystemDefaultOrganization(organizationId, organizationName) {
      this.setData({
        systemDefaultOrganizationId: organizationId,
        systemDefaultOrganizationName: organizationName
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
            systemDefaultOrganizationId: result.config.currentOrganization || null
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
          dateTime.setSystemTimezoneConfig(result.systemTimezoneOffset, result.timezoneConfigVersion);
          wx.showToast({ title: localeCopy.copy_c1add6c36e, icon: 'success' });
        } else {
          wx.showToast({ title: result.message || localeCopy.copy_215e3c57da, icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: localeCopy.copy_215e3c57da, icon: 'none' });
      }
      this.setLoading('saveSystemConfig', false);
    },

    async loadOrganizations() {
      if (!this.data.isSuperAdmin) return;
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
      const orgId = this.data.systemDefaultOrganizationId;
      if (!orgId) {
        this.setData({ systemDefaultOrganizationName: '' });
        return;
      }
      const org = this.data.organizationList.find(function (o) { return o.id === orgId; });
      this.setData({ systemDefaultOrganizationName: org ? org.name : '' });
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
        wx.showToast({ title: localeCopy.copy_a032183564, icon: 'none' });
        return;
      }
      this.setLoading('saveOrganization', true);
      try {
        const result = await this.callCloud('saveOrganization', this.data.orgFormData);
        if (result.status === 'success') {
          wx.showToast({ title: localeCopy.copy_d41345ef29, icon: 'success' });
          this.closeOrgForm();
          await this.loadOrganizations();
        } else {
          wx.showToast({ title: result.message || localeCopy.copy_215e3c57da, icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: localeCopy.copy_215e3c57da, icon: 'none' });
      }
      this.setLoading('saveOrganization', false);
    },

    async deleteOrganization(e) {
      const organizationId = e.currentTarget.dataset.id;
      if (!organizationId) return;
      const confirm = await new Promise(function (resolve) {
        wx.showModal({
          title: localeCopy.copy_96a69f21ff,
          content: localeCopy.copy_c1360f875d,
          confirmText: localeCopy.copy_292043f789,
          cancelText: localeCopy.copy_4b213fd88a,
          success: function (res) { resolve(res.confirm); }
        });
      });
      if (!confirm) return;
      this.setLoading('deleteOrganization', true);
      wx.showLoading({ title: localeCopy.copy_7946938ca9, mask: true });
      try {
        const result = await this.callCloud('deleteOrganization', { organizationId });
        if (result.status === 'success') {
          wx.showToast({ title: localeCopy.copy_770ca6e54d, icon: 'success' });
          await this.loadOrganizations();
        } else {
          wx.showToast({ title: result.message || localeCopy.copy_076bb5d383, icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: localeCopy.copy_076bb5d383, icon: 'none' });
      }
      wx.hideLoading();
      this.setLoading('deleteOrganization', false);
    },

    async switchOrganization(e) {
      const { id, name } = e.currentTarget.dataset;
      if (!id || !name) return;
      const confirm = await new Promise(function (resolve) {
        wx.showModal({
          title: localeCopy.copy_a58d703333,
          content: localeCopy.copy_e7e3787584 + name + '」。',
          confirmText: localeCopy.copy_6616a4de3c,
          cancelText: localeCopy.copy_4b213fd88a,
          success: function (res) { resolve(res.confirm); }
        });
      });
      if (!confirm) return;
  
      this.setLoading('switchOrganization', true);
      wx.showLoading({ title: localeCopy.copy_0ff87aff65, mask: true });
  
      try {
        const result = await this.callCloud('switchOrganization', {
          organizationId: id,
          organizationName: name
        });
        if (result.status === 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_0a1deb4187, icon: 'success' });
          this.applySystemDefaultOrganization(id, name);
        } else {
          wx.showToast({ title: result.message || localeCopy.copy_53d5e0a0c8, icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: localeCopy.copy_53d5e0a0c8, icon: 'none' });
      }
      wx.hideLoading();
      this.setLoading('switchOrganization', false);
    },

    async createAndSwitchOrganization() {
      if (!this.data.orgFormData.name) {
        wx.showToast({ title: localeCopy.copy_a032183564, icon: 'none' });
        return;
      }
      const organizationName = this.data.orgFormData.name;
      const confirm = await new Promise(function (resolve) {
        wx.showModal({
          title: localeCopy.copy_fcc6193afc,
          content: localeCopy.copy_e7e3787584 + organizationName + '」。',
          confirmText: localeCopy.copy_d5f0842283,
          cancelText: localeCopy.copy_4b213fd88a,
          success: function (res) { resolve(res.confirm); }
        });
      }.bind(this));
      if (!confirm) return;
  
      this.setLoading('switchOrganization', true);
      wx.showLoading({ title: localeCopy.copy_4706701186, mask: true });
  
      try {
        // 第一步：创建组织。
        const saveResult = await this.callCloud('saveOrganization', { name: organizationName });
        if (saveResult.status !== 'success') {
          wx.hideLoading();
          wx.showToast({ title: saveResult.message || localeCopy.copy_b3614bb93e, icon: 'none' });
          this.setLoading('switchOrganization', false);
          return;
        }
  
        // 第二步：切换系统组织并刷新当前管理上下文。
        const result = await this.callCloud('switchOrganization', {
          organizationId: saveResult.organization.id,
          organizationName
        });
        if (result.status === 'success') {
          wx.showToast({ title: result.message || localeCopy.copy_0a1deb4187, icon: 'success' });
          this.closeOrgForm();
          this.applySystemDefaultOrganization(saveResult.organization.id, organizationName);
        } else {
          wx.showToast({ title: result.message || localeCopy.copy_53d5e0a0c8, icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: localeCopy.copy_53d5e0a0c8, icon: 'none' });
      }
      wx.hideLoading();
      this.setLoading('switchOrganization', false);
    }
  }
});
