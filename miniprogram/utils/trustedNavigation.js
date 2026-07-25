const TRUSTED_ROUTES = new Set([
  '/pages/login/login',
  '/pages/portal/portal',
  '/pages/messageCenter/messageCenter',
  '/pages/home/home',
  '/subpackages/scoring/pages/score/score',
  '/subpackages/scoring/pages/admin/admin',
  '/subpackages/scoring/pages/scorerTasks/scorerTasks',
  '/subpackages/audit/pages/mySubmissions/mySubmissions',
  '/subpackages/audit/pages/submissionDetail/submissionDetail',
  '/subpackages/audit/pages/pendingApprovals/pendingApprovals',
  '/subpackages/audit/pages/myApprovalHistory/myApprovalHistory',
  '/subpackages/audit/pages/signatureManager/signatureManager',
  '/subpackages/audit/pages/verification/verification',
  '/subpackages/venue/pages/venueManage/venueManage',
  '/subpackages/venue/pages/venueBookings/venueBookings',
  '/subpackages/venue/pages/venueBooking/venueBooking',
  '/subpackages/venue/pages/myVenueBookings/myVenueBookings',
  '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals',
  '/subpackages/org/pages/switch/switch',
  '/subpackages/org/pages/adminPermissions/adminPermissions'
]);

function isTrustedRoute(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || url.length > 1024 || /[\u0000-\u001f\\#]/.test(url)) return false;
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch (_) { return false; }
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('://')) return false;
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  return TRUSTED_ROUTES.has(pathname) && (!query || /^[A-Za-z0-9_.~%=&+-]+$/.test(query));
}

function navigateToTrustedRoute(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!isTrustedRoute(url)) {
    wx.showToast({ title: '目标页面不可用', icon: 'none' });
    return false;
  }
  wx.navigateTo({
    url: url,
    fail: function() {
      wx.showToast({ title: '目标页面不可用', icon: 'none' });
    }
  });
  return true;
}

module.exports = { isTrustedRoute, navigateToTrustedRoute };
