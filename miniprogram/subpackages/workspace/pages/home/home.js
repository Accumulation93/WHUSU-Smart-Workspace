const { callFunction, getErrorText, formatAuditTime } = require('../../../../utils/api');
const orgSession = require('../../../../utils/orgSession');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
const { home: copy } = require('../../../../locales/zh-CN/main');
const STORAGE_KEY = 'roleProfiles';
const ACTIVE_ROLE_KEY = 'activeRole';

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
    rejectionReason: ''
  };
}

function emptyAccountSecurityState() {
  return {
    loading: false,
    loaded: false,
    account: null,
    sessions: [],
    allowRecoveryCode: false,
    allowPassphrase: false,
    passphrase: '',
    recoveryCode: '',
    savingCredential: false,
    revokingSessionId: ''
  };
}

function decorateAccountSessions(sessions) {
  return (sessions || []).map(function(item) {
    return Object.assign({}, item, {
      roleLabel: item.role === 'admin' ? copy.text.managementIdentity : copy.text.regularPosition,
      lastSeenText: formatAuditTime(String(item.lastSeenAt || '')),
      deviceTitle: item.currentDevice || item.current
        ? copy.text.currentDevice
        : (item.recognized ? copy.text.signedInDevice : copy.text.unrecognizedDevice),
      deviceMeta: [item.platform, item.model].filter(Boolean).join(' · ') || copy.text.miniProgram,
      sessionMeta: [
        item.role === 'admin' ? copy.text.managementIdentity : copy.text.regularPosition,
        item.organizationName || ''
      ].filter(Boolean).join(' · ')
    });
  });
}

