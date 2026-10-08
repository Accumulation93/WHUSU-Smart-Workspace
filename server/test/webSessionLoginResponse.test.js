'use strict';

const assert = require('assert');
const Module = require('module');

process.env.JWT_SECRET = 'web-session-login-response-test-secret-32b';
process.env.DB_USER = process.env.DB_USER || 'web-session-login-response-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'web-session-login-response-test';

/**
 * 网页登录成功时的响应契约。
 *
 * 网页模式必须把令牌写进 HttpOnly Cookie 并从响应体里移除明文令牌；
 * 小程序请求不带网页标记，响应必须保持原样（照旧返回令牌，且不下发 Cookie）。
 */

const account = {
  id: 'account-1',
  person_id: 'person-1',
  name: '测试用户',
  student_id: '20260001',
  status: 'verified',
  openid_hash: 'existing-binding-hash'
};

class IdentityError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const identityModel = {
  IdentityError,
  async authenticateWithPassphrase(studentId, passphrase) {
    if (studentId !== account.student_id || passphrase !== 'correct-passphrase-value') {
      throw new IdentityError('login_failed', '登录信息不正确', 401);
    }
    return account;
  },
  temporaryPasswordSessionOptions() {
    return {};
  },
  async appendAuditEvent() {
    return true;
  }
};

const mocks = {
  '../../config/db': {
    async withTransaction(callback) { return callback({ query: async () => [[]] }); },
    query: async () => [[]]
  },
  '../models/unifiedIdentity': identityModel,
  '../models/sessionDevice': {},
  '../models/systemConfig': { async get() { return { timezone: 8, timezone_config_version: 1 }; } },
  '../services/unifiedAuth': {
    async createAuthenticatedSession() {
      return { status: 'login_success', token: 'signed.jwt.value', expiresIn: 604800 };
    }
  },
  '../services/adminPermissions': { scopeAccountSessions(items) { return items; } },
  '../../middleware/auth': {
    resolveUnifiedSession: async () => null,
    readRequestToken: () => ({ token: '', source: '' })
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require('../src/core/routes/unifiedAuth');
Module._load = originalLoad;

const handle = router.stack.find((layer) => layer.route && layer.route.path === '/auth/password/session')
  .route.stack[0].handle;

async function invoke(body, secure) {
  let payload = null;
  let statusCode = 200;
  const headers = {};
  const req = {
    body,
    secure: secure === true,
    headers: {},
    requestId: 'request-1',
    ip: '127.0.0.1',
    logger: { warn() {}, error() {} }
  };
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(value) { statusCode = value; return this; },
    json(value) { payload = value; return value; }
  };
  await handle(req, res);
  return { payload, statusCode, headers };
}

(async () => {
  const credentials = { studentId: account.student_id, passphrase: 'correct-passphrase-value' };

  const web = await invoke(Object.assign({ webSession: true }, credentials), true);
  assert.strictEqual(web.statusCode, 200);
  assert.strictEqual(web.payload.status, 'login_success');
  assert.strictEqual(web.payload.token, undefined, '网页模式不得在响应体里返回明文令牌');
  assert.strictEqual(web.payload.webSession, true);
  assert.strictEqual(web.payload.expiresIn, 604800);
  assert.strictEqual(web.payload.systemTimezoneOffset, 8, '网页响应同样要带时区配置');

  const setCookie = web.headers['set-cookie'] || '';
  assert.ok(setCookie.startsWith('wsw_web_session=signed.jwt.value'), '网页模式必须下发登录凭证');
  assert.ok(setCookie.includes('HttpOnly'), '凭证必须是脚本不可读的');
  assert.ok(setCookie.includes('SameSite=Lax'), '凭证必须限制跨站携带');
  assert.ok(setCookie.includes('Path=/'), '凭证必须覆盖站点全部路径');
  assert.ok(setCookie.includes('Max-Age=604800'), '凭证存活时间必须与服务端会话一致');
  assert.ok(setCookie.includes('Secure'), 'HTTPS 请求必须带 Secure');

  const webInsecure = await invoke(Object.assign({ webSession: true }, credentials), false);
  assert.ok(
    !(webInsecure.headers['set-cookie'] || '').includes('Secure'),
    '本地 http 调试不加 Secure'
  );

  const miniProgram = await invoke(Object.assign({}, credentials), true);
  assert.strictEqual(miniProgram.statusCode, 200);
  assert.strictEqual(
    miniProgram.payload.token,
    'signed.jwt.value',
    '小程序请求必须照旧拿到令牌'
  );
  assert.strictEqual(miniProgram.payload.webSession, undefined, '小程序响应不得出现网页模式标记');
  assert.strictEqual(miniProgram.headers['set-cookie'], undefined, '小程序请求不得下发网页凭证');

  const rejected = await invoke({
    studentId: account.student_id,
    passphrase: 'wrong-passphrase-value',
    webSession: true
  }, true);
  assert.strictEqual(rejected.statusCode, 401, '口令不正确必须拒绝');
  assert.strictEqual(rejected.headers['set-cookie'], undefined, '登录失败不得下发凭证');

  console.log('网页登录成功签发 Cookie、小程序响应不变与失败不下发凭证测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
