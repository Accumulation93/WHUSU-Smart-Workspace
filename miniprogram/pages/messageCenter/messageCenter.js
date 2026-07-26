const { callFunction, formatAuditTime, showShortToast } = require('../../utils/api');
const orgSession = require('../../utils/orgSession');
const messageScope = require('../../utils/messageScope');
const { activateOrganization } = require('../../utils/organizationActivation');
const { navigateToTrustedRoute } = require('../../utils/trustedNavigation');

const CATEGORY_LABELS = {
  audit: '审核',
  venue: '场地',
  scoring: '考核',
  hr: '人事',
  system: '系统'
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
    partial: false,
    showSwitchDialog: false,
    switchOrganizationName: '',
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
        showShortToast('组织权限已变更');
        this.loadOverview(true);
        return;
      }
      if (result.status !== 'success') throw new Error(result.message || '消息加载失败');

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
        showShortToast('组织权限已变更');
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
      if (!(error && error.silent)) showShortToast('消息加载失败');
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false });
    }
  },

  onOrganizationChange(e) {
    const index = Number(e.detail.value);
    const organization = this.data.organizationOptions[index];
    if (!organization || organization.id === this.data.selectedOrganizationId) return;
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
      loadingMore: false
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
      if (!(error && error.silent)) showShortToast('加载更多失败');
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loadingMore: false });
    }
  },

  findItem(type, id) {
    const source = type === 'notification' ? this.data.notifications : this.data.todos;
    return source.find(function(item) { return item.id === id; }) || null;
  },

  requiresOrganizationSwitch(item) {
    return !!(item && item.organizationId
      && item.organizationId !== String(wx.getStorageSync('activeOrgId') || ''));
  },

  openSwitchDialog(item, type) {
    this._pendingNavigation = { item, type };
    this.setData({
      showSwitchDialog: true,
      switchOrganizationName: item.organizationName || '目标组织'
    });
  },

  closeSwitchDialog() {
    if (this.data.switchingOrganization) return;
    this._pendingNavigation = null;
    this.setData({ showSwitchDialog: false, switchOrganizationName: '' });
  },

  onTodoTap(e) {
    const item = this.findItem('todo', e.currentTarget.dataset.id);
    if (!item) return;
    if (this.requiresOrganizationSwitch(item)) {
      this.openSwitchDialog(item, 'todo');
      return;
    }
    navigateToTrustedRoute(item.targetUrl);
  },

  async markNotificationRead(item) {
    const result = await callFunction({
      name: 'markNotificationRead',
      data: { id: item.id, organizationId: item.organizationId }
    });
    if (result.status !== 'success') throw new Error(result.message || '通知销记失败');
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

  onNotificationTap(e) {
    const item = this.findItem('notification', e.currentTarget.dataset.id);
    if (!item) return;
    if (this.requiresOrganizationSwitch(item)) {
      this.openSwitchDialog(item, 'notification');
      return;
    }
    this.openNotification(item);
  },

  async confirmOrganizationSwitch() {
    const pending = this._pendingNavigation;
    if (!pending || this.data.switchingOrganization) return;
    this.setData({ switchingOrganization: true });
    try {
      const activated = await activateOrganization(pending.item.organizationId);
      this._activeOrgSnapshot = orgSession.getSnapshot();
      this.setData({ showSwitchDialog: false, switchingOrganization: false });
      if (pending.type === 'notification' && !pending.item.isRead) {
        try {
          await this.markNotificationRead(pending.item);
        } catch (_) {
          queuePendingRead(pending.item.organizationId, activated.role, pending.item.id);
        }
      }
      this._pendingNavigation = null;
      navigateToTrustedRoute(pending.item.targetUrl);
    } catch (error) {
      const denied = error && (error.status === 'org_access_denied' || error.status === 'not_found');
      showShortToast(denied ? '组织权限已变更' : '组织切换失败');
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
      if (result.status !== 'success') throw new Error(result.message || '操作失败');
      if (result.partial) this.setData({ partial: true });
    } catch (_) {
      this.setData({ notifications: previous });
      this.loadOverview(true);
      showShortToast('操作失败');
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
      if (result.status !== 'success') throw new Error(result.message || '删除失败');
    } catch (_) {
      this.setData({ notifications: previous });
      this.loadOverview(true);
      showShortToast('删除失败');
    }
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
        if (result.status !== 'success') throw new Error(result.message || '通知销记失败');
      } catch (_) {
        failed.push(id);
      }
    }
    if (failed.length) wx.setStorageSync(key, failed);
    else wx.removeStorageSync(key);
  }
});
