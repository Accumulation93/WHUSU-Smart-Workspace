const localeCopy = require('../locales/zh-CN/generated/utils/api');
const API_BASE = 'https://accumulation93.com/api';
const CLIENT_VERSION = '1.2.0-security';
const orgSession = require('./orgSession');
const { getDeviceIdentity } = require('./deviceIdentity');
const IDEMPOTENT_WRITE_APIS = {
  submitScoreRecord: true,
  startAuditSubmission: true,
  startAdHocAudit: true,
  createVenueBooking: true,
  createAdminVenueBooking: true
};
const AUTH_ENTRY_APIS = {
  'auth/wechat/session': true,
  'auth/claims': true,
  'auth/claims/verify': true,
  'auth/claims/redeem': true,
  'auth/password/session': true,
  'auth/recovery/start': true,
  'auth/recovery/complete': true
};

let authenticationRefreshPromise = null;
let authenticationRedirecting = false;
let contextActivationDepth = 0;

function createRequestId() {
  return 'mp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function createRequestHeaders(requestId) {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (wx.getStorageSync('token') || ''),
    'X-Active-Org': wx.getStorageSync('activeOrgId') || '',
    'X-Role': wx.getStorageSync('activeRole') || '',
    'X-Client-Version': CLIENT_VERSION,
    'X-Request-Id': requestId || createRequestId()
  };
}

function cancelledError(requestId) {
  return {
    errMsg: 'request:fail request_cancelled',
    message: localeCopy.copy_e58fa637eb,
    status: 'request_cancelled',
    requestId: requestId,
    silent: true
  };
}

function notifyUpgrade(result) {
  if (!result || result.status !== 'client_upgrade_required') return;
  try {
    const app = getApp();
    if (app && app.notifyUpgradeRequired) app.notifyUpgradeRequired(result.message);
  } catch (_) {}
}

let orgPromptVisible = false;
function notifyOrgContextRequired(result) {
  if (!result || result.status !== 'org_context_required' || orgPromptVisible) return;
  orgPromptVisible = true;
  wx.showModal({
    title: localeCopy.copy_c6070950c1,
    content: result.message || localeCopy.copy_db7d9fed8e,
    showCancel: false,
    confirmText: localeCopy.copy_d869b80f50,
    complete: function() {
      orgPromptVisible = false;
      require('./trustedNavigation').navigateToTrustedRoute(
        '/subpackages/org/pages/identitySwitch/identitySwitch',
        { fail: function() { wx.reLaunch({ url: '/subpackages/main/pages/portal/portal' }); } }
      );
    }
  });
}

function createResponseError(res) {
  const responseData = res.data || {};
  return {
    errMsg: 'request:fail statusCode ' + res.statusCode,
    message: responseData.message || '',
    status: responseData.status || '',
    statusCode: res.statusCode,
    data: responseData,
    requestId: (res.header && (res.header['X-Request-Id'] || res.header['x-request-id'])) || ''
  };
}

function isAuthenticationFailure(statusCode, result) {
  if (Number(statusCode) !== 401) return false;
  const status = String((result && result.status) || '');
  return !status || [
    'auth_failed',
    'session_expired',
    'binding_missing',
    'account_unavailable'
  ].indexOf(status) >= 0;
}

function getFreshWechatCode() {
  return new Promise(function(resolve, reject) {
    wx.login({
      success: function(result) {
        const code = String((result && result.code) || '');
        if (code) resolve(code);
        else reject({ status: 'auth_failed', message: localeCopy.copy_c337bd9350 });
      },
      fail: function() {
        reject({ status: 'auth_failed', message: localeCopy.copy_c337bd9350 });
      }
    });
  });
}

