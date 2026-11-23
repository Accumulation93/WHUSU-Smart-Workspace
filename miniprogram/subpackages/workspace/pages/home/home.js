const { callFunction, getErrorText, formatAuditTime } = require('../../../../utils/api');
const directoryCopy = require('../../../../locales/zh-CN/contactDirectory');
const calendarCopy = require('../../../../locales/zh-CN/calendar');
const orgSession = require('../../../../utils/orgSession');
const authContext = require('../../../../utils/authContext');
const deviceMetadataReport = require('../../../../utils/deviceMetadataReport');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const { home: copy } = require('../../../../locales/zh-CN/main');
const { awardSelection: awardCopy } = require('../../../../locales/zh-CN/scoringPublication');
const { describeProfile } = require('../../package-resources/utils/hrProfileStatusView');
const publicationView = require('../../package-resources/utils/scoringPublicationView');
const { getNavigationBarMetrics } = require('../../../../utils/navigationBarMetrics');
const { readCurrentAuthorizationAccess } = require('../../../../utils/authorizationAccess');
const { managementTabAllowed } = require('../../../../utils/authorizationAccessView');
const authorizationCopy = require('../../../../locales/zh-CN/authorization');
const { formatDateOnly, getSystemDate } = require('../../../../utils/dateTime');
const {
  formatDateTextOnly,
  normalizeDateLiteral,
  normalizeDateTimeInstant,
  formatDateTimeText,
  formatDateTimePickerDate,
  formatDateTimePickerTime,
  pickerToUtcIso
} = require('../../package-resources/utils/hrProfileDate');

function getDisplayIdentity(user, activeRole) {
  if (!user) {
    return copy.text.signedOut;
  }

  if (activeRole === 'admin') {
    return user.adminLevel === 'super_admin' ? copy.text.superAdmin : copy.text.admin;
  }

  return user.identity || copy.text.unsetIdentity;
}

function emptyHrProfileState() {
  return {
    loading: false,
    saving: false,
    loaded: false,
    template: null,
    pendingValues: {},
    auditStatus: 'none',
    statusText: copy.text.profileNotSubmitted,
    rejectionReason: '',
    errorText: ''
  };
}

function emptyAccountSecurityState() {
  return {
    loading: false,
    loaded: false,
    account: null,
    devices: [],
    sessionMode: false,
    allowRecoveryCode: false,
    allowPassphrase: false,
    passphrase: '',
    recoveryCode: '',
    savingCredential: false,
    revokingDeviceKey: ''
  };
}

/**
 * 登录设备按“设备”展示：同一台设备上的多次登录（不同岗位、口令/微信登录、退出后重登）
 * 合成一台；没有识别码的会话合成一条“无法识别的设备”。
 */
function decorateAccountDevices(devices, sessions) {
  const sessionMode = !Array.isArray(devices);
  const list = !sessionMode
    ? devices
    : (sessions || []).map(function(item) {
      // 旧响应保留独立登录记录，不推测设备数量。
      return Object.assign({}, item, {
        deviceKey: item.deviceKey || '',
        sessionId: item.id || '',
        recognized: false,
        sessionCount: 1,
        currentDevice: Boolean(item.currentDevice || item.current)
      });
    });
  return list.map(function(item) {
    const recognized = item.recognized !== false;
    return Object.assign({}, item, {
      // 设备目录按设备区分；旧响应按登录记录区分。
      _rowKey: !sessionMode && item.deviceKey ? 'device:' + item.deviceKey : 'session:' + String(item.sessionId || ''),
      deviceKey: String(item.deviceKey || ''),
      sessionId: String(item.sessionId || ''),
      lastSeenText: formatAuditTime(String(item.lastSeenAt || ''), item.lastSeenAtReviewStatus),
      deviceTitle: sessionMode ? (item.currentDevice ? copy.text.currentSession : copy.text.otherSession) : item.currentDevice
        ? copy.text.currentDevice
        : (recognized ? copy.text.signedInDevice : copy.text.unrecognizedDevice),
      // 识别不出来的设备标题已经说明了情况，这里不再重复占一行。
      deviceMeta: [item.platform, item.model].filter(Boolean).join(' · ')
        || (!sessionMode && recognized ? copy.text.deviceModelUnavailable : '')
      // 登录设备只按设备区分：不展示当前身份与组织，避免看起来像按身份分行。
    });
  });
}

function assignmentNatureText(value) {
  if (value === 'staff') return copy.text.assignmentNatureStaff;
  if (value === 'liaison') return copy.text.assignmentNatureLiaison;
  if (value === 'other') return copy.text.assignmentNatureOther;
  return String(value || '').trim();
}

function decorateScoringTarget(item) {
  const target = Object.assign({}, item || {});
  const label = target.assignmentLabel && typeof target.assignmentLabel === 'object'
    ? target.assignmentLabel
    : {};
  const parts = [
    assignmentNatureText(label.assignmentNature || target.assignmentNature || target.assignmentKind),
    label.department || target.department,
    label.identityCategory || target.identityCategory || target.identity,
    label.workGroup || target.workGroup
  ].filter(Boolean);
  target._showAssignmentChip = Boolean(target.needsAssignmentDisambiguation && target.assignmentId);
  target._assignmentChipText = target._showAssignmentChip ? parts.join(' · ') : '';
  return target;
}

function emptyPublicationState() {
  return {
    publicationMemberCount: 0,
    meritRuleGroups: [],
    meritSummary: {},
    publicationAccessLoading: false,
    publicationResultsPending: false,
    publicationMeritPending: false,
    publicationResultsFailed: false,
    publicationMeritFailed: false,
    hasPublication: false,
    hasViewPerm: false,
    hasMeritPerm: false,
    canEditMerit: false,
    savedMeritRefreshText: awardCopy.savedNotRefreshed,
    userDesigCandidates: [],
    statsData: { count: 0, maxScore: '--', avgScore: '--' },
    displayMode: 'score',
    gradeDistribution: [],
    resultFilterIdentity: '',
    resultFilterDepartment: '',
    resultFilterWorkGroup: '',
    resultFilterGrade: '',
    resultSearchText: '',
    resultIdentities: [],
    resultDepartments: [],
    resultWorkGroups: [],
    filteredResults: [],
    filteredGroups: [],
    filteredStatsData: { count: 0, maxScore: '--', avgScore: '--' },
    expandedResultGroupClauseId: '',
    showUserDesigPopup: false,
    publicationPageLabels: { previous: calendarCopy.previous, next: calendarCopy.next },
    userDesigHrList: [],
    userDesigSelectedList: [],
    userDesigPubId: '',
    userDesigSaving: false,
    userDesigQuota: '',
    userDesigNotice: '',
    userDesigError: '',
    userDesigSaveUnknown: false,
    savedMeritRefreshFailed: false
  };
}

function showShortToast(title, icon = 'none') {
  const t = String(title || '');
  wx.showToast({
    title: t.length > 7 ? t.slice(0, 7) + '…' : t,
    icon
  });
}

function isValidDateString(value) {
  return Boolean(normalizeDateLiteral(String(value || '')));
}

function isValidDateTimeString(value) {
  return Boolean(normalizeDateTimeInstant(String(value || '')));
}

function getNumericLength(value) {
  return String(value || '').replace(/^[+-]/, '').replace('.', '').length;
}

function getProfileFieldTypeLabel(type) {
  if (type === 'number') {
    return copy.text.numberType;
  }
  if (type === 'sequence') {
    return copy.text.sequenceType;
  }
  if (type === 'date') {
    return copy.text.dateType;
  }
  if (type === 'datetime') {
    return copy.text.datetimeType;
  }
  if (type === 'phone') {
    return copy.text.phoneType;
  }
  if (type === 'email') {
    return copy.text.emailType;
  }
  return copy.text.textType;
}

