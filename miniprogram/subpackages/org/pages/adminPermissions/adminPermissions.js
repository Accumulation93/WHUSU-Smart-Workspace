const localeCopy = require('../../../../locales/zh-CN/generated/subpackages/org/pages/adminPermissions/adminPermissions');
const { callFunction, getErrorText, showShortToast } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const adminPermissions = require('../../../../utils/adminPermissions');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');

function cloneGroups(groups) {
  return (groups || []).map(function(group) {
    const permissions = (group.permissions || []).map(function(item) { return Object.assign({}, item); });
    const editablePermissions = permissions.filter(function(item) { return item.editable; });
    return Object.assign({}, group, {
      permissions: permissions,
      grantedCount: permissions.filter(function(item) { return item.granted; }).length,
      editableCount: editablePermissions.length,
      allGranted: editablePermissions.length > 0 && editablePermissions.every(function(item) { return item.granted; })
    });
  });
}

Page({
  data: {
    localeCopy,
    loading: true,
    saving: false,
    organizationName: '',
    operatorLevelLabel: '',
    admins: [],
    filteredAdmins: [],
    keyword: '',
    selectedAdmin: null,
    permissionGroups: [],
    editorVisible: false,
    contextSwitchGuardVisible: false
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });
    this._active = true;
    this.setData({ organizationName: orgSession.getSnapshot().orgName || '' });
  },

  onShow() {
    const state = orgSession.consume(this);
    if (state.changed) {
      orgSession.invalidateRequests(this);
      this.setData({
        organizationName: state.snapshot.orgName || '',
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
          title: localeCopy.copy_58460e829b,
          content: localeCopy.copy_e3a7655873,
          showCancel: false,
          success: function() { wx.navigateBack(); }
        });
        return;
      }
      const result = await callFunction({ name: 'listPermissionManagedAdmins', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (result.status !== 'success') throw new Error(result.message || localeCopy.copy_e52119b17e);
      const admins = (result.list || []).slice();
      this.setData({
        admins: admins,
        filteredAdmins: admins,
        operatorLevelLabel: result.operatorLevel === 'super_admin' ? localeCopy.copy_ccd219e5f1 : localeCopy.copy_1557b96093
      });
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) {
        showShortToast(getErrorText(error, localeCopy.copy_e52119b17e));
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
      if (result.status !== 'success') throw new Error(result.message || localeCopy.copy_e52119b17e);
      this.setData({
        selectedAdmin: result.admin,
        permissionGroups: cloneGroups(result.groups),
        editorVisible: true
      });
    } catch (error) {
      if (orgSession.isRequestCurrent(this, request)) showShortToast(getErrorText(error, localeCopy.copy_e52119b17e));
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
    if (!groups[groupIndex].permissions[permissionIndex].editable) return;
    groups[groupIndex].permissions[permissionIndex].granted = Boolean(e.detail.value);
    const changed = groups[groupIndex].permissions[permissionIndex];
    if (changed.key === 'system.admin_accounts.write' && changed.granted) {
      const readPermission = groups[groupIndex].permissions.find(function(item) {
        return item.key === 'system.admin_accounts.read';
      });
      if (readPermission && readPermission.editable) readPermission.granted = true;
    }
    this.setData({ permissionGroups: cloneGroups(groups) });
  },

  onGroupChange(e) {
    const groupIndex = Number(e.currentTarget.dataset.groupIndex);
    const groups = cloneGroups(this.data.permissionGroups);
    if (!groups[groupIndex]) return;
    if (!groups[groupIndex].editableCount) return;
    const granted = Boolean(e.detail.value);
    groups[groupIndex].permissions = groups[groupIndex].permissions.map(function(item) {
      return item.editable ? Object.assign({}, item, { granted: granted }) : item;
    });
    this.setData({ permissionGroups: cloneGroups(groups) });
  },

  async savePermissions() {
    if (this.data.saving || !this.data.selectedAdmin) return;
    const permissionMap = {};
    (this.data.permissionGroups || []).forEach(function(group) {
      (group.permissions || []).forEach(function(item) {
        if (item.editable) permissionMap[item.key] = Boolean(item.granted);
      });
    });
    this.setData({ saving: true });
    try {
      const result = await callFunction({
        name: 'saveAdminPermissions',
        data: { adminId: this.data.selectedAdmin.id, permissions: permissionMap }
      });
      if (result.status !== 'success') throw new Error(result.message || localeCopy.copy_215e3c57da);
      showShortToast(localeCopy.copy_e47065f3f1, 'success');
      this.setData({ permissionGroups: cloneGroups(result.groups), editorVisible: false, selectedAdmin: null });
      await this.loadPage();
    } catch (error) {
      showShortToast(getErrorText(error, localeCopy.copy_215e3c57da));
    } finally {
      if (this._active) this.setData({ saving: false });
    }
  },

  onOrgTap() {
    if (this.data.editorVisible) {
      this.setData({ contextSwitchGuardVisible: true });
      return;
    }
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
  },

  closeContextSwitchGuard() {
    this.setData({ contextSwitchGuardVisible: false });
  },

  noop() {}
});
