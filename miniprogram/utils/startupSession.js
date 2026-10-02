'use strict';

/**
 * 启动时的微信会话探测。
 *
 * 小程序默认落地门户页，所以门户在“本地没有任何会话”时要先问一次微信：
 *   - 该微信已绑定账号 → 直接建立会话，用户不用再点一次登录；
 *   - 该微信尚未绑定任何账号（服务端返回 need_claim）→ 去登录页完成绑定或认领；
 *   - 账号被冻结 → 去登录页；其他失败（网络不可用等）→ 视为“未知”，留在门户并提供重试。
 *
 * 只在启动这一次调用；业务请求发现登录失效时仍然回到登录页让用户明确认证，不在这里自动重放。
 */
const { callFunction } = require('./api');

const PROBE_TIMEOUT_MS = 15000;

function probeStartupSession() {
  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || typeof wx.login !== 'function') {
      resolve({ state: 'unavailable' });
      return;
    }
    let settled = false;
    let timer = setTimeout(function () {
      settled = true;
      resolve({ state: 'unavailable' });
    }, PROBE_TIMEOUT_MS + 1000);
    const finish = function (payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      timer = null;
      resolve(payload);
    };

    wx.login({
      success: function (loginResult) {
        const code = String((loginResult && loginResult.code) || '');
        if (!code) {
          finish({ state: 'unavailable' });
          return;
        }
        // 走统一请求客户端：登录属于会话入口，客户端在没有会话时也允许调用。
        callFunction({ name: 'auth/wechat/session', data: { code: code }, timeout: PROBE_TIMEOUT_MS })
          .then(function (result) {
            if (result && result.status === 'login_success') {
              finish({ state: 'authenticated', result: result });
              return;
            }
            if (result && result.status === 'need_claim') {
              finish({ state: 'unbound', result: result });
              return;
            }
            finish({ state: 'unavailable' });
          })
          .catch(function (error) {
            finish({ state: error && error.status === 'account_frozen' ? 'frozen' : 'unavailable' });
          });
      },
      fail: function () {
        finish({ state: 'unavailable' });
      }
    });
  });
}

module.exports = { probeStartupSession };