function buildFieldHint(field = {}) {
  if (field.type === 'text' && ((field.minLength != null && field.minLength !== '') || (field.maxLength != null && field.maxLength !== ''))) {
    const parts = [];
    if (field.minLength != null && field.minLength !== '') {
      parts.push(copy.format.shortest(field.minLength));
    }
    if (field.maxLength != null && field.maxLength !== '') {
      parts.push(copy.format.longest(field.maxLength));
    }
    return copy.format.lengthLimit(parts);
  }

  if (field.type === 'number') {
    const decimalText = field.allowDecimal === false ? copy.text.integerOnly : copy.text.decimalAllowed;
    if (field.numberRule === 'length_range' && ((field.minDigits != null && field.minDigits !== '') || (field.maxDigits != null && field.maxDigits !== ''))) {
      const parts = [];
      if (field.minDigits != null && field.minDigits !== '') {
        parts.push(copy.format.shortest(field.minDigits));
      }
      if (field.maxDigits != null && field.maxDigits !== '') {
        parts.push(copy.format.longest(field.maxDigits));
      }
      return copy.format.numberLength(parts, decimalText);
    }
    if ((field.minValue != null && field.minValue !== '') || (field.maxValue != null && field.maxValue !== '')) {
      const parts = [];
      if (field.minValue != null && field.minValue !== '') {
        parts.push(copy.format.minimum(field.minValue));
      }
      if (field.maxValue != null && field.maxValue !== '') {
        parts.push(copy.format.maximum(field.maxValue));
      }
      return copy.format.numberRange(parts, decimalText);
    }
    return decimalText;
  }

  if (field.type === 'date') {
    return copy.text.dateFormat;
  }

  if (field.type === 'phone') {
    return copy.text.phoneHint;
  }

  if (field.type === 'email') {
    return copy.text.emailHint;
  }

  return '';
}

function normalizeDisplayField(field = {}, valueMap = {}) {
  const id = field.id || '';
  const rawValue = valueMap[id] || '';
  const result = {
    ...field,
    value: rawValue,
    inputPlaceholder: copy.format.required(field.label),
    // 日期字段提交与校验使用 YYYY-MM-DD，展示统一为 2004.08.31 简略格式。
    displayValue: field.type === 'date' ? formatDateTextOnly(rawValue) : rawValue,
    typeLabel: getProfileFieldTypeLabel(field.type),
    // 管理员写的填写说明单列一行；自动规则提醒继续保留，两者互不覆盖。
    hintLine: String(field.hint || '').trim(),
    hintText: buildFieldHint(field)
  };
  if (field.type === 'datetime') {
    // 日期时间字段存绝对时刻，展示按系统时区换算；选择器分别给出日期与时间初值。
    result.displayValue = rawValue ? (formatDateTimeText(rawValue) || rawValue) : '';
    result.pickerDate = rawValue ? formatDateTimePickerDate(rawValue) : '';
    result.pickerTime = rawValue ? formatDateTimePickerTime(rawValue) : '';
    result.displayDate = result.pickerDate;
    result.displayTime = result.pickerTime;
  }
  if (field.type === 'sequence' && Array.isArray(field.options)) {
    const idx = field.options.indexOf(rawValue);
    result.valueIndex = idx >= 0 ? idx : 0;
  }
  return result;
}

function validateProfileField(field = {}, rawValue) {
  const value = rawValue == null ? '' : String(rawValue).trim();

  if (field.required && !value) {
    return copy.format.required(field.label);
  }

  if (!value) {
    return '';
  }

  if (field.type === 'text') {
    const characterCount = Array.from(value).length;
    if (field.minLength != null && field.minLength !== '' && characterCount < field.minLength) {
      return copy.format.minimumCharacters(field.label, field.minLength);
    }
    if (field.maxLength != null && field.maxLength !== '' && characterCount > field.maxLength) {
      return copy.format.maximumCharacters(field.label, field.maxLength);
    }
  }

  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) {
      return copy.format.integer(field.label);
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return copy.format.number(field.label);
    }
    if (field.numberRule === 'length_range') {
      const numericLength = getNumericLength(value);
      if (field.minDigits != null && field.minDigits !== '' && numericLength < field.minDigits) {
        return copy.format.minimumDigits(field.label, field.minDigits);
      }
      if (field.maxDigits != null && field.maxDigits !== '' && numericLength > field.maxDigits) {
        return copy.format.maximumDigits(field.label, field.maxDigits);
      }
    } else {
      if (field.minValue != null && field.minValue !== '' && numberValue < field.minValue) {
        return copy.format.minimumValue(field.label, field.minValue);
      }
      if (field.maxValue != null && field.maxValue !== '' && numberValue > field.maxValue) {
        return copy.format.maximumValue(field.label, field.maxValue);
      }
    }
  }

  if (field.type === 'sequence' && Array.isArray(field.options) && field.options.length && field.options.indexOf(value) === -1) {
    return copy.format.selectValid(field.label);
  }

  if (field.type === 'date' && !isValidDateString(value)) {
    return copy.format.check(field.label);
  }

  if (field.type === 'datetime' && !isValidDateTimeString(value)) {
    return copy.format.check(field.label);
  }

  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) {
    return copy.format.check(field.label);
  }

  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return copy.format.check(field.label);
  }

  return '';
}

