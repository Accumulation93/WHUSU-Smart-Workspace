const { callFunction } = require('../../utils/api');
const orgSession = require('../../utils/orgSession');
const STORAGE_KEY = 'roleProfiles';
const ACTIVE_ROLE_KEY = 'activeRole';
const LEADER_IDENTITIES = ['部门主要负责人', '部门负责人'];
const USER_TABS = [
  { key: 'scoring', label: '考核评分' },
  { key: 'results', label: '结果公示' },
  { key: 'meritList', label: '评优名单' },
  { key: 'profile', label: '人事信息' }
];

function shouldShowWorkGroup(user) {
  if (!user || !user.workGroup) {
    return false;
  }

  return LEADER_IDENTITIES.indexOf(user.identity) === -1;
}

function getDisplayIdentity(user, activeRole) {
  if (!user) {
    return '未登录';
  }

  if (activeRole === 'admin') {
    return user.adminLevel === 'super_admin' ? '超级管理员' : '普通管理员';
  }

  return user.identity || '未设置身份';
}

function emptyHrProfileState() {
  return {
    loading: false,
    saving: false,
    loaded: false,
    template: null,
    pendingValues: {},
    auditStatus: 'none',
    statusText: '尚未提交扩展资料',
    rejectionReason: ''
  };
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
    userDesigFilterDept: '全部',
    userDesigFilterIdent: '全部',
    userDesigFilterDeptOptions: ['全部'],
    userDesigFilterIdentOptions: ['全部'],
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
    return '数字字段';
  }
  if (type === 'sequence') {
    return '序列选择';
  }
  if (type === 'date') {
    return '日期字段';
  }
  if (type === 'phone') {
    return '手机号字段';
  }
  if (type === 'email') {
    return '邮箱字段';
  }
  return '文本字段';
}

function buildFieldHint(field = {}) {
  if (field.type === 'text' && ((field.minLength != null && field.minLength !== '') || (field.maxLength != null && field.maxLength !== ''))) {
    const parts = [];
    if (field.minLength != null && field.minLength !== '') {
      parts.push(`最短 ${field.minLength}`);
    }
    if (field.maxLength != null && field.maxLength !== '') {
      parts.push(`最长 ${field.maxLength}`);
    }
    return `长度限制：${parts.join('，')}`;
  }

  if (field.type === 'number') {
    const decimalText = field.allowDecimal === false ? '仅整数' : '允许小数';
    if (field.numberRule === 'length_range' && ((field.minDigits != null && field.minDigits !== '') || (field.maxDigits != null && field.maxDigits !== ''))) {
      const parts = [];
      if (field.minDigits != null && field.minDigits !== '') {
        parts.push(`最短 ${field.minDigits}`);
      }
      if (field.maxDigits != null && field.maxDigits !== '') {
        parts.push(`最长 ${field.maxDigits}`);
      }
      return `数字长度：${parts.join('，')}，${decimalText}`;
    }
    if ((field.minValue != null && field.minValue !== '') || (field.maxValue != null && field.maxValue !== '')) {
      const parts = [];
      if (field.minValue != null && field.minValue !== '') {
        parts.push(`最小 ${field.minValue}`);
      }
      if (field.maxValue != null && field.maxValue !== '') {
        parts.push(`最大 ${field.maxValue}`);
      }
      return `数值范围：${parts.join('，')}，${decimalText}`;
    }
    return decimalText;
  }

  if (field.type === 'date') {
    return '格式：YYYY-MM-DD';
  }

  if (field.type === 'phone') {
    return '请输入 11 位手机号';
  }

  if (field.type === 'email') {
    return '示例：name@example.com';
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
    return `${field.label}不能为空`;
  }

  if (!value) {
    return '';
  }

  if (field.type === 'text') {
    if (field.minLength != null && field.minLength !== '' && value.length < field.minLength) {
      return `${field.label}长度不能少于 ${field.minLength}`;
    }
    if (field.maxLength != null && field.maxLength !== '' && value.length > field.maxLength) {
      return `${field.label}长度不能超过 ${field.maxLength}`;
    }
  }

  if (field.type === 'number') {
    if (field.allowDecimal === false && !/^[+-]?\d+$/.test(value)) {
      return `${field.label}必须是整数`;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return `${field.label}必须是数字`;
    }
    if (field.numberRule === 'length_range') {
      const numericLength = getNumericLength(value);
      if (field.minDigits != null && field.minDigits !== '' && numericLength < field.minDigits) {
        return `${field.label}长度不能少于 ${field.minDigits}`;
      }
      if (field.maxDigits != null && field.maxDigits !== '' && numericLength > field.maxDigits) {
        return `${field.label}长度不能超过 ${field.maxDigits}`;
      }
    } else {
      if (field.minValue != null && field.minValue !== '' && numberValue < field.minValue) {
        return `${field.label}不能小于 ${field.minValue}`;
      }
      if (field.maxValue != null && field.maxValue !== '' && numberValue > field.maxValue) {
        return `${field.label}不能大于 ${field.maxValue}`;
      }
    }
  }

  if (field.type === 'sequence' && Array.isArray(field.options) && field.options.length && field.options.indexOf(value) === -1) {
    return `${field.label}必须从预设选项中选择`;
  }

  if (field.type === 'date' && !isValidDateString(value)) {
    return `${field.label}必须是有效日期`;
  }

  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) {
    return `${field.label}必须是有效手机号`;
  }

  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `${field.label}必须是有效邮箱`;
  }

  return '';
}

