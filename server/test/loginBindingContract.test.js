const assert = require('assert');
const jwt = require('jsonwebtoken');
const Module = require('module');

process.env.WECHAT_APPID = process.env.WECHAT_APPID || 'test-appid';
process.env.WECHAT_SECRET = process.env.WECHAT_SECRET || 'test-secret';

const JWT_SECRET = 'login-binding-contract-secret';
const organization = { id: 'org-44', name: '第四十四届' };

const mocks = {
  '../../middleware/auth': { JWT_SECRET },
  '../../middleware/orgContext': { clearOrgAccessCache() {} },
  '../../utils/orgContext': { async getCurrentOrgId() { return organization.id; } },
  '../models/userInfo': {
    async getByOpenidInOrg() { return null; },
    async getByOpenidGlobal() { return []; }
  },
  '../models/adminInfo': {
    async getByOpenidAcrossOrgs() { return []; }
  },
  '../models/hrInfo': {},
  '../models/organization': {
    async getAll() { return [organization]; },
    async getById(id) { return id === organization.id ? organization : null; }
  },
  '../models/authChallenge': {
    async create(type, openid, payload) {
      assert.strictEqual(type, 'user_bind');
      assert.strictEqual(openid, 'openid-new-user');
      assert.deepStrictEqual(payload, { targetOrgId: organization.id });
      return 'signed-user-binding-context';
    }
  },
  '../services/adminPermissions': { async loadEffectivePermissions() { return {}; } },
  '../services/accessibleOrganizations': { async listAvailableOrganizations() { return []; } },
  '../../config/db': {
    async query(sql) {
      if (sql.includes('FROM system_config')) {
        return [[{ current_organization: organization.id }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  }
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

async function invoke(path, openid) {
  let body;
  const req = {
    openid,
    body: {},
    headers: {},
    requestId: 'login-binding-contract-request',
    logger: { warn() {}, error() {} }
  };
  const res = {
    json(value) {
      body = value;
      return value;
    }
  };
  await routeHandler(path)(req, res);
  return body;
}

async function run() {
  const user = await invoke('/userLogin', 'openid-new-user');
  assert.strictEqual(user.status, 'need_bind');
  assert.strictEqual(user.bindingContext, 'signed-user-binding-context');
  assert.strictEqual(user.bindingOrg.id, organization.id);
  assert.strictEqual(jwt.verify(user.token, JWT_SECRET).openid, 'openid-new-user');

  const admin = await invoke('/adminLogin', 'openid-new-admin');
  assert.strictEqual(admin.status, 'need_bind');
  assert.strictEqual(jwt.verify(admin.token, JWT_SECRET).openid, 'openid-new-admin');

  console.log('服务端登录绑定凭证契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