function requestWechatSession(code) {
  return new Promise(function(resolve, reject) {
    const device = getDeviceIdentity();
    wx.request({
      url: API_BASE + '/auth/wechat/session',
      method: 'POST',
      timeout: 15000,
      header: createRequestHeaders(createRequestId()),
      data: {
        code: code,
        deviceId: device.id,
        devicePlatform: device.platform,
        deviceModel: device.model,
        preferredOrganizationId: wx.getStorageSync('lastOrganizationId') || '',
        preferredContextId: wx.getStorageSync('lastContextId') || '',
        preferredIdentityId: wx.getStorageSync('lastIdentityId') || ''
      },
      success: function(res) {
        const result = res.data || {};
        if (res.statusCode === 200 && result.status === 'login_success') {
          resolve(result);
          return;
        }
        const error = createResponseError(res);
        if (!error.message) error.message = result.message || localeCopy.copy_c337bd9350;
        reject(error);
      },
      fail: function(error) {
        reject({
          status: 'auth_failed',
          message: localeCopy.copy_c337bd9350,
          errMsg: (error && error.errMsg) || 'request:fail'
        });
      }
    });
  });
}

function refreshAuthentication() {
  if (authenticationRefreshPromise) return authenticationRefreshPromise;
  authenticationRefreshPromise = getFreshWechatCode()
    .then(requestWechatSession)
    .then(function(result) {
      // 延迟加载可避免 api.js 与 authContext.js 在初始化阶段互相引用。
      require('./authContext').applyAuthenticatedResult(result);
      authenticationRefreshPromise = null;
      authenticationRedirecting = false;
      return result;
    }, function(error) {
      authenticationRefreshPromise = null;
      throw error;
    });
  return authenticationRefreshPromise;
}

function authenticationMessage(error) {
  const status = String((error && error.status) || '');
  if (status === 'account_frozen') return localeCopy.copy_d6a178f6ce;
  if (status === 'need_claim' || status === 'binding_missing') return localeCopy.copy_e7c4c49eab;
  return localeCopy.copy_c337bd9350;
}

function redirectToLogin(error) {
  if (authenticationRedirecting) return;
  authenticationRedirecting = true;
  const message = authenticationMessage(error);
  try {
    require('./authContext').clearUnifiedAuthentication();
  } catch (_) {
    orgSession.clearAuthentication('');
  }
  wx.setStorageSync('authLoginNotice', message);
  wx.showToast({ title: message, icon: 'none', duration: 1800 });
  wx.reLaunch({ url: '/subpackages/main/pages/login/login?reason=expired' });
}

function markAuthenticationReady() {
  authenticationRedirecting = false;
}

function beginContextActivation() {
  contextActivationDepth += 1;
}

function endContextActivation() {
  contextActivationDepth = Math.max(0, contextActivationDepth - 1);
}

function hasSameSelection(left, right) {
  if (!left || !right) return false;
  return left.orgId === right.orgId
    && left.role === right.role
    && left.contextId === right.contextId
    && left.identityId === right.identityId;
}

