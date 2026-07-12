// Shared API wrapper — provides callCloud() to all behaviors via this.callCloud()
// Must be registered FIRST in the behaviors array
const { callFunction } = require('../../../../../utils/api');

module.exports = Behavior({
  methods: {
    callCloud(name, data = {}) {
      return new Promise((resolve, reject) => {
        callFunction({
          name,
          data,
          success: function (res) {
            const result = res.result || {};
            // 诊断：捕获后端返回的异常错误消息
            if (result.status === 'error' && result.message) {
              console.error('[callCloud] API error:', name, 'message:', result.message);
            }
            resolve(result);
          },
          fail: function (err) {
            console.error('[callCloud] Request failed:', name, JSON.stringify(err));
            reject(err);
          }
        });
      });
    }
  }
});
