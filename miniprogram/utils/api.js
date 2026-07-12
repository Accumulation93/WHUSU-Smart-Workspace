const API_BASE = 'https://accumulation93.com/api';

function callFunction(options) {
  const name = options.name || '';
  const data = options.data || {};
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
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (wx.getStorageSync('token') || ''),
        'X-Active-Org': wx.getStorageSync('activeOrgId') || ''
      },
      data: data,
      success: function(res) {
        if (res.statusCode === 200) {
          settle(null, res.data);
        } else {
          settle({ errMsg: 'request:fail statusCode ' + res.statusCode });
        }
      },
      fail: function(err) {
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
        if (fail) fail(err);
        if (complete) complete();
      }
    );
  }

  return promise;
}

function showShortToast(title, icon) {
  if (!icon) icon = 'none';
  const t = String(title || '');
  wx.showToast({ title: t.length > 7 ? t.slice(0, 7) + '…' : t, icon: icon });
}

function getErrorText(error, fallback) {
  const text = String((error && (error.errMsg || error.message)) || '').trim();
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

module.exports = { callFunction: callFunction, showShortToast: showShortToast, getErrorText: getErrorText, formatAuditTime: formatAuditTime };
