const { callFunction } = require('../../utils/api');
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
  { key: 'venue', label: '场地管理', icon: '🏟️', desc: '场地 · 规则 · 配置', url: '/subpackages/venue/pages/venueManage/venueManage', disabled: false },
  { key: 'venueBookings', label: '借用管理', icon: '📅', desc: '审批 · 查看 · 管理', url: '/subpackages/venue/pages/venueBookings/venueBookings', disabled: false }
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
    unbindLoading: false
  },

  onShow() {
    this.refreshCurrentUser();
    this.loadOrganizationName();
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
