const { callFunction, showShortToast, getErrorText } = require('../../../../utils/api');
const eventBus = require('../../../../utils/eventBus');
const orgSession = require('../../../../utils/orgSession');

const STORAGE_KEY = 'roleProfiles';

function readCachedOrganizations(role) {
  const roleCached = wx.getStorageSync('availableOrgs:' + role);
  if (Array.isArray(roleCached)) return roleCached;
  const cached = wx.getStorageSync('availableOrgs');
  return Array.isArray(cached)
    ? cached.filter((item) => !item.role || item.role === role)
    : [];
}

function saveRoleProfile(role, user) {
  if (!role || !user) return;
  const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
  roleProfiles[role] = Object.assign({}, roleProfiles[role] || {}, user);
  wx.setStorageSync(STORAGE_KEY, roleProfiles);
}

Page({
  data: {
    organizations: [],
    activeOrgId: '',
    activeOrgName: '',
    activeRole: 'user',
    roleLabel: '普通用户',
    loading: true,
    refreshing: false,
    switchingOrgId: '',
    skeletonRows: [1, 2, 3]
  },

  onLoad() {
    this._isActive = true;
    const activeRole = wx.getStorageSync('activeRole') === 'admin' ? 'admin' : 'user';
    const cachedOrganizations = readCachedOrganizations(activeRole);
    this.setData({
      organizations: cachedOrganizations,
      activeOrgId: wx.getStorageSync('activeOrgId') || '',
      activeOrgName: wx.getStorageSync('activeOrgName') || '',
      activeRole,
      roleLabel: activeRole === 'admin' ? '管理端' : '普通用户端',
      loading: cachedOrganizations.length === 0,
      refreshing: cachedOrganizations.length > 0
    });
  },

  onShow() {
    this.loadOrganizations();
  },

  onUnload() {
    this._isActive = false;
    this._loadRequestId = (this._loadRequestId || 0) + 1;
  },

  async loadOrganizations() {
    const requestId = (this._loadRequestId || 0) + 1;
    this._loadRequestId = requestId;
    const activeRole = this.data.activeRole;
    const apiName = activeRole === 'admin' ? 'admin/listMyOrganizations' : 'listMyOrganizations';

    this.setData({
      loading: this.data.organizations.length === 0,
      refreshing: this.data.organizations.length > 0
    });

    try {
      const result = await callFunction({ name: apiName });
      if (requestId !== this._loadRequestId) return;

      if (result.status !== 'success') {
        showShortToast(result.message || '加载失败');
        return;
      }

      const organizations = Array.isArray(result.organizations) ? result.organizations : [];
      const active = organizations.find((item) => item.id === this.data.activeOrgId) || null;
      wx.setStorageSync('availableOrgs', organizations);
      wx.setStorageSync('availableOrgs:' + activeRole, organizations);
      this.setData({
        organizations,
        activeOrgName: active ? active.name : this.data.activeOrgName
      });
      if (active && active.name !== wx.getStorageSync('activeOrgName')) {
        wx.setStorageSync('activeOrgName', active.name);
      }
    } catch (error) {
      if (requestId === this._loadRequestId) {
        console.error('[组织列表] 加载失败', error);
        showShortToast(getErrorText(error, '加载组织失败'));
      }
    } finally {
      if (this._isActive && requestId === this._loadRequestId) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },

  async onOrgTap(e) {
    if (this.data.switchingOrgId) return;
    const index = Number(e.currentTarget.dataset.index);
    const organization = this.data.organizations[index];
    if (!organization) return;

    if (organization.id === this.data.activeOrgId) {
      wx.navigateBack();
      return;
    }

    this.setData({ switchingOrgId: organization.id });
    try {
      const result = await callFunction({
        name: 'activateOrganization',
        data: { organizationId: organization.id, role: this.data.activeRole }
      });
      if (result.status !== 'success' || !result.activeOrg) {
        showShortToast(result.message || '切换失败');
        return;
      }

      const activeOrg = result.activeOrg;
      saveRoleProfile(this.data.activeRole, result.user);
      const contextResult = orgSession.commitContext({
        orgId: activeOrg.id,
        orgName: activeOrg.name,
        role: this.data.activeRole
      });
      this.setData({
        activeOrgId: activeOrg.id,
        activeOrgName: activeOrg.name
      });
      eventBus.emit('org:changed', {
        orgId: activeOrg.id,
        orgName: activeOrg.name,
        role: this.data.activeRole,
        orgVersion: contextResult.version,
        user: result.user || null
      });
      showShortToast('组织已切换', 'success');
      this._isActive = false;
      wx.navigateBack();
    } catch (error) {
      console.error('[组织切换] 请求失败', error);
      showShortToast(getErrorText(error, '切换组织失败'));
    } finally {
      if (this._isActive) {
        this.setData({ switchingOrgId: '' });
      }
    }
  }
});
