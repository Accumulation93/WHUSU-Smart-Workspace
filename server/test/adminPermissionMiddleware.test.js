const assert = require('assert');
const Module = require('module');

let activeAdmin = null;
let effective = null;
const mocks = {
  '../core/models/adminInfo': {
    async getByOpenid() { return activeAdmin; }
  },
  '../utils/orgContext': {
    async getCurrentOrgId() { return 'org-44'; }
  },
  '../core/services/adminPermissions': {
    ROUTE_RULES: new Map([
      ['/saveScoreActivity', { anyOf: ['scoring.activities'] }]
    ]),
    async loadEffectivePermissions() { return effective; },
    hasAnyPermission(value, keys) {
      return Boolean(value && (value.isRoot || keys.some((key) => value.permissions[key])));
    }
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const { adminPermissionMiddleware } = require('../src/middleware/adminPermission');
Module._load = originalLoad;

async function invoke(path, role) {
  let payload = null;
  let nextCalled = false;
  const req = {
    path,
    openid: 'openid-test',
    get(name) { return name === 'X-Role' ? role : ''; },
    logger: { error() {} }
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  await adminPermissionMiddleware(req, res, () => { nextCalled = true; });
  return { payload, nextCalled, statusCode: res.statusCode };
}

(async () => {
  activeAdmin = { id: 'admin-1', admin_level: 'admin', org_id: 'org-44' };
  effective = { isRoot: false, permissions: { 'scoring.activities': false } };
  const denied = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(denied.nextCalled, false);
  assert.strictEqual(denied.statusCode, 403);
  assert.strictEqual(denied.payload.status, 'permission_denied');

  effective = { isRoot: false, permissions: { 'scoring.activities': true } };
  const allowed = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(allowed.nextCalled, true);

  effective = { isRoot: true, permissions: {} };
  const rootAllowed = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(rootAllowed.nextCalled, true);

  effective = { isRoot: false, permissions: {} };
  const userBypass = await invoke('/api/saveScoreActivity', 'user');
  assert.strictEqual(userBypass.nextCalled, true);
  const unknownBypass = await invoke('/api/notMapped', 'admin');
  assert.strictEqual(unknownBypass.nextCalled, true);

  activeAdmin = null;
  const invalidAdmin = await invoke('/api/saveScoreActivity', 'admin');
  assert.strictEqual(invalidAdmin.statusCode, 403);
  assert.strictEqual(invalidAdmin.payload.status, 'forbidden');
  console.log('管理员权限中间件路由与拒绝测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
