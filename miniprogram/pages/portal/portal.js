const { callFunction, formatAuditTime } = require('../../utils/api');
const eventBus = require('../../utils/eventBus');
const orgSession = require('../../utils/orgSession');
const STORAGE_KEY = 'roleProfiles';
const ACTIVE_ROLE_KEY = 'activeRole';
const NOTIFICATION_DELETE_WIDTH_PX = 72;
const LEADER_IDENTITIES = ['部门主要负责人', '部门负责人'];

function navigateToTrustedRoute(rawUrl) {
  const url = String(rawUrl || '').trim();
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch (error) {}
  const isLocalRoute = /^\/(?:pages|subpackages)\/[A-Za-z0-9_?&=./%-]+$/.test(url);
  const hasUnsafeSegment = decoded.includes('..') || decoded.includes('\\') || decoded.includes('://');
  if (!isLocalRoute || hasUnsafeSegment || url.length > 1024) {
    console.warn('[portal] blocked untrusted route');
    wx.showToast({ title: '目标页面不可用', icon: 'none' });
    return;
  }
  wx.navigateTo({ url: url });
}

const PORTAL_CARDS_USER = [
  { key: 'scoring', label: '考核评分', iconName: 'grid', url: '/pages/home/home?subApp=scoring', disabled: false },
  { key: 'hr', label: '人事信息', iconName: 'user', url: '/pages/home/home?subApp=hr', disabled: false },
  { key: 'audit', label: '审核', iconName: 'file', url: '/pages/home/home?subApp=audit', disabled: false },
  { key: 'venue', label: '场地借用', iconName: 'venue', url: '/subpackages/venue/pages/venueBooking/venueBooking', disabled: false }
];

