const assert = require('assert');
const Module = require('module');

let injectedOrgId = '';
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../utils/orgContext') {
    return {
      orgStorage: {
        run(value, callback) {
          injectedOrgId = value;
          callback();
        }
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { orgContextMiddleware } = require('../src/middleware/orgContext');
Module._load = originalLoad;

async function invoke({
  path = '/api/getDepartments',
  authContext = null,
  orgId = 'forged-org',
  role = 'admin'
} = {}) {
  let body;
  let statusCode = 200;
  let nextCalled = false;
  injectedOrgId = '';
  const req = {
    path,
    authContext,
    headers: { 'x-active-org': orgId, 'x-role': role },
    requestId: 'request-security-test'
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return value; }
  };
  await orgContextMiddleware(req, res, () => { nextCalled = true; });
  return { body, statusCode, nextCalled, injectedOrgId, headers: req.headers };
}

async function run() {
  let result = await invoke();
  assert.strictEqual(result.statusCode, 401);
  assert.strictEqual(result.body.status, 'auth_failed');

  result = await invoke({ path: '/api/bindUserInfo' });
  assert.strictEqual(result.nextCalled, true, '安全绑定入口应绕过组织上下文');

  result = await invoke({ path: '/api/auth/password/session' });
  assert.strictEqual(result.nextCalled, true, '口令登录应绕过组织上下文');

  result = await invoke({ path: '/api/auth/claims/redeem' });
  assert.strictEqual(result.nextCalled, true, '初始化认证码认领应绕过组织上下文');

  result = await invoke({
    authContext: {
      contextId: 'assignment:assignment-1:org-44',
      organizationId: 'org-44',
      role: 'user'
    }
  });
  assert.strictEqual(result.nextCalled, true);
  assert.strictEqual(result.injectedOrgId, 'org-44');
  assert.strictEqual(result.headers['x-active-org'], 'org-44', '客户端组织头必须被服务端上下文覆盖');
  assert.strictEqual(result.headers['x-role'], 'user', '客户端角色头必须被服务端上下文覆盖');

  console.log('组织上下文安全测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
