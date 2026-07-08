const { callFunction, formatAuditTime } = require('../../utils/api');
const eventBus = require('../../utils/eventBus');
const STORAGE_KEY = 'roleProfiles';
const ACTIVE_ROLE_KEY = 'activeRole';
const LEADER_IDENTITIES = ['部门主要负责人', '部门负责人'];

const PORTAL_CARDS_USER = [
  { key: 'scoring', label: '考核评分', icon: '📊', desc: '评分 · 结果 · 公示', url: '/pages/home/home?subApp=scoring', disabled: false },
  { key: 'hr', label: '人事信息', icon: '👤', desc: '档案 · 资料 · 履历', url: '/pages/home/home?subApp=hr', disabled: false },
  { key: 'audit', label: '审核', icon: '📋', desc: '发起 · 审批 · 记录', url: '/pages/home/home?subApp=audit', disabled: false },
  { key: 'venue', label: '场地借用', icon: '🏟️', desc: '浏览 · 借用 · 记录', url: '/subpackages/venue/pages/venueBooking/venueBooking', disabled: false }
];

const PORTAL_CARDS_ADMIN = [
  { key: 'scoring', label: '考核评分', icon: '📊', desc: '活动 · 问题 · 规则 · 公示', url: '/subpackages/scoring/pages/admin/admin?subApp=scoring', disabled: false },
  { key: 'hr', label: '人事信息', icon: '👤', desc: '人事 · 部门 · 职能 · 身份', url: '/subpackages/scoring/pages/admin/admin?subApp=hr', disabled: false },
  { key: 'system', label: '系统配置', icon: '⚙️', desc: '管理员 · 基础配置', url: '/subpackages/scoring/pages/admin/admin?subApp=system', disabled: false },
  { key: 'audit', label: '审核', icon: '📋', desc: '模板 · 印章 · 验签', url: '/subpackages/scoring/pages/admin/admin?subApp=audit', disabled: false },
  { key: 'venue', label: '场地管理', icon: '🏟️', desc: '场地 · 借用 · 审批 · 事由', url: '/subpackages/venue/pages/venueManage/venueManage', disabled: false }
];

function getDisplayIdentity(user, activeRole) {
  if (!user) return '未登录';
  if (activeRole === 'admin') {
    return user.adminLevel === 'root_admin' ? '至高权限管理员' : (user.adminLevel === 'super_admin' ? '超级管理员' : '普通管理员');
  }
  return user.identity || '未设置身份';
}

function shouldShowWorkGroup(user) {
  if (!user || !user.workGroup) return false;
  return LEADER_IDENTITIES.indexOf(user.identity) === -1;
}

