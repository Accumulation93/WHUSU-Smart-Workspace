'use strict';

const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const warnings = [];
Module._load = function(request, parent, isMain) {
  if (request === '../utils/logger') {
    return { logger: { warn(...args) { warnings.push(args); }, error() {} } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const cookie = require('../src/core/services/webSessionCookie');
const { webSessionGuard } = require('../src/middleware/webSessionGuard');
const { minimumVersionFor, clientVersionMiddleware } = require('../src/middleware/clientVersion');
Module._load = originalLoad;

function requestWith(headers, method = 'POST') {
  const lower = {};
  Object.keys(headers || {}).forEach((key) => { lower[key.toLowerCase()] = headers[key]; });
  return {
    method,
    path: '/api/auth/contexts/activate',
    headers: lower,
    ip: '127.0.0.1',
    get(name) { return lower[String(name || '').toLowerCase()] || ''; }
  };
}

function invokeGuard(req) {
  let statusCode = 200;
  let body = null;
  let nexted = false;
  webSessionGuard(req, {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return value; }
  }, () => { nexted = true; });
  return { statusCode, body, nexted };
}

function invokeVersion(req) {
  let statusCode = 200;
  let body = null;
  let nexted = false;
  clientVersionMiddleware(req, {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return value; }
  }, () => { nexted = true; });
  return { statusCode, body, nexted };
}

// ---------- Cookie 读写 ----------
assert.strictEqual(
  cookie.readWebSessionToken({ headers: { cookie: 'other=1; wsw_web_session=abc.def; tail=2' } }),
  'abc.def'
);
assert.strictEqual(cookie.readWebSessionToken({ headers: { cookie: 'wsw_web_session="quoted.value"' } }), 'quoted.value');
assert.strictEqual(cookie.readWebSessionToken({ headers: {} }), '');
assert.strictEqual(cookie.readWebSessionToken({}), '');
assert.strictEqual(cookie.hasWebSessionCookie(requestWith({ cookie: 'wsw_web_session=x' })), true);
assert.strictEqual(cookie.hasWebSessionCookie(requestWith({})), false);

const hardened = cookie.buildWebSessionSetCookie('tok.value', 600, true);
assert.ok(hardened.startsWith('wsw_web_session=tok.value'), 'Cookie 名必须固定');
assert.ok(hardened.includes('HttpOnly'), '网页凭证必须禁止脚本读取');
assert.ok(hardened.includes('SameSite=Lax'), '网页凭证必须限制跨站携带');
assert.ok(hardened.includes('Path=/'), '网页凭证必须覆盖站点全部路径');
assert.ok(hardened.includes('Max-Age=600'), '网页凭证必须与登录有效期一致');
assert.ok(hardened.includes('Secure'), 'HTTPS 请求必须带 Secure');
assert.ok(!cookie.buildWebSessionSetCookie('tok', 600, false).includes('Secure'), '本地 http 调试不加 Secure');
const cleared = cookie.buildClearedWebSessionCookie(true);
assert.ok(cleared.includes('Max-Age=0'), '退出登录必须让浏览器立刻丢弃凭证');
assert.ok(cleared.startsWith('wsw_web_session=;'), '退出登录必须清空凭证值');

assert.strictEqual(cookie.isSecureRequest({ secure: true }), true);
assert.strictEqual(cookie.isSecureRequest({ secure: false, headers: { 'x-forwarded-proto': 'https' } }), true);
assert.strictEqual(cookie.isSecureRequest({ secure: false, headers: { 'x-forwarded-proto': 'http' } }), false);
assert.strictEqual(cookie.isSecureRequest({}), false);

// ---------- 网页来源核对 ----------
const webOrigin = 'https://accumulation93.com';
const withCookie = { cookie: 'wsw_web_session=tok' };

const allowedOrigin = invokeGuard(requestWith(Object.assign({ origin: webOrigin }, withCookie)));
assert.strictEqual(allowedOrigin.nexted, true, '受信任来源必须放行');

const foreignOrigin = invokeGuard(requestWith(Object.assign({ origin: 'https://evil.example' }, withCookie)));
assert.strictEqual(foreignOrigin.statusCode, 403, '外来来源必须拒绝');
assert.strictEqual(foreignOrigin.body.status, 'origin_not_allowed');
assert.strictEqual(foreignOrigin.nexted, false);

const missingOrigin = invokeGuard(requestWith(withCookie));
assert.strictEqual(missingOrigin.statusCode, 403, '缺少来源信息必须拒绝');

const refererOnly = invokeGuard(requestWith(Object.assign(
  { referer: 'https://accumulation93.com/web/login' },
  withCookie
)));
assert.strictEqual(refererOnly.nexted, true, '只有 Referer 的旧浏览器按同源放行');

// 小程序不携带网页 Cookie，链路不受来源核对影响。
const miniProgram = invokeGuard(requestWith({ origin: 'https://evil.example' }));
assert.strictEqual(miniProgram.nexted, true, '没有网页凭证的请求不参与来源核对');

const safeMethod = invokeGuard(requestWith(Object.assign({ origin: 'https://evil.example' }, withCookie), 'GET'));
assert.strictEqual(safeMethod.nexted, true, '读取类请求不改变状态，不受来源核对限制');

process.env.WEB_ORIGIN = 'https://staging.example';
assert.strictEqual(invokeGuard(requestWith(Object.assign({ origin: webOrigin }, withCookie))).statusCode, 403);
assert.strictEqual(invokeGuard(requestWith(Object.assign({ origin: 'https://staging.example' }, withCookie))).nexted, true);
delete process.env.WEB_ORIGIN;

// ---------- 版本底线按客户端类型分流 ----------
const previousMini = process.env.MIN_CLIENT_VERSION;
const previousWeb = process.env.MIN_WEB_CLIENT_VERSION;
process.env.MIN_CLIENT_VERSION = '1.2.0';
delete process.env.MIN_WEB_CLIENT_VERSION;

assert.strictEqual(
  minimumVersionFor(requestWith({ 'x-client-type': 'web' })),
  '1.0.0',
  '网页未配置底线时回落到 1.0.0'
);
assert.strictEqual(
  minimumVersionFor(requestWith({})),
  '1.2.0',
  '小程序继续使用原有的最低版本'
);

const oldMini = invokeVersion({
  path: '/api/listHrInfo',
  get(name) { return name === 'X-Client-Version' ? '1.1.9' : ''; }
});
assert.strictEqual(oldMini.statusCode, 426);

const freshWeb = invokeVersion({
  path: '/api/listHrInfo',
  get(name) {
    if (name === 'X-Client-Type') return 'web';
    if (name === 'X-Client-Version') return '1.0.0';
    return '';
  }
});
assert.strictEqual(freshWeb.nexted, true, '网页版本不受小程序底线影响');

const staleWeb = invokeVersion({
  path: '/api/listHrInfo',
  get(name) {
    if (name === 'X-Client-Type') return 'web';
    if (name === 'X-Client-Version') return '0.9.0';
    return '';
  }
});
assert.strictEqual(staleWeb.statusCode, 426, '网页低于自己的底线同样拦下');

process.env.MIN_WEB_CLIENT_VERSION = '2.0.0';
const raisedWebFloor = invokeVersion({
  path: '/api/listHrInfo',
  get(name) {
    if (name === 'X-Client-Type') return 'web';
    if (name === 'X-Client-Version') return '1.9.0';
    return '';
  }
});
assert.strictEqual(raisedWebFloor.statusCode, 426, '网页底线可以按发布节奏提高');

if (previousMini === undefined) delete process.env.MIN_CLIENT_VERSION;
else process.env.MIN_CLIENT_VERSION = previousMini;
if (previousWeb === undefined) delete process.env.MIN_WEB_CLIENT_VERSION;
else process.env.MIN_WEB_CLIENT_VERSION = previousWeb;

assert.ok(warnings.length >= 3, '被拒绝的网页请求必须留下日志');
console.log('网页会话 Cookie、来源核对与分客户端版本底线测试通过');