Page({
  // 顶栏高度：顶栏自绘后 100vh 是整屏高度，横竖屏切换要重算页面容器的补偿高度；
  // Pad 横屏的页签会在页面里吸顶，它的 top 也要跟着顶栏下移。
  applyNavigationBarMetrics() {
    const totalHeight = getNavigationBarMetrics().totalHeight;
    this.setData({ navTopPx: totalHeight, navStickyTopPx: totalHeight + 16 });
  },

  onResize() {
    this.applyNavigationBarMetrics();
  },

  data: {
    navigationTitle: copy.format.navigationTitle(''),
    navTopPx: 0,
    navStickyTopPx: 16,
    copy: copy.text,
    user: null,
    activeRole: '',
    hasUser: false,
    isAdminRole: false,
    heroName: copy.text.welcome,
    heroIdentity: copy.text.signedOut,
    heroSubtitle: copy.text.signInWithWechat,
    organizationName: '',
    currentActivity: null,
    publicationActivity: null,
    currentActivityText: copy.text.loadingDots,
    activityPaused: false,
    activityEnded: false,
    targetList: [],
    targetGroups: [],
    selectedTargetId: '',
    targetsLoading: false,
    targetsEmptyText: copy.text.loadingDots,
    scoringStats: { total: 0, scored: 0, pending: 0 },
    // Start with only always-available tabs; results/meritList added after permission check
    userTabs: [
      { key: 'scoring', label: copy.text.scoring },
      { key: 'profile', label: copy.text.hr }
    ],
    activeTab: 'scoring',
    hrProfile: emptyHrProfileState(),
    accountSecurity: emptyAccountSecurityState(),
    ...emptyPublicationState(),
    // Audit badge counts
    auditPendingCount: 0,
    auditMyCount: 0,
    auditApprovalHistoryCount: 0,
    auditCanVerify: false,
    canManageSubApp: false,
    managementSubApp: 'scoring',
    managementDialogVisible: false,
    managementKeyboardHeight: 0,
  },

  noop() {},

  onShow() {
    this._isPageVisible = true;
    const organizationState = orgSession.consume(this);
    const snapshot = organizationState.snapshot;
    const contextKey = [snapshot.role, snapshot.orgId, snapshot.contextId].join('::');
    const firstEntry = !this._homeContextKey;
    const organizationChanged = organizationState.changed
      || (!!this._homeContextKey && this._homeContextKey !== contextKey);
    this._homeContextKey = contextKey;
    this._orgContextSnapshot = organizationState.snapshot;
    const preservedTab = this.data.activeTab;
    if (organizationChanged) {
      orgSession.invalidateRequests(this);
      this._meritEditor = null;
      this._publicationRows = null;
      this._publicationLoaded = false;
      this._preferredOrgTab = preservedTab;
      this.setData({
        ...emptyPublicationState(),
        canManageSubApp: false,
        activeTab: preservedTab,
        currentActivity: null,
        publicationActivity: null,
        currentActivityText: copy.text.loadingDots,
        activityPaused: false,
        activityEnded: false
      });
    }
    this.refreshCurrentUser({ resetPageState: firstEntry || organizationChanged });
    this.loadManagementAccess();
    if (snapshot.role === 'user') {
      if (this._subApp === 'scoring') {
        this.fetchRateTargets('user', {
          preserveExisting: !organizationChanged && this.data.targetList.length > 0
        });
        if (firstEntry || organizationChanged || !this.data.currentActivity) {
          this.loadCurrentActivity();
          this.loadLatestPublishedActivity();
        } else if (this.data.publicationActivity && (this._refreshPublicationOnShow
          || !this._publicationLoaded && ['results', 'meritList'].includes(this.data.activeTab))) {
          this.checkPublication();
        } else if (this._refreshMeritOnShow && this.data.publicationActivity) {
          this.refreshMeritAfterSave();
        }
        this._refreshPublicationOnShow = false;
        this._refreshMeritOnShow = false;
      }
      if (firstEntry || organizationChanged) this.refreshUserFromCloud();
      if (this._subApp === 'hr') {
        this.loadUserHrProfile();
        this.loadAccountSecurity();
        deviceMetadataReport.start(this, () => this.loadAccountSecurity());
      }
    }
    this.loadOrganizationName();
  },

  onLoad(options) {
    this._subApp = (options && options.subApp) || 'scoring';
    this._openManagementArea = !!(options && options.area === 'management');
    this.setData({ managementSubApp: this._subApp });
    if (this._subApp === 'hr' && options.tab === 'directory') {
      this._preferredOrgTab = 'directory';
      this.setData({ activeTab: 'directory', contactKey: /^[a-f0-9]{96}$/.test(options.contactKey || '') ? options.contactKey : '' });
    }
    this._focusAccountSecurity = Boolean(options && options.section === 'account');
  },

  applySubAppFilter() {
    const subApp = this._subApp || 'scoring';
    const SUB_APP_USER_TABS = {
      scoring: ['scoring', 'results', 'meritList'],
      hr: ['profile', 'directory'],
      audit: ['audit']
    };
    this._subAppAllowedTabs = SUB_APP_USER_TABS[subApp] || SUB_APP_USER_TABS.scoring;
    const SUB_APP_LABELS = { scoring: copy.text.scoring, hr: copy.text.hr, audit: copy.text.audit };
    this._subAppLabel = SUB_APP_LABELS[subApp] || '';
    this.setData({ navigationTitle: copy.format.navigationTitle(this._subAppLabel) });
  },

  rebuildUserTabs(finalizeOrgFallback) {
    if (!this._subAppAllowedTabs) this.applySubAppFilter();
    const allowed = this._subAppAllowedTabs || ['scoring', 'results', 'meritList'];
    const tabs = [];
    if (allowed.indexOf('scoring') !== -1) tabs.push({ key: 'scoring', label: copy.text.scoring });
    if (allowed.indexOf('results') !== -1 && (this.data.hasViewPerm || this.data.publicationResultsPending || this.data.publicationResultsFailed)) {
      tabs.push({ key: 'results', label: copy.text.results });
    }
    if (allowed.indexOf('meritList') !== -1 && (this.data.hasMeritPerm || this.data.publicationMeritPending || this.data.publicationMeritFailed)) {
      tabs.push({ key: 'meritList', label: copy.text.meritList });
    }
    if (allowed.indexOf('profile') !== -1) tabs.push({ key: 'profile', label: directoryCopy.profile });
    if (allowed.indexOf('directory') !== -1) tabs.push({ key: 'directory', label: directoryCopy.title });
    // Always add audit tab for users with HR info
    if (allowed.indexOf('audit') !== -1 && this.data.hasUser) {
      tabs.push({ key: 'audit', label: copy.text.audit });
    }
    if (this.data.canManageSubApp) tabs.push({ key: 'management', label: authorizationCopy.businessManagement });
    const preferredTab = this._preferredOrgTab || '';
    const preferredAvailable = !!preferredTab && tabs.some((item) => item.key === preferredTab);
    const currentAvailable = tabs.some((item) => item.key === this.data.activeTab);
    let activeTab = this.data.activeTab;
    if (preferredAvailable) {
      activeTab = preferredTab;
    } else if (tabs.length === 1 || ((finalizeOrgFallback || this._subApp === 'hr') && !currentAvailable)) {
      activeTab = tabs.length ? tabs[0].key : 'scoring';
    }
    if (finalizeOrgFallback) {
      if (preferredTab && !preferredAvailable && activeTab !== preferredTab) {
        showShortToast(copy.text.noFeatureInOrganization);
      }
      this._preferredOrgTab = '';
    }
    this.setData({ userTabs: tabs, activeTab });
    // Load audit badge counts
    if (this.data.hasUser && allowed.indexOf('audit') !== -1) {
      this.loadAuditBadgeCounts();
      this.loadAuditVerificationAccess();
    }
  },

  refreshUserFromCloud() {
    const activeSession = orgSession.getSnapshot();
    const activeRole = activeSession.role || '';
    const activeOrgId = activeSession.orgId || '';

    if (activeRole !== 'user' || !activeOrgId) {
      return;
    }

    const request = orgSession.beginRequest(this, 'userProfile');
    authContext.refreshCatalog().then(() => {
      if (!orgSession.isRequestCurrent(this, request)) return;
      const activeContext = authContext.getActiveWorkContext();
      if (!activeContext || activeContext.organizationId !== activeOrgId || activeContext.role !== 'user') return;
      const profile = authContext.getRuntimeProfile('user')
        || authContext.normalizeProfile(activeContext);
      const storedProfile = this.updateStoredProfile('user', profile);

      if (this.data.activeRole === 'user') {
        this.setData({
          user: storedProfile,
          hasUser: true,
          heroName: storedProfile.name || copy.text.welcome,
          heroIdentity: getDisplayIdentity(storedProfile, 'user'),
          heroSubtitle: this._subAppLabel || ''
        });

        this.rebuildUserTabs();
      }
    }).catch(() => {});
  },

  onHide() {
    this._isPageVisible = false;
    this._restoreManagementTab = this.data.activeTab === 'management';
    this._managementGeneration = (this._managementGeneration || 0) + 1;
    this._refreshPublicationOnShow = this.data.publicationAccessLoading;
    this._refreshMeritOnShow = this.data.userDesigSaving || this.data.publicationMeritPending;
    this._meritEditor = null;
    this.setData({ managementDialogVisible: false, managementKeyboardHeight: 0,
      publicationAccessLoading: false, publicationResultsPending: false, publicationMeritPending: false,
      showUserDesigPopup: false, userDesigSaving: false, userDesigHrList: [], userDesigSelectedList: [] });
    deviceMetadataReport.cancel(this);
    orgSession.invalidateRequests(this);
  },

  onUnload() {
    this.onHide();
    this._publicationRows = null;
  },

  refreshCurrentUser(options) {
    const settings = options || {};
    this.applySubAppFilter();
    const subAppLabel = this._subAppLabel || '';
    const activeSession = orgSession.getSnapshot();
    const activeRole = activeSession.role || '';
    const currentUser = activeRole ? authContext.getRuntimeProfile(activeRole) : null;
    const isAdminRole = activeRole === 'admin' && !(currentUser && currentUser.identityModel === 'unified');
    const patch = {
      activeRole,
      user: currentUser,
      hasUser: !!currentUser,
      isAdminRole,
      heroTone: activeRole === 'admin' ? 'admin' : 'blue',
      heroName: currentUser ? currentUser.name : copy.text.welcome,
      heroIdentity: getDisplayIdentity(currentUser, activeRole),
      heroSubtitle: currentUser ? subAppLabel : copy.text.signInWithWechat,
      activeTab: isAdminRole ? 'scoring' : this.data.activeTab,
      organizationName: activeSession.orgName || this.data.organizationName
    };
    if (settings.resetPageState) {
      Object.assign(patch, {
        targetList: [],
        targetGroups: [],
        selectedTargetId: '',
        targetsEmptyText: copy.text.loadingDots,
        targetsLoading: false,
        scoringStats: { total: 0, scored: 0, pending: 0 },
        hrProfile: emptyHrProfileState(),
        auditCanVerify: false
      });
    }
    this.setData(patch);

    if (currentUser && activeRole === 'user') {
      // 用户信息现在以 checkLogin 云端合并结果为准，
      // 不再用本地缓存直接加载被评分人，避免旧缓存缺字段导致误报。
    }

    // Ensure audit tab is added immediately — don't wait for checkPublication
    if (currentUser && !isAdminRole) {
      this.rebuildUserTabs();
    }
  },

  switchUserTab(e) {
    const tab = String(e.currentTarget.dataset.tab || '');
    if (this.data.userDesigSaving || !this.data.userTabs.some(item => item.key === tab) || tab === this.data.activeTab) {
      return;
    }
    this._restoreManagementTab = false;

    this.setData({
      activeTab: tab
    });

    if (tab === 'profile' && this.data.activeRole === 'user' && !this.data.hrProfile.loaded) {
      this.loadUserHrProfile();
    }
    if (tab === 'profile' && this.data.activeRole === 'user' && !this.data.accountSecurity.loaded) {
      this.loadAccountSecurity();
    }
    if (tab === 'audit') {
      this.loadAuditBadgeCounts();
      this.loadAuditVerificationAccess();
    }
    if (tab === 'results' || tab === 'meritList') {
      if (this.data.publicationActivity) {
        if (!this._publicationLoaded && !this.data.publicationAccessLoading) this.checkPublication();
      } else this.loadLatestPublishedActivity();
    }
  },

  async loadManagementAccess() {
    const generation = (this._managementGeneration || 0) + 1;
    this._managementGeneration = generation;
    const groups = {
      scoring: ['activities', 'templates', 'rules', 'results', 'publications'],
      hr: ['hrInfo', 'hrTemplates', 'departments', 'workGroups', 'identities', 'assignmentNatures'],
      audit: ['auditTemplates', 'auditStamps', 'auditSubmissions', 'auditVerification']
    };
    let allowed = false;
    try {
      const access = await readCurrentAuthorizationAccess();
      const profile = authContext.getRuntimeProfile(orgSession.getSnapshot().role);
      allowed = Boolean(access && (access.role === 'user' || profile && profile.identityModel === 'unified')
        && (groups[this._subApp] || []).some(tab => managementTabAllowed(access, tab)));
    } catch (error) {
      if (!['authorization_forbidden', 'forbidden'].includes(error.code || error.status)) return;
    }
    if (!this._isPageVisible || generation !== this._managementGeneration) return;
    const patch = { canManageSubApp: allowed };
    if (allowed && (this._restoreManagementTab || this._openManagementArea)) patch.activeTab = 'management';
    this._openManagementArea = false;
    this._restoreManagementTab = false;
    if (!allowed && this.data.activeTab === 'management') patch.activeTab = (this._subAppAllowedTabs || ['scoring'])[0];
    this.setData(patch);
    this.rebuildUserTabs();
  },

  onManagementDialogChange(event) {
    this.setData({ managementDialogVisible: Boolean(event.detail.visible), managementKeyboardHeight: Number(event.detail.keyboardHeight) || 0 });
  },

  onReachBottom() {
    if (this.data.activeTab !== 'management') return;
    const workbench = this.selectComponent('#management-workbench');
    if (workbench) workbench.workbenchReachBottom();
  },

  loadCurrentActivity() {
    const request = orgSession.beginRequest(this, 'currentActivity');
    callFunction({
      name: 'getCurrentScoreActivity',
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        const result = res.result || {};
        const activity = result.activity || null;
        this.setData({
          currentActivity: activity,
          currentActivityText: activity ? activity.name : copy.text.noActivity,
          activityPaused: activity ? !!activity.isPaused : false,
          activityEnded: Boolean(activity && activity.endDate && getSystemDate() > activity.endDate)
        });
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          currentActivity: null,
          currentActivityText: copy.text.noActivity,
          activityPaused: false,
          activityEnded: false
        });
      }
    });
  },

  loadLatestPublishedActivity() {
    if (this._publicationDiscovery && orgSession.isRequestCurrent(this, this._publicationDiscovery)) return;
    const request = orgSession.beginRequest(this, 'publicationActivity');
    this._publicationDiscovery = request;
    callFunction({
      name: 'getLatestPublishedScoreActivity',
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        const result = res.result || {};
        if (result.status !== 'success') {
          this.useCurrentActivityAsPublicationFallback();
          return;
        }
        const activity = result.activity || null;
        const previousId = (this.data.publicationActivity || {}).id;
        if (previousId !== (activity || {}).id) {
          this._publicationLoaded = false;
          this._publicationRows = null;
          this._meritEditor = null;
          this.setData(emptyPublicationState());
        }
        this.setData({ publicationActivity: activity });
        if (activity) {
          this.checkPublication();
        } else {
          this.setData(emptyPublicationState());
          this.rebuildUserTabs(true);
        }
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        // 临时网络失败时保留已经确认过的公示入口，避免页签闪烁或消失。
        if (this.data.publicationActivity) {
          this.checkPublication();
          return;
        }
        // 新接口与小程序可能分批发布。服务端尚未支持历史公示发现时，
        // 继续用当前活动读取公示，避免已上线的结果/评优入口短暂消失。
        this.useCurrentActivityAsPublicationFallback();
      },
      complete: () => {
        if (this._publicationDiscovery === request) this._publicationDiscovery = null;
      }
    });
  },

  useCurrentActivityAsPublicationFallback() {
    const activity = this.data.currentActivity || null;
    if (!activity) return;
    this.setData({ publicationActivity: activity });
    this.checkPublication();
  },

  loadOrganizationName() {
    const storedName = orgSession.getSnapshot().orgName || '';
    if (storedName) {
      this.setData({ organizationName: storedName });
      return;
    }
    callFunction({
      name: 'getCurrentOrganization',
      success: (res) => {
        const result = res.result || {};
        const org = result.organization;
        const name = org && org.name ? org.name : '';
        this.setData({ organizationName: name });
        if (name) wx.setStorageSync('activeOrgName', name);
      },
      fail: () => {
        this.setData({ organizationName: '' });
      }
    });
  },

  onOrgTap() {
    navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
  },

  processRateTargetsResult(result, options) {
    const settings = options || {};
    if (result.status !== 'success') {
      if (settings.preserveExisting && this.data.targetList.length) return;
      this.setData({
        targetList: [],
        targetGroups: [],
        targetsEmptyText: result.message || copy.text.noTargets,
        scoringStats: { total: 0, scored: 0, pending: 0 }
      });
      return;
    }

    const currentUser = result.scorer
      ? this.updateStoredProfile('user', result.scorer)
      : this.data.user;

    const targets = (result.targets || []).map(decorateScoringTarget);
    const groupMap = {};
    let scoredCount = 0;
    for (let i = 0; i < targets.length; i++) {
      const identity = targets[i].identity || copy.text.unclassified;
      if (!groupMap[identity]) { groupMap[identity] = []; }
      groupMap[identity].push(targets[i]);
      if (targets[i].scoreStatus === 'scored') scoredCount++;
    }
    const groupKeys = Object.keys(groupMap);
    const targetGroups = groupKeys.map(function (identity) {
      return { identity: identity, targets: groupMap[identity] };
    });

    this.setData({
      user: currentUser,
      heroName: currentUser ? currentUser.name : this.data.heroName,
      heroIdentity: getDisplayIdentity(currentUser, 'user'),
      targetList: targets,
      targetGroups: targetGroups,
      targetsEmptyText: targets.length ? '' : copy.text.noVisibleTargets,
      scoringStats: {
        total: targets.length,
        scored: scoredCount,
        pending: targets.length - scoredCount
      }
    });
  },

  fetchRateTargets(role, options) {
    const settings = options || {};
    const request = orgSession.beginRequest(this, 'rateTargets');
    const preserveVisibleTargets = settings.preserveExisting && this.data.targetList.length > 0;
    const loadingPatch = {
      targetsLoading: !preserveVisibleTargets,
      selectedTargetId: '',
      targetsEmptyText: this.data.targetList.length ? this.data.targetsEmptyText : copy.text.loadingTargets
    };
    if (!preserveVisibleTargets) {
      Object.assign(loadingPatch, {
        targetList: [],
        targetGroups: [],
        scoringStats: { total: 0, scored: 0, pending: 0 }
      });
    }
    this.setData(loadingPatch);

    callFunction({
      name: 'getRateTargets',
      data: { role },
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.processRateTargetsResult(res.result || {}, settings);
      },
      fail: (error) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        if (error.statusCode === 403 || !settings.preserveExisting || !this.data.targetList.length) {
          this.setData({
            targetList: [],
            targetGroups: [],
            targetsEmptyText: copy.text.refreshTargetsLater,
            scoringStats: { total: 0, scored: 0, pending: 0 }
          });
        }
      },
      complete: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          targetsLoading: false
        });
      }
    });
  },

  processHrProfileResult(result) {
    if (result.status !== 'success') {
      this.setData({
        hrProfile: Object.assign({}, this.data.hrProfile || emptyHrProfileState(), {
          loading: false,
          saving: false,
          loaded: true,
          errorText: getErrorText(result, copy.text.profileLoadFailed)
        })
      });
      return;
    }

    const template = result.template || null;
    const baseValues = result.values || {};
    const pendingValues = result.pendingValues || {};
    const formValues = result.auditStatus === 'pending'
      ? { ...baseValues, ...pendingValues }
      : { ...baseValues };
    const nextTemplate = template ? {
      ...template,
      modeText: describeProfile({ template }, copy.text).modeText,
      editMode: ['direct', 'audit', 'readonly'].indexOf(template.editMode) >= 0 ? template.editMode : 'readonly',
      fields: (template.fields || []).map((field) => normalizeDisplayField(field, formValues))
    } : null;

    this.setData({
      hrProfile: {
        loading: false,
        saving: false,
        loaded: true,
        template: nextTemplate,
        fieldsNotApplicable: result.profileFieldsNotApplicable === true,
        pendingValues,
        auditStatus: result.auditStatus || 'none',
        statusText: describeProfile(result, copy.text).statusText,
        completenessText: describeProfile(result, copy.text).completenessText,
        rejectionReason: result.rejectionReason || '',
        errorText: ''
      }
    });
  },

  loadUserHrProfile() {
    if (this.data.activeRole !== 'user' || !this.data.hasUser) {
      return;
    }

    const request = orgSession.beginRequest(this, 'hrProfile');
    this.setData({
      'hrProfile.loading': true,
      'hrProfile.errorText': ''
    });

    callFunction({
      name: 'getUserHrProfile',
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.processHrProfileResult(res.result || {});
      },
      fail: (error) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          hrProfile: Object.assign({}, this.data.hrProfile || emptyHrProfileState(), {
            loading: false,
            saving: false,
            loaded: true,
            errorText: getErrorText(error, copy.text.profileLoadFailed)
          })
        });
      }
    });
  },

  retryUserHrProfile() {
    if (this.data.hrProfile && this.data.hrProfile.loading) return;
    this.loadUserHrProfile();
  },

  async loadAccountSecurity() {
    if (this.data.activeRole !== 'user' || !this.data.hasUser) return;
    const request = orgSession.beginRequest(this, 'accountSecurityInProfile');
    this.setData({ 'accountSecurity.loading': true });
    try {
      const result = await callFunction({ name: 'auth/security', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (!result || result.status !== 'success') {
        throw new Error((result && result.message) || copy.text.retryLater);
      }
      const policy = result.policy || {};
      this.setData({
        accountSecurity: Object.assign({}, this.data.accountSecurity, {
          loading: false,
          loaded: true,
          account: result.account || null,
          devices: decorateAccountDevices(result.devices, result.sessions),
          sessionMode: !Array.isArray(result.devices),
          allowRecoveryCode: Boolean(policy.allowRecoveryCode),
          allowPassphrase: Boolean(policy.allowPassphrase)
        })
      });
      if (this._focusAccountSecurity) {
        this._focusAccountSecurity = false;
        setTimeout(function() {
          wx.pageScrollTo({ selector: '#account-and-login', duration: 240 });
        }, 80);
      }
    } catch (error) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.setData({
        accountSecurity: Object.assign({}, this.data.accountSecurity, {
          loading: false,
          loaded: true
        })
      });
      showShortToast(getErrorText(error, copy.text.retryLater));
    }
  },

  onAccountPassphraseInput(e) {
    this.setData({ 'accountSecurity.passphrase': String(e.detail.value || '') });
  },

  async rotateAccountRecoveryCode() {
    const security = this.data.accountSecurity;
    if (security.savingCredential) return;
    this.setData({ 'accountSecurity.savingCredential': true });
    try {
      const result = await callFunction({
        name: 'auth/security/recovery-credential',
        data: { method: 'recovery_code' }
      });
      if (!result || result.status !== 'success' || !result.recoveryCode) {
        throw new Error((result && result.message) || copy.text.generationFailed);
      }
      this.setData({ 'accountSecurity.recoveryCode': result.recoveryCode });
    } catch (error) {
      showShortToast(getErrorText(error, copy.text.generationFailed));
    } finally {
      this.setData({ 'accountSecurity.savingCredential': false });
    }
  },

  copyAccountRecoveryCode() {
    const code = this.data.accountSecurity.recoveryCode;
    if (code) wx.setClipboardData({ data: code });
  },

  hideAccountRecoveryCode() {
    this.setData({ 'accountSecurity.recoveryCode': '' });
  },

  async saveAccountPassphrase() {
    const security = this.data.accountSecurity;
    if (security.savingCredential) return;
    if (!security.passphrase) {
      showShortToast(copy.text.passphraseRequired);
      return;
    }
    this.setData({ 'accountSecurity.savingCredential': true });
    try {
      const result = await callFunction({
        name: 'auth/security/recovery-credential',
        data: { method: 'passphrase', value: security.passphrase }
      });
      if (!result || result.status !== 'success') {
        throw new Error((result && result.message) || copy.text.saveFailed);
      }
      this.setData({ 'accountSecurity.passphrase': '' });
      showShortToast(copy.text.passphraseUpdated, 'success');
    } catch (error) {
      showShortToast(getErrorText(error, copy.text.saveFailed));
    } finally {
      this.setData({ 'accountSecurity.savingCredential': false });
    }
  },

  async revokeAccountDevice(e) {
    const rowKey = String((e.currentTarget.dataset || {}).rowKey || '');
    const device = (this.data.accountSecurity.devices || []).find((item) => item._rowKey === rowKey);
    if (!device || this.data.accountSecurity.revokingDeviceKey) return;
    const sessionId = String(device.sessionId || '');
    const deviceKey = String(device.deviceKey || '');
    const revokeKey = device._rowKey;
    this.setData({ 'accountSecurity.revokingDeviceKey': revokeKey });
    try {
      // 有 sessionId 说明服务端还没返回设备维度，退回单条吊销；否则按设备整体退出。
      const result = await callFunction({
        name: 'auth/security/sessions/revoke',
        data: sessionId ? { sessionId } : { deviceKey }
      });
      if (!result || (result.status !== 'success' && result.status !== 'not_found')) {
        throw new Error((result && result.message) || copy.text.retry);
      }
      const devices = (this.data.accountSecurity.devices || []).filter((item) => item._rowKey !== revokeKey);
      this.setData({ 'accountSecurity.devices': devices });
      showShortToast(this.data.accountSecurity.sessionMode ? copy.text.sessionEnded : copy.text.deviceSignedOut, 'success');
    } catch (error) {
      showShortToast(getErrorText(error, copy.text.retry));
    } finally {
      this.setData({ 'accountSecurity.revokingDeviceKey': '' });
    }
  },

  onHrProfileInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const fields = [...((this.data.hrProfile.template && this.data.hrProfile.template.fields) || [])];
    if (!fields[index]) {
      return;
    }

    fields[index] = {
      ...fields[index],
      value: String(e.detail.value || '')
    };

    this.setData({
      'hrProfile.template.fields': fields
    });
  },

  onHrProfileOptionChange(e) {
    const fieldIndex = Number(e.currentTarget.dataset.index);
    const optionIndex = Number(e.detail.value);
    const fields = [...((this.data.hrProfile.template && this.data.hrProfile.template.fields) || [])];
    const field = fields[fieldIndex];
    const nextValue = field && Array.isArray(field.options) ? field.options[optionIndex] : '';
    if (!field || !nextValue) {
      return;
    }

    fields[fieldIndex] = {
      ...field,
      value: nextValue,
      displayValue: nextValue,
      valueIndex: optionIndex
    };

    this.setData({
      'hrProfile.template.fields': fields
    });
  },

  onHrProfileDateChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const fields = [...((this.data.hrProfile.template && this.data.hrProfile.template.fields) || [])];
    if (!fields[index]) {
      return;
    }

    fields[index] = {
      ...fields[index],
      value: String(e.detail.value || ''),
      displayValue: formatDateTextOnly(String(e.detail.value || ''))
    };

    this.setData({
      'hrProfile.template.fields': fields
    });
  },

  // 日期时间字段只能通过选择器录入：日期与时间分别选择后合成绝对时刻。
  onHrProfileDateTimeChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const part = String(e.currentTarget.dataset.part || '');
    const fields = [...((this.data.hrProfile.template && this.data.hrProfile.template.fields) || [])];
    const field = fields[index];
    if (!field || (part !== 'date' && part !== 'time')) {
      return;
    }
    const picked = String(e.detail.value || '');
    const nextDate = part === 'date' ? picked : (field.pickerDate || formatDateTimePickerDate(field.value) || '');
    const nextTime = part === 'time' ? picked : (field.pickerTime || formatDateTimePickerTime(field.value) || '');
    if (!nextDate) {
      return;
    }
    const instant = pickerToUtcIso(nextDate, nextTime || '00:00');
    fields[index] = {
      ...field,
      value: instant,
      displayValue: instant ? formatDateTimeText(instant) : '',
      pickerDate: nextDate,
      pickerTime: nextTime || '00:00',
      displayDate: nextDate,
      displayTime: nextTime || '00:00'
    };

    this.setData({
      'hrProfile.template.fields': fields
    });
  },

  submitHrProfile() {
    const hrProfile = this.data.hrProfile || emptyHrProfileState();
    const template = hrProfile.template;
    if (!template || !Array.isArray(template.fields) || !template.fields.length) {
      wx.showToast({
        title: copy.text.noProfile,
        icon: 'none'
      });
      return;
    }

    if (template.editMode === 'readonly') {
      wx.showToast({
        title: copy.text.contactAdminToEdit,
        icon: 'none'
      });
      return;
    }

    const values = {};
    for (let i = 0; i < template.fields.length; i += 1) {
      const field = template.fields[i];
      values[field.id] = field.value == null ? '' : String(field.value).trim();
      const errorMessage = validateProfileField(field, values[field.id]);
      if (errorMessage) {
        wx.showToast({
          title: errorMessage,
          icon: 'none'
        });
        return;
      }
    }

    this.setData({
      'hrProfile.saving': true
    });

    callFunction({
      name: 'submitUserHrProfile',
      data: {
        values
      },
      success: (res) => {
        const result = res.result || {};
        if (result.status !== 'success') {
          showShortToast(getErrorText(result, copy.text.updateFailed));
          return;
        }

        showShortToast(copy.text.updated, 'success');
        this.loadUserHrProfile();
      },
      fail: () => {
        showShortToast(copy.text.updateFailed);
      },
      complete: () => {
        this.setData({
          'hrProfile.saving': false
        });
      }
    });
  },

  updateStoredProfile(role, profile) {
    const snapshot = orgSession.getSnapshot();
    const current = authContext.getRuntimeProfile(role) || {};
    const sameContext = current.contextId
      && current.contextId === snapshot.contextId
      && (!current.organizationId || current.organizationId === snapshot.orgId);
    const nextProfile = authContext.normalizeProfile(Object.assign(
      {}, sameContext ? current : {}, profile || {}, {
        contextId: snapshot.contextId,
        organizationId: snapshot.orgId,
        organizationName: snapshot.orgName || ''
      }
    ));
    return authContext.updateRuntimeProfile(role, nextProfile) || nextProfile;
  },

  selectTarget(e) {
    const { id, name, scoreStatus } = e.currentTarget.dataset;
    if (!id) return;
    const alreadyScored = scoreStatus === 'scored';
    if (!alreadyScored && this.data.activityPaused) {
      wx.showToast({ title: copy.text.activityPaused, icon: 'none' });
      return;
    }
    const activity = this.data.currentActivity;
    if (activity && !alreadyScored) {
      const today = getSystemDate();
      if (activity.startDate) {
        if (today < activity.startDate) {
          wx.showToast({ title: copy.text.activityNotStarted, icon: 'none' });
          return;
        }
      }
      if (activity.endDate) {
        if (today > activity.endDate) {
          wx.showToast({ title: copy.text.activityEnded, icon: 'none' });
          return;
        }
      }
    }
    this.setData({ selectedTargetId: id });

    navigateToTrustedRoute(
      `/subpackages/scoring/pages/score/score?targetId=${encodeURIComponent(id)}`,
      {
        fail: () => {
        wx.showToast({
          title: copy.format.reopenScorePage(name),
          icon: 'none'
        });
      }
      }
    );
  },

  goLogin() {
    wx.redirectTo({
      url: '/subpackages/main/pages/login/login'
    });
  },

  goPortal() {
    wx.redirectTo({
      url: '/subpackages/main/pages/portal/portal'
    });
  },

  goAdmin() {
    navigateToTrustedRoute('/subpackages/scoring/pages/admin/admin');
  },

  // ── Audit navigation ──
  goMySubmissions() {
    navigateToTrustedRoute('/subpackages/audit/pages/mySubmissions/mySubmissions');
  },

  goPendingApprovals() {
    navigateToTrustedRoute('/subpackages/audit/pages/pendingApprovals/pendingApprovals');
  },

  goMyApprovalHistory() {
    navigateToTrustedRoute('/subpackages/audit/pages/myApprovalHistory/myApprovalHistory');
  },

  goAuditVerification() {
    navigateToTrustedRoute('/subpackages/audit/pages/verification/verification');
  },

  async loadAuditVerificationAccess() {
    const request = orgSession.beginRequest(this, 'auditVerificationAccess');
    try {
      const res = await callFunction({ name: 'getAuditVerificationAccess', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.setData({ auditCanVerify: res.status === 'success' && res.canVerify === true });
    } catch (_) {
      if (orgSession.isRequestCurrent(this, request)) {
        this.setData({ auditCanVerify: false });
      }
    }
  },

  async loadAuditBadgeCounts() {
    const request = orgSession.beginRequest(this, 'auditBadges');
    try {
      const res = await callFunction({ name: 'getUnreadCounts', data: {} });
      if (!orgSession.isRequestCurrent(this, request)) return;
      if (res.status === 'success') {
        this.setData({
          auditMyCount: res.mySubmissionsUnread || 0,
          auditPendingCount: res.pendingCount || 0,
          auditApprovalHistoryCount: res.myApprovalHistoryUnread || 0
        });
      } else {
      }
    } catch (e) {
    }
  },

  async checkPublication(retryFailed = false) {
    const activeRole = orgSession.getSnapshot().role || '';
    if (!this._isPageVisible || activeRole !== 'user') return;
    const activityId = this.data.publicationActivity ? this.data.publicationActivity.id : '';
    const request = orgSession.beginRequest(this, 'publication');
    if (!activityId) {
      this._publicationRows = null;
      this.setData(emptyPublicationState());
      this.rebuildUserTabs(true);
      return;
    }
    const loadResults = !retryFailed || this.data.publicationResultsFailed;
    const loadMerit = !retryFailed || this.data.publicationMeritFailed;
    this.setData({ publicationAccessLoading: true, publicationResultsPending: loadResults, publicationMeritPending: loadMerit,
      publicationResultsFailed: false, publicationMeritFailed: false });
    this.rebuildUserTabs();
    const current = () => this._isPageVisible && orgSession.isRequestCurrent(this, request)
      && activityId === ((this.data.publicationActivity || {}).id || '');
    // 直接复用请求 Promise，取消或失效的请求也能结束对应的加载状态。
    const readPublication = async (name, extra) => {
      try {
        return await callFunction({ name, data: { activityId, ...extra } });
      } catch (error) {
        if (error.statusCode === 403) return { status: 'no_permission' };
        throw error;
      }
    };
    const readResults = async () => {
    try {
      let res = await readPublication('getPublicResults', { batch: true });
      if (!current()) return;
      if (res.status === 'success') {
        this._publicationGroupPages = {};
        this.showResultBatch(res, true);
        while (res.page && res.page.next) {
          const next = await readPublication('getPublicResults', { batch: true, cursor: res.page.next });
          if (!current()) return;
          if (next.status !== 'success') {
            res = next;
            break;
          }
          const restarted = next.page && !next.page.offset;
          if (restarted) this._publicationGroupPages = {};
          res = publicationView.appendResultBatch(res, next);
          this.showResultBatch(res, restarted);
        }
      }
      if (res.status === 'no_permission' || res.status === 'not_published') {
        this._publicationRows = null;
        this.setData({
          publicationMemberCount: 0,
          filteredResults: [],
          filteredGroups: [],
          hasPublication: res.status === 'no_permission',
          hasViewPerm: false,
          statsData: { count: 0, maxScore: '--', avgScore: '--' }
        });
      } else if (res.status !== 'success') {
        this.setData({ publicationResultsFailed: true });
      }
    } catch (e) {
      if (current()) this.setData({ publicationResultsFailed: true });
    } finally {
      if (current()) {
        this.setData({ publicationResultsPending: false });
        this.rebuildUserTabs(true);
      }
    }
    };

    const readMerit = async () => {
    try {
      const mlRes = await readPublication('getPublicMeritList');
      if (!current()) return;
      if (mlRes.status === 'success' && Array.isArray(mlRes.meritList)) {
        this.showMeritList(mlRes);
      } else if (mlRes.status === 'not_published' || mlRes.status === 'no_permission') {
        this.showMeritList({});
      } else {
        this.setData({ publicationMeritFailed: true });
      }
    } catch (e) {
      if (current()) this.setData({ publicationMeritFailed: true });
    } finally {
      if (current()) {
        this.setData({ publicationMeritPending: false });
        this.rebuildUserTabs(true);
      }
    }
    };

    await Promise.all([loadResults && readResults(), loadMerit && readMerit()]);
    if (current()) {
      this._publicationLoaded = true;
      this.setData({ publicationAccessLoading: false });
      this.rebuildUserTabs(true);
    }
  },

  showResultBatch(res, reset) {
        const displayMode = res.displayMode || 'score';
        const isGrade = displayMode === 'grade';
        // Support both legacy flat results and new per-clause groups
        const groups = res.groups || [];
        const flatResults = res.results || [];

        // 分页接口按组内名次输出；续页只转换新到的条目。旧接口仍在本地排序。
        const previous = res.page && !reset && this._publicationRows
          ? new Map(this._publicationRows.groups.map(group => [group.clauseId, group.members]))
          : new Map();
        const enrichedGroups = groups.map(group => {
          const retained = previous.get(group.clauseId) || [];
          const members = retained.concat((group.members || []).slice(retained.length).map((m, index) => ({
            ...publicationView.memberView(m),
            resultKey: m.assignmentId || m.id || group.clauseId + ':' + (retained.length + index),
            sortScore: typeof m.sortScore === 'number' ? m.sortScore : (parseFloat(m.finalScore) || 0)
          })));
          if (!res.page && group.displayMode !== 'grade') members.sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
          return { ...group, members, groupLabel: publicationView.groupTitle(group, copy.text),
            identityLabel: publicationView.groupIdentity(group) };
        });

        // Build flat results from all groups for filtering compatibility
        const allMembers = [];
        enrichedGroups.forEach(g => { g.members.forEach(m => { allMembers.push(m); }); });

        // Legacy: if server returned flat results
        let sorted = [];
        if (flatResults.length && !enrichedGroups.length) {
          const results = flatResults.map((r, index) => ({
            ...publicationView.memberView(r),
            resultKey: r.assignmentId || r.id || String(index),
            finalScore: isGrade ? '' : (typeof r.finalScore === 'number' ? r.finalScore.toFixed(3) : (r.finalScore || '0.000')),
            sortScore: typeof r.sortScore === 'number' ? r.sortScore : (parseFloat(r.finalScore) || 0)
          }));
          sorted = isGrade ? results : results.sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
        }
        sorted.forEach((item, idx) => { item.rank = idx + 1; });
        const members = enrichedGroups.length ? allMembers : sorted;

        // Grade distribution from all members (for grade filter chips)
        const gradeCountMap = new Map();
        members.forEach(r => {
          const g = r.grade || (isGrade ? copy.text.unrated : '');
          if (g) gradeCountMap.set(g, (gradeCountMap.get(g) || 0) + 1);
        });
        const gradeDistribution = Array.from(gradeCountMap.entries())
          .map(([grade, count]) => ({ grade, count }));

        let fullStats = res.page && res.page.stats;
        if (!res.page) {
          const hasGrades = isGrade || enrichedGroups.some(group => group.displayMode === 'grade') || members.some(member => member.grade);
          const scores = hasGrades ? [] : members.map(r => parseFloat(r.finalScore) || 0);
          fullStats = {
            count: members.length,
            maxScore: scores.length ? Math.max(...scores).toFixed(1) : '--',
            avgScore: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '--'
          };
        }

        // Extract filter options from all members
        const idSet = new Set(); const deptSet = new Set(); const wgSet = new Set();
        members.forEach(r => { if (r.identity) idSet.add(r.identity); if (r.department) deptSet.add(r.department); if (r.workGroup) wgSet.add(r.workGroup); });
        const resultIdentities = Array.from(idSet).sort();
        const resultDepartments = Array.from(deptSet).sort();
        const resultWorkGroups = Array.from(wgSet).sort();

        this._publicationRows = { flat: sorted, groups: enrichedGroups };
        this.setData({ publicationMemberCount: res.page ? res.page.total : members.length, filteredResults: sorted,
          filteredGroups: enrichedGroups.map(group => publicationView.resultPage(group, this._publicationGroupPages[group.clauseId])),
          hasPublication: true, hasViewPerm: true, statsData: fullStats, filteredStatsData: fullStats,
          displayMode, gradeDistribution,
          resultIdentities, resultDepartments, resultWorkGroups,
          ...(reset ? { resultFilterIdentity: '', resultFilterDepartment: '', resultFilterWorkGroup: '', resultFilterGrade: '', resultSearchText: '' } : {}) });
  },

  showMeritList(response) {
    const roster = response.meritList || [];
    const groups = publicationView.awardGroups(response, copy, awardCopy);
    const canEditMerit = response.canDesignate === true;
    this.setData({
      meritRuleGroups: groups,
      meritSummary: publicationView.awardSummary(groups, roster, copy),
      hasMeritPerm: response.canViewMeritList === true || canEditMerit,
      canEditMerit,
      userDesigCandidates: response.designationCandidates || [],
      userDesigPubId: response.publicationId || '',
      savedMeritRefreshFailed: false
    });
  },

  async refreshMeritAfterSave() {
    const activityId = (this.data.publicationActivity || {}).id;
    if (!activityId || this.data.publicationMeritPending) return;
    const request = orgSession.beginRequest(this, 'meritAfterSave');
    const unknown = this.data.userDesigSaveUnknown && this._meritEditor;
    const current = () => orgSession.isRequestCurrent(this, request)
      && activityId === (this.data.publicationActivity || {}).id;
    this.setData({ publicationMeritPending: true });
    try {
      const response = await callFunction({ name: 'getPublicMeritList', data: { activityId } });
      if (!current()) return;
      if (response.status === 'success' && Array.isArray(response.meritList)) {
        this.showMeritList(response);
        if (unknown && unknown === this._meritEditor) {
          const group = this.data.meritRuleGroups.find(item => item.key === unknown.group.key);
          if (!group || !response.canDesignate || response.publicationId !== unknown.publicationId) {
            this.closeUserDesignation();
          } else if (publicationView.awardSavedMatches(group, unknown.unknownSelection)) {
            this.closeUserDesignation();
            wx.showToast({ title: awardCopy.saveSuccess, icon: 'success' });
          } else {
            unknown.group = group;
            unknown.clauseIds = group.clauses.map(clause => clause.id);
            this.setData({ userDesigSaveUnknown: false, userDesigError: awardCopy.savedListDiffers, userDesigQuota: group.quota });
          }
        }
      } else if (['no_permission', 'not_published', 'forbidden'].includes(response.status)) {
        this.showMeritList({});
        if (unknown) this.closeUserDesignation();
        this.rebuildUserTabs(true);
      } else if (!unknown) {
        this.setData({ savedMeritRefreshFailed: true });
      }
    } catch (error) {
      if (current()) {
        if (['forbidden', 'no_permission'].includes(error.status)) {
          this.showMeritList({});
          if (unknown) this.closeUserDesignation();
          this.rebuildUserTabs(true);
        } else if (!unknown) {
          this.setData({ savedMeritRefreshFailed: true });
        }
      }
    } finally {
      if (current()) this.setData({ publicationMeritPending: false });
    }
  },


  retryPublication() {
    if (this.data.publicationAccessLoading) return;
    if (this.data.publicationActivity) this.checkPublication(true);
    else this.loadLatestPublishedActivity();
  },

  applyResultFilters(resetPage = true) {
    if (resetPage) this._publicationGroupPages = {};
    const { flat: base, groups: baseGroups } = this._publicationRows || { flat: [], groups: [] };
    const idFilter = this.data.resultFilterIdentity || '';
    const deptFilter = this.data.resultFilterDepartment || '';
    const wgFilter = this.data.resultFilterWorkGroup || '';
    const gradeFilter = this.data.resultFilterGrade || '';
    const searchText = (this.data.resultSearchText || '').trim().toLowerCase();

    const memberMatches = function(r) {
      if (idFilter && r.identity !== idFilter) return false;
      if (deptFilter && r.department !== deptFilter) return false;
      if (wgFilter && r.workGroup !== wgFilter) return false;
      if (gradeFilter && (r.grade || copy.text.unrated) !== gradeFilter) return false;
      if (searchText) {
        const s = searchText;
        if ((r.name || '').toLowerCase().indexOf(s) < 0 &&
            (r.identity || '').toLowerCase().indexOf(s) < 0 &&
            (r.department || '').toLowerCase().indexOf(s) < 0 &&
            (r.workGroup || '').toLowerCase().indexOf(s) < 0) return false;
      }
      return true;
    };

    // Flat filtered results (legacy)
    const filtered = base.filter(memberMatches).map((item, index) => ({ ...item, rank: index + 1 }));

    // Filtered groups
    const filtering = idFilter || deptFilter || wgFilter || gradeFilter || searchText;
    const filteredGroups = filtering ? baseGroups.map(group => {
      const members = group.members.filter(memberMatches);
      return { ...group, members, memberCount: members.length };
    }).filter(group => group.memberCount) : baseGroups;

    // Stats from all filtered members
    const allFiltered = [];
    filteredGroups.forEach(g => { g.members.forEach(m => { allFiltered.push(m); }); });
    if (!allFiltered.length) filtered.forEach(item => allFiltered.push(item));

    const hasAnyGrade = allFiltered.some(r => r.grade);
    let filteredStatsData;
    let gradeDistribution;
    if (hasAnyGrade) {
      const gradeCountMap = new Map();
      allFiltered.forEach(r => {
        const grade = r.grade || copy.text.unrated;
        gradeCountMap.set(grade, (gradeCountMap.get(grade) || 0) + 1);
      });
      gradeDistribution = Array.from(gradeCountMap.entries()).map(([grade, count]) => ({ grade, count }));
      filteredStatsData = { count: allFiltered.length, maxScore: '--', avgScore: '--' };
    } else {
      const scores = allFiltered.map(r => parseFloat(r.finalScore) || 0).filter(s => !isNaN(s));
      filteredStatsData = {
        count: allFiltered.length,
        maxScore: scores.length ? Math.max(...scores).toFixed(1) : '--',
        avgScore: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '--'
      };
    }
    this.setData({
      filteredResults: filtered,
      filteredGroups: filteredGroups.map(group => publicationView.resultPage(group, this._publicationGroupPages && this._publicationGroupPages[group.clauseId])),
      filteredStatsData: this.data.publicationResultsPending || this.data.publicationResultsFailed ? this.data.statsData : filteredStatsData,
      gradeDistribution: gradeDistribution || this.data.gradeDistribution || []
    });
  },
  changeResultGroupPage(e) {
    const { clauseId, step } = e.currentTarget.dataset;
    const group = this.data.filteredGroups.find(item => item.clauseId === clauseId);
    if (!group) return;
    this._publicationGroupPages[clauseId] = group.page + Number(step);
    this.applyResultFilters(false);
    wx.pageScrollTo({ selector: '#publication-group-' + clauseId, duration: 0, offsetTop: -(this.data.navStickyTopPx || 0) });
  },
  toggleResultGroup(e) {
    const clauseId = e.currentTarget.dataset.clauseId || '';
    this.setData({ expandedResultGroupClauseId: this.data.expandedResultGroupClauseId === clauseId ? '' : clauseId });
  },

  onResultFilterClear() {
    this.setData({ resultFilterIdentity: '', resultFilterDepartment: '', resultFilterWorkGroup: '', resultFilterGrade: '', resultSearchText: '' });
    this.applyResultFilters();
  },

  onResultFilterIdentity(e) {
    const val = e.currentTarget.dataset.value || '';
    this.setData({ resultFilterIdentity: val === this.data.resultFilterIdentity ? '' : val });
    this.applyResultFilters();
  },

  onResultFilterDepartment(e) {
    const val = e.currentTarget.dataset.value || '';
    this.setData({ resultFilterDepartment: val === this.data.resultFilterDepartment ? '' : val });
    this.applyResultFilters();
  },

  onResultFilterWorkGroup(e) {
    const val = e.currentTarget.dataset.value || '';
    this.setData({ resultFilterWorkGroup: val === this.data.resultFilterWorkGroup ? '' : val });
    this.applyResultFilters();
  },

  onResultFilterGrade(e) {
    const val = e.currentTarget.dataset.value || '';
    this.setData({ resultFilterGrade: val === this.data.resultFilterGrade ? '' : val });
    this.applyResultFilters();
  },

  onResultSearchInput(e) {
    this.setData({ resultSearchText: e.detail.value || '' });
    this.applyResultFilters();
  },

  onResultSearchClear() {
    this.setData({ resultSearchText: '' });
    this.applyResultFilters();
  },

  openUserDesignation(e) {
    if (!this.data.canEditMerit || this.data.savedMeritRefreshFailed || this.data.publicationMeritPending || this.data.userDesigSaving) return;
    const group = this.data.meritRuleGroups.find(item => item.key === e.currentTarget.dataset.groupKey);
    if (!group || !group.clauses.length) return;
    const picker = publicationView.awardPicker(group, this.data.userDesigCandidates);
    this._meritEditor = { group, clauseIds: picker.clauseIds, publicationId: this.data.userDesigPubId };
    this.setData({
      showUserDesigPopup: true,
      userDesigHrList: picker.options,
      userDesigSelectedList: picker.selected,
      userDesigQuota: group.quota,
      userDesigNotice: publicationView.awardSelectionNotice(group, picker.selected.length, awardCopy),
      userDesigError: '',
      userDesigSaveUnknown: false
    });
  },

  closeUserDesignation() {
    if (this.data.userDesigSaving) return;
    this._meritEditor = null;
    this.setData({ showUserDesigPopup: false, userDesigSaveUnknown: false });
  },

  onUserDesignationChange(e) {
    if (!this._meritEditor || this.data.userDesigSaving || this.data.userDesigSaveUnknown) return;
    this.setData({
      userDesigNotice: publicationView.awardSelectionNotice(this._meritEditor.group, e.detail.count, awardCopy),
      userDesigError: ''
    });
  },

  async confirmSharedUserDesignation(e) {
    const editor = this._meritEditor;
    if (!editor || !editor.publicationId || this.data.userDesigSaving || this.data.userDesigSaveUnknown) return;
    const designationAssignmentIds = [...new Set(e.detail.keys || [])];
    const selected = designationAssignmentIds.length;
    const mismatch = publicationView.awardSelectionNotice(editor.group, selected, awardCopy);
    if (mismatch) {
      this.setData({ userDesigNotice: mismatch, userDesigError: '' });
      wx.showToast({ title: mismatch, icon: 'none' });
      return;
    }
    const activityId = (this.data.publicationActivity || {}).id;
    const request = orgSession.beginRequest(this, 'meritSave');
    const current = () => orgSession.isRequestCurrent(this, request)
      && this._meritEditor === editor && activityId === (this.data.publicationActivity || {}).id;
    this.setData({ userDesigSaving: true, userDesigError: '' });
    try {
      const result = await callFunction({
        name: 'submitMeritListDesignations',
        data: { clauseIds: editor.clauseIds, clauseId: editor.clauseIds[0], publicationId: editor.publicationId, designationAssignmentIds }
      });
      if (!current()) return;
      if (result.status !== 'success') {
        this.setData({ userDesigError: publicationView.awardSaveNotice(result, editor.group, selected, awardCopy) });
        return;
      }
      wx.showToast({ title: awardCopy.saveSuccess, icon: 'success' });
      this.setData({ showUserDesigPopup: false });
      await this.refreshMeritAfterSave();
    } catch (error) {
      if (current() && !error.silent) {
        if (publicationView.awardSaveIsUnknown(error)) {
          editor.unknownSelection = designationAssignmentIds;
          this.setData({ userDesigSaveUnknown: true, userDesigError: awardCopy.saveResultUnknown });
        } else {
          this.setData({ userDesigError: publicationView.awardSaveNotice(error, editor.group, selected, awardCopy) });
        }
      }
    } finally {
      if (current()) {
        if (!this.data.showUserDesigPopup) this._meritEditor = null;
        this.setData({ userDesigSaving: false });
      }
    }
  }

});
