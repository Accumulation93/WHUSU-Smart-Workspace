const API_BASE = 'https://accumulation93.com/api';

function callFunction(options) {
  const name = options.name || '';
  const data = options.data || {};
  const success = options.success;
  const fail = options.fail;
  const complete = options.complete;

  var settled = false;
  var timer = null;

  var promise = new Promise(function(resolve, reject) {
    function settle(err, result) {
      if (settled) return;
      settled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (err) { reject(err); } else { resolve(result); }
    }

    timer = setTimeout(function() {
      // Wrap in try-catch: any synchronous throw inside a setTimeout callback
      // gets caught by WeChat's WAServiceMainContext and surfaced as "Error: timeout"
      try {
        settle({ errMsg: 'request:fail timeout', timedOut: true });
      } catch (e) {
        // Silently swallow — prevents WAServiceMainContext "Error: timeout"
      }
    }, 15000);

    wx.request({
      url: API_BASE + '/' + name,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (wx.getStorageSync('token') || '')
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
        // Ignore abort errors caused by our own timeout settlement
        if (settled) return;
        console.error('[API] Request failed:', name, JSON.stringify(err));
        settle(err);
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
  wx.showToast({ title: title, icon: icon });
}

function getErrorText(error, fallback) {
  var text = String((error && (error.errMsg || error.message)) || '').trim();
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
    var d;
    if (raw.indexOf('T') !== -1) {
      // ISO 8601 — parse as UTC, display in local
      d = new Date(raw);
    } else {
      // MySQL DATETIME — already in local time
      d = new Date(raw.replace(' ', 'T') + '+08:00');
    }
    if (isNaN(d.getTime())) return raw;
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch (_) {
    return raw;
  }
}

module.exports = { callFunction: callFunction, showShortToast: showShortToast, getErrorText: getErrorText, formatAuditTime: formatAuditTime };