function emptyPublicationState() {
  return {
    publishedResults: [],
    publishedGroups: [],
    publishedMeritList: [],
    publishedMeritGroups: [],
    meritRuleGroups: [],
    meritDeptCount: 0,
    hasPublication: false,
    hasViewPerm: false,
    hasMeritPerm: false,
    userMeritClauses: [],
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
    userDesigPerms: [],
    userDesigHrList: [],
    userDesigFilteredList: [],
    userDesigSelectedIds: [],
    userDesigSelectedList: [],
    userDesigGroups: [],
    userDesigPubId: '',
    userDesigLoading: false,
    userDesigSaving: false,
    userDesigFilterDept: copy.text.all,
    userDesigFilterIdent: copy.text.all,
    userDesigFilterDeptOptions: [copy.text.all],
    userDesigFilterIdentOptions: [copy.text.all],
    userDesigSearchKeyword: ''
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [year, month, day] = value.split('-').map((item) => Number(item));
  return date.getFullYear() === year
    && date.getMonth() + 1 === month
    && date.getDate() === day;
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
    typeLabel: getProfileFieldTypeLabel(field.type),
    hintText: buildFieldHint(field)
  };
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
    if (field.minLength != null && field.minLength !== '' && value.length < field.minLength) {
      return copy.format.minimumCharacters(field.label, field.minLength);
    }
    if (field.maxLength != null && field.maxLength !== '' && value.length > field.maxLength) {
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
    return copy.format.select(field.label);
  }

  if (field.type === 'date' && !isValidDateString(value)) {
    return copy.format.selectValid(field.label);
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
  data: {
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
    currentActivityText: copy.text.loadingDots,
    activityPaused: false,
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
    publishedResults: [],
    publishedGroups: [],
    publishedMeritList: [],
    publishedMeritGroups: [],
    meritRuleGroups: [],
    hasPublication: false,
    hasViewPerm: false,
    hasMeritPerm: false,
    userMeritClauses: [],
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
    userDesigPerms: [],
    userDesigHrList: [],
    userDesigFilteredList: [],
    userDesigSelectedIds: [],
    userDesigSelectedList: [],
    userDesigGroups: [],
    userDesigPubId: '',
    userDesigLoading: false,
    userDesigSaving: false,
    userDesigFilterDept: copy.text.all,
    userDesigFilterIdent: copy.text.all,
    userDesigFilterDeptOptions: [copy.text.all],
    userDesigFilterIdentOptions: [copy.text.all],
    userDesigSearchKeyword: '',
    // Audit badge counts
    auditPendingCount: 0,
    auditMyCount: 0,
    auditApprovalHistoryCount: 0,
  },

  noop() {},

  onShow() {
    const organizationState = orgSession.consume(this);
    const organizationChanged = organizationState.changed;
    this._orgContextSnapshot = organizationState.snapshot;
    const preservedTab = this.data.activeTab;
    if (organizationChanged) {
      orgSession.invalidateRequests(this);
      this._preferredOrgTab = preservedTab;
      this.setData({
        ...emptyPublicationState(),
        activeTab: preservedTab,
        currentActivity: null,
        currentActivityText: copy.text.loadingDots,
        activityPaused: false
      });
    }
    this.refreshCurrentUser();
    this.refreshUserFromCloud();
    this.loadCurrentActivity();
    this.loadOrganizationName();
  },

  onLoad(options) {
    this._subApp = (options && options.subApp) || 'scoring';
    this._focusAccountSecurity = Boolean(options && options.section === 'account');
  },

  applySubAppFilter() {
    const subApp = this._subApp || 'scoring';
    const SUB_APP_USER_TABS = {
      scoring: ['scoring', 'results', 'meritList'],
      hr: ['profile'],
      audit: ['audit']
    };
    this._subAppAllowedTabs = SUB_APP_USER_TABS[subApp] || SUB_APP_USER_TABS.scoring;
    const SUB_APP_LABELS = { scoring: copy.text.scoring, hr: copy.text.hr, audit: copy.text.audit };
    this._subAppLabel = SUB_APP_LABELS[subApp] || '';
    wx.setNavigationBarTitle({
      title: copy.format.navigationTitle(this._subAppLabel)
    });
  },

  rebuildUserTabs(finalizeOrgFallback) {
    if (!this._subAppAllowedTabs) this.applySubAppFilter();
    const allowed = this._subAppAllowedTabs || ['scoring', 'results', 'meritList'];
    const tabs = [];
    if (allowed.indexOf('scoring') !== -1) tabs.push({ key: 'scoring', label: copy.text.scoring });
    if (allowed.indexOf('results') !== -1 && this.data.hasViewPerm) {
      tabs.push({ key: 'results', label: copy.text.results });
    }
    if (allowed.indexOf('meritList') !== -1 && this.data.hasMeritPerm) {
      tabs.push({ key: 'meritList', label: copy.text.meritList });
    }
    if (allowed.indexOf('profile') !== -1) tabs.push({ key: 'profile', label: copy.text.hr });
    // Always add audit tab for users with HR info
    if (allowed.indexOf('audit') !== -1 && this.data.hasUser) {
      tabs.push({ key: 'audit', label: copy.text.audit });
    }
    const preferredTab = this._preferredOrgTab || '';
    const preferredAvailable = !!preferredTab && tabs.some((item) => item.key === preferredTab);
    const currentAvailable = tabs.some((item) => item.key === this.data.activeTab);
    let activeTab = this.data.activeTab;
    if (preferredAvailable) {
      activeTab = preferredTab;
    } else if (tabs.length === 1 || (finalizeOrgFallback && !currentAvailable)) {
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
    if (this.data.hasUser) this.loadAuditBadgeCounts();
  },

  refreshUserFromCloud() {
    const activeRole = wx.getStorageSync(ACTIVE_ROLE_KEY) || '';
    const activeOrgId = wx.getStorageSync('activeOrgId') || '';

    if (activeRole !== 'user' || !activeOrgId) {
      return;
    }

    const request = orgSession.beginRequest(this, 'userProfile');
    callFunction({
      name: 'activateOrganization',
      data: { organizationId: activeOrgId, role: 'user' },
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        const result = res.result || {};

        if (result.status !== 'success' || !result.user) {
          return;
        }

        this.updateStoredProfile('user', result.user);

        if (this.data.activeRole === 'user') {
          this.setData({
            user: result.user,
            hasUser: true,
            heroName: result.user.name || copy.text.welcome,
            heroIdentity: getDisplayIdentity(result.user, 'user'),
            heroSubtitle: this._subAppLabel || ''
          });

          this.rebuildUserTabs();
          this.fetchRateTargets('user');
          this.loadUserHrProfile();
          if (this._subApp === 'hr') this.loadAccountSecurity();
        }
      }
    });
  },

  refreshCurrentUser() {
    this.applySubAppFilter();
    const subAppLabel = this._subAppLabel || '';
    const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
    let activeRole = wx.getStorageSync(ACTIVE_ROLE_KEY) || '';

    if (!roleProfiles[activeRole]) {
      const roleList = Object.keys(roleProfiles);
      activeRole = roleList.length ? roleList[0] : '';
      orgSession.commitContext({ role: activeRole });
    }

    const currentUser = activeRole ? roleProfiles[activeRole] : null;
    const isAdminRole = activeRole === 'admin';

    this.setData({
      activeRole,
      user: currentUser,
      hasUser: !!currentUser,
      isAdminRole,
      heroName: currentUser ? currentUser.name : copy.text.welcome,
      heroIdentity: getDisplayIdentity(currentUser, activeRole),
      heroSubtitle: currentUser ? subAppLabel : copy.text.signInWithWechat,
      targetList: [],
      selectedTargetId: '',
      targetsEmptyText: copy.text.loadingDots,
      targetsLoading: false,
      scoringStats: { total: 0, scored: 0, pending: 0 },
      activeTab: isAdminRole ? 'scoring' : this.data.activeTab,
      hrProfile: emptyHrProfileState(),
      organizationName: wx.getStorageSync('activeOrgName') || this.data.organizationName
    });

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
    if (!tab || tab === this.data.activeTab) {
      return;
    }

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
    }
    if (tab === 'results' || tab === 'meritList') {
      this.checkPublication();
    }
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
          activityPaused: activity ? !!activity.isPaused : false
        });
        this.checkPublication();
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          currentActivity: null,
          currentActivityText: copy.text.noActivity,
          activityPaused: false
        });
        this.checkPublication();
      }
    });
  },

  loadOrganizationName() {
    const storedName = wx.getStorageSync('activeOrgName') || '';
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

  processRateTargetsResult(result) {
    if (result.status !== 'success') {
      this.setData({
        targetList: [],
        targetGroups: [],
        targetsEmptyText: result.message || copy.text.noTargets,
        scoringStats: { total: 0, scored: 0, pending: 0 }
      });
      return;
    }

    if (result.scorer) {
      this.updateStoredProfile('user', result.scorer);
    }

    const currentUser = result.scorer || this.data.user;

    const targets = result.targets || [];
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
      targetsEmptyText: targets.length ? '' : copy.text.noTargets,
      scoringStats: {
        total: targets.length,
        scored: scoredCount,
        pending: targets.length - scoredCount
      }
    });
  },

  fetchRateTargets(role) {
    const request = orgSession.beginRequest(this, 'rateTargets');
    this.setData({
      targetsLoading: true,
      targetList: [],
      targetGroups: [],
      selectedTargetId: '',
      targetsEmptyText: copy.text.loadingTargets,
      scoringStats: { total: 0, scored: 0, pending: 0 }
    });

    callFunction({
      name: 'getRateTargets',
      data: { role },
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.processRateTargetsResult(res.result || {});
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          targetList: [],
          targetGroups: [],
          targetsEmptyText: copy.text.refreshTargetsLater,
          scoringStats: { total: 0, scored: 0, pending: 0 }
        });
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
        hrProfile: {
          ...emptyHrProfileState(),
          loaded: true
        }
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
      fields: (template.fields || []).map((field) => normalizeDisplayField(field, formValues))
    } : null;

    this.setData({
      hrProfile: {
        loading: false,
        saving: false,
        loaded: true,
        template: nextTemplate,
        pendingValues,
        auditStatus: result.auditStatus || 'none',
        statusText: result.statusText || copy.text.profileNotSubmitted,
        rejectionReason: result.rejectionReason || ''
      }
    });
  },

  loadUserHrProfile() {
    if (this.data.activeRole !== 'user' || !this.data.hasUser) {
      return;
    }

    const request = orgSession.beginRequest(this, 'hrProfile');
    this.setData({
      'hrProfile.loading': true
    });

    callFunction({
      name: 'getUserHrProfile',
      success: (res) => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.processHrProfileResult(res.result || {});
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          hrProfile: {
            ...emptyHrProfileState(),
            loaded: true
          }
        });
      }
    });
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
          sessions: decorateAccountSessions(result.sessions),
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

  async revokeAccountSession(e) {
    const sessionId = String(e.currentTarget.dataset.id || '');
    if (!sessionId || this.data.accountSecurity.revokingSessionId) return;
    this.setData({ 'accountSecurity.revokingSessionId': sessionId });
    try {
      const result = await callFunction({
        name: 'auth/security/sessions/revoke',
        data: { sessionId }
      });
      if (!result || (result.status !== 'success' && result.status !== 'not_found')) {
        throw new Error((result && result.message) || copy.text.retry);
      }
      const sessions = this.data.accountSecurity.sessions.filter((item) => item.id !== sessionId);
      this.setData({ 'accountSecurity.sessions': sessions });
      showShortToast(copy.text.deviceSignedOut, 'success');
    } catch (error) {
      showShortToast(getErrorText(error, copy.text.retry));
    } finally {
      this.setData({ 'accountSecurity.revokingSessionId': '' });
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
      value: String(e.detail.value || '')
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
          showShortToast(copy.text.updateFailed);
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
    const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
    roleProfiles[role] = profile;
    wx.setStorageSync(STORAGE_KEY, roleProfiles);
  },

  selectTarget(e) {
    const { id, name } = e.currentTarget.dataset;
    if (this.data.activityPaused) {
      wx.showToast({ title: copy.text.activityPaused, icon: 'none' });
      return;
    }
    const activity = this.data.currentActivity;
    if (activity) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (activity.startDate) {
        const startDate = new Date(activity.startDate.replace(/-/g, '/'));
        if (today < startDate) {
          wx.showToast({ title: copy.text.activityNotStarted, icon: 'none' });
          return;
        }
      }
      if (activity.endDate) {
        const endDate = new Date(activity.endDate.replace(/-/g, '/'));
        if (today > endDate) {
          wx.showToast({ title: copy.text.activityEnded, icon: 'none' });
          return;
        }
      }
    }
    this.setData({ selectedTargetId: id });

    wx.showLoading({
      title: copy.text.enteringScorePage
    });

    callFunction({
      name: 'getScoreFormData',
      data: {
        targetId: id
      },
      success: (res) => {
        const result = res.result || {};
        if (result.status !== 'success') {
          wx.showToast({
            title: result.message || copy.text.enterScorePageFailed,
            icon: 'none'
          });
          return;
        }

        navigateToTrustedRoute(`/subpackages/scoring/pages/score/score?targetId=${encodeURIComponent(id)}`);
      },
      fail: () => {
        wx.showToast({
          title: copy.format.reopenScorePage(name),
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  goLogin() {
    wx.redirectTo({
      url: '/pages/login/login'
    });
  },

  goPortal() {
    wx.redirectTo({
      url: '/pages/portal/portal'
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
        console.warn('[home] getUnreadCounts returned:', res.status, res.message);
      }
    } catch (e) {
      console.error('[home] getUnreadCounts failed:', e);
    }
  },

  async checkPublication() {
    const activeRole = wx.getStorageSync(ACTIVE_ROLE_KEY) || '';
    if (activeRole !== 'user') return;
    const activityId = this.data.currentActivity ? this.data.currentActivity.id : '';
    const request = orgSession.beginRequest(this, 'publication');
    if (!activityId) {
      this.setData(emptyPublicationState());
      this.rebuildUserTabs(true);
      return;
    }
    try {
      const res = await new Promise((resolve, reject) => {
        callFunction({ name: 'getPublicResults', data: { activityId }, success: (r) => resolve(r.result || {}), fail: reject });
      });
      if (!orgSession.isRequestCurrent(this, request) || activityId !== ((this.data.currentActivity || {}).id || '')) return;
      if (res.status === 'success') {
        const displayMode = res.displayMode || 'score';
        const isGrade = displayMode === 'grade';
        // Support both legacy flat results and new per-clause groups
        const groups = res.groups || [];
        const flatResults = res.results || [];

        // Enrich groups with sorting
        const enrichedGroups = groups.map(group => ({
          ...group,
          members: (group.members || []).map(m => ({
            ...m,
            grade: m.grade || '',
            sortScore: typeof m.sortScore === 'number' ? m.sortScore : (parseFloat(m.finalScore) || 0)
          })).sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0))
        }));

        // Build flat results from all groups for filtering compatibility
        const allMembers = [];
        enrichedGroups.forEach(g => { g.members.forEach(m => { allMembers.push(m); }); });

        // Legacy: if server returned flat results
        let sorted = [];
        if (flatResults.length && !enrichedGroups.length) {
          const results = flatResults.map(r => ({
            ...r,
            grade: r.grade || '',
            finalScore: isGrade ? '' : (typeof r.finalScore === 'number' ? r.finalScore.toFixed(3) : (r.finalScore || '0.000')),
            sortScore: typeof r.sortScore === 'number' ? r.sortScore : (parseFloat(r.finalScore) || 0)
          }));
          sorted = [...results].sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
        } else if (allMembers.length) {
          sorted = [...allMembers].sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
        }
        sorted.forEach((item, idx) => { item.rank = idx + 1; });

        // Flatten all members for stats
        const allScores = sorted.map(r => parseFloat(r.finalScore) || 0).filter(s => !isNaN(s));

        // Grade distribution from all members (for grade filter chips)
        const gradeCountMap = new Map();
        sorted.forEach(r => {
          const g = r.grade || (isGrade ? copy.text.unrated : '');
          if (g) gradeCountMap.set(g, (gradeCountMap.get(g) || 0) + 1);
        });
        const gradeDistribution = Array.from(gradeCountMap.entries())
          .map(([grade, count]) => ({ grade, count }));

        const statsData = isGrade
          ? { count: sorted.length, maxScore: '--', avgScore: '--' }
          : {
              count: sorted.length,
              maxScore: allScores.length ? Math.max(...allScores).toFixed(1) : '--',
              avgScore: allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : '--'
            };

        // Extract filter options from all members
        const idSet = new Set(); const deptSet = new Set(); const wgSet = new Set();
        sorted.forEach(r => { if (r.identity) idSet.add(r.identity); if (r.department) deptSet.add(r.department); if (r.workGroup) wgSet.add(r.workGroup); });
        const resultIdentities = Array.from(idSet).sort();
        const resultDepartments = Array.from(deptSet).sort();
        const resultWorkGroups = Array.from(wgSet).sort();

        this.setData({ publishedResults: sorted, publishedGroups: enrichedGroups, hasPublication: true, hasViewPerm: true, statsData,
          displayMode, gradeDistribution,
          resultIdentities, resultDepartments, resultWorkGroups,
          resultFilterIdentity: '', resultFilterDepartment: '', resultFilterWorkGroup: '', resultFilterGrade: '', resultSearchText: '' });
        this.applyResultFilters();
      } else if (res.status === 'no_permission') {
        this.setData({ ...emptyPublicationState(), hasPublication: true, hasViewPerm: false });
      } else {
        this.setData(emptyPublicationState());
      }
    } catch (e) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      console.error('checkPublication error:', e);
      this.setData(emptyPublicationState());
    }

    if (!orgSession.isRequestCurrent(this, request)) return;
    try {
      const mlRes = await new Promise((resolve, reject) => {
        callFunction({ name: 'getPublicMeritList', data: { activityId }, success: (r) => resolve(r.result || {}), fail: reject });
      });
      if (!orgSession.isRequestCurrent(this, request) || activityId !== ((this.data.currentActivity || {}).id || '')) return;
      if (mlRes.status === 'success') {
        const canDes = mlRes.canDesignate === true;
        const list = mlRes.meritList || [];
        // Group by identity
        const groupMap = new Map();
        list.forEach(m => {
          const key = m.identity || copy.text.unclassified;
          if (!groupMap.has(key)) groupMap.set(key, { identity: key, identityId: '', members: [] });
          groupMap.get(key).members.push(m);
        });
        const deptSet = new Set(list.map(m => m.department).filter(Boolean));

        // Build merit rule groups from user's clauses (per-identity display)
        const userClauses = mlRes.clauses || [];
        const ruleGroupMap = new Map();
        for (const c of userClauses) {
          const key = c.targetIdentity || copy.text.unclassified;
          if (!ruleGroupMap.has(key)) {
            ruleGroupMap.set(key, { targetIdentity: key, targetIdentityId: c.targetIdentityId || '', clauses: [], designatedMembers: [], quotaInfo: '' });
          }
          ruleGroupMap.get(key).clauses.push(c);
        }
        for (const [key, group] of ruleGroupMap) {
          const quotas = group.clauses.map(c => c.quotaLimit || 0).filter(q => q > 0);
          const hasExact = group.clauses.some(c => c.requireExactQuota);
          if (hasExact && quotas.length > 0) {
            group.quotaInfo = copy.format.exactQuota(quotas[0]);
          } else if (quotas.length > 0) {
            group.quotaInfo = copy.format.maximumQuota(Math.max(...quotas));
          } else {
            group.quotaInfo = copy.text.unlimitedPeople;
          }
          group.designatedMembers = list.filter(m => (m.identity || copy.text.unclassified) === key);
        }
        const meritRuleGroups = Array.from(ruleGroupMap.values());

        this.setData({ publishedMeritList: list, publishedMeritGroups: Array.from(groupMap.values()), meritDeptCount: deptSet.size, hasMeritPerm: canDes, userMeritClauses: userClauses, userDesigCandidates: mlRes.designationCandidates || [], userDesigPubId: mlRes.publicationId || '', meritRuleGroups });
      } else {
        this.setData({
          publishedMeritList: [],
          publishedMeritGroups: [],
          meritRuleGroups: [],
          meritDeptCount: 0,
          hasMeritPerm: false,
          userMeritClauses: [],
          userDesigCandidates: [],
          userDesigPubId: ''
        });
      }
    } catch (e) {
      if (!orgSession.isRequestCurrent(this, request)) return;
      this.setData({
        publishedMeritList: [],
        publishedMeritGroups: [],
        meritRuleGroups: [],
        meritDeptCount: 0,
        hasMeritPerm: false,
        userMeritClauses: [],
        userDesigCandidates: [],
        userDesigPubId: ''
      });
    }

    if (orgSession.isRequestCurrent(this, request)) this.rebuildUserTabs(true);
  },

  applyResultFilters() {
    const base = this.data.publishedResults || [];
    const baseGroups = this.data.publishedGroups || [];
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
    let filtered = base.filter(memberMatches);
    const sorted = [...filtered].sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
    sorted.forEach((item, idx) => { item.rank = idx + 1; });

    // Filtered groups
    const filteredGroups = baseGroups.map(group => ({
      ...group,
      members: (group.members || []).filter(memberMatches)
    })).filter(group => group.members.length > 0);

    // Stats from all filtered members
    const allFiltered = [];
    filteredGroups.forEach(g => { g.members.forEach(m => { allFiltered.push(m); }); });
    if (!allFiltered.length && sorted.length) sorted.forEach(m => allFiltered.push(m));

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
      filteredResults: sorted,
      filteredGroups,
      filteredStatsData,
      gradeDistribution: gradeDistribution || this.data.gradeDistribution || []
    });
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

  async openUserDesignation(e) {
    const filterIdentity = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.identity) || '';
    this.setData({ userDesigLoading: true });
    try {
      const user = this.data.user || {};
      // Use stored clauses from checkPublication (no admin auth needed)
      let meritClauses = (this.data.userMeritClauses || []).filter(c => {
        return c.granteeDepartmentId === (user.departmentId || '') && c.granteeIdentityId === (user.identityId || '');
      });
      if (filterIdentity) {
        meritClauses = meritClauses.filter(c => c.targetIdentity === filterIdentity);
      }
      if (!meritClauses.length) {
        wx.showToast({ title: copy.text.noMeritList, icon: 'none' });
        this.setData({ userDesigLoading: false });
        return;
      }

      // Use pre-fetched designationCandidates from getPublicMeritList (no admin auth needed)
      const allCandidates = this.data.userDesigCandidates || [];

      // Filter candidates by the clause's merit clauses
      const meritedTargetIds = new Set(meritClauses.map(c => c.targetIdentityId));
      const hrList = allCandidates.filter(hr => meritedTargetIds.has(hr.targetIdentityId));

      // Group by target identity
      const groupMap = new Map();
      hrList.forEach(hr => {
        const key = hr.targetIdentityId;
        if (!groupMap.has(key)) groupMap.set(key, { targetIdentityId: key, targetIdentity: hr.targetIdentity, members: [] });
        groupMap.get(key).members.push(hr);
      });
      const desigGroups = Array.from(groupMap.values());

      const depts = new Set(hrList.map(hr => hr.department).filter(Boolean));
      const idents = new Set(hrList.map(hr => hr.identity).filter(Boolean));
      const selectedList = hrList.filter(hr => hr.isSelected);
      const selectedHrIds = [...new Set(selectedList.map(hr => hr.id))];
      const pubId = this.data.publicationForm ? this.data.publicationForm.id : '';
      this.setData({
        showUserDesigPopup: true,
        userDesigClauses: meritClauses,
        userDesigHrList: hrList,
        userDesigFilteredList: hrList,
        userDesigSelectedIds: selectedHrIds,
        userDesigSelectedList: selectedList,
        userDesigGroups: desigGroups,
        userDesigPubId: pubId || (this.data.currentActivity ? this.data.currentActivity.id : ''),
        userDesigFilterDept: copy.text.all,
        userDesigFilterIdent: copy.text.all,
        userDesigFilterDeptOptions: [copy.text.all, ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
        userDesigFilterIdentOptions: [copy.text.all, ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
        userDesigSearchKeyword: ''
      });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: copy.text.refreshLater, icon: 'none' });
    }
    this.setData({ userDesigLoading: false });
  },

  closeUserDesignation() { this.setData({ showUserDesigPopup: false }); },

  onUserDesigToggle(e) {
    const hrId = e.currentTarget.dataset.hrId;
    const sel = [...this.data.userDesigSelectedIds];
    const idx = sel.indexOf(hrId);
    if (idx >= 0) sel.splice(idx, 1); else sel.push(hrId);
    const hrList = this.data.userDesigHrList.map(hr => ({
      ...hr,
      isSelected: hr.id === hrId ? !hr.isSelected : hr.isSelected
    }));
    const selectedList = hrList.filter(hr => hr.isSelected);
    const filteredList = this.applyUserDesigFilters(hrList);
    this.setData({
      userDesigSelectedIds: sel, userDesigHrList: hrList,
      userDesigFilteredList: filteredList, userDesigSelectedList: selectedList
    });
  },

  applyUserDesigFilters(list) {
    let result = list || this.data.userDesigHrList;
    if (this.data.userDesigFilterDept !== copy.text.all) {
      result = result.filter(hr => hr.department === this.data.userDesigFilterDept);
    }
    if (this.data.userDesigFilterIdent !== copy.text.all) {
      result = result.filter(hr => hr.identity === this.data.userDesigFilterIdent);
    }
    if (this.data.userDesigSearchKeyword) {
      const kw = this.data.userDesigSearchKeyword.toLowerCase();
      result = result.filter(hr => (hr.name || '').toLowerCase().includes(kw) || (hr.studentId || '').toLowerCase().includes(kw));
    }
    // Rebuild groups from filtered list
    const groupMap = new Map();
    result.forEach(hr => {
      const key = hr.targetIdentityId;
      if (!groupMap.has(key)) groupMap.set(key, { targetIdentityId: key, targetIdentity: hr.targetIdentity, members: [] });
      groupMap.get(key).members.push(hr);
    });
    this.setData({ userDesigGroups: Array.from(groupMap.values()) });
    return result;
  },

  onUserDesigFilterChange(e) {
    const field = e.currentTarget.dataset.field;
    const options = field === 'identity' ? this.data.userDesigFilterIdentOptions : this.data.userDesigFilterDeptOptions;
    const value = options[Number(e.detail.value)] || copy.text.all;
    const patch = { userDesigFilteredList: this.applyUserDesigFilters() };
    if (field === 'department') patch.userDesigFilterDept = value;
    else patch.userDesigFilterIdent = value;
    this.setData(patch);
  },

  onUserDesigSearchInput(e) {
    this.setData({ userDesigSearchKeyword: e.detail.value, userDesigFilteredList: this.applyUserDesigFilters() });
  },

  async saveUserDesignations() {
    const clauses = this.data.userDesigClauses || [];
    if (!clauses.length) return;
    const clauseIds = clauses.map(c => c.id);
    // Dedup: ensure no duplicate HR IDs in the request
    const uniqueHrIds = [...new Set(this.data.userDesigSelectedIds)];
    this.setData({ userDesigSaving: true });
    try {
      const res = await new Promise((r, j) => callFunction({
        name: 'submitMeritListDesignations',
        data: { clauseIds, clauseId: clauseIds[0], publicationId: this.data.userDesigPubId, designationHrIds: uniqueHrIds },
        success: (res) => r(res.result || {}), fail: j
      }));
      if (res.status === 'success') {
        wx.showToast({ title: copy.text.saved, icon: 'success' });
        this.closeUserDesignation();
        this.checkPublication();
      } else {
        wx.showToast({ title: res.message || copy.text.saveFailed, icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: copy.text.saveFailed, icon: 'none' });
    }
    this.setData({ userDesigSaving: false });
  }
});
