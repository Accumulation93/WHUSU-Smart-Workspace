const adminPermissions = require('./adminPermissions');

const PORTAL_ROUTE = '/pages/portal/portal';

const USER_ONLY_ROUTES = {
  '/pages/home/home': true,
  '/subpackages/scoring/pages/score/score': true,
  '/subpackages/audit/pages/mySubmissions/mySubmissions': true,
  '/subpackages/audit/pages/pendingApprovals/pendingApprovals': true,
  '/subpackages/audit/pages/myApprovalHistory/myApprovalHistory': true,
  '/subpackages/audit/pages/signatureManager/signatureManager': true,
  '/subpackages/venue/pages/venueBooking/venueBooking': true,
  '/subpackages/venue/pages/myVenueBookings/myVenueBookings': true
};

function normalizeRoute(route) {
  const value = String(route || '').split('?')[0];
  if (!value) return '';
  return value.charAt(0) === '/' ? value : '/' + value;
}

function getPageSubApp(page) {
  if (!page) return '';
  if (page._subApp) return String(page._subApp);
  const options = page.options || {};
  return String(options.subApp || '');
}

function canUseAdminArea(profile, area) {
  const permissionMap = adminPermissions.PORTAL_PERMISSION_MAP;
  return adminPermissions.hasAny(profile, permissionMap[area] || []);
}

function isPageSupported(page, activated) {
  if (!page) return true;
  const route = normalizeRoute(page.route);
  const context = (activated && activated.context) || {};
  const role = context.role || '';
  const profile = (activated && activated.user) || null;

  if (USER_ONLY_ROUTES[route]) return role === 'user';

  if (route === '/subpackages/scoring/pages/admin/admin') {
    const subApp = getPageSubApp(page) || 'scoring';
    return role === 'admin' && canUseAdminArea(profile, subApp);
  }
  if (route === '/subpackages/scoring/pages/scorerTasks/scorerTasks') {
    return role === 'admin' && adminPermissions.hasAny(profile, ['scoring.results']);
  }
  if (route === '/subpackages/venue/pages/venueManage/venueManage') {
    return role === 'admin' && canUseAdminArea(profile, 'venue');
  }
  if (route === '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals') {
    return role === 'user'
      || (role === 'admin' && adminPermissions.hasAny(profile, ['venue.approvals']));
  }
  if (route === '/subpackages/org/pages/adminPermissions/adminPermissions') {
    return role === 'admin' && adminPermissions.canAccessPermissionSystem(profile);
  }
  if (route === '/subpackages/org/pages/authManagement/authManagement') {
    return role === 'admin' && canUseAdminArea(profile, 'authManagement');
  }
  return true;
}

function shouldReturnToPortalAfterSwitch(activated) {
  const pages = getCurrentPages();
  const previousPage = pages && pages.length > 1 ? pages[pages.length - 2] : null;
  return !isPageSupported(previousPage, activated);
}

function finishSwitch(activated) {
  if (shouldReturnToPortalAfterSwitch(activated)) {
    wx.reLaunch({ url: PORTAL_ROUTE });
    return 'portal';
  }
  wx.navigateBack();
  return 'back';
}

module.exports = {
  PORTAL_ROUTE,
  normalizeRoute,
  getPageSubApp,
  isPageSupported,
  shouldReturnToPortalAfterSwitch,
  finishSwitch
};
