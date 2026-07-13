// Shared API wrapper — provides callCloud() to all behaviors via this.callCloud()
// Must be registered FIRST in the behaviors array
const { callFunction } = require('../../../../../utils/api');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    callCloud(name, data = {}) {
      const organizationSnapshot = orgSession.getSnapshot();
      return new Promise((resolve, reject) => {
        callFunction({
          name,
          data,
          success: function (res) {
            // 组织切换后丢弃旧上下文响应，避免任一 Behavior 回写上一组织数据。
            if (!orgSession.isCurrent(organizationSnapshot)) return;
            const result = res.result || {};
            // 诊断：捕获后端返回的异常错误消息
            if (result.status === 'error' && result.message) {
              console.error('[callCloud] API error:', name, 'message:', result.message);
            }
            resolve(result);
          },
          fail: function (err) {
            if (!orgSession.isCurrent(organizationSnapshot)) return;
            console.error('[callCloud] Request failed:', name, JSON.stringify(err));
            reject(err);
          }
        });
      });
    }
  }
});
