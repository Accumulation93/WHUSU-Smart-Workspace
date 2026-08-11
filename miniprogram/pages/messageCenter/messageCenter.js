const { callFunction, formatAuditTime, showShortToast } = require('../../utils/api');
const orgSession = require('../../utils/orgSession');
const messageScope = require('../../utils/messageScope');
const { activateOrganization } = require('../../utils/organizationActivation');
const authContext = require('../../utils/authContext');
const { navigateToTrustedRoute } = require('../../utils/trustedNavigation');

const CATEGORY_LABELS = {
  audit: '审核',
  venue: '场地',
  scoring: '考核',
  hr: '人事',
  system: '其他'
};

function pendingReadStorageKey(organizationId, role) {
  return 'pendingNotificationReads:' + String(organizationId || '') + ':' + String(role || '');
}

function queuePendingRead(organizationId, role, id) {
  const key = pendingReadStorageKey(organizationId, role);
  const ids = wx.getStorageSync(key) || [];
  if (Array.isArray(ids) && ids.indexOf(id) === -1) {
    ids.push(id);
    wx.setStorageSync(key, ids);
  }
}

Page({
  data: {
    activeTab: 'todos',
    todos: [],
    notifications: [],
    todoTotal: 0,
    notificationTotal: 0,
    unreadCount: 0,
    todoCursor: '',
    notificationCursor: '',
    loading: false,
    loadingMore: false,
    organizationOptions: [{ id: '', name: '全部组织' }],
    selectedOrganizationId: '',
    selectedOrganizationName: '全部组织',
    selectedOrganizationIndex: 0,
    organizationPickerVisible: false,
    pendingOrganizationIndex: 0,
    partial: false,
    showSwitchDialog: false,
    switchOrganizationName: '',
    switchDialogTitle: '切换组织与身份后查看',
    switchingOrganization: false
  },

  onLoad(options) {
    const scope = messageScope.getScope();
    this.setData({
      activeTab: options.tab === 'notifications' ? 'notifications' : 'todos',
      selectedOrganizationId: scope.organizationId,
      selectedOrganizationName: scope.organizationName
    });
  },

  onShow() {
    const state = orgSession.consume(this);
    if (state.changed) {
      orgSession.invalidateRequests(this);
      this._messageRevision = (this._messageRevision || 0) + 1;
    }
    this.loadOverview(true);
    this.retryPendingNotificationReads();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling();
    const that = this;
    this._pollTimer = setInterval(function() { that.loadOverview(true); }, 30000);
  },

  stopPolling() {
    if (!this._pollTimer) return;
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  formatItems(items) {
    return (items || []).map(function(item) {
      return Object.assign({}, item, {
        categoryLabel: CATEGORY_LABELS[item.category] || '通知',
        createdAt: formatAuditTime(item.createdAt)
      });
    });
  },

  buildOrganizationOptions(organizations) {
    return [{ id: '', name: '全部组织', isCurrentOrganization: false }].concat(
      (organizations || []).map(function(item) {
        return {
          id: item.id,
          name: item.name,
          isCurrentOrganization: !!item.isCurrentOrganization
        };
      })
    );
  },

  selectedOrganizationData() {
    return this.data.selectedOrganizationId
      ? { organizationId: this.data.selectedOrganizationId }
      : {};
  },

  async loadOverview(reset) {
    if (this.data.loading || this.data.loadingMore) return;
    const request = orgSession.beginRequest(this, 'messageOverview');
    const revision = this._messageRevision || 0;
    this.setData({ loading: true });
    try {
      const data = Object.assign({ limit: 20 }, this.selectedOrganizationData());
      const result = await callFunction({ name: 'getMessageOverview', data });
      if (!orgSession.isRequestCurrent(this, request)
          || revision !== (this._messageRevision || 0)) return;
      if (result.status === 'org_access_denied' && this.data.selectedOrganizationId) {
        messageScope.resetScope();
        this._messageRevision = (this._messageRevision || 0) + 1;
        this.setData({
          selectedOrganizationId: '',
          selectedOrganizationName: '全部组织',
          selectedOrganizationIndex: 0,
          loading: false
        });
        showShortToast('请重新选择组织或身份');
        this.loadOverview(true);
        return;
      }
      if (result.status !== 'success') throw new Error(result.message || '请稍后刷新');

      const organizationOptions = this.buildOrganizationOptions(result.organizations);
      let selectedIndex = organizationOptions.findIndex((item) => (
        item.id === this.data.selectedOrganizationId
      ));
      if (selectedIndex < 0 && this.data.selectedOrganizationId) {
        messageScope.resetScope();
        this._messageRevision = (this._messageRevision || 0) + 1;
        this.setData({
          selectedOrganizationId: '',
          selectedOrganizationName: '全部组织',
          selectedOrganizationIndex: 0,
          loading: false
        });
        showShortToast('请重新选择组织或身份');
        this.loadOverview(true);
        return;
      }
      if (selectedIndex < 0) selectedIndex = 0;
      const selectedOrganization = organizationOptions[selectedIndex];
      messageScope.setScope(selectedOrganization);

      const todos = result.todos || {};
      const notifications = result.notifications || {};
      this.setData({
        todos: this.formatItems(todos.items),
        notifications: this.formatItems(notifications.items),
        todoTotal: todos.total || 0,
        notificationTotal: notifications.total || 0,
        unreadCount: notifications.unreadCount || 0,
        todoCursor: todos.nextCursor || '',
        notificationCursor: notifications.nextCursor || '',
        organizationOptions,
        selectedOrganizationIndex: selectedIndex,
        selectedOrganizationName: selectedOrganization.name,
        partial: !!result.partial
      });
    } catch (error) {
      if (!(error && error.silent)) showShortToast('请稍后刷新');
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  openOrganizationPicker() {
    this.setData({
      organizationPickerVisible: true,
      pendingOrganizationIndex: this.data.selectedOrganizationIndex
    });
  },

  closeOrganizationPicker() {
    if (this.data.loading) return;
    this.setData({ organizationPickerVisible: false });
  },

  selectOrganizationOption(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.organizationOptions[index]) return;
    this.setData({ pendingOrganizationIndex: index });
  },

  confirmOrganizationPicker() {
    const index = Number(this.data.pendingOrganizationIndex);
    const organization = this.data.organizationOptions[index];
    if (!organization) return;
    this.setData({ organizationPickerVisible: false });
    if (organization.id === this.data.selectedOrganizationId) return;
    messageScope.setScope(organization);
    this._messageRevision = (this._messageRevision || 0) + 1;
    orgSession.invalidateRequests(this);
    this.setData({
      selectedOrganizationId: organization.id,
      selectedOrganizationName: organization.name,
      selectedOrganizationIndex: index,
      todos: [],
      notifications: [],
      todoTotal: 0,
      notificationTotal: 0,
      unreadCount: 0,
      todoCursor: '',
      notificationCursor: '',
      partial: false,
      loading: false,
      loadingMore: false,
      pendingOrganizationIndex: index
    });
    this.loadOverview(true);
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore) return;
    const isNotifications = this.data.activeTab === 'notifications';
    const cursor = isNotifications ? this.data.notificationCursor : this.data.todoCursor;
    if (!cursor) return;
    const request = orgSession.beginRequest(this, isNotifications ? 'messageNotificationsMore' : 'messageTodosMore');
    this.setData({ loadingMore: true });
    try {
      const name = isNotifications ? 'listNotifications' : 'listTodos';
      const data = Object.assign({ limit: 20, cursor }, this.selectedOrganizationData());
      const result = await callFunction({ name, data });
      if (!orgSession.isRequestCurrent(this, request) || result.status !== 'success') return;
      const items = this.formatItems(result.items);
      if (isNotifications) {
        this.setData({
          notifications: this.data.notifications.concat(items),
          notificationTotal: result.total || 0,
          unreadCount: result.unreadCount || 0,
          notificationCursor: result.nextCursor || '',
          partial: !!result.partial
        });
      } else {
        this.setData({
          todos: this.data.todos.concat(items),
          todoTotal: result.total || 0,
          todoCursor: result.nextCursor || '',
          partial: !!result.partial
        });
      }
    } catch (error) {
      if (!(error && error.silent)) showShortToast('请稍后重试');
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loadingMore: false });
    }
  },

  findItem(type, id) {
    const source = type === 'notification' ? this.data.notifications : this.data.todos;
    return source.find(function(item) { return item.id === id; }) || null;
  },

  contextSwitchKind(item) {
    if (!item) return '';
    if (item.organizationId
      && item.organizationId !== String(wx.getStorageSync('activeOrgId') || '')) {
      return 'organization';
    }
    if (item.identityId) {
      return item.identityId !== String(wx.getStorageSync('activeIdentityId') || '')
        ? 'identity'
        : '';
    }
    if (item.contextId) {
      return item.contextId !== String(wx.getStorageSync('activeContextId') || '')
        ? 'identity'
        : '';
    }
    return '';
  },

  openSwitchDialog(item, type) {
    this._pendingNavigation = { item, type };
    const sameOrganization = item.organizationId === String(wx.getStorageSync('activeOrgId') || '');
    this.setData({
      showSwitchDialog: true,
      switchDialogTitle: sameOrganization ? '切换身份后查看' : '切换组织与身份后查看',
      switchOrganizationName: (item.organizationName || '目标组织')
        + (item.identityName ? ' · ' + item.identityName : '')
    });
  },

  closeSwitchDialog() {
    if (this.data.switchingOrganization) return;
    this._pendingNavigation = null;
    this.setData({ showSwitchDialog: false, switchOrganizationName: '' });
  },

  async onTodoTap(e) {
    const item = this.findItem('todo', e.currentTarget.dataset.id);
    if (!item) return;
    const switchKind = this.contextSwitchKind(item);
    if (switchKind === 'organization') {
      this.openSwitchDialog(item, 'todo');
      return;
    }
    if (switchKind === 'identity') {
      await this.activateAndOpen(item, 'todo');
      return;
    }
    navigateToTrustedRoute(item.targetUrl);
  },

  async markNotificationRead(item) {
    const result = await callFunction({
      name: 'markNotificationRead',
      data: { id: item.id, organizationId: item.organizationId }
    });
    if (result.status !== 'success') throw new Error(result.message || '未标记已读，请重试');
  },

  async openNotification(item) {
    if (!item.isRead) {
      this._messageRevision = (this._messageRevision || 0) + 1;
      this.setData({
        notifications: this.data.notifications.map(function(row) {
          return row.id === item.id ? Object.assign({}, row, { isRead: true }) : row;
        }),
        unreadCount: Math.max(0, this.data.unreadCount - 1)
      });
    }
    navigateToTrustedRoute(item.targetUrl);
    if (!item.isRead) {
      try {
        await this.markNotificationRead(item);
      } catch (_) {
        const role = wx.getStorageSync('activeRole') || '';
        queuePendingRead(item.organizationId, role, item.id);
      }
    }
  },

  async onNotificationTap(e) {
    const item = this.findItem('notification', e.currentTarget.dataset.id);
    if (!item) return;
    const switchKind = this.contextSwitchKind(item);
    if (switchKind === 'organization') {
      this.openSwitchDialog(item, 'notification');
      return;
    }
    if (switchKind === 'identity') {
      await this.activateAndOpen(item, 'notification');
      return;
    }
    this.openNotification(item);
  },

  async activateItemContext(item) {
    if (item.organizationId && item.identityId) {
      return authContext.activateSelection(item.organizationId, item.identityId);
    }
    if (item.contextId) return authContext.activateContext(item.contextId);
    return activateOrganization(item.organizationId);
  },

  async activateAndOpen(item, type) {
    try {
      const activated = await this.activateItemContext(item);
      this._activeOrgSnapshot = orgSession.getSnapshot();
      if (type === 'notification' && !item.isRead) {
        try {
          await this.markNotificationRead(item);
        } catch (_) {
          queuePendingRead(
            item.organizationId,
            (activated.selection && activated.selection.identityId) || activated.role || '',
            item.id
          );
        }
      }
      navigateToTrustedRoute(item.targetUrl);
    } catch (error) {
      const denied = error && ['org_access_denied', 'context_forbidden', 'not_found'].indexOf(error.status) >= 0;
      showShortToast(denied ? '请重新选择身份' : '未切换，请重试');
      this.loadOverview(true);
    }
  },

  async confirmOrganizationSwitch() {
    const pending = this._pendingNavigation;
    if (!pending || this.data.switchingOrganization) return;
    this.setData({ switchingOrganization: true });
    try {
      const activated = await this.activateItemContext(pending.item);
      this._activeOrgSnapshot = orgSession.getSnapshot();
      this.setData({ showSwitchDialog: false, switchingOrganization: false });
      if (pending.type === 'notification' && !pending.item.isRead) {
        try {
          await this.markNotificationRead(pending.item);
        } catch (_) {
          queuePendingRead(
            pending.item.organizationId,
            (activated.selection && activated.selection.identityId)
              || (activated.context && activated.context.contextId)
              || activated.role,
            pending.item.id
          );
        }
      }
      this._pendingNavigation = null;
      navigateToTrustedRoute(pending.item.targetUrl);
    } catch (error) {
      const denied = error && (error.status === 'org_access_denied' || error.status === 'not_found');
      showShortToast(denied ? '请重新选择组织' : '未切换，请重试');
      this._pendingNavigation = null;
      this.setData({
        showSwitchDialog: false,
        switchOrganizationName: '',
        switchingOrganization: false
      });
      this.loadOverview(true);
    }
  },

  async markAllRead() {
    if (!this.data.unreadCount) return;
    const previous = this.data.notifications;
    this._messageRevision = (this._messageRevision || 0) + 1;
    this.setData({
      unreadCount: 0,
      notifications: previous.map(function(item) {
        return Object.assign({}, item, { isRead: true });
      })
    });
    try {
      const result = await callFunction({
        name: 'markAllNotificationsRead',
        data: this.selectedOrganizationData()
      });
      if (result.status !== 'success') throw new Error(result.message || '未完成，请重试');
      if (result.partial) this.setData({ partial: true });
    } catch (_) {
      this.setData({ notifications: previous });
      this.loadOverview(true);
      showShortToast('未完成，请重试');
    }
  },

  async deleteNotification(e) {
    const item = this.findItem('notification', e.currentTarget.dataset.id);
    if (!item) return;
    const previous = this.data.notifications;
    this._messageRevision = (this._messageRevision || 0) + 1;
    this.setData({
      notifications: previous.filter(function(row) { return row.id !== item.id; }),
      notificationTotal: Math.max(0, this.data.notificationTotal - 1),
      unreadCount: item.isRead ? this.data.unreadCount : Math.max(0, this.data.unreadCount - 1)
    });
    try {
      const result = await callFunction({
        name: 'deleteNotification',
        data: { id: item.id, organizationId: item.organizationId }
      });
      if (result.status !== 'success') throw new Error(result.message || '未删除，请重试');
    } catch (_) {
      this.setData({ notifications: previous });
      this.loadOverview(true);
      showShortToast('未删除，请重试');
    }
  },

  deleteAllNotifications() {
    if (!this.data.notificationTotal) return;
    wx.showModal({
      title: '清除全部通知',
      content: '将清除当前可见组织范围内的全部通知，待我审批事项不受影响。',
      confirmText: '全部清除',
      confirmColor: '#dc2626',
      success: async (result) => {
        if (!result.confirm) return;
        const previous = this.data.notifications;
        this._messageRevision = (this._messageRevision || 0) + 1;
        this.setData({ notifications: [], notificationTotal: 0, unreadCount: 0 });
        try {
          const response = await callFunction({
            name: 'deleteAllNotifications',
            data: this.selectedOrganizationData()
          });
          if (response.status !== 'success') throw new Error(response.message || '未清除，请重试');
          if (response.partial) this.setData({ partial: true });
        } catch (_) {
          this.setData({ notifications: previous });
          this.loadOverview(true);
          showShortToast('未清除，请重试');
        }
      }
    });
  },

  async retryPendingNotificationReads() {
    const orgId = wx.getStorageSync('activeOrgId') || '';
    const role = wx.getStorageSync('activeRole') || '';
    const key = pendingReadStorageKey(orgId, role);
    const ids = wx.getStorageSync(key) || [];
    if (!Array.isArray(ids) || !ids.length) return;
    const failed = [];
    for (const id of ids) {
      try {
        const result = await callFunction({
          name: 'markNotificationRead',
          data: { id, organizationId: orgId }
        });
        if (result.status !== 'success') throw new Error(result.message || '未标记已读，请重试');
      } catch (_) {
        failed.push(id);
      }
    }
    if (failed.length) wx.setStorageSync(key, failed);
    else wx.removeStorageSync(key);
  },

  noop() {}
});
