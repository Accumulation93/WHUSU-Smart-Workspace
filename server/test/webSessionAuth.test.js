'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'web-session-auth-test-secret-32-bytes-long';

const middlewarePath = require.resolve('../src/middleware/auth');
const ACCOUNT_ID = 'account-1';
const SESSION_ID = 'session-1';
const TOKEN_VERSION = 3;

function signToken(contextId) {
  return jwt.sign({
    kind: 'unified_access',
    sid: SESSION_ID,
    accountId: ACCOUNT_ID,
    tokenVersion: TOKEN_VERSION,
    contextId
  }, process.env.JWT_SECRET, {
    expiresIn: '1h',
    audience: 'whusu-smart-workspace-api',
    issuer: 'whusu-smart-workspace'
  });
}

function legacyToken() {
  return jwt.sign({ openid: 'openid-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function loadMiddleware(contextId) {
  delete require.cache[middlewarePath];
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../core/models/unifiedIdentity') {
      return {
        async loadSession() {
          return {
            session: {
              id: SESSION_ID,
              account_id: ACCOUNT_ID,
              person_id: 'person-1',
              token_version: TOKEN_VERSION,
              account_token_version: TOKEN_VERSION,
              name: '测试用户',
              student_id: '20260001'
            },
            context: { contextId, organizationId: 'org-1', role: 'user' }
          };
        }
      };
    }
    if (request === '../utils/logger') return { logger: { warn() {}, error() {} } };
    return originalLoad.call(this, request, parent, isMain);
  };
  const loaded = require(middlewarePath);
  Module._load = originalLoad;
  return loaded;
}

async function invoke(middleware, headers, requestPath = '/api/listHrInfo') {
  let statusCode = 200;
  let body = null;
  let nexted = false;
  const req = { path: requestPath, headers: Object.assign({}, headers), requestId: 'request-1' };
  await middleware(req, {
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return value; }
  }, () => { nexted = true; });
  return { statusCode, body, nexted, req };
}

(async () => {
  // ---------- 网页 Cookie 与小程序请求头共用同一套校验 ----------
  const current = signToken('ctx-current');
  const stale = signToken('ctx-after-switch');

  const cookieOnly = await invoke(loadMiddleware('ctx-current').authMiddleware, {
    cookie: 'wsw_web_session=' + current
  });
  assert.strictEqual(cookieOnly.nexted, true, '网页 Cookie 必须能通过认证');
  assert.strictEqual(cookieOnly.req.authTokenSource, 'cookie');
  assert.strictEqual(cookieOnly.req.authAccount.id, ACCOUNT_ID);
  assert.strictEqual(cookieOnly.req.headers['x-active-org'], 'org-1');

  const headerOnly = await invoke(loadMiddleware('ctx-current').authMiddleware, {
    authorization: 'Bearer ' + current
  });
  assert.strictEqual(headerOnly.nexted, true, '小程序请求头必须保持可用');
  assert.strictEqual(headerOnly.req.authTokenSource, 'header');

  // 请求头优先：同一浏览器同时持有两种凭据时，显式声明的那个说了算。
  const headerWins = await invoke(loadMiddleware('ctx-current').authMiddleware, {
    authorization: 'Bearer ' + current,
    cookie: 'wsw_web_session=' + legacyToken()
  });
  assert.strictEqual(headerWins.nexted, true, '有效请求头不能被无效 Cookie 拖垮');
  assert.strictEqual(headerWins.req.authTokenSource, 'header');

  const cookieCannotOverride = await invoke(loadMiddleware('ctx-current').authMiddleware, {
    authorization: 'Bearer ' + legacyToken(),
    cookie: 'wsw_web_session=' + current
  });
  assert.strictEqual(cookieCannotOverride.statusCode, 401, '无效请求头不能被有效 Cookie 顶替');
  assert.strictEqual(cookieCannotOverride.nexted, false);

  const staleCookie = await invoke(loadMiddleware('ctx-current').authMiddleware, {
    cookie: 'wsw_web_session=' + stale
  });
  assert.strictEqual(staleCookie.statusCode, 401, '切换工作角色后的旧 Cookie 必须失效');
  assert.strictEqual(staleCookie.body.status, 'auth_failed');

  const noCredential = await invoke(loadMiddleware('ctx-current').authMiddleware, {});
  assert.strictEqual(noCredential.statusCode, 401);
  assert.strictEqual(noCredential.body.status, 'auth_failed');

  const publicLogout = await invoke(loadMiddleware('ctx-current').authMiddleware, {}, '/api/auth/web/logout');
  assert.strictEqual(publicLogout.nexted, true, '退出登录必须能在凭证失效后继续清 Cookie');

  // ---------- 路由接线 ----------
  const root = path.resolve(__dirname, '..');
  const routes = fs.readFileSync(path.join(root, 'src/core/routes/unifiedAuth.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  const middlewareSource = fs.readFileSync(path.join(root, 'src/middleware/auth.js'), 'utf8');

  assert.match(routes, /req\.body\.webSession === true/, '网页登录必须由显式标记开启');
  assert.match(
    routes,
    /applyWebSessionCookie\(req, res, withTimezone, withTimezone\.expiresIn\)/,
    '网页登录必须把令牌写进 Cookie'
  );
  assert.match(routes, /router\.post\('\/auth\/web\/logout'/, '必须提供网页退出登录入口');
  assert.match(
    routes,
    /req\.authTokenSource === 'cookie'/,
    '切换工作角色时必须换发新 Cookie'
  );
  assert.match(
    routes,
    /delete rest\.token/,
    '网页模式的响应体不得返回明文令牌'
  );
  assert.match(middlewareSource, /readWebSessionToken/, '认证中间件必须能读取网页 Cookie');
  assert.ok(
    indexSource.indexOf('app.use(webSessionGuard);') < indexSource.indexOf('app.use(authMiddleware);'),
    '来源核对必须在认证之前完成'
  );
  assert.ok(
    indexSource.includes("'/api/auth/web/logout'"),
    '退出登录必须在认证前解析请求体'
  );

  console.log('网页会话令牌来源、退出登录与安全接线测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
