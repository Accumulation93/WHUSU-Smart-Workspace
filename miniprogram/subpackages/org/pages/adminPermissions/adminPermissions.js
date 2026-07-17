const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const adminPermissions = require('../../../../utils/adminPermissions');

function cloneGroups(groups) {
  return (groups || []).map(function(group) {
    const permissions = (group.permissions || []).map(function(item) { return Object.assign({}, item); });
    return Object.assign({}, group, {
      permissions: permissions,
      grantedCount: permissions.filter(function(item) { return item.granted; }).length,
      allGranted: permissions.length > 0 && permissions.every(function(item) { return item.granted; })
    });
  });
}

Page({
  data: {
    loading: true,
    saving: false,
    organizationName: '',
    operatorLevelLabel: '',
    admins: [],
    filteredAdmins: [],
    keyword: '',
    selectedAdmin: null,
    permissionGroups: [],
    editorVisible: false
  },

  onLoad() {
    this._active = true;
    this.setData({ organizationName: wx.getStorageSync('activeOrgName') || '' });
  },

  onShow() {
    const state = orgSession.consume(this);
    if (state.changed) {
      orgSession.invalidateRequests(this);
      this.setData({
        organizationName: wx.getStorageSync('activeOrgName') || '',
        admins: [],
        filteredAdmins: [],
        selectedAdmin: null,
        permissionGroups: [],
        editorVisible: false
      });
    }
    this.loadPage();
  },

  onUnload() {
    this._active = false;
    orgSession.invalidateRequests(this);
  },

  async loadPage() {
    const request = orgSession.beginRequest(this, 'permissionPage');
    this.setData({ loading: true });
    try {
      const profile = await adminPermissions.refreshMyPermissions();
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (!adminPermissions.canAccessPermissionSystem(profile)) {
        wx.showModal({
          title: '无法访问',
          content: '当前账号没有访问权限系统的权限。',
          showCancel: false,
          success: function() { wx.navigateBack(); }
        });
        return;
      }
      const result = await callFunction({ name: 'listPermissionManagedAdmins', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw new Error(result.message || '读取管理员失败');
      const admins = (result.list || []).map(function(item) {
        return Object.assign({}, item, { initial: item.name ? item.name.charAt(0) : '管' });
      });
      this.setData({
        admins: admins,
        filteredAdmins: admins,
        operatorLevelLabel: result.operatorLevel === 'root_admin' ? '至高权限管理员' : '超级管理员'
      });
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) {
        showShortToast(getErrorText(error, '权限系统加载失败'));
      }
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  onKeywordInput(e) {
    const keyword = String(e.detail.value || '').trim().toLowerCase();
    const filteredAdmins = (this.data.admins || []).filter(function(item) {
      return String(item.name || '').toLowerCase().indexOf(keyword) >= 0
        || String(item.studentId || '').toLowerCase().indexOf(keyword) >= 0
        || String(item.adminLevelLabel || '').toLowerCase().indexOf(keyword) >= 0;
    });
    this.setData({ keyword: e.detail.value, filteredAdmins: filteredAdmins });
  },

  clearKeyword() {
    this.setData({ keyword: '', filteredAdmins: this.data.admins });
  },

  async openAdmin(e) {
    if (this.data.saving) return;
    const adminId = e.currentTarget.dataset.id;
    const request = orgSession.beginRequest(this, 'permissionDetail');
    this.setData({ loading: true });
    try {
      const result = await callFunction({ name: 'getAdminPermissionDetail', data: { adminId: adminId } });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw new Error(result.message || '读取权限失败');
      this.setData({
        selectedAdmin: result.admin,
        permissionGroups: cloneGroups(result.groups),
        editorVisible: true
      });
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(error, '读取权限失败'));
    } finally {
      if (this._active && orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  closeEditor() {
    if (this.data.saving) return;
    this.setData({ editorVisible: false, selectedAdmin: null, permissionGroups: [] });
  },

  onPermissionChange(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const permissionIndex = Number(e.currentTarget.dataset.permissionIndex);
    const groups = cloneGroups(this.data.permissionGroups);
    if (!groups[groupIndex] || !groups[groupIndex].permissions[permissionIndex]) return;
    groups[groupIndex].permissions[permissionIndex].granted = Boolean(e.detail.value);
    this.setData({ permissionGroups: cloneGroups(groups) });
  },

  onGroupChange(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const groups = cloneGroups(this.data.permissionGroups);
    if (!groups[groupIndex]) return;
    const granted = Boolean(e.detail.value);
    groups[groupIndex].permissions = groups[groupIndex].permissions.map(function(item) {
      return Object.assign({}, item, { granted: granted });
    });
    this.setData({ permissionGroups: cloneGroups(groups) });
  },

  async savePermissions() {
    if (this.data.saving || !this.data.selectedAdmin) return;
    const permissionMap = {};
    (this.data.permissionGroups || []).forEach(function(group) {
      (group.permissions || []).forEach(function(item) { permissionMap[item.key] = Boolean(item.granted); });
    });
    this.setData({ saving: true });
    try {
      const result = await callFunction({
        name: 'saveAdminPermissions',
        data: { adminId: this.data.selectedAdmin.id, permissions: permissionMap }
      });
      if (result.status !== 'success') throw new Error(result.message || '保存失败');
      showShortToast('权限已生效', 'success');
      this.setData({ permissionGroups: cloneGroups(result.groups), editorVisible: false, selectedAdmin: null });
      await this.loadPage();
    } catch (error) {
      showShortToast(getErrorText(error, '保存权限失败'));
    } finally {
      if (this._active) this.setData({ saving: false });
    }
  },

  onOrgTap() {
    if (this.data.editorVisible) {
      wx.showModal({ title: '存在未保存内容', content: '请先保存或关闭权限配置，再切换组织。', showCancel: false });
      return;
    }
    wx.navigateTo({ url: '/subpackages/org/pages/switch/switch' });
  },

  noop() {}
});
