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
 *
 * 单次探测带整体超时（包含 wx.login 与请求两段），并且可以延迟起跑：
 * 小程序启动瞬间微信登录桥、存储桥与网络都可能还没就绪，太早发请求会白白超时。
 */
const { callFunction } = require('./api');

// 首次探测默认延后 600ms，单次最多等 4 秒；重试由调用方（门户）决定节奏。
const DEFAULT_DELAY_MS = 600;
const DEFAULT_TIMEOUT_MS = 4000;

function probeStartupSession(options) {
  const settings = options || {};
  const delayMs = Number.isFinite(Number(settings.delayMs)) && Number(settings.delayMs) > 0
    ? Number(settings.delayMs)
    : DEFAULT_DELAY_MS;
  const timeoutMs = Number.isFinite(Number(settings.timeoutMs)) && Number(settings.timeoutMs) > 0
    ? Number(settings.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || typeof wx.login !== 'function') {
      resolve({ state: 'unavailable' });
      return;
    }
    let settled = false;
    let timer = null;
    const finish = function (payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      timer = null;
      resolve(payload);
    };

    const attempt = function () {
      if (settled) return;
      // 整体超时覆盖 wx.login 与请求两段，避免某一段卡住时用户一直等。
      timer = setTimeout(function () {
        settled = true;
        finish({ state: 'unavailable' });
      }, timeoutMs);
      wx.login({
        success: function (loginResult) {
          const code = String((loginResult && loginResult.code) || '');
          if (!code) {
            finish({ state: 'unavailable' });
            return;
          }
          // 走统一请求客户端：登录属于会话入口，客户端在没有会话时也允许调用。
          callFunction({ name: 'auth/wechat/session', data: { code: code }, timeout: timeoutMs })
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
    };

    if (delayMs > 0) {
      timer = setTimeout(function () {
        timer = null;
        attempt();
      }, delayMs);
    } else {
      attempt();
    }
  });
}

module.exports = { probeStartupSession };
