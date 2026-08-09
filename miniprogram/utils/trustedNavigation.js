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
  '/subpackages/venue/pages/venueApprovalHistory/venueApprovalHistory',
  '/subpackages/org/pages/switch/switch',
  '/subpackages/org/pages/adminPermissions/adminPermissions',
  '/subpackages/org/pages/identitySwitch/identitySwitch',
  '/subpackages/org/pages/accountSecurity/accountSecurity',
  '/subpackages/org/pages/authManagement/authManagement'
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

function routePath(url) {
  return String(url || '').split('?')[0].replace(/^\//, '');
}

function isCurrentRoute(url) {
  if (typeof getCurrentPages !== 'function') return false;
  const pages = getCurrentPages();
  const current = pages && pages[pages.length - 1];
  return !!current && current.route === routePath(url);
}

function navigateToTrustedRouteFallback(url, callbacks, finishFailure) {
  if (!isTrustedRoute(url) || typeof wx.redirectTo !== 'function') {
    finishFailure({ errMsg: 'redirectTo:fail unavailable' });
    return;
  }
  wx.redirectTo({
    url: url,
    success: function(result) {
      if (typeof callbacks.success === 'function') callbacks.success(result);
    },
    fail: finishFailure
  });
}

function navigateToTrustedRoute(rawUrl, handlers) {
  const url = String(rawUrl || '').trim();
  const callbacks = handlers || {};
  if (!isTrustedRoute(url)) {
    wx.showToast({ title: '请从应用服务重新进入', icon: 'none' });
    return false;
  }
  const finishFailure = function(error) {
    if (typeof callbacks.fail === 'function') callbacks.fail(error);
    else wx.showToast({ title: '页面未打开，请重试', icon: 'none' });
  };
  wx.navigateTo({
    url: url,
    success: function(result) {
      if (typeof callbacks.success === 'function') callbacks.success(result);
    },
    fail: function(error) {
      const timedOut = /timeout/i.test(String(error && error.errMsg || ''));
      if (!timedOut || !isCurrentRoute(url)) {
        finishFailure(error);
        return;
      }
      navigateToTrustedRouteFallback(url, callbacks, finishFailure);
    }
  });
  return true;
}

module.exports = { isTrustedRoute, navigateToTrustedRoute, isCurrentRoute };