Page({
  data: {
    user: null,
    activeRole: '',
    hasUser: false,
    isAdminRole: false,
    showWorkGroup: false,
    heroName: '欢迎使用',
    heroIdentity: '未登录',
    heroSubtitle: '请先完成登录',
    organizationName: '',
    currentActivity: null,
    currentActivityText: '加载中...',
    activityPaused: false,
    targetList: [],
    targetGroups: [],
    selectedTargetId: '',
    targetsLoading: false,
    targetsEmptyText: '加载中...',
    scoringStats: { total: 0, scored: 0, pending: 0 },
    showUnbindDialog: false,
    unbindLoading: false,
    // Start with only always-available tabs; results/meritList added after permission check
    userTabs: [{ key: 'scoring', label: '考核评分' }, { key: 'profile', label: '人事信息' }],
    activeTab: 'scoring',
    hrProfile: emptyHrProfileState(),
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
    userDesigFilterDept: '全部',
    userDesigFilterIdent: '全部',
    userDesigFilterDeptOptions: ['全部'],
    userDesigFilterIdentOptions: ['全部'],
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
        currentActivityText: '加载中...',
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
  },

  applySubAppFilter() {
    const subApp = this._subApp || 'scoring';
    const SUB_APP_USER_TABS = {
      scoring: ['scoring', 'results', 'meritList'],
      hr: ['profile'],
      audit: ['audit']
    };
    this._subAppAllowedTabs = SUB_APP_USER_TABS[subApp] || SUB_APP_USER_TABS.scoring;
    const SUB_APP_LABELS = { scoring: '考核评分', hr: '人事信息', audit: '审核' };
    this._subAppLabel = SUB_APP_LABELS[subApp] || '';
  },

  rebuildUserTabs(finalizeOrgFallback) {
    if (!this._subAppAllowedTabs) this.applySubAppFilter();
    const allowed = this._subAppAllowedTabs || ['scoring', 'results', 'meritList'];
    const tabs = [];
    if (allowed.indexOf('scoring') !== -1) tabs.push({ key: 'scoring', label: '考核评分' });
    if (allowed.indexOf('results') !== -1 && this.data.hasViewPerm) tabs.push({ key: 'results', label: '结果公示' });
    if (allowed.indexOf('meritList') !== -1 && this.data.hasMeritPerm) tabs.push({ key: 'meritList', label: '评优名单' });
    if (allowed.indexOf('profile') !== -1) tabs.push({ key: 'profile', label: '人事信息' });
    // Always add audit tab for users with HR info
    if (allowed.indexOf('audit') !== -1 && this.data.hasUser) tabs.push({ key: 'audit', label: '审核' });
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
        showShortToast('已切换页签');
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
            showWorkGroup: shouldShowWorkGroup(result.user),
            heroName: result.user.name || '欢迎使用',
            heroIdentity: getDisplayIdentity(result.user, 'user'),
            heroSubtitle: this._subAppLabel || ''
          });

          this.rebuildUserTabs();
          this.fetchRateTargets('user');
          this.loadUserHrProfile();
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
      showWorkGroup: shouldShowWorkGroup(currentUser),
      heroName: currentUser ? currentUser.name : '欢迎使用',
      heroIdentity: getDisplayIdentity(currentUser, activeRole),
      heroSubtitle: currentUser ? subAppLabel : '请先完成登录',
      targetList: [],
      selectedTargetId: '',
      targetsEmptyText: '加载中...',
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
          currentActivityText: activity ? activity.name : '暂无评分活动',
          activityPaused: activity ? !!activity.isPaused : false
        });
        this.checkPublication();
      },
      fail: () => {
        if (!orgSession.isRequestCurrent(this, request)) return;
        this.setData({
          currentActivity: null,
          currentActivityText: '暂无评分活动',
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
    wx.navigateTo({ url: '/subpackages/org/pages/switch/switch' });
  },

  processRateTargetsResult(result) {
    if (result.status !== 'success') {
      this.setData({
        targetList: [],
        targetGroups: [],
        targetsEmptyText: result.message || '暂无符合规则的被评分人',
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
      const identity = targets[i].identity || '未分类';
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
      showWorkGroup: shouldShowWorkGroup(currentUser),
      heroName: currentUser ? currentUser.name : this.data.heroName,
      heroIdentity: getDisplayIdentity(currentUser, 'user'),
      targetList: targets,
      targetGroups: targetGroups,
      targetsEmptyText: targets.length ? '' : '暂无符合规则的被评分人',
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
      targetsEmptyText: '正在加载被评分人',
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
          targetsEmptyText: '加载被评分人失败',
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
        statusText: result.statusText || '尚未提交扩展资料',
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
        title: '暂无模板配置',
        icon: 'none'
      });
      return;
    }

    if (template.editMode === 'readonly') {
      wx.showToast({
        title: '当前不可修改',
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
          showShortToast('更新失败');
          return;
        }

        showShortToast('已更新', 'success');
        this.loadUserHrProfile();
      },
      fail: () => {
        showShortToast('更新失败');
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
      wx.showToast({ title: '当前评分活动已暂停', icon: 'none' });
      return;
    }
    const activity = this.data.currentActivity;
    if (activity) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (activity.startDate) {
        const startDate = new Date(activity.startDate.replace(/-/g, '/'));
        if (today < startDate) {
          wx.showToast({ title: '当前评分活动尚未开始', icon: 'none' });
          return;
        }
      }
      if (activity.endDate) {
        const endDate = new Date(activity.endDate.replace(/-/g, '/'));
        if (today > endDate) {
          wx.showToast({ title: '当前评分活动已结束', icon: 'none' });
          return;
        }
      }
    }
    this.setData({ selectedTargetId: id });

    wx.showLoading({
      title: '进入评分页'
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
            title: result.message || '无法进入评分页',
            icon: 'none'
          });
          return;
        }

        wx.navigateTo({
          url: `/subpackages/scoring/pages/score/score?targetId=${encodeURIComponent(id)}`
        });
      },
      fail: () => {
        wx.showToast({
          title: `${name} 评分页加载失败`,
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
    wx.navigateTo({
      url: '/subpackages/scoring/pages/admin/admin'
    });
  },

  // ── Audit navigation ──
  goMySubmissions() {
    wx.navigateTo({
      url: '/subpackages/audit/pages/mySubmissions/mySubmissions'
    });
  },

  goPendingApprovals() {
    wx.navigateTo({
      url: '/subpackages/audit/pages/pendingApprovals/pendingApprovals'
    });
  },

  goMyApprovalHistory() {
    wx.navigateTo({
      url: '/subpackages/audit/pages/myApprovalHistory/myApprovalHistory'
    });
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

  openUnbindDialog() {
    if (!this.data.activeRole || this.data.unbindLoading) {
      return;
    }

    this.setData({
      showUnbindDialog: true
    });
  },

  closeUnbindDialog() {
    if (this.data.unbindLoading) {
      return;
    }

    this.setData({
      showUnbindDialog: false
    });
  },

  confirmUnbind() {
    if (!this.data.activeRole || this.data.unbindLoading) {
      return;
    }

    this.setData({
      unbindLoading: true
    });

    callFunction({
      name: 'unbindRole',
      data: {
        role: this.data.activeRole
      },
      success: (res) => {
        const result = res.result || {};

        if (result.status !== 'unbind_success' && result.status !== 'already_unbound') {
          wx.showToast({
            title: result.message || '解绑失败',
            icon: 'none'
          });
          return;
        }

        const roleProfiles = wx.getStorageSync(STORAGE_KEY) || {};
        delete roleProfiles[this.data.activeRole];
        wx.setStorageSync(STORAGE_KEY, roleProfiles);

        const roleList = Object.keys(roleProfiles);
        orgSession.clearAuthentication(roleList.length ? roleList[0] : '');

        this.setData({
          showUnbindDialog: false
        });

        wx.showToast({
          title: '解绑成功',
          icon: 'success'
        });

        wx.redirectTo({
          url: '/pages/login/login'
        });
      },
      fail: () => {
        wx.showToast({
          title: '解绑失败',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({
          unbindLoading: false
        });
      }
    });
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
          const g = r.grade || (isGrade ? '未评级' : '');
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
          const key = m.identity || '未分类';
          if (!groupMap.has(key)) groupMap.set(key, { identity: key, identityId: '', members: [] });
          groupMap.get(key).members.push(m);
        });
        const deptSet = new Set(list.map(m => m.department).filter(Boolean));

        // Build merit rule groups from user's clauses (per-identity display)
        const userClauses = mlRes.clauses || [];
        const ruleGroupMap = new Map();
        for (const c of userClauses) {
          const key = c.targetIdentity || '未分类';
          if (!ruleGroupMap.has(key)) {
            ruleGroupMap.set(key, { targetIdentity: key, targetIdentityId: c.targetIdentityId || '', clauses: [], designatedMembers: [], quotaInfo: '' });
          }
          ruleGroupMap.get(key).clauses.push(c);
        }
        for (const [key, group] of ruleGroupMap) {
          const quotas = group.clauses.map(c => c.quotaLimit || 0).filter(q => q > 0);
          const hasExact = group.clauses.some(c => c.requireExactQuota);
          if (hasExact && quotas.length > 0) {
            group.quotaInfo = `等额 ${quotas[0]} 人`;
          } else if (quotas.length > 0) {
            group.quotaInfo = `最多 ${Math.max(...quotas)} 人`;
          } else {
            group.quotaInfo = '不限人数';
          }
          group.designatedMembers = list.filter(m => (m.identity || '未分类') === key);
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
      if (gradeFilter && (r.grade || '未评级') !== gradeFilter) return false;
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
      allFiltered.forEach(r => { const g = r.grade || '未评级'; gradeCountMap.set(g, (gradeCountMap.get(g) || 0) + 1); });
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
      if (!meritClauses.length) { wx.showToast({ title: '暂无指定权限', icon: 'none' }); this.setData({ userDesigLoading: false }); return; }

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
        userDesigFilterDept: '全部', userDesigFilterIdent: '全部',
        userDesigFilterDeptOptions: ['全部', ...Array.from(depts).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
        userDesigFilterIdentOptions: ['全部', ...Array.from(idents).sort((a,b) => a.localeCompare(b, 'zh-CN'))],
        userDesigSearchKeyword: ''
      });
    } catch (e) { console.error(e); wx.showToast({ title: '加载失败', icon: 'none' }); }
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
    if (this.data.userDesigFilterDept !== '全部') result = result.filter(hr => hr.department === this.data.userDesigFilterDept);
    if (this.data.userDesigFilterIdent !== '全部') result = result.filter(hr => hr.identity === this.data.userDesigFilterIdent);
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
    const value = options[Number(e.detail.value)] || '全部';
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
        wx.showToast({ title: '已保存', icon: 'success' });
        this.closeUserDesignation();
        this.checkPublication();
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    } catch (e) { wx.showToast({ title: '保存失败', icon: 'none' }); }
    this.setData({ userDesigSaving: false });
  }
});
