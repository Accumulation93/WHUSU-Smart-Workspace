const assert = require('assert');
const Module = require('module');

let queryCount = 0;
let scenario = { userAllowed: false, adminAllowed: false, superAllowed: false };
const pool = {
  async query(sql) {
    queryCount += 1;
    if (sql.includes("admin_level = 'super_admin'")) return [scenario.superAllowed ? [{ ok: 1 }] : []];
    if (sql.includes('FROM admin_info')) return [scenario.adminAllowed ? [{ ok: 1 }] : []];
    if (sql.includes('FROM user_info')) return [scenario.userAllowed ? [{ ok: 1 }] : []];
    throw new Error('未预期的 SQL：' + sql);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../config/db') return pool;
  if (request === '../utils/orgContext') {
    return { orgStorage: { run(value, callback) { callback(); } } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { orgContextMiddleware } = require('../src/middleware/orgContext');
Module._load = originalLoad;

async function invoke({ path = '/api/getDepartments', openid = 'openid-user', orgId = '', role = 'user' } = {}) {
  let body;
  let statusCode = 200;
  let nextCalled = false;
  const req = {
    path,
    openid,
    headers: { 'x-active-org': orgId, 'x-role': role },
    requestId: 'request-security-test'
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return value; }
  };
  await orgContextMiddleware(req, res, () => { nextCalled = true; });
  return { body, statusCode, nextCalled };
}

async function run() {
  let result = await invoke();
  assert.strictEqual(result.statusCode, 400);
  assert.strictEqual(result.body.status, 'org_context_required');

  result = await invoke({ orgId: 'org-44', openid: '' });
  assert.strictEqual(result.statusCode, 401);
  assert.strictEqual(result.body.status, 'auth_failed');

  result = await invoke({ path: '/api/bindUserInfo', openid: 'openid-new' });
  assert.strictEqual(result.nextCalled, true, '安全绑定入口应允许没有组织头');

  result = await invoke({ path: '/api/auth/password/session', openid: '', orgId: 'stale-org' });
  assert.strictEqual(result.nextCalled, true, '口令登录应绕过组织上下文，不能返回请先登录');

  result = await invoke({ path: '/api/auth/claims/redeem', openid: '', orgId: '' });
  assert.strictEqual(result.nextCalled, true, '初始化认证码认领应绕过组织上下文');

  scenario.userAllowed = true;
  queryCount = 0;
  result = await invoke({ orgId: 'org-44' });
  assert.strictEqual(result.nextCalled, true);
  result = await invoke({ orgId: 'org-44' });
  assert.strictEqual(result.nextCalled, true);
  assert.strictEqual(queryCount, 2, '组织访问权必须逐请求读取数据库，不能使用进程缓存');

  scenario = { userAllowed: false, adminAllowed: false, superAllowed: false };
  result = await invoke({ path: '/api/admin/listAdmins', orgId: 'org-44', role: 'admin' });
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.body.status, 'org_access_denied');

  scenario.superAllowed = true;
  result = await invoke({ path: '/api/admin/listAdmins', orgId: 'org-44', role: 'admin' });
  assert.strictEqual(result.nextCalled, true);

  console.log('组织上下文安全测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
