'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.JWT_SECRET = 'public-route-bypass-test-secret-32-bytes';
// 数据库配置只在模块加载时校验存在性，本测试不会真正建立连接。
process.env.DB_USER = process.env.DB_USER || 'public-route-bypass-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'public-route-bypass-test';

const root = path.resolve(__dirname, '..');

/**
 * 免认证入口必须在组织上下文中间件里同样放行。
 *
 * 生产事故：网页退出登录接口加进了认证免检清单，却漏了组织上下文清单，
 * 结果带着失效凭证退出时被拦成 401，浏览器里的 Cookie 永远清不掉。
 * 本测试同时检查两份清单的包含关系、实际中间件行为与接线顺序。
 */

const { PUBLIC_PATHS, authMiddleware } = require('../src/middleware/auth');
const { ORG_CONTEXT_BYPASS_PATHS, orgContextMiddleware } = require('../src/middleware/orgContext');

const indexSource = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
// 这两个入口在认证之前就已注册，请求不会走到后面的中间件，因此不需要出现在绕过清单里。
const EARLY_REGISTERED_PATHS = new Set(['/api/ping', '/api/health']);

assert.ok(
  PUBLIC_PATHS.has('/api/auth/web/logout'),
  '网页退出登录必须在认证免检清单里'
);
assert.ok(
  ORG_CONTEXT_BYPASS_PATHS.has('/api/auth/web/logout'),
  '网页退出登录必须在组织上下文免检清单里'
);

for (const publicPath of PUBLIC_PATHS) {
  if (EARLY_REGISTERED_PATHS.has(publicPath)) continue;
  assert.ok(
    ORG_CONTEXT_BYPASS_PATHS.has(publicPath),
    '免认证入口必须同时免组织上下文：' + publicPath
  );
}

for (const earlyPath of EARLY_REGISTERED_PATHS) {
  assert.ok(
    indexSource.indexOf("app.get('" + earlyPath + "'") < indexSource.indexOf('app.use(authMiddleware);'),
    earlyPath + ' 必须在认证之前注册，否则要把它并入组织上下文绕过清单'
  );
}

function responseStub() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return value; },
    setHeader() {},
    end() {}
  };
}

async function runChain(requestPath, method) {
  const req = {
    path: requestPath,
    method: method || 'POST',
    headers: {},
    body: {},
    requestId: 'request-1',
    ip: '127.0.0.1',
    logger: { warn() {}, error() {} }
  };
  const res = responseStub();
  const stages = [];
  await authMiddleware(req, res, () => { stages.push('auth'); });
  if (stages.length === 0) return { stages, statusCode: res.statusCode, body: res.body };
  await orgContextMiddleware(req, res, () => { stages.push('orgContext'); });
  return { stages, statusCode: res.statusCode, body: res.body };
}

(async () => {
  const logout = await runChain('/api/auth/web/logout');
  assert.deepStrictEqual(
    logout.stages,
    ['auth', 'orgContext'],
    '退出登录必须能穿过认证与组织上下文两层中间件'
  );

  const login = await runChain('/api/auth/password/session');
  assert.deepStrictEqual(login.stages, ['auth', 'orgContext'], '口令登录同样必须放行');

  const protectedPath = await runChain('/api/listHrInfo');
  assert.strictEqual(protectedPath.stages.length, 0, '没有会话的业务请求必须在认证层被拒绝');
  assert.strictEqual(protectedPath.statusCode, 401);

  // 接线顺序：来源核对与认证必须在组织上下文之前，退出登录路由必须挂在业务路由之后统一生效。
  assert.ok(
    indexSource.indexOf('app.use(webSessionGuard);') < indexSource.indexOf('app.use(authMiddleware);'),
    '来源核对必须早于认证'
  );
  assert.ok(
    indexSource.indexOf('app.use(authMiddleware);') < indexSource.indexOf('app.use(orgContextMiddleware);'),
    '认证必须早于组织上下文'
  );

  console.log('免认证入口的组织上下文放行、中间件行为与接线顺序测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
