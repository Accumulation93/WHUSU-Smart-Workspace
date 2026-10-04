const { callFunction, formatAuditTime, showShortToast, recordMessageRender } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const messageScope = require('../../../../utils/messageScope');
const { activateOrganization } = require('../../../../utils/organizationActivation');
const authContext = require('../../../../utils/authContext');
const notificationReceipt = require('../../../../utils/notificationNavigationReceipt');
const {
  navigateToTrustedRoute,
  reLaunchPortalThenNavigate
} = require('../../../../utils/trustedNavigation');
const { messageCenter: copy } = require('../../../../locales/zh-CN/main');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');

const CATEGORY_LABELS = copy.categoryLabels;

function pendingReadStorageKey(organizationId, role) {
  return 'pendingNotificationReads:' + String(organizationId || '') + ':' + String(role || '');
}

function queuePendingRead(organizationId, role, id) {
  try {
    const key = pendingReadStorageKey(organizationId, role);
    const ids = wx.getStorageSync(key) || [];
    if (Array.isArray(ids) && ids.indexOf(id) === -1) {
      ids.push(id);
      wx.setStorageSync(key, ids);
    }
  } catch (_) {
    // 已读写入失败不能阻断用户打开目标；下一次列表刷新仍会显示服务端真实状态。
  }
}

function isPartialBulkResult(result) {
  return !!(result && (
    result.partial
    || (Array.isArray(result.failedOrganizations) && result.failedOrganizations.length)
    || (Array.isArray(result.failures) && result.failures.length)
  ));
}

