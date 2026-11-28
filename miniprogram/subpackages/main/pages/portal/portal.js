const { callFunction, formatAuditTime, showShortToast, recordMessageRender } = require('../../../../utils/api');
const eventBus = require('../../../../utils/eventBus');
const { describeMessage, messageCategory } = require('../../../../utils/messageFactsView');
const messageFactsCopy = require('../../../../locales/zh-CN/messageFacts');
const { formatDisplayTime, formatTimeRange, formatDateOnly } = require('../../../../utils/dateTime');
const orgSession = require('../../../../utils/orgSession');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const adminPermissions = require('../../../../utils/adminPermissions');
const { readCurrentAuthorizationAccess } = require('../../../../utils/authorizationAccess');
const { canOpenAuthorization, canOpenConfigurationCopy, domainAccess, cardMatches } = require('../../../../utils/authorizationEntryView');
const authorizationCopy = require('../../../../locales/zh-CN/authorization');
const authContext = require('../../../../utils/authContext');
const identityCardCopy = require('../../../../locales/zh-CN/identityCard');
const calendarCopy = require('../../../../locales/zh-CN/calendar');
const passwordBindingOffer = require('../../../../utils/passwordBindingOffer');
const deviceMetadataReport = require('../../../../utils/deviceMetadataReport');
const { shouldClearAuthenticationOnPortalExit } = require('../../../../utils/portalExit');
const { activateOrganization } = require('../../../../utils/organizationActivation');
const notificationReceipt = require('../../../../utils/notificationNavigationReceipt');
const { probeStartupSession } = require('../../../../utils/startupSession');
// 启动探测节奏：首次延后起跑躲开未就绪的桥，单次 4 秒；失败后后台再试一次给 6 秒。
const STARTUP_AUTH_FIRST_DELAY_MS = 600;
const STARTUP_AUTH_TIMEOUT_MS = 4000;
const STARTUP_AUTH_RETRY_TIMEOUT_MS = 6000;
// 后台重试很快成功时不要让提示闪一下：提示本身也延后 600ms 才出现。
const STARTUP_AUTH_HINT_DELAY_MS = 600;
const {
  isTrustedRoute,
  navigateToTrustedRoute,
  reLaunchPortalThenNavigate
} = require('../../../../utils/trustedNavigation');
const { portal: copy } = require('../../../../locales/zh-CN/main');
const NOTIFICATION_DELETE_WIDTH_PX = 72;
const CATEGORY_LABELS = {
  audit: copy.categoryLabels.audit,
  venue: copy.categoryLabels.venue,
  scoring: copy.categoryLabels.scoring,
  hr: copy.categoryLabels.hr,
  calendar: copy.categoryLabels.calendar,
  system: copy.categoryLabels.system
};

function isPartialBulkResult(result) {
  return !!(result && (
    result.partial
    || (Array.isArray(result.failedOrganizations) && result.failedOrganizations.length)
    || (Array.isArray(result.failures) && result.failures.length)
  ));
}

const PORTAL_CARDS_USER = [
  { key: 'calendar', label: calendarCopy.title, iconName: 'calendar', url: '/subpackages/workspace/pages/calendar/calendar', disabled: false },
  { key: 'identityCard', label: identityCardCopy.title, iconName: 'id-card', url: '/subpackages/org/pages/identityCard/identityCard', disabled: false },
  { key: 'scan', label: copy.cards.scan, iconName: 'scan', url: '', action: 'scan', disabled: false },
  { key: 'messages', label: copy.cards.messages, iconName: 'bell', url: '/subpackages/message/pages/messageCenter/messageCenter', disabled: false },
  { key: 'identitySwitch', label: copy.cards.workContextSwitch, iconName: 'role-switch', url: '/subpackages/org/pages/identitySwitch/identitySwitch', disabled: false },
  { key: 'scoring', label: copy.cards.scoring, iconName: 'grid', url: '/subpackages/workspace/pages/home/home?subApp=scoring', disabled: false },
  { key: 'hr', label: copy.cards.hr, iconName: 'personnel', url: '/subpackages/workspace/pages/home/home?subApp=hr', disabled: false },
  { key: 'audit', label: copy.cards.audit, iconName: 'file', url: '/subpackages/workspace/pages/home/home?subApp=audit', disabled: false },
  { key: 'venue', label: copy.cards.venueBooking, iconName: 'venue', url: '/subpackages/venue/pages/venueBooking/venueBooking', disabled: false }
];