Page({
  data: {
    portalCards: [],
    heroName: '',
    heroIdentity: '',
    heroInitial: '',
    userDepartment: '',
    userWorkGroup: '',
    showWorkGroup: false,
    hasUser: false,
    isAdminRole: false,
    activeRole: '',
    organizationName: '',
    showUnbindDialog: false,
    unbindLoading: false,
    todoCount: 0,
    todos: [],
    todoLoading: false,
    notificationCount: 0,
    notifications: [],
    notificationLoading: false
  },

  _pollTimer: null,
  _isPageVisible: true,

  onShow() {
    this._isPageVisible = true;
    this.refreshCurrentUser();
    this.loadOrganizationName();
    if (this.data.hasUser) {
      this.loadTodoCount();
      this.loadRecentTodos();
      this.loadNotificationUnreadCount();
      this.loadRecentNotifications();
    }
    this.startPolling();
    if (!this._boundOnApprovalDone) {
      this._boundOnApprovalDone = this._onApprovalDone.bind(this);
      eventBus.on('approval:done', this._boundOnApprovalDone);
    }
    if (!this._boundOnVenueChanged) {
      this._boundOnVenueChanged = this._onApprovalDone.bind(this);
      eventBus.on('venue:changed', this._boundOnVenueChanged);
    }
  },

  onHide() {
    this._isPageVisible = false;
    this.stopPolling();
    if (this._boundOnApprovalDone) {
      eventBus.off('approval:done', this._boundOnApprovalDone);
      this._boundOnApprovalDone = null;
    }
    if (this._boundOnVenueChanged) {
      eventBus.off('venue:changed', this._boundOnVenueChanged);
      this._boundOnVenueChanged = null;
    }
  },

  onUnload() {
    this.stopPolling();
    if (this._boundOnApprovalDone) {
      eventBus.off('approval:done', this._boundOnApprovalDone);
      this._boundOnApprovalDone = null;
    }
    if (this._boundOnVenueChanged) {
      eventBus.off('venue:changed', this._boundOnVenueChanged);
      this._boundOnVenueChanged = null;
    }
  },

  refreshCurrentUser() {
    const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
    let activeRole = wx.getStorageSync(ACTIVE_ROLE_KEY) || '';
    const roleKeys = Object.keys(roleProfiles);

    if (!activeRole || roleKeys.indexOf(activeRole) === -1) {
      if (roleKeys.length) {
        activeRole = roleKeys[0];
        wx.setStorageSync(ACTIVE_ROLE_KEY, activeRole);
      } else {
        activeRole = '';
        wx.removeStorageSync(ACTIVE_ROLE_KEY);
      }
    }

    const user = activeRole ? (roleProfiles[activeRole] || null) : null;
    const isAdminRole = activeRole === 'admin';
    const portalCards = isAdminRole ? PORTAL_CARDS_ADMIN : PORTAL_CARDS_USER;

    this.setData({
      activeRole,
      user: user,
      hasUser: !!user,
      isAdminRole: isAdminRole,
      heroName: user ? (user.name || '欢迎使用') : '欢迎使用',
      heroIdentity: user ? getDisplayIdentity(user, activeRole) : 'REDSU智慧工作台',
      heroInitial: user && user.name ? user.name.charAt(0) : 'R',
      userDepartment: user ? (user.department || '') : '',
      userWorkGroup: user ? (user.workGroup || '') : '',
      showWorkGroup: shouldShowWorkGroup(user),
      portalCards: portalCards
    });
  },

  loadOrganizationName() {
    callFunction({
      name: 'getCurrentOrganization',
      success: (res) => {
        const result = res.result || {};
        const org = result.organization;
        this.setData({
          organizationName: org && org.name ? org.name : ''
        });
      },
      fail: () => {
        this.setData({ organizationName: '' });
      }
    });
  },

  onCardTap(e) {
    const { key } = e.currentTarget.dataset;
    const card = this.data.portalCards.find(c => c.key === key);
    if (!card) return;
    if (card.disabled) {
      wx.showToast({ title: card.disabledReason || '暂不可用', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: card.url });
  },

  // ── Notification methods ──
  // Real-time query: notifications reflect current pending steps only.
  // No persistent storage, no read/unread — processed items disappear automatically.
  async loadTodoCount() {
    try {
      const res = await callFunction({ name: 'getTodoCount', data: {} });
      if (res.status === 'success') {
        this.setData({ todoCount: res.count || 0 });
      }
    } catch (e) {
      console.error('[portal] loadTodoCount failed:', e);
    }
  },

  async loadRecentTodos() {
    this.setData({ todoLoading: true });
    try {
      const res = await callFunction({ name: 'listTodos', data: { limit: 5, offset: 0 } });
      if (res.status === 'success') {
        const items = (res.items || []).map(function(item) {
          return Object.assign({}, item, { createdAt: formatAuditTime(item.createdAt), _showDelete: false });
        });
        this.setData({ todos: items, todoCount: res.total || items.length });
      }
    } catch (e) {
      console.error('[portal] loadRecentTodos failed:', e);
    } finally {
      this.setData({ todoLoading: false });
    }
  },

  async loadNotificationUnreadCount() {
    try {
      const res = await callFunction({ name: 'getNotificationUnreadCount', data: {} });
      if (res.status === 'success') {
        this.setData({ notificationCount: res.count || 0 });
      }
    } catch (e) {
      console.error('[portal] loadNotificationUnreadCount failed:', e);
    }
  },

  async loadRecentNotifications() {
    this.setData({ notificationLoading: true });
    try {
      const res = await callFunction({ name: 'listNotifications', data: { limit: 5, offset: 0 } });
      if (res.status === 'success') {
        const items = (res.items || []).map(function(item) {
          return Object.assign({}, item, { createdAt: formatAuditTime(item.createdAt) });
        });
        this.setData({ notifications: items });
      }
    } catch (e) {
      console.error('[portal] loadRecentNotifications failed:', e);
    } finally {
      this.setData({ notificationLoading: false });
    }
  },

  onTodoTap(e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: url });
  },

  async onNotificationTap(e) {
    if (this._notificationSwiping) return;
    var id = e.currentTarget.dataset.id;
    var url = e.currentTarget.dataset.url;
    if (id) {
      var notifications = this.data.notifications.map(function(item) {
        return item.id === id ? Object.assign({}, item, { isRead: true, _showDelete: false }) : item;
      });
      this.setData({ notifications: notifications });
      this.loadNotificationUnreadCount();
      callFunction({ name: 'markNotificationRead', data: { id: id } }).catch(function(err) {
        console.error('[portal] markNotificationRead failed:', err);
      });
    }
    if (!url) return;
    wx.navigateTo({ url: url });
  },

  onNotificationTouchStart(e) {
    this._notificationTouchStartX = e.touches && e.touches[0] ? e.touches[0].clientX : 0;
  },

  onNotificationTouchEnd(e) {
    var startX = this._notificationTouchStartX || 0;
    var endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : startX;
    var id = e.currentTarget.dataset.id;
    if (!id || Math.abs(endX - startX) < 40) return;
    this._notificationSwiping = true;
    var that = this;
    setTimeout(function() { that._notificationSwiping = false; }, 250);
    var showDelete = endX < startX;
    var notifications = this.data.notifications.map(function(item) {
      return Object.assign({}, item, { _showDelete: item.id === id ? showDelete : false });
    });
    this.setData({ notifications: notifications });
  },

  async deleteNotification(e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var notifications = this.data.notifications.filter(function(item) { return item.id !== id; });
    this.setData({ notifications: notifications });
    this.loadNotificationUnreadCount();
    try {
      await callFunction({ name: 'deleteNotification', data: { id: id } });
    } catch (err) {
      console.error('[portal] deleteNotification failed:', err);
      this.loadRecentNotifications();
      this.loadNotificationUnreadCount();
    }
  },

  // ── Polling: auto-refresh notification count every 30s ──
  startPolling() {
    this.stopPolling();
    var that = this;
    this._pollTimer = setInterval(function() {
      if (that._isPageVisible && that.data.hasUser) {
        that.loadTodoCount();
        that.loadRecentTodos();
        that.loadNotificationUnreadCount();
        that.loadRecentNotifications();
      }
    }, 30000);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // ── Event bus: triggered when an approval action completes ──
  _onApprovalDone: function() {
    if (this._isPageVisible && this.data.hasUser) {
      this.loadTodoCount();
      this.loadRecentTodos();
      this.loadNotificationUnreadCount();
      this.loadRecentNotifications();
    }
  },

  goLogin() {
    wx.redirectTo({ url: '/pages/login/login' });
  },

  openUnbindDialog() {
    if (!this.data.activeRole || this.data.unbindLoading) return;
    this.setData({ showUnbindDialog: true });
  },

  closeUnbindDialog() {
    if (this.data.unbindLoading) return;
    this.setData({ showUnbindDialog: false });
  },

  confirmUnbind() {
    if (this.data.unbindLoading) return;
    this.setData({ unbindLoading: true });

    const activeRole = this.data.activeRole;

    // Call server to actually unlink the WeChat openid from this role
    callFunction({
      name: 'unbindRole',
      data: { role: activeRole },
      success: (res) => {
        const result = res.result || {};
        if (result.status !== 'unbind_success' && result.status !== 'already_unbound') {
          wx.showToast({ title: result.message || '解绑失败', icon: 'none' });
          this.setData({ unbindLoading: false });
          return;
        }

        // Clear all auth state
        const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
        delete roleProfiles[activeRole];
        wx.setStorageSync(STORAGE_KEY, roleProfiles);

        const roleKeys = Object.keys(roleProfiles);
        if (roleKeys.length) {
          wx.setStorageSync(ACTIVE_ROLE_KEY, roleKeys[0]);
        } else {
          wx.removeStorageSync(ACTIVE_ROLE_KEY);
        }

        // Clear token to prevent auto-login with old credentials
        wx.removeStorageSync('token');

        wx.showToast({ title: '已解绑，即将返回登录页', icon: 'success' });
        this.setData({ showUnbindDialog: false, unbindLoading: false });

        // Redirect to login page
        setTimeout(function() {
          wx.redirectTo({ url: '/pages/login/login' });
        }, 800);
      },
      fail: () => {
        wx.showToast({ title: '解绑失败，请检查网络', icon: 'none' });
        this.setData({ unbindLoading: false });
      }
    });
  }
});