function requestOnce(name, data, requestId, allowAuthenticationRefresh) {
  const organizationSnapshot = orgSession.getSnapshot();
  return new Promise(function(resolve, reject) {
    wx.request({
      url: API_BASE + '/' + name,
      method: 'POST',
      timeout: 15000,
      header: createRequestHeaders(requestId),
      data: data,
      success: function(res) {
        if (!orgSession.isCurrent(organizationSnapshot)) {
          const currentSnapshot = orgSession.getSnapshot();
          if (allowAuthenticationRefresh
            && hasSameSelection(organizationSnapshot, currentSnapshot)
            && currentSnapshot.token
            && currentSnapshot.token !== organizationSnapshot.token) {
            requestOnce(name, data, requestId, false).then(resolve, reject);
            return;
          }
          reject(cancelledError(requestId));
          return;
        }
        if (res.statusCode === 200) {
          notifyUpgrade(res.data);
          notifyOrgContextRequired(res.data);
          resolve(res.data);
          return;
        }
        const responseData = res.data || {};
        notifyUpgrade(responseData);
        notifyOrgContextRequired(responseData);
        const responseError = createResponseError(res);
        if (responseData.status === 'org_context_required') responseError.silent = true;
        if (contextActivationDepth > 0
          && name !== 'auth/contexts/activate'
          && isAuthenticationFailure(res.statusCode, responseData)) {
          reject(cancelledError(requestId));
          return;
        }
        if (allowAuthenticationRefresh
          && !AUTH_ENTRY_APIS[name]
          && isAuthenticationFailure(res.statusCode, responseData)) {
          refreshAuthentication().then(function() {
            return requestOnce(name, data, requestId, false);
          }).then(resolve, function(error) {
            redirectToLogin(error);
            error.silent = true;
            reject(error);
          });
          return;
        }
        reject(responseError);
      },
      fail: function(err) {
        if (!orgSession.isCurrent(organizationSnapshot)) {
          reject(cancelledError(requestId));
          return;
        }
        console.error('[API] Request failed:', name, JSON.stringify(err));
        const requestError = err || { errMsg: 'request:fail unknown' };
        if (/timeout/i.test(requestError.errMsg || '')) requestError.timedOut = true;
        reject(requestError);
      }
    });
  });
}

function callFunction(options) {
  const name = options.name || '';
  const data = Object.assign({}, options.data || {});
  const success = options.success;
  const fail = options.fail;
  const complete = options.complete;

  if (!/^[A-Za-z][A-Za-z0-9_\/-]*$/.test(name)) {
    const invalidNameError = { errMsg: 'request:fail invalid api name' };
    if (fail) fail(invalidNameError);
    if (complete) complete();
    const rejected = Promise.reject(invalidNameError);
    if (success || fail || complete) rejected.catch(function() {});
    return rejected;
  }

  const requestId = createRequestId();
  if (IDEMPOTENT_WRITE_APIS[name] && !data.clientRequestId) data.clientRequestId = requestId;
  const promise = requestOnce(name, data, requestId, true);

  // Backward compatibility: wire up callbacks if provided
  if (success || fail || complete) {
    promise.then(
      function(result) {
        if (success) success({ result: result });
        if (complete) complete();
      },
      function(err) {
        if (fail && !(err && err.silent)) fail(err);
        if (complete) complete();
      }
    );
  }

  return promise;
}

function showShortToast(title, icon) {
  if (!icon) icon = 'none';
  const t = String(title || '');
  if (!t) return;
  wx.showToast({ title: t, icon: icon });
}

function getErrorText(error, fallback) {
  if (error && (error.silent || error.status === 'request_cancelled')) return '';
  const text = String((error && error.message) || '').trim();
  return text || fallback;
}

/**
 * Format an audit timestamp for display.
 * Handles both ISO 8601 (2026-06-12T08:30:00.000Z) and MySQL DATETIME (2026-06-12 16:30:00).
 * Output: "2026-06-12 16:30" in local time
 */
function formatAuditTime(raw) {
  if (!raw) return '';
  try {
    let d;
    if (raw.indexOf('T') !== -1) {
      // ISO 8601 — parse as UTC, display in local
      d = new Date(raw);
    } else {
      // MySQL DATETIME — already in local time
      d = new Date(raw.replace(' ', 'T') + '+08:00');
    }
    if (isNaN(d.getTime())) return raw;
    const pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch (_) {
    return raw;
  }
}

module.exports = {
  API_BASE: API_BASE,
  CLIENT_VERSION: CLIENT_VERSION,
  callFunction: callFunction,
  createRequestId: createRequestId,
  createRequestHeaders: createRequestHeaders,
  markAuthenticationReady: markAuthenticationReady,
  beginContextActivation: beginContextActivation,
  endContextActivation: endContextActivation,
  showShortToast: showShortToast,
  getErrorText: getErrorText,
  isRequestCancelled: function(error) { return !!(error && (error.silent || error.status === 'request_cancelled')); },
  formatAuditTime: formatAuditTime
};