Page({
  // 顶栏高度：顶栏自绘后 100vh 是整屏高度，横竖屏切换要重算页面容器的补偿高度。
  applyNavigationBarMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onResize() {
    this.applyNavigationBarMetrics();
  },

  data: {
    navigationTitle: copy.navigationTitle,
    navTopPx: 0,
    performanceCopy: require('../../../../locales/zh-CN/messagePerformance'),
    copy: copy.view,
    isAdminRole: false,
    activeTab: 'todos',
    todos: [],
    notifications: [],
    todoTotal: 0,
    notificationTotal: 0,
    unreadCount: 0,
    todoCursor: '',
    notificationCursor: '',
    loading: false,
    todoLoading: false,
    notificationLoading: false,
    todoError: false,
    notificationError: false,
    loadingMore: false,
    organizationOptions: [{ id: '', name: copy.messages.allOrganizations }],
    selectedOrganizationId: '',
    selectedOrganizationName: copy.messages.allOrganizations,
    selectedOrganizationIndex: 0,
    organizationPickerVisible: false,
    pendingOrganizationIndex: 0,
    partial: false,
    showSwitchDialog: false,
    switchOrganizationName: '',
    switchDialogTitle: copy.messages.switchOrganizationAndWorkContext,
    switchingOrganization: false
  },

  onLoad(options) {
    this.applyNavigationBarMetrics();
    const scope = messageScope.getScope();
    this.setData({
      activeTab: options.tab === 'notifications' ? 'notifications' : 'todos',
      selectedOrganizationId: scope.organizationId,
      selectedOrganizationName: scope.organizationName
    });
  },

  onShow() {
    this._isPageVisible = true;
    const state = orgSession.consume(this);
    const isAdminRole = state.snapshot.role === 'admin';
    if (state.changed) {
      this._todoFingerprint = ''; this._notificationFingerprint = '';
      this.setData({ todos: [], notifications: [], todoTotal: 0, notificationTotal: 0, unreadCount: 0 });
      orgSession.invalidateRequests(this);
      this._messageRevision = (this._messageRevision || 0) + 1;
    }
    if (this.data.isAdminRole !== isAdminRole) this.setData({ isAdminRole });
    this.loadOverview(true);
    this.retryPendingNotificationReads();
    this.startPolling();
  },

  onHide() {
    this._isPageVisible = false;
    orgSession.invalidateRequests(this);
    this._overviewPromise = null;
    this.stopPolling();
  },

  onUnload() {
    this._isPageVisible = false;
    orgSession.invalidateRequests(this);
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
        categoryLabel: CATEGORY_LABELS[item.category] || copy.messages.notification,
        createdAtText: formatAuditTime(item.createdAt, item.createdAtReviewStatus),
        workContextName: item.workContextName || item.contextLabel || item.assignmentLabel || item.identityName || ''
      });
    });
  },

  buildOrganizationOptions(organizations) {
    return [{ id: '', name: copy.messages.allOrganizations, isCurrentOrganization: false }].concat(
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

  async loadOverview(reset, refresh) {
    if (this._overviewPromise) {
      if (refresh === true) { this._messageRefreshQueued = true; this._overviewReloadQueued = true; }
      if (this._overviewRevision !== (this._messageRevision || 0)) this._overviewReloadQueued = true;
      return this._overviewPromise;
    }
    const request = orgSession.beginRequest(this, 'messageOverview');
    const revision = this._messageRevision || 0;
    this._overviewRevision = revision;
    const current = () => this._isPageVisible !== false && orgSession.isRequestCurrent(this, request)
      && revision === (this._messageRevision || 0);
    this.setData({ todoLoading: !this.data.todos.length, notificationLoading: !this.data.notifications.length });
    const job = Promise.all([false, true].map(async (isNotification) => {
      const prefix = isNotification ? 'notification' : 'todo';
      try {
        const data = Object.assign({ limit: 20, refresh: refresh === true }, this.selectedOrganizationData());
        const result = await require('../../../../utils/messageQueries').load(isNotification ? 'listNotifications' : 'listTodos', data);
        if (!current()) return;
        if (result.status === 'org_access_denied' && this.data.selectedOrganizationId) {
          messageScope.resetScope();
          this._todoFingerprint = ''; this._notificationFingerprint = '';
          this._messageRevision = (this._messageRevision || 0) + 1;
          this.setData({
            selectedOrganizationId: '', selectedOrganizationName: copy.messages.allOrganizations,
            selectedOrganizationIndex: 0, todos: [], notifications: [], todoLoading: false, notificationLoading: false,
            todoTotal: 0, notificationTotal: 0, unreadCount: 0, todoCursor: '', notificationCursor: '', loadingMore: false
          });
          this._overviewReloadQueued = true;
          return;
        }
        if (result.status !== 'success') throw new Error('message_list_unavailable');
        const organizationOptions = this.buildOrganizationOptions(result.organizations);
        const selectedIndex = Math.max(0, organizationOptions.findIndex(item => item.id === this.data.selectedOrganizationId));
        const organization = organizationOptions[selectedIndex];
        messageScope.setScope(organization);
        const fingerprint = JSON.stringify([result.items, result.total, result.unreadCount]);
        const patch = {
          organizationOptions: organizationOptions,
          selectedOrganizationIndex: selectedIndex,
          selectedOrganizationName: organization.name
        };
        patch[prefix + 'Loading'] = false;
        patch[prefix + 'Error'] = false;
        patch[prefix + 'Total'] = result.total || 0;
        if (isNotification) patch.unreadCount = result.unreadCount || 0;
        if (this['_' + prefix + 'Fingerprint'] !== fingerprint) {
          orgSession.beginRequest(this, isNotification ? 'messageNotificationsMore' : 'messageTodosMore');
          patch.loadingMore = false;
          patch[isNotification ? 'notifications' : 'todos'] = this.formatItems(result.items);
          patch[prefix + 'Cursor'] = result.nextCursor || '';
          this['_' + prefix + 'Fingerprint'] = fingerprint;
        }
        this['_' + prefix + 'Partial'] = !!result.partial;
        patch.partial = !!(this._todoPartial || this._notificationPartial);
        const renderStarted = Date.now();
        this.setData(patch, function() {
          if (typeof recordMessageRender === 'function') recordMessageRender('messageCenter.' + prefix, renderStarted, Object.keys(patch).length, null);
        });
      } catch (error) {
        if (current()) {
          const patch = {}; patch[prefix + 'Loading'] = false; patch[prefix + 'Error'] = true;
          this.setData(patch);
        }
      }
    }));
    this._overviewPromise = job;
    try { await job; } finally {
      if (this._overviewPromise === job) this._overviewPromise = null;
      if (this._overviewReloadQueued && this._isPageVisible !== false) {
        this._overviewReloadQueued = false;
        const forceRefresh = this._messageRefreshQueued === true;
        this._messageRefreshQueued = false;
        this.loadOverview(true, forceRefresh);
      }
    }
  },

  retryOverview() {
    require('../../../../utils/messageQueries').invalidate();
    return this.loadOverview(true, true);
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
    this._overviewPromise = null;
    this._todoFingerprint = ''; this._notificationFingerprint = '';
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
    if (this._overviewPromise || this.data.loading || this.data.loadingMore) return;
    const isNotifications = this.data.activeTab === 'notifications';
    const cursor = isNotifications ? this.data.notificationCursor : this.data.todoCursor;
    if (!cursor) return;
    const request = orgSession.beginRequest(this, isNotifications ? 'messageNotificationsMore' : 'messageTodosMore');
    const revision = this._messageRevision || 0;
    this.setData({ loadingMore: true });
    try {
      const name = isNotifications ? 'listNotifications' : 'listTodos';
      const data = Object.assign({ limit: 20, cursor }, this.selectedOrganizationData());
      const result = await callFunction({ name, data });
      if (!orgSession.isRequestCurrent(this, request)
          || revision !== (this._messageRevision || 0)) return;
      if (result.status !== 'success') {
        if (result.status === 'cursor_expired') {
          this._todoFingerprint = '';
          this.retryOverview();
          return;
        }
        throw new Error(result.message || copy.messages.retryLater);
      }
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
      if (!(error && error.silent)) showShortToast(copy.messages.retryLater);
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loadingMore: false });
      if (this._overviewReloadQueued && !this.data.loading && !this.data.loadingMore) {
        this._overviewReloadQueued = false;
        this.loadOverview(true);
      }
    }
  },

  findItem(type, id) {
    const source = type === 'notification' ? this.data.notifications : this.data.todos;
    return source.find(function(item) { return item.id === id; }) || null;
  },

  contextSwitchKind(item) {
    if (!item) return '';
    const activeSession = orgSession.getSnapshot();
    if (item.organizationId
      && item.organizationId !== String(activeSession.orgId || '')) {
      return 'organization';
    }
    const targetContextId = String(item.contextId || '') || authContext.resolveContextId(
      item.identityId,
      item.organizationId
    );
    if (targetContextId) {
      return targetContextId !== orgSession.getSnapshot().contextId
        ? 'context'
        : '';
    }
    if (item.contextId || item.identityId) return 'context';
    return '';
  },

  openSwitchDialog(item, type) {
    this._pendingNavigation = { item, type };
    const sameOrganization = item.organizationId === String(orgSession.getSnapshot().orgId || '');
    this.setData({
      showSwitchDialog: true,
      switchDialogTitle: sameOrganization
        ? copy.messages.switchWorkContext
        : copy.messages.switchOrganizationAndWorkContext,
      switchOrganizationName: (item.organizationName || copy.messages.targetOrganization)
        + (item.workContextName ? ' · ' + item.workContextName : '')
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
    if (switchKind === 'context') {
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
    if (result.status !== 'success') {
      throw new Error(result.message || copy.messages.notificationReadFailed);
    }
  },

  async confirmNotificationOpened(item) {
    if (item.isRead) return;
    try {
      await this.markNotificationRead(item);
      this._messageRevision = (this._messageRevision || 0) + 1;
      this.setData({
        notifications: this.data.notifications.map(function(row) {
          return row.id === item.id ? Object.assign({}, row, { isRead: true }) : row;
        }),
        unreadCount: Math.max(0, this.data.unreadCount - 1)
      });
    } catch (_) {
      const role = orgSession.getSnapshot().role || '';
      queuePendingRead(item.organizationId, role, item.id);
    }
  },

  openNotification(item) {
    navigateToTrustedRoute(item.targetUrl, {
      success: () => { this.confirmNotificationOpened(item); }
    });
  },

  async onNotificationTap(e) {
    const item = this.findItem('notification', e.currentTarget.dataset.id);
    if (!item) return;
    const switchKind = this.contextSwitchKind(item);
    if (switchKind === 'organization') {
      this.openSwitchDialog(item, 'notification');
      return;
    }
    if (switchKind === 'context') {
      await this.activateAndOpen(item, 'notification');
      return;
    }
    this.openNotification(item);
  },

  async activateItemContext(item) {
    if (item.contextId) return authContext.activateContext(item.contextId);
    if (item.organizationId && item.identityId) {
      return authContext.activateSelection(item.organizationId, item.identityId);
    }
    return activateOrganization(item.organizationId);
  },

  async activateAndOpen(item, type) {
    try {
      await this.activateItemContext(item);
      this._activeOrgSnapshot = orgSession.getSnapshot();
      if (type === 'notification' && !item.isRead) {
        notificationReceipt.stage(item, orgSession.getSnapshot());
      }
      const launched = reLaunchPortalThenNavigate(item.targetUrl, {
        fail: function() { notificationReceipt.clear(item.id); }
      });
      if (!launched) notificationReceipt.clear(item.id);
    } catch (error) {
      const denied = error && ['org_access_denied', 'context_forbidden', 'not_found'].indexOf(error.status) >= 0;
      showShortToast(denied ? copy.messages.selectWorkContext : copy.messages.switchFailed);
      this.loadOverview(true);
    }
  },

  async confirmOrganizationSwitch() {
    const pending = this._pendingNavigation;
    if (!pending || this.data.switchingOrganization) return;
    this.setData({ switchingOrganization: true });
    try {
      await this.activateItemContext(pending.item);
      this._activeOrgSnapshot = orgSession.getSnapshot();
      this.setData({ showSwitchDialog: false, switchingOrganization: false });
      if (pending.type === 'notification' && !pending.item.isRead) {
        notificationReceipt.stage(pending.item, orgSession.getSnapshot());
      }
      this._pendingNavigation = null;
      const launched = reLaunchPortalThenNavigate(pending.item.targetUrl, {
        fail: function() { notificationReceipt.clear(pending.item.id); }
      });
      if (!launched) notificationReceipt.clear(pending.item.id);
    } catch (error) {
      const denied = error && (error.status === 'org_access_denied' || error.status === 'not_found');
      showShortToast(denied ? copy.messages.selectOrganization : copy.messages.switchFailed);
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
    const previous = {
      notifications: this.data.notifications,
      notificationTotal: this.data.notificationTotal,
      unreadCount: this.data.unreadCount,
      partial: this.data.partial
    };
    this._messageRevision = (this._messageRevision || 0) + 1;
    this.setData({
      unreadCount: 0,
      notifications: previous.notifications.map(function(item) {
        return Object.assign({}, item, { isRead: true });
      })
    });
    try {
      const result = await callFunction({
        name: 'markAllNotificationsRead',
        data: this.selectedOrganizationData()
      });
      if (result.status !== 'success') throw new Error(result.message || copy.messages.incomplete);
      if (isPartialBulkResult(result)) {
        this.setData(previous);
        await this.loadOverview(true);
        showShortToast(copy.messages.partialBulkAction);
      }
    } catch (_) {
      this.setData(previous);
      await this.loadOverview(true);
      showShortToast(copy.messages.incomplete);
    }
  },

  async deleteNotification(e) {
    const item = this.findItem('notification', e.currentTarget.dataset.id);
    if (!item) return;
    const previous = {
      notifications: this.data.notifications,
      notificationTotal: this.data.notificationTotal,
      unreadCount: this.data.unreadCount,
      partial: this.data.partial
    };
    this._messageRevision = (this._messageRevision || 0) + 1;
    this.setData({
      notifications: previous.notifications.filter(function(row) { return row.id !== item.id; }),
      notificationTotal: Math.max(0, this.data.notificationTotal - 1),
      unreadCount: item.isRead ? this.data.unreadCount : Math.max(0, this.data.unreadCount - 1)
    });
    try {
      const result = await callFunction({
        name: 'deleteNotification',
        data: { id: item.id, organizationId: item.organizationId }
      });
      if (result.status !== 'success') throw new Error(result.message || copy.messages.deleteFailed);
    } catch (_) {
      this.setData(previous);
      await this.loadOverview(true);
      showShortToast(copy.messages.deleteFailed);
    }
  },

  deleteAllNotifications() {
    if (!this.data.notificationTotal) return;
    wx.showModal({
      title: copy.messages.clearTitle,
      content: copy.messages.clearDescription,
      confirmText: copy.messages.clearConfirm,
      confirmColor: '#dc2626',
      success: async (result) => {
        if (!result.confirm) return;
        const previous = {
          notifications: this.data.notifications,
          notificationTotal: this.data.notificationTotal,
          unreadCount: this.data.unreadCount,
          partial: this.data.partial
        };
        this._messageRevision = (this._messageRevision || 0) + 1;
        this.setData({ notifications: [], notificationTotal: 0, unreadCount: 0 });
        try {
          const response = await callFunction({
            name: 'deleteAllNotifications',
            data: this.selectedOrganizationData()
          });
          if (response.status !== 'success') {
            throw new Error(response.message || copy.messages.clearFailed);
          }
          if (isPartialBulkResult(response)) {
            this.setData(previous);
            await this.loadOverview(true);
            showShortToast(copy.messages.partialBulkAction);
          }
        } catch (_) {
          this.setData(previous);
          await this.loadOverview(true);
          showShortToast(copy.messages.clearFailed);
        }
      }
    });
  },

  async retryPendingNotificationReads() {
    try {
      const activeSession = orgSession.getSnapshot();
      const orgId = activeSession.orgId || '';
      const role = activeSession.role || '';
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
          if (result.status !== 'success') {
            throw new Error(result.message || copy.messages.notificationReadFailed);
          }
        } catch (_) {
          failed.push(id);
        }
      }
      if (failed.length) wx.setStorageSync(key, failed);
      else wx.removeStorageSync(key);
    } catch (_) {
      // 本地缓存异常不影响消息中心加载；服务端状态会在下次打开时重新同步。
    }
  },

  noop() {}
});
