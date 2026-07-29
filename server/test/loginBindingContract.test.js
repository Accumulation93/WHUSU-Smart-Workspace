const assert = require('assert');
const Module = require('module');

process.env.WECHAT_APPID = process.env.WECHAT_APPID || 'test-appid';
process.env.WECHAT_SECRET = process.env.WECHAT_SECRET || 'test-secret';

const mocks = {
  '../../middleware/auth': { JWT_SECRET: 'legacy-binding-disabled-test' },
  '../../middleware/orgContext': { clearOrgAccessCache() {} },
  '../../utils/orgContext': { async getCurrentOrgId() { return 'org-44'; } },
  '../models/userInfo': {},
  '../models/adminInfo': {},
  '../models/hrInfo': {},
  '../models/organization': {},
  '../models/authChallenge': {},
  '../services/adminPermissions': {},
  '../services/accessibleOrganizations': {},
  '../../config/db': {}
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require('../src/core/routes/auth');
Module._load = originalLoad;

function routeHandler(path) {
  const layer = router.stack.find((item) => item.route && item.route.path === path);
  assert(layer, `Missing route: ${path}`);
  return layer.route.stack[0].handle;
}

async function invoke(path) {
  let body;
  let statusCode = 200;
  const req = {
    openid: 'legacy-openid',
    body: {},
    headers: {},
    requestId: 'legacy-binding-disabled',
    logger: { warn() {}, error() {} }
  };
  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      body = value;
      return value;
    }
  };
  await routeHandler(path)(req, res);
  return { statusCode, body };
}

async function run() {
  const previous = process.env.ENABLE_LEGACY_IDENTITY_BINDING;
  process.env.ENABLE_LEGACY_IDENTITY_BINDING = '1';
  try {
    const user = await invoke('/bindUserInfo');
    assert.strictEqual(user.statusCode, 426);
    assert.strictEqual(user.body.status, 'client_upgrade_required');

    const admin = await invoke('/bindAdminInfo');
    assert.strictEqual(admin.statusCode, 426);
    assert.strictEqual(admin.body.status, 'client_upgrade_required');

    const unbind = await invoke('/unbindRole');
    assert.strictEqual(unbind.statusCode, 410);
    assert.strictEqual(unbind.body.status, 'recovery_required');
  } finally {
    if (previous == null) delete process.env.ENABLE_LEGACY_IDENTITY_BINDING;
    else process.env.ENABLE_LEGACY_IDENTITY_BINDING = previous;
  }

  console.log('旧姓名学号、管理员邀请码与直接解绑入口禁用契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
