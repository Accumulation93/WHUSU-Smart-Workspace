const { callFunction, formatAuditTime } = require('../../utils/api');
const orgSession = require('../../utils/orgSession');
const { navigateToTrustedRoute } = require('../../utils/trustedNavigation');

Page({
  data: {
    activeTab: 'todos',
    todos: [],
    notifications: [],
    todoTotal: 0,
    unreadCount: 0,
    todoCursor: '',
    notificationCursor: '',
    loading: false,
    loadingMore: false
  },

  onLoad(options) {
    this.setData({ activeTab: options.tab === 'notifications' ? 'notifications' : 'todos' });
  },

  onShow() {
    const state = orgSession.consume(this);
    if (state.changed) {
      orgSession.invalidateRequests(this);
      this._messageRevision = (this._messageRevision || 0) + 1;
      this.setData({
        todos: [], notifications: [], todoTotal: 0, unreadCount: 0,
        todoCursor: '', notificationCursor: '', loading: false, loadingMore: false
      });
    }
    this.reloadCurrentTab();
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
    this._pollTimer = setInterval(function() { that.reloadCurrentTab(); }, 30000);
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
    if (tab === 'todos' && !this.data.todos.length) this.loadTodos(true);
    if (tab === 'notifications' && !this.data.notifications.length) this.loadNotifications(true);
  },

  reloadCurrentTab() {
    if (this.data.activeTab === 'notifications') this.loadNotifications(true);
    else this.loadTodos(true);
  },

  formatItems(items) {
    return (items || []).map(function(item) {
      return Object.assign({}, item, { createdAt: formatAuditTime(item.createdAt) });
    });
  },

  async loadTodos(reset) {
    if (this.data.loading || this.data.loadingMore) return;
    const request = orgSession.beginRequest(this, reset ? 'messageTodosReset' : 'messageTodosMore');
    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const cursor = reset ? '' : this.data.todoCursor;
      if (!reset && !cursor) return;
      const result = await callFunction({ name: 'listTodos', data: { limit: 20, cursor: cursor } });
      if (!orgSession.isRequestCurrent(this, request) || result.status !== 'success') return;
      const items = this.formatItems(result.items);
      this.setData({
        todos: reset ? items : this.data.todos.concat(items),
        todoTotal: result.total || 0,
        todoCursor: result.nextCursor || ''
      });
    } catch (error) {
      if (!(error && error.silent)) wx.showToast({ title: '待办加载失败', icon: 'none' });
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false, loadingMore: false });
    }
  },

  async loadNotifications(reset) {
    if (this.data.loading || this.data.loadingMore) return;
    const request = orgSession.beginRequest(this, reset ? 'messageNotificationsReset' : 'messageNotificationsMore');
    const revision = this._messageRevision || 0;
    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const cursor = reset ? '' : this.data.notificationCursor;
      if (!reset && !cursor) return;
      const result = await callFunction({ name: 'listNotifications', data: { limit: 20, cursor: cursor } });
      if (!orgSession.isRequestCurrent(this, request) || revision !== (this._messageRevision || 0) || result.status !== 'success') return;
      const items = this.formatItems(result.items);
      this.setData({
        notifications: reset ? items : this.data.notifications.concat(items),
        unreadCount: result.unreadCount || 0,
        notificationCursor: result.nextCursor || ''
      });
    } catch (error) {
      if (!(error && error.silent)) wx.showToast({ title: '通知加载失败', icon: 'none' });
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ loading: false, loadingMore: false });
    }
  },

  loadMore() {
    if (this.data.activeTab === 'notifications') this.loadNotifications(false);
    else this.loadTodos(false);
  },

  onTodoTap(e) {
    navigateToTrustedRoute(e.currentTarget.dataset.url);
  },

  async onNotificationTap(e) {
    const id = e.currentTarget.dataset.id;
    const url = e.currentTarget.dataset.url;
    const item = this.data.notifications.find(function(row) { return row.id === id; });
    if (item && !item.isRead) {
      this._messageRevision = (this._messageRevision || 0) + 1;
      this.setData({
        notifications: this.data.notifications.map(function(row) {
          return row.id === id ? Object.assign({}, row, { isRead: true }) : row;
        }),
        unreadCount: Math.max(0, this.data.unreadCount - 1)
      });
      navigateToTrustedRoute(url);
      try {
        const result = await callFunction({ name: 'markNotificationRead', data: { id: id } });
        if (result.status === 'success') this.setData({ unreadCount: result.unreadCount || 0 });
      } catch (_) {
        this.loadNotifications(true);
      }
      return;
    }
    navigateToTrustedRoute(url);
  },

  async markAllRead() {
    if (!this.data.unreadCount) return;
    this._messageRevision = (this._messageRevision || 0) + 1;
    try {
      const result = await callFunction({ name: 'markAllNotificationsRead', data: {} });
      if (result.status !== 'success') throw new Error(result.message || 'failed');
      this.setData({
        unreadCount: 0,
        notifications: this.data.notifications.map(function(item) { return Object.assign({}, item, { isRead: true }); })
      });
    } catch (_) {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  async deleteNotification(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.notifications.find(function(row) { return row.id === id; });
    this._messageRevision = (this._messageRevision || 0) + 1;
    try {
      const result = await callFunction({ name: 'deleteNotification', data: { id: id } });
      if (result.status !== 'success') throw new Error(result.message || 'failed');
      this.setData({
        notifications: this.data.notifications.filter(function(row) { return row.id !== id; }),
        unreadCount: result.unreadCount || 0
      });
    } catch (_) {
      if (item) wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    }
  }
});