const PORTAL_CARDS_ADMIN = [
  { key: 'calendar', label: calendarCopy.title, iconName: 'calendar', url: '/subpackages/workspace/pages/calendar/calendar', disabled: false },
  { key: 'identityCard', label: identityCardCopy.title, iconName: 'id-card', url: '/subpackages/org/pages/identityCard/identityCard', disabled: false },
  { key: 'scan', label: copy.cards.scan, iconName: 'scan', url: '', action: 'scan', disabled: false },
  { key: 'messages', label: copy.cards.messages, iconName: 'bell', url: '/subpackages/message/pages/messageCenter/messageCenter', disabled: false },
  { key: 'identitySwitch', label: copy.cards.workContextSwitch, iconName: 'role-switch', url: '/subpackages/org/pages/identitySwitch/identitySwitch', disabled: false },
  { key: 'scoring', label: copy.cards.scoring, iconName: 'grid', url: '/subpackages/scoring/pages/admin/admin?subApp=scoring', disabled: false },
  { key: 'hr', label: copy.cards.hr, iconName: 'personnel', url: '/subpackages/scoring/pages/admin/admin?subApp=hr', disabled: false },
  { key: 'system', label: copy.cards.system, iconName: 'settings', url: '/subpackages/scoring/pages/admin/admin?subApp=system', disabled: false },
  { key: 'audit', label: copy.cards.audit, iconName: 'file', url: '/subpackages/scoring/pages/admin/admin?subApp=audit', disabled: false },
  { key: 'venue', label: copy.cards.venueManage, iconName: 'venue', url: '/subpackages/venue/pages/venueManage/venueManage', disabled: false },
  { key: 'permissions', label: copy.cards.permissions, iconName: 'permission-key', url: '/subpackages/org/pages/authorization/authorization', disabled: false }
];

function unifiedPortalCards(access) {
  return PORTAL_CARDS_USER.concat(PORTAL_CARDS_ADMIN.filter(card => card.key === 'system')).reduce((cards, card) => {
    const permissions = domainAccess(access, card.key);
    if (!permissions.business && !permissions.management) return cards;
    let entry = card;
    if (card.key === 'venue') entry = Object.assign({}, card, { label: copy.cards.venue, searchAliases: [copy.cards.venueBooking, copy.cards.venueManage] });
    if (card.key === 'audit') entry = Object.assign({}, card, { searchAliases: [copy.cards.auditVerification] });
    if (!permissions.business && permissions.management && card.key !== 'system') {
      entry = Object.assign({}, entry, { url: entry.url + (entry.url.includes('?') ? '&' : '?') + 'area=management' });
    }
    cards.push(entry);
    return cards;
  }, []);
}

function getDisplayWorkContext(user, activeRole) {
  if (!user) return copy.workContext.signedOut;
  if (user.accountType === 'super_admin') return copy.workContext.superAdmin;
  if (user.accountType === 'user') return user.assignmentLabel || user.identity || copy.workContext.user;
  if (activeRole === 'admin') {
    return user.adminLevel === 'super_admin' ? copy.workContext.superAdmin : copy.workContext.admin;
  }
  return user.assignmentLabel || user.identity || copy.workContext.unset;
}

