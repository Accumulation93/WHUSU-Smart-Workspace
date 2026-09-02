const localeCopy = require('../locales/zh-CN/generated/utils/trustedNavigation');
const TRUSTED_ROUTES = new Set([
  '/subpackages/main/pages/login/login',
  '/subpackages/main/pages/portal/portal',
  '/subpackages/message/pages/messageCenter/messageCenter',
  '/subpackages/workspace/pages/home/home',
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
  '/subpackages/venue/pages/venueApprovalHistoryDetail/venueApprovalHistoryDetail',
  '/subpackages/org/pages/switch/switch',
  '/subpackages/org/pages/adminPermissions/adminPermissions',
  '/subpackages/org/pages/identitySwitch/identitySwitch',
  '/subpackages/org/pages/accountSecurity/accountSecurity',
  '/subpackages/org/pages/authManagement/authManagement'
]);
const NAVIGATION_TIMEOUT_MS = 3000;

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

function navigateToTrustedRoute(rawUrl, handlers) {
  const url = String(rawUrl || '').trim();
  const callbacks = handlers || {};
  if (!isTrustedRoute(url)) {
    wx.showToast({ title: localeCopy.copy_9aad91c741, icon: 'none' });
    return false;
  }
  let finished = false;
  let fallbackStarted = false;
  let timer = null;
  const clearTimer = function() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  const finishSuccess = function(result) {
    if (finished) return;
    finished = true;
    clearTimer();
    if (typeof callbacks.success === 'function') callbacks.success(result);
  };
  const finishFailure = function(error) {
    if (finished) return;
    finished = true;
    clearTimer();
    if (typeof callbacks.fail === 'function') callbacks.fail(error);
    else wx.showToast({ title: localeCopy.copy_4becb061c6, icon: 'none' });
  };
  const rebuildRoute = function(originalError) {
    if (typeof wx.reLaunch !== 'function') {
      finishFailure(originalError || { errMsg: 'reLaunch:fail unavailable' });
      return;
    }
    wx.reLaunch({
      url: url,
      success: finishSuccess,
      fail: finishFailure
    });
  };
  const replaceRoute = function(originalError) {
    if (finished || fallbackStarted) return;
    if (isCurrentRoute(url)) {
      finishSuccess({ errMsg: 'navigateTo:ok route active' });
      return;
    }
    fallbackStarted = true;
    if (typeof wx.redirectTo !== 'function') {
      rebuildRoute(originalError);
      return;
    }
    wx.redirectTo({
      url: url,
      success: finishSuccess,
      fail: function() { rebuildRoute(originalError); }
    });
  };

  // 部分真机会在加载分包时丢失 navigateTo 回调。进入功能优先：正常压栈失败
  // 或超时后替换当前页，再失败才重建页面栈，不让已登录用户停在工作台。
  timer = setTimeout(function() {
    replaceRoute({ errMsg: 'navigateTo:fail timeout' });
  }, NAVIGATION_TIMEOUT_MS);
  wx.navigateTo({
    url: url,
    success: finishSuccess,
    fail: replaceRoute
  });
  return true;
}

module.exports = { isTrustedRoute, navigateToTrustedRoute, isCurrentRoute };
