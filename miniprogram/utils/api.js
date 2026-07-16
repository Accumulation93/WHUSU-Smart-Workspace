const API_BASE = 'https://accumulation93.com/api';
const CLIENT_VERSION = '1.2.0-security';
const orgSession = require('./orgSession');
const IDEMPOTENT_WRITE_APIS = {
  submitScoreRecord: true,
  startAuditSubmission: true,
  startAdHocAudit: true,
  createVenueBooking: true,
  createAdminVenueBooking: true
};

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
    message: '组织已切换，请求已取消',
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
    title: '请选择组织',
    content: result.message || '当前会话缺少组织上下文，请重新选择组织。',
    showCancel: false,
    confirmText: '去选择',
    complete: function() {
      orgPromptVisible = false;
      wx.navigateTo({
        url: '/subpackages/org/pages/switch/switch',
        fail: function() { wx.reLaunch({ url: '/pages/portal/portal' }); }
      });
    }
  });
}

function callFunction(options) {
  const name = options.name || '';
  const data = Object.assign({}, options.data || {});
  const success = options.success;
  const fail = options.fail;
  const complete = options.complete;

  if (!/^[A-Za-z][A-Za-z0-9_\/]*$/.test(name)) {
    const invalidNameError = { errMsg: 'request:fail invalid api name' };
    if (fail) fail(invalidNameError);
    if (complete) complete();
    const rejected = Promise.reject(invalidNameError);
    if (success || fail || complete) rejected.catch(function() {});
    return rejected;
  }

  let settled = false;
  const organizationSnapshot = orgSession.getSnapshot();
  const requestId = createRequestId();
  if (IDEMPOTENT_WRITE_APIS[name] && !data.clientRequestId) data.clientRequestId = requestId;
  const promise = new Promise(function(resolve, reject) {
    function settle(err, result) {
      if (settled) return;
      settled = true;
      if (err) { reject(err); } else { resolve(result); }
    }

    wx.request({
      url: API_BASE + '/' + name,
      method: 'POST',
      timeout: 15000,
      header: createRequestHeaders(requestId),
      data: data,
      success: function(res) {
        if (!orgSession.isCurrent(organizationSnapshot)) {
          settle(cancelledError(requestId));
          return;
        }
        if (res.statusCode === 200) {
          notifyUpgrade(res.data);
          notifyOrgContextRequired(res.data);
          settle(null, res.data);
        } else {
          const responseData = res.data || {};
          notifyUpgrade(responseData);
          notifyOrgContextRequired(responseData);
          const responseError = {
            errMsg: 'request:fail statusCode ' + res.statusCode,
            message: responseData.message || '',
            status: responseData.status || '',
            statusCode: res.statusCode,
            data: responseData,
            requestId: (res.header && (res.header['X-Request-Id'] || res.header['x-request-id'])) || ''
          };
          if (responseData.status === 'org_context_required') responseError.silent = true;
          settle(responseError);
        }
      },
      fail: function(err) {
        if (!orgSession.isCurrent(organizationSnapshot)) {
          settle(cancelledError(requestId));
          return;
        }
        console.error('[API] Request failed:', name, JSON.stringify(err));
        const requestError = err || { errMsg: 'request:fail unknown' };
        if (/timeout/i.test(requestError.errMsg || '')) requestError.timedOut = true;
        settle(requestError);
      }
    });
  });

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
  wx.showToast({ title: t.length > 7 ? t.slice(0, 7) + '…' : t, icon: icon });
}

function getErrorText(error, fallback) {
  if (error && (error.silent || error.status === 'request_cancelled')) return '';
  const text = String((error && (error.message || error.errMsg)) || '').trim();
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
  showShortToast: showShortToast,
  getErrorText: getErrorText,
  isRequestCancelled: function(error) { return !!(error && (error.silent || error.status === 'request_cancelled')); },
  formatAuditTime: formatAuditTime
};
