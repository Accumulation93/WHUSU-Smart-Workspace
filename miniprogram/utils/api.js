const API_BASE = 'https://accumulation93.com/api';

function callFunction(options) {
  const name = options.name || '';
  const data = options.data || {};
  const success = options.success || function() {};
  const fail = options.fail || function() {};
  const complete = options.complete || function() {};

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
        success({ result: res.data });
      } else {
        fail({ errMsg: 'request:fail statusCode ' + res.statusCode });
      }
      complete();
    },
    fail: function(err) {
      console.error('[API] Request failed:', name, JSON.stringify(err));
      fail(err);
      complete();
    }
  });
}

module.exports = { callFunction };