const PORTAL_CARDS_ADMIN = [
  { key: 'scoring', label: '考核评分', iconName: 'grid', url: '/subpackages/scoring/pages/admin/admin?subApp=scoring', disabled: false },
  { key: 'hr', label: '人事信息', iconName: 'user', url: '/subpackages/scoring/pages/admin/admin?subApp=hr', disabled: false },
  { key: 'system', label: '系统配置', iconName: 'shield', url: '/subpackages/scoring/pages/admin/admin?subApp=system', disabled: false },
  { key: 'audit', label: '审核', iconName: 'file', url: '/subpackages/scoring/pages/admin/admin?subApp=audit', disabled: false },
  { key: 'venue', label: '场地管理', iconName: 'venue', url: '/subpackages/venue/pages/venueManage/venueManage', disabled: false }
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
    notificationLoading: false,

    // App services view & search
    appViewMode: 'grid',        // 'grid' | 'list'
    appSearchKeyword: '',
    filteredPortalCards: []
  },

  _pollTimer: null,
  _isPageVisible: true,

  onShow() {
    this._isPageVisible = true;
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      orgSession.invalidateRequests(this);
      this.setData({
        organizationName: wx.getStorageSync('activeOrgName') || '',
        todoCount: 0,
        todos: [],
        notificationCount: 0,
        notifications: [],
        todoLoading: false,
        notificationLoading: false,
        appSearchKeyword: ''
      });
    }
    // Restore saved view mode preference
    const savedView = wx.getStorageSync('appViewMode');
    if (savedView && (savedView === 'grid' || savedView === 'list')) {
      this.setData({ appViewMode: savedView });
    }
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
    if (!this._boundOnOrgChanged) {
      this._boundOnOrgChanged = this._onOrgChanged.bind(this);
      eventBus.on('org:changed', this._boundOnOrgChanged);
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
    if (this._boundOnOrgChanged) {
      eventBus.off('org:changed', this._boundOnOrgChanged);
      this._boundOnOrgChanged = null;
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
    if (this._boundOnOrgChanged) {
      eventBus.off('org:changed', this._boundOnOrgChanged);
      this._boundOnOrgChanged = null;
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
      heroIdentity: user ? getDisplayIdentity(user, activeRole) : 'WHUSU智慧工作台',
      heroInitial: user && user.name ? user.name.charAt(0) : 'R',
      userDepartment: user ? (user.department || '') : '',
      userWorkGroup: user ? (user.workGroup || '') : '',
      showWorkGroup: shouldShowWorkGroup(user),
      portalCards: portalCards
    });
    this._applyAppFilter();
  },

  loadOrganizationName() {
    const request = orgSession.beginRequest(this, 'portalOrganization');
    // 优先读取用户选择的活跃组织，其次回退 API 获取系统默认组织
    const storedName = wx.getStorageSync('activeOrgName') || '';
    if (storedName) {
      this.setData({ organizationName: storedName });
      return;
    }
    callFunction({
      name: 'getCurrentOrganization',
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        const result = res.result || {};
        const org = result.organization;
        const name = org && org.name ? org.name : '';
        this.setData({ organizationName: name });
        if (name) wx.setStorageSync('activeOrgName', name);
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({ organizationName: '' });
      }
    });
  },

  onOrgTap() {
    wx.navigateTo({ url: '/subpackages/org/pages/switch/switch' });
  },

  _onOrgChanged() {
    this.onShow();
  },

  onCardTap(e) {
    const key = e.currentTarget.dataset.key;
    const source = this.data.filteredPortalCards.length ? this.data.filteredPortalCards : this.data.portalCards;
    const card = source.find(function(c) { return c.key === key; });
    if (!card) return;
    if (card.disabled) {
      wx.showToast({ title: card.disabledReason || '暂不可用', icon: 'none' });
      return;
    }
    navigateToTrustedRoute(card.url);
  },

  // ── App Services View & Search ──

  switchAppView(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.appViewMode) return;
    wx.setStorageSync('appViewMode', mode);
    this.setData({ appViewMode: mode });
  },

  onAppSearchInput(e) {
    this.setData({ appSearchKeyword: e.detail.value });
    this._applyAppFilter();
  },

  clearAppSearch() {
    this.setData({ appSearchKeyword: '' });
    this._applyAppFilter();
  },

  _applyAppFilter() {
    const keyword = (this.data.appSearchKeyword || '').trim().toLowerCase();
    const cards = this.data.portalCards || [];
    if (!keyword) {
      this.setData({ filteredPortalCards: cards });
      return;
    }
    const filtered = cards.filter(function(c) {
      const label = (c.label || '').toLowerCase();
      return label.indexOf(keyword) >= 0;
    });
    this.setData({ filteredPortalCards: filtered });
  },

  // ── Notification methods ──
  // Real-time query: notifications reflect current pending steps only.
  // No persistent storage, no read/unread — processed items disappear automatically.
  async loadTodoCount() {
    const request = orgSession.beginRequest(this, 'portalTodoCount');
    try {
      const res = await callFunction({ name: 'getTodoCount', data: {} });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        this.setData({ todoCount: res.count || 0 });
      }
    } catch (e) {
      console.error('[portal] loadTodoCount failed:', e);
    }
  },

  async loadRecentTodos() {
    const request = orgSession.beginRequest(this, 'portalTodos');
    this.setData({ todoLoading: true });
    try {
      const res = await callFunction({ name: 'listTodos', data: { limit: 5, offset: 0 } });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        const items = (res.items || []).map(function(item) {
          return Object.assign({}, item, { createdAt: formatAuditTime(item.createdAt) });
        });
        this.setData({ todos: items, todoCount: res.total || items.length });
      }
    } catch (e) {
      console.error('[portal] loadRecentTodos failed:', e);
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ todoLoading: false });
    }
  },

  async loadNotificationUnreadCount() {
    const request = orgSession.beginRequest(this, 'portalNotificationCount');
    try {
      const res = await callFunction({ name: 'getNotificationUnreadCount', data: {} });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        this.setData({ notificationCount: res.count || 0 });
      }
    } catch (e) {
      console.error('[portal] loadNotificationUnreadCount failed:', e);
    }
  },

  async loadRecentNotifications() {
    const request = orgSession.beginRequest(this, 'portalNotifications');
    this.setData({ notificationLoading: true });
    try {
      const res = await callFunction({ name: 'listNotifications', data: { limit: 5, offset: 0 } });
      if (orgSession.isRequestCurrent(this, request) && res.status === 'success') {
        const items = (res.items || []).map(function(item) {
          return Object.assign({}, item, { createdAt: formatAuditTime(item.createdAt), _showDelete: false, _swipeX: 0 });
        });
        this.setData({ notifications: items });
      }
    } catch (e) {
      console.error('[portal] loadRecentNotifications failed:', e);
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ notificationLoading: false });
    }
  },

  onTodoTap(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    navigateToTrustedRoute(url);
  },

  async onNotificationTap(e) {
    if (this._notificationSwiping) return;
    const id = e.currentTarget.dataset.id;
    const url = e.currentTarget.dataset.url;
    if (id) {
      const notifications = this.data.notifications.map(function(item) {
        return item.id === id ? Object.assign({}, item, { isRead: true, _showDelete: false }) : item;
      });
      this.setData({ notifications: notifications });
      this.loadNotificationUnreadCount();
      callFunction({ name: 'markNotificationRead', data: { id: id } }).catch(function(err) {
        console.error('[portal] markNotificationRead failed:', err);
      });
    }
    if (!url) return;
    navigateToTrustedRoute(url);
  },

  onNotificationTouchStart(e) {
    const touch = e.touches && e.touches[0] ? e.touches[0] : null;
    const id = e.currentTarget.dataset.id;
    const current = (this.data.notifications || []).find(function(item) { return item.id === id; });
    this._notificationTouch = {
      id: id,
      startX: touch ? touch.clientX : 0,
      startY: touch ? touch.clientY : 0,
      baseX: current && current._showDelete ? -NOTIFICATION_DELETE_WIDTH_PX : 0,
      moving: false
    };
  },

  onNotificationTouchMove(e) {
    const touchState = this._notificationTouch || {};
    const touch = e.touches && e.touches[0] ? e.touches[0] : null;
    const id = touchState.id;
    if (!id || !touch) return;

    const dx = touch.clientX - touchState.startX;
    const dy = touch.clientY - touchState.startY;
    if (!touchState.moving && Math.abs(dx) < 8) return;
    if (!touchState.moving && Math.abs(dy) > Math.abs(dx)) return;

    touchState.moving = true;
    this._notificationTouch = touchState;

    const nextX = Math.max(-NOTIFICATION_DELETE_WIDTH_PX, Math.min(0, touchState.baseX + dx));
    const notifications = this.data.notifications.map(function(item) {
      if (item.id !== id) return Object.assign({}, item, { _showDelete: false, _swipeX: 0 });
      return Object.assign({}, item, { _swipeX: nextX, _showDelete: nextX <= -NOTIFICATION_DELETE_WIDTH_PX / 2 });
    });
    this.setData({ notifications: notifications });
  },

  onNotificationTouchEnd(e) {
    const touchState = this._notificationTouch || {};
    const touch = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
    const id = touchState.id || e.currentTarget.dataset.id;
    if (!id || !touchState.moving) return;

    this._notificationSwiping = true;
    const that = this;
    setTimeout(function() { that._notificationSwiping = false; }, 250);

    const current = (this.data.notifications || []).find(function(item) { return item.id === id; }) || {};
    const currentX = typeof current._swipeX === 'number' ? current._swipeX : 0;
    const dx = touch ? (touch.clientX - touchState.startX) : 0;
    const showDelete = currentX <= -NOTIFICATION_DELETE_WIDTH_PX / 2 || dx < -40;
    const notifications = this.data.notifications.map(function(item) {
      return Object.assign({}, item, {
        _showDelete: item.id === id ? showDelete : false,
        _swipeX: item.id === id && showDelete ? -NOTIFICATION_DELETE_WIDTH_PX : 0
      });
    });
    this.setData({ notifications: notifications });
    this._notificationTouch = null;
  },

  async deleteNotification(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const notifications = this.data.notifications.filter(function(item) { return item.id !== id; });
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
    const that = this;
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
