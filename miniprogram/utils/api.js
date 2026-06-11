const API_BASE = 'https://accumulation93.com/api';

function callFunction(options) {
  const name = options.name || '';
  const data = options.data || {};
  const success = options.success;
  const fail = options.fail;
  const complete = options.complete;

  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let requestTask = null;

    const timer = setTimeout(function() {
      if (!settled) {
        settled = true;
        // Abort the underlying network request so WeChat's WAServiceMainContext
        // won't later emit a framework-level "Error: timeout" after we've already
        // handled the timeout at the application layer.
        if (requestTask) requestTask.abort();
        reject({ errMsg: 'request:fail timeout', timedOut: true });
      }
    }, 15000);

    requestTask = wx.request({
      url: API_BASE + '/' + name,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (wx.getStorageSync('token') || '')
      },
      data: data,
      success: function(res) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject({ errMsg: 'request:fail statusCode ' + res.statusCode });
        }
      },
      fail: function(err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.error('[API] Request failed:', name, JSON.stringify(err));
        reject(err);
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

function showShortToast(title, icon = 'none') {
  wx.showToast({ title, icon });
}

function getErrorText(error, fallback) {
  const text = String((error && (error.errMsg || error.message)) || '').trim();
  return text || fallback;
}

module.exports = { callFunction, showShortToast, getErrorText };