Page({
  data: {
    performanceCopy: require('../../../../locales/zh-CN/messagePerformance'),
    todoError: false,
    notificationError: false,
    copy: copy.view,
    portalCards: [],
    heroName: '',
    heroWorkContext: '',
    heroInitial: '',
    userDepartment: '',
    userWorkGroup: '',
    hasUser: false,
    isAdminRole: false,
    activeRole: '',
    organizationName: '',
    todoCount: 0,
    todos: [],
    todoLoading: false,
    notificationCount: 0,
    notifications: [],
    notificationLoading: false,
    todoNextCursor: '',
    notificationNextCursor: '',
    todoLoadingMore: false,
    notificationLoadingMore: false,
    messagePartial: false,
    showMessageSwitchDialog: false,
    messageSwitchOrganizationName: '',
    messageSwitchTitle: copy.messages.switchOrganizationAndWorkContext,
    messageSwitchLoading: false,

    // 应用服务视图与搜索
    appViewMode: 'grid',        // 宫格或列表
    appSearchKeyword: '',
    filteredPortalCards: [],

    // 启动时确认登录状态：checking 时说明进度，unavailable 时允许重试或主动去登录
    portalAuthState: 'ready',
    portalAuthFrozen: false,

    // 顶栏由 ui-navbar 标准件渲染；标题用带“ - WHUSU智慧工作台”后缀的完整标题。
    navTitle: copy.navigationTitle,
    // 顶栏自绘后 100vh 是整屏高度，页面容器要按顶栏高度补偿，否则底部会多出空白。
    navTopPx: 0
  },

  _pollTimer: null,
  _isPageVisible: true,
  _messageOverviewLoading: false,
  _messageOverviewQueued: false,

  onLoad(options) {
    // 门户使用统一自绘顶栏（ui-navbar），标题由页面提供文案。
    this.applyNavigationMetrics();
    let pendingRoute = String((options && options.next) || '').trim();
    try { pendingRoute = decodeURIComponent(pendingRoute); } catch (_) { pendingRoute = ''; }
    this._pendingTrustedRoute = isTrustedRoute(pendingRoute)
      && pendingRoute.indexOf('/subpackages/main/pages/portal/portal') !== 0
      && pendingRoute.indexOf('/subpackages/main/pages/login/login') !== 0
      ? pendingRoute
      : '';
  },

  // Pad 横竖屏切换后状态栏与胶囊位置会变，页面容器补偿高度必须跟着重算。
  applyNavigationMetrics() {
    this.setData({ navTopPx: getNavigationBarMetrics().totalHeight });
  },

  onResize() {
    this.applyNavigationMetrics();
  },

  onShow() {
    this._isPageVisible = true;
    const activeSession = orgSession.getSnapshot();
    if (!activeSession.token || !activeSession.role) {
      // 默认落地门户：先问一次微信是不是已绑定账号，未绑定才去登录页，
      // 避免每次进来都要先点一次不必要的登录。
      this.runStartupAuthCheck();
      return;
    }
    this.continuePortalShow(activeSession);
  },

  /**
   * 启动确认：已绑定直接建立会话继续进门户；未绑定或冻结去登录页完成绑定/认领；
   * 网络等失败视为“未知”，先给出提示与“去登录”，再在后台自动重试一次。
   * 确认期间不显示任何“正在确认”的中间状态：正常情况下一两秒内自然出结果。
   */
  runStartupAuthCheck() {
    if (this._startupAuthRunning) return;
    this._startupAuthRunning = true;
    const requestId = (this._startupAuthRequestId || 0) + 1;
    this._startupAuthRequestId = requestId;
    const isCurrent = () => this._isPageVisible !== false && this._startupAuthRequestId === requestId;
    probeStartupSession({ delayMs: STARTUP_AUTH_FIRST_DELAY_MS, timeoutMs: STARTUP_AUTH_TIMEOUT_MS })
      .then((probe) => {
        if (!isCurrent()) return;
        if (this.applyStartupAuthProbe(probe)) return;
        // 先让用户可以马上“去登录”，再在后台自动重试一次；用户离开门户则结果作废。
        this._startupAuthRunning = false;
        this._startupAuthHintTimer = setTimeout(() => {
          this._startupAuthHintTimer = null;
          if (!isCurrent()) return;
          this.setData({ portalAuthState: 'unavailable', portalAuthFrozen: false });
        }, STARTUP_AUTH_HINT_DELAY_MS);
        return probeStartupSession({ delayMs: 0, timeoutMs: STARTUP_AUTH_RETRY_TIMEOUT_MS })
          .then((retryProbe) => {
            if (!isCurrent()) return;
            this.applyStartupAuthProbe(retryProbe);
          });
      })
      .catch(() => {
        if (!isCurrent()) return;
        this._startupAuthRunning = false;
        this.setData({ portalAuthState: 'unavailable', portalAuthFrozen: false });
      });
  },

  clearStartupAuthHintTimer() {
    if (!this._startupAuthHintTimer) return;
    clearTimeout(this._startupAuthHintTimer);
    this._startupAuthHintTimer = null;
  },

  /** 返回 true 表示已经落到确定状态；false 表示这次无法判断，需要提示与重试。 */
  applyStartupAuthProbe(probe) {
    const state = probe && probe.state;
    if (state === 'authenticated') {
      this.clearStartupAuthHintTimer();
      authContext.applyAuthenticatedResult(probe.result);
      this._startupAuthRunning = false;
      this.setData({ portalAuthState: 'ready', portalAuthFrozen: false });
      this.continuePortalShow(orgSession.getSnapshot());
      return true;
    }
    if (state === 'unbound') {
      this.clearStartupAuthHintTimer();
      this._startupAuthRunning = false;
      authContext.clearUnifiedAuthentication();
      wx.reLaunch({ url: '/subpackages/main/pages/login/login' });
      return true;
    }
    if (state === 'frozen') {
      this.clearStartupAuthHintTimer();
      this._startupAuthRunning = false;
      this.setData({ portalAuthState: 'unavailable', portalAuthFrozen: true });
      return true;
    }
    return false;
  },

  onRetryPortalAuth() {
    this.runStartupAuthCheck();
  },

  /** 门户左上角返回键：回登录页换账号；保留当前会话，可以返回门户。 */
  // 左上角按钮随登录状态切换：未登录时去登录页（保留当前会话），已登录时退出登录。
  onPortalAuthButtonTap() {
    if (this.data.hasUser) {
      this.logout();
      return;
    }
    this.onBackToLoginTap();
  },

  onBackToLoginTap() {
    navigateToTrustedRoute('/subpackages/main/pages/login/login');
  },

  continuePortalShow(activeSession) {
    const organizationState = orgSession.consume(this);
    if (organizationState.changed) {
      this._authorizationEntryAllowed = false;
      this._copyEntryAllowed = false;
      this._modernAccess = null;
      this._todoFingerprint = ''; this._notificationFingerprint = '';
      this._messageOverviewLoading = false;
      orgSession.invalidateRequests(this);
      this._messageRevision = (this._messageRevision || 0) + 1;
      this.setData({
        organizationName: activeSession.orgName || '',
        todoCount: 0,
        todos: [],
        notificationCount: 0,
        notifications: [],
        todoNextCursor: '',
        notificationNextCursor: '',
        todoLoading: false,
        notificationLoading: false,
        messagePartial: false,
        appSearchKeyword: ''
      });
    }
    // 视图偏好只有本页写入，返回同一页面时直接沿用。
    if (!this._appViewLoaded) {
      this._appViewLoaded = true;
      const savedView = wx.getStorageSync('appViewMode');
      if (savedView === 'list') this.setData({ appViewMode: savedView });
    }
    const currentUserState = this.refreshCurrentUser();
    this.refreshAuthorizationEntry();
    if (!currentUserState.hasUser || currentUserState.isAdminRole && currentUserState.user.identityModel !== 'unified') {
      this.restoreCurrentUser(activeSession);
    }
    if (currentUserState.isAdminRole) this.refreshAdminPermissionState();
    this.loadOrganizationName();
    if (currentUserState.hasUser) {
      this.retryPendingNotificationReads();
      this.loadMessageOverview();
    }
    this.startPolling();
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && typeof app.refreshTimeConfig === 'function') {
      if (this._timeConfigRefreshTimer) clearTimeout(this._timeConfigRefreshTimer);
      this._timeConfigRefreshTimer = setTimeout(function() { app.refreshTimeConfig(false); }, 500);
    }
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
    this.openPendingTrustedRoute();
    passwordBindingOffer.start(this);
    deviceMetadataReport.start(this);
  },

  openPendingTrustedRoute() {
    const targetUrl = this._pendingTrustedRoute;
    if (!targetUrl) return;
    this._pendingTrustedRoute = '';
    const receipt = notificationReceipt.take(targetUrl, orgSession.getSnapshot());
    navigateToTrustedRoute(targetUrl, {
      success: () => {
        if (receipt) this.confirmNotificationOpened(receipt);
      }
    });
  },

  onHide() {
    deviceMetadataReport.cancel(this);
    this._isPageVisible = false;
    orgSession.invalidateRequests(this);
    this._messageOverviewLoading = false;
    passwordBindingOffer.cancel(this);
    if (this._timeConfigRefreshTimer) {
      clearTimeout(this._timeConfigRefreshTimer);
      this._timeConfigRefreshTimer = null;
    }
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
    deviceMetadataReport.cancel(this);
    this._isPageVisible = false;
    passwordBindingOffer.cancel(this);
    const returningToLogin = shouldClearAuthenticationOnPortalExit(getCurrentPages(), this);
    this.stopPolling();
    if (this._timeConfigRefreshTimer) {
      clearTimeout(this._timeConfigRefreshTimer);
      this._timeConfigRefreshTimer = null;
    }
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
    if (returningToLogin) authContext.clearUnifiedAuthentication();
    if (returningToLogin) wx.reLaunch({ url: '/subpackages/main/pages/login/login' });
  },

  refreshCurrentUser() {
    const activeSession = orgSession.getSnapshot();
    const activeRole = activeSession.role || '';
    const user = activeRole ? authContext.getRuntimeProfile(activeRole) : null;
    const isAdminRole = activeRole === 'admin' && !!user && (!user.accountType || user.accountType === 'super_admin');
    const modern = user && user.identityModel === 'unified';
    const portalCards = modern ? unifiedPortalCards(this._modernAccess)
      : isAdminRole ? adminPermissions.filterPortalCards(PORTAL_CARDS_ADMIN, user) : PORTAL_CARDS_USER.slice();
    if (this._authorizationEntryAllowed && !portalCards.some(card => card.key === 'permissions')) {
      portalCards.push(PORTAL_CARDS_ADMIN.find(card => card.key === 'permissions'));
    }
    if (this._copyEntryAllowed) portalCards.push({ key: 'organizationCopy', label: authorizationCopy.configurationCopy.title,
      iconName: 'org-transfer', url: '/subpackages/org/pages/organizationCopy/organizationCopy', disabled: false });

    this.setData({
      activeRole,
      user: user,
      hasUser: !!user,
      isAdminRole: isAdminRole,
      heroName: user ? (user.name || copy.workContext.welcome) : copy.workContext.welcome,
      heroWorkContext: user ? getDisplayWorkContext(user, activeRole) : copy.appName,
      heroInitial: user && user.name ? user.name.charAt(0) : 'R',
      userDepartment: user ? (user.department || '') : '',
      userWorkGroup: user ? (user.workGroup || '') : '',
      portalCards,
      filteredPortalCards: this.filterAppCards(portalCards, this.data.appSearchKeyword)
    });
    return { user, activeRole, isAdminRole, hasUser: !!user, portalCards };
  },

  async restoreCurrentUser(expectedSession) {
    try {
      const catalog = await authContext.refreshCatalog();
      if (!orgSession.isCurrent(expectedSession)) return;
      if (catalog.needsContextSelection) {
        this._modernAccess = null;
        this._copyEntryAllowed = false;
        this._authorizationEntryAllowed = false;
        this.setData({ user: null, hasUser: false, portalCards: [], filteredPortalCards: [], todos: [], notifications: [] });
        navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
        return;
      }
      const restored = this.refreshCurrentUser();
      if (restored.isAdminRole) await this.refreshAdminPermissionState();
      if (restored.hasUser) {
        this.retryPendingNotificationReads();
        this.loadMessageOverview();
      }
    } catch (_) {
      // 目录暂时无法读取时保留当前可用的本地资料。
    }
  },

  async refreshAdminPermissionState() {
    const request = orgSession.beginRequest(this, 'portalAdminPermissions');
    try {
      await adminPermissions.refreshMyPermissions();
      if (orgSession.isRequestCurrent(this, request)) this.refreshCurrentUser();
    } catch (error) {
      if (this._isPageVisible && orgSession.isRequestCurrent(this, request)) this.refreshCurrentUser();
    }
  },

  async refreshAuthorizationEntry() {
    const request = orgSession.beginRequest(this, 'portalAuthorization');
    try {
      const access = await readCurrentAuthorizationAccess();
      if (!this._isPageVisible || !orgSession.isRequestCurrent(this, request) || !access) return;
      this._copyEntryAllowed = canOpenConfigurationCopy(access);
      this._modernAccess = access;
      this._authorizationEntryAllowed = canOpenAuthorization(access);
      this.refreshCurrentUser();
    } catch (error) {
      if (!this._isPageVisible || !orgSession.isRequestCurrent(this, request)
        || !['authorization_forbidden', 'forbidden'].includes(error.code || error.status)) return;
      this._authorizationEntryAllowed = false;
      this._copyEntryAllowed = false;
      this._modernAccess = null;
      this.refreshCurrentUser();
    }
  },

  loadOrganizationName() {
    const request = orgSession.beginRequest(this, 'portalOrganization');
    // 优先读取用户选择的活跃组织，其次回退 API 获取系统默认组织
    const storedName = orgSession.getSnapshot().orgName || '';
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
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
  },

  onIdentityTap() {
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
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
      wx.showToast({ title: card.disabledReason || copy.messages.retryLater, icon: 'none' });
      return;
    }
    if (card.action === 'scan') {
      this.startScan();
      return;
    }
    navigateToTrustedRoute(card.url);
  },

  /** 门户页的“扫一扫”快捷键入口。 */
  onScanQuickTap() {
    this.startScan();
  },

  /** 扫一扫：站内地址直接跳转，其他内容只展示与复制，不自动打开外部地址。 */
  startScan() {
    if (typeof wx.scanCode !== 'function') {
      showShortToast(copy.scanFailed);
      return;
    }
    if (this._scanRunning) return;
    this._scanRunning = true;
    wx.scanCode({
      scanType: ['qrCode', 'barCode', 'wxCode'],
      onlyFromCamera: false,
      success: (result) => {
        this._scanRunning = false;
        if (result && typeof result.path === 'string') {
          const path = '/' + result.path.replace(/^\//, '');
          // 使用当前代码包内导航，保留扫码者的开发版、体验版或正式版。
          if (isTrustedRoute(path)) { navigateToTrustedRoute(path); return; }
        }
        this.handleScanPayload(String((result && result.result) || '').trim());
      },
      fail: (error) => {
        this._scanRunning = false;
        if (/cancel/i.test(String((error && error.errMsg) || ''))) return;
        showShortToast(copy.scanFailed);
      }
    });
  },

  handleScanPayload(raw) {
    if (!raw) return;
    const identityCode = /^https:\/\/accumulation93\.com\/web\/identity-card\/verify\?token=([a-f0-9]{32})$/.exec(raw);
    if (identityCode) {
      navigateToTrustedRoute('/subpackages/org/pages/identityCard/identityCard?token=' + identityCode[1]);
      return;
    }
    if (isTrustedRoute(raw)) {
      navigateToTrustedRoute(raw);
      return;
    }
    const looksExternal = /^https?:\/\//i.test(raw);
    wx.showModal({
      title: copy.scanResultTitle,
      content: looksExternal ? copy.scanExternalHint + '\n' + raw : raw,
      confirmText: copy.scanCopyAction,
      cancelText: copy.scanCloseAction,
      success: (answer) => {
        if (!answer.confirm) return;
        wx.setClipboardData({ data: raw });
      }
    });
  },

  // ── 应用服务视图与搜索 ──

  switchAppView(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.appViewMode) return;
    wx.setStorageSync('appViewMode', mode);
    this.setData({ appViewMode: mode });
  },

  onAppSearchInput(e) {
    const value = e.detail.value;
    this.setData({ appSearchKeyword: value, filteredPortalCards: this.filterAppCards(this.data.portalCards, value) });
  },

  clearAppSearch() {
    this.setData({ appSearchKeyword: '', filteredPortalCards: this.data.portalCards });
  },

  filterAppCards(cards, value) {
    const keyword = (value || '').trim().toLowerCase();
    return keyword ? cards.filter(card => cardMatches(card, keyword)) : cards;
  },

  // ── 统一消息中心 ──
  formatMessageItems(items, isNotification) {
    return (items || []).map(function(item) {
      const extra = {
        categoryLabel: CATEGORY_LABELS[messageCategory(item)] || (isNotification ? copy.messages.notification : copy.messages.todo),
        createdAtText: formatAuditTime(item.createdAt, item.createdAtReviewStatus),
        workContextName: item.workContextName || item.contextLabel || item.assignmentLabel || item.identityName || ''
      };
      const interaction = isNotification ? { _showDelete: false, _swipeX: 0 } : {};
      return Object.assign(interaction, item, extra, describeMessage(item, messageFactsCopy, {
        notification: isNotification === true, canOpen: isTrustedRoute(item.targetUrl), formatDateTime: (value, reviewStatus) => formatDisplayTime(value, { reviewStatus }), formatRange: formatTimeRange, formatDate: formatDateOnly
      }));
    });
  },

  onSystemTimezoneChanged() {
    const patch = {};
    if (this.data.todos.length) patch.todos = this.formatMessageItems(this.data.todos, false);
    if (this.data.notifications.length) patch.notifications = this.formatMessageItems(this.data.notifications, true);
    if (patch.todos || patch.notifications) this.setData(patch);
  },

  async loadMessageOverview(refresh) {
    if (this._messageOverviewLoading) {
      if (refresh === true) { this._messageRefreshQueued = true; this._messageOverviewQueued = true; }
      if (this._messageOverviewRevision !== (this._messageRevision || 0)) this._messageOverviewQueued = true;
      return;
    }
    this._messageOverviewLoading = true;
    const request = orgSession.beginRequest(this, 'portalMessages');
    const revision = this._messageRevision || 0;
    this._messageOverviewRevision = revision;
    this.setData({ todoLoading: !this.data.todos.length, notificationLoading: !this.data.notifications.length });
    try {
      await Promise.all([false, true].map(async (isNotification) => {
        const prefix = isNotification ? 'notification' : 'todo';
        try {
          const res = await require('../../../../utils/messageQueries').load(isNotification ? 'listNotifications' : 'listTodos', { limit: 6, refresh: refresh === true });
          if (!this._isPageVisible || !orgSession.isRequestCurrent(this, request) || revision !== (this._messageRevision || 0)) return;
          if (res.status !== 'success') throw new Error('message_list_unavailable');
          const fingerprint = JSON.stringify([res.items, res.total, res.unreadCount]);
          const patch = {};
          patch[prefix + 'Loading'] = false;
          patch[prefix + 'Error'] = false;
          patch[prefix + 'Count'] = isNotification ? res.unreadCount || 0 : res.total || 0;
          if (!isNotification) patch.todoCountText = copy.view.todoCount(res.total > 99 ? '99+' : res.total || 0);
          if (this['_' + prefix + 'Fingerprint'] !== fingerprint) {
            orgSession.beginRequest(this, isNotification ? 'portalNotificationMore' : 'portalTodoMore');
            patch[prefix + 'LoadingMore'] = false;
            patch[isNotification ? 'notifications' : 'todos'] = this.formatMessageItems(res.items, isNotification);
            patch[prefix + 'NextCursor'] = res.nextCursor || '';
            this['_' + prefix + 'Fingerprint'] = fingerprint;
          }
          this['_' + prefix + 'Partial'] = !!res.partial;
          patch.messagePartial = !!(this._todoPartial || this._notificationPartial);
          const renderStarted = Date.now();
          this.setData(patch, function() {
            if (typeof recordMessageRender === 'function') recordMessageRender('portal.' + prefix, renderStarted, Object.keys(patch).length, null);
          });
        } catch (error) {
          if (this._isPageVisible && orgSession.isRequestCurrent(this, request)) {
            const patch = {}; patch[prefix + 'Loading'] = false; patch[prefix + 'Error'] = true;
            this.setData(patch);
          }
        }
      }));
    } catch (error) {
    } finally {
      if (orgSession.isRequestCurrent(this, request)) {
        this.setData({ todoLoading: false, notificationLoading: false });
      }
      if (orgSession.isRequestCurrent(this, request)) this._messageOverviewLoading = false;
      const shouldReload = this._messageOverviewQueued;
      this._messageOverviewQueued = false;
      if (shouldReload && this._isPageVisible && this.data.hasUser) {
        const forceRefresh = this._messageRefreshQueued === true;
        this._messageRefreshQueued = false;
        this.loadMessageOverview(forceRefresh);
      }
    }
  },

  async loadMoreTodos() {
    if (this._messageOverviewLoading || !this.data.todoNextCursor || this.data.todoLoadingMore) return;
    const request = orgSession.beginRequest(this, 'portalTodoMore');
    const revision = this._messageRevision || 0;
    this.setData({ todoLoadingMore: true });
    try {
      const res = await callFunction({ name: 'listTodos', data: { limit: 20, cursor: this.data.todoNextCursor } });
      if (res.status === 'cursor_expired' && orgSession.isRequestCurrent(this, request)) {
        this._todoFingerprint = '';
        this.retryMessageOverview();
        return;
      }
      if (!orgSession.isRequestCurrent(this, request)
          || revision !== (this._messageRevision || 0)
          || res.status !== 'success') return;
      this.setData({
        todos: this.data.todos.concat(this.formatMessageItems(res.items, false)),
        todoCount: res.total || 0,
        todoCountText: copy.view.todoCount(res.total > 99 ? '99+' : res.total || 0),
        todoNextCursor: res.nextCursor || '',
        messagePartial: !!res.partial
      });
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ todoLoadingMore: false });
    }
  },

  async loadMoreNotifications() {
    if (this._messageOverviewLoading || !this.data.notificationNextCursor || this.data.notificationLoadingMore) return;
    const request = orgSession.beginRequest(this, 'portalNotificationMore');
    const revision = this._messageRevision || 0;
    this.setData({ notificationLoadingMore: true });
    try {
      const res = await callFunction({ name: 'listNotifications', data: { limit: 20, cursor: this.data.notificationNextCursor } });
      if (!orgSession.isRequestCurrent(this, request)
          || revision !== (this._messageRevision || 0)
          || res.status !== 'success') return;
      this.setData({
        notifications: this.data.notifications.concat(this.formatMessageItems(res.items, true)),
        notificationCount: res.unreadCount || 0,
        notificationNextCursor: res.nextCursor || '',
        messagePartial: !!res.partial
      });
    } finally {
      if (orgSession.isRequestCurrent(this, request)) this.setData({ notificationLoadingMore: false });
    }
  },

  openMessageCenter(e) {
    const tab = e.currentTarget.dataset.tab === 'notifications' ? 'notifications' : 'todos';
    navigateToTrustedRoute('/subpackages/message/pages/messageCenter/messageCenter?tab=' + tab);
  },

  pendingReadStorageKey(organizationId) {
    return 'pendingNotificationReads:' + (organizationId || orgSession.getSnapshot().orgId || '') +
      ':' + (this.data.activeRole || '');
  },

  async retryPendingNotificationReads() {
    const key = this.pendingReadStorageKey();
    const ids = wx.getStorageSync(key) || [];
    if (!Array.isArray(ids) || !ids.length) return;
    const failed = [];
    for (const id of ids) {
      try {
        const result = await callFunction({
          name: 'markNotificationRead',
          data: { id: id, organizationId: orgSession.getSnapshot().orgId || '' }
        });
        if (result.status !== 'success') throw new Error(result.message || copy.messages.readFailed);
      }
      catch (_) { failed.push(id); }
    }
    if (failed.length) wx.setStorageSync(key, failed); else wx.removeStorageSync(key);
  },

  retryMessageOverview() {
    require('../../../../utils/messageQueries').invalidate();
    return this.loadMessageOverview(true);
  },

  queuePendingNotificationRead(item) {
    try {
      const key = this.pendingReadStorageKey(item.organizationId);
      const queued = wx.getStorageSync(key) || [];
      if (Array.isArray(queued) && queued.indexOf(item.id) === -1) {
        queued.push(item.id);
        wx.setStorageSync(key, queued);
      }
    } catch (_) {}
  },

  async confirmNotificationOpened(item) {
    if (!item || !item.id) return;
    const current = (this.data.notifications || []).find(function(row) {
      return row.id === item.id;
    });
    if (current && !current.isRead) {
      this._messageRevision = (this._messageRevision || 0) + 1;
      this.setData({
        notifications: this.data.notifications.map(function(row) {
          return row.id === item.id
            ? Object.assign({}, row, { isRead: true, _showDelete: false })
            : row;
        }),
        notificationCount: Math.max(0, this.data.notificationCount - 1)
      });
    }
    try {
      const result = await callFunction({
        name: 'markNotificationRead',
        data: { id: item.id, organizationId: item.organizationId }
      });
      if (result.status !== 'success') throw new Error(result.message || copy.messages.readFailed);
    } catch (_) {
      this.queuePendingNotificationRead(item);
    }
  },

  async onTodoTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = (this.data.todos || []).find(function(row) { return row.id === id; });
    if (!item) return;
    if (item.canOpen === false) { wx.showToast({ title: messageFactsCopy.todoDetailUnavailable, icon: 'none' }); return; }
    const switchKind = this.messageSwitchKind(item);
    if (switchKind === 'organization') {
      this.openMessageSwitchDialog(item, 'todo');
      return;
    }
    if (switchKind === 'context') {
      await this.activateMessageTarget(item, 'todo');
      return;
    }
    navigateToTrustedRoute(item.targetUrl);
  },

  async onNotificationTap(e) {
    if (this._notificationSwiping) return;
    const id = e.currentTarget.dataset.id;
    const current = (this.data.notifications || []).find(function(item) { return item.id === id; });
    if (!current) return;
    if (current.canOpen === false) { wx.showToast({ title: messageFactsCopy.notificationDetailUnavailable, icon: 'none' }); return; }
    const switchKind = this.messageSwitchKind(current);
    if (switchKind === 'organization') {
      this.openMessageSwitchDialog(current, 'notification');
      return;
    }
    if (switchKind === 'context') {
      await this.activateMessageTarget(current, 'notification');
      return;
    }
    if (id && current && !current.isRead) {
      navigateToTrustedRoute(current.targetUrl, {
        success: () => { this.confirmNotificationOpened(current); }
      });
      return;
    }
    if (current.targetUrl) navigateToTrustedRoute(current.targetUrl);
  },

  messageSwitchKind(item) {
    if (!item) return '';
    if (item.organizationId
      && item.organizationId !== String(orgSession.getSnapshot().orgId || '')) {
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

  openMessageSwitchDialog(item, type) {
    this._pendingMessageNavigation = { item: item, type: type };
    const sameOrganization = item.organizationId === String(orgSession.getSnapshot().orgId || '');
    this.setData({
      showMessageSwitchDialog: true,
      messageSwitchTitle: sameOrganization ? copy.messages.switchWorkContext : copy.messages.switchOrganizationAndWorkContext,
      messageSwitchOrganizationName: (item.organizationName || copy.messages.targetOrganization)
        + (item.workContextName ? ' · ' + item.workContextName : '')
    });
  },

  closeMessageSwitchDialog() {
    if (this.data.messageSwitchLoading) return;
    this._pendingMessageNavigation = null;
    this.setData({
      showMessageSwitchDialog: false,
      messageSwitchOrganizationName: ''
    });
  },

  async activateMessageContext(item) {
    if (item.contextId) return authContext.activateContext(item.contextId);
    if (item.organizationId && item.identityId) {
      return authContext.activateSelection(item.organizationId, item.identityId);
    }
    return activateOrganization(item.organizationId);
  },

  async activateMessageTarget(item, type) {
    try {
      await this.activateMessageContext(item);
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
      this.loadMessageOverview();
    }
  },

  async confirmMessageOrganizationSwitch() {
    const pending = this._pendingMessageNavigation;
    if (!pending || this.data.messageSwitchLoading) return;
    this.setData({ messageSwitchLoading: true });
    try {
      await this.activateMessageContext(pending.item);
      this._activeOrgSnapshot = orgSession.getSnapshot();
      if (pending.type === 'notification' && !pending.item.isRead) {
        notificationReceipt.stage(pending.item, orgSession.getSnapshot());
      }
      this._pendingMessageNavigation = null;
      this.setData({
        showMessageSwitchDialog: false,
        messageSwitchOrganizationName: '',
        messageSwitchLoading: false
      });
      const launched = reLaunchPortalThenNavigate(pending.item.targetUrl, {
        fail: function() { notificationReceipt.clear(pending.item.id); }
      });
      if (!launched) notificationReceipt.clear(pending.item.id);
    } catch (error) {
      const denied = error && (error.status === 'org_access_denied' || error.status === 'not_found');
      wx.showToast({ title: denied ? copy.messages.selectOrganization : copy.messages.switchFailed, icon: 'none' });
      this._pendingMessageNavigation = null;
      this.setData({
        showMessageSwitchDialog: false,
        messageSwitchOrganizationName: '',
        messageSwitchLoading: false
      });
      this.loadMessageOverview();
    }
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
    const previous = this.data.notifications;
    this._messageRevision = (this._messageRevision || 0) + 1;
    const deleted = previous.find(function(item) { return item.id === id; });
    const notifications = previous.filter(function(item) { return item.id !== id; });
    this.setData({
      notifications: notifications,
      notificationCount: deleted && !deleted.isRead ? Math.max(0, this.data.notificationCount - 1) : this.data.notificationCount
    });
    try {
      const result = await callFunction({
        name: 'deleteNotification',
        data: { id: id, organizationId: deleted && deleted.organizationId }
      });
      if (result.status !== 'success') throw new Error(result.message || copy.messages.deleteFailed);
      await this.loadMessageOverview(true);
    } catch (err) {
      this.setData({ notifications: previous });
      this.loadMessageOverview();
    }
  },

  async markAllNotificationsRead() {
    if (!this.data.notificationCount) return;
    this._messageRevision = (this._messageRevision || 0) + 1;
    const previous = {
      notifications: this.data.notifications,
      notificationCount: this.data.notificationCount,
      messagePartial: this.data.messagePartial
    };
    this.setData({
      notifications: previous.notifications.map(function(item) { return Object.assign({}, item, { isRead: true }); }),
      notificationCount: 0
    });
    try {
      const result = await callFunction({ name: 'markAllNotificationsRead', data: {} });
      if (result.status !== 'success') throw new Error(result.message || copy.messages.readFailed);
      if (isPartialBulkResult(result)) {
        this.setData(previous);
        await this.loadMessageOverview();
        showShortToast(copy.messages.partialBulkAction);
      }
    } catch (error) {
      this.setData(previous);
      await this.loadMessageOverview();
      showShortToast(copy.messages.incomplete);
    }
  },

  // ── 每 30 秒轮询刷新消息概览 ──
  startPolling() {
    this.stopPolling();
    const that = this;
    this._pollTimer = setInterval(function() {
      if (that._isPageVisible && that.data.hasUser) {
        that.loadMessageOverview();
      }
    }, 30000);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // ── 审批完成后通过事件总线刷新 ──
  _onApprovalDone: function() {
    if (this._isPageVisible && this.data.hasUser) {
      this.loadMessageOverview();
    }
  },

  goLogin() {
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
  },

  noop() {},

  logout() {
    authContext.clearUnifiedAuthentication();
    const pages = getCurrentPages();
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : null;
    if (previousPage && previousPage.route === 'subpackages/main/pages/login/login') {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: '/subpackages/main/pages/login/login' });
  },

});
