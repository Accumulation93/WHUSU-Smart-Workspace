const ROUTE_TITLES = {
  'pages/login/login': '登录 - WHUSU智慧工作台',
  'pages/portal/portal': '应用服务 - WHUSU智慧工作台',
  'pages/messageCenter/messageCenter': '消息中心 - WHUSU智慧工作台',
  'pages/home/home': '考核评分 - WHUSU智慧工作台',
  'subpackages/scoring/pages/score/score': '考核评分 - WHUSU智慧工作台',
  'subpackages/scoring/pages/admin/admin': '考核评分 - WHUSU智慧工作台',
  'subpackages/scoring/pages/scorerTasks/scorerTasks': '考核评分 - WHUSU智慧工作台',
  'subpackages/audit/pages/mySubmissions/mySubmissions': '审核审批 - WHUSU智慧工作台',
  'subpackages/audit/pages/submissionDetail/submissionDetail': '审核审批 - WHUSU智慧工作台',
  'subpackages/audit/pages/pendingApprovals/pendingApprovals': '审核审批 - WHUSU智慧工作台',
  'subpackages/audit/pages/myApprovalHistory/myApprovalHistory': '审核审批 - WHUSU智慧工作台',
  'subpackages/audit/pages/signatureManager/signatureManager': '审核审批 - WHUSU智慧工作台',
  'subpackages/audit/pages/verification/verification': '审核审批 - WHUSU智慧工作台',
  'subpackages/venue/pages/venueManage/venueManage': '场地借用 - WHUSU智慧工作台',
  'subpackages/venue/pages/venueBookings/venueBookings': '场地借用 - WHUSU智慧工作台',
  'subpackages/venue/pages/venueBooking/venueBooking': '场地借用 - WHUSU智慧工作台',
  'subpackages/venue/pages/myVenueBookings/myVenueBookings': '场地借用 - WHUSU智慧工作台',
  'subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals': '场地借用 - WHUSU智慧工作台',
  'subpackages/org/pages/switch/switch': '组织与身份 - WHUSU智慧工作台',
  'subpackages/org/pages/adminPermissions/adminPermissions': '管理员权限 - WHUSU智慧工作台',
  'subpackages/org/pages/identitySwitch/identitySwitch': '组织与身份 - WHUSU智慧工作台',
  'subpackages/org/pages/accountSecurity/accountSecurity': '账号安全 - WHUSU智慧工作台',
  'subpackages/org/pages/authManagement/authManagement': '身份认证 - WHUSU智慧工作台'
};

const ROOT_ROUTES = {
  'pages/login/login': true,
  'pages/portal/portal': true
};

function getWindowMetrics() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const statusBarHeight = Math.max(Number(windowInfo.statusBarHeight) || 0, 20);
  let menuRect = null;
  try {
    menuRect = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  } catch (error) {
    menuRect = null;
  }
  const menuTop = menuRect && Number(menuRect.top) > statusBarHeight
    ? Number(menuRect.top)
    : statusBarHeight + 6;
  const menuHeight = menuRect && Number(menuRect.height) > 0 ? Number(menuRect.height) : 32;
  const navigationBarHeight = Math.max(44, menuHeight + Math.max(menuTop - statusBarHeight, 4) * 2);
  const windowWidth = Number(windowInfo.windowWidth) || 375;
  const menuLeft = menuRect && Number(menuRect.left) > 0 ? Number(menuRect.left) : windowWidth - 95;
  const sideWidth = Math.max(windowWidth - menuLeft + 8, 88);
  return {
    statusBarHeight,
    navigationBarHeight,
    totalHeight: statusBarHeight + navigationBarHeight,
    rightWidth: sideWidth
  };
}

Component({
  data: {
    title: 'WHUSU智慧工作台',
    canGoBack: false,
    statusBarHeight: 24,
    navigationBarHeight: 44,
    totalHeight: 68,
    leftWidth: 18,
    rightWidth: 96
  },

  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const currentPage = pages.length ? pages[pages.length - 1] : null;
      const route = currentPage && currentPage.route ? currentPage.route : '';
      const canGoBack = pages.length > 1 || !ROOT_ROUTES[route];
      this.setData({
        ...getWindowMetrics(),
        title: ROUTE_TITLES[route] || 'WHUSU智慧工作台',
        canGoBack,
        leftWidth: canGoBack ? 58 : 18
      });
    }
  },

  methods: {
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
        return;
      }
      wx.reLaunch({ url: '/pages/portal/portal' });
    }
  }
});
