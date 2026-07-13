const assert = require('assert');
const Module = require('module');

process.env.WECHAT_APPID = process.env.WECHAT_APPID || 'test-appid';
process.env.WECHAT_SECRET = process.env.WECHAT_SECRET || 'test-secret';

let scenario = {};
let cacheClears = [];

const pool = {
  async query(sql) {
    throw new Error('activateOrganization 不应直接执行 SQL：' + sql);
  }
};

const mocks = {
  '../../middleware/auth': { JWT_SECRET: 'test-jwt-secret' },
  '../../middleware/orgContext': {
    clearOrgAccessCache(openid, orgId, role) {
      cacheClears.push({ openid, orgId, role });
    }
  },
  '../../utils/orgContext': {
    async getCurrentOrgId() {
      return 'org-42';
    }
  },
  '../models/userInfo': {},
  '../models/adminInfo': {
    async getByOpenidAcrossOrgs() {
      return scenario.adminRecords || [];
    }
  },
  '../models/hrInfo': {},
  '../models/organization': {
    async getById(id) {
      return (scenario.organizations || []).find((item) => item.id === id) || null;
    },
    async getAll() {
      return scenario.organizations || [];
    }
  },
  '../../config/db': pool
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};

const router = require('../src/core/routes/auth');
Module._load = originalLoad;

const routeLayer = router.stack.find((layer) => {
  return layer.route && layer.route.path === '/activateOrganization';
});
assert(routeLayer, '缺少 activateOrganization 路由');
const handler = routeLayer.route.stack[0].handle;

async function invoke({ openid = '', organizationId = '', role = 'admin' } = {}) {
  let payload;
  const req = {
    openid,
    body: { organizationId, role },
    headers: { 'x-role': role },
    requestId: 'test-request-id',
    logger: { error() {} }
  };
  const res = {
    json(value) {
      payload = value;
      return value;
    }
  };
  await handler(req, res);
  return payload;
}

async function run() {
  scenario = {
    organizations: [
      { id: 'org-42', name: '武汉大学第四十二届学生会' },
      { id: 'org-43', name: '武汉大学第四十三届学生会' }
    ],
    adminRecords: [
      {
        id: 'root-chen',
        openid: 'openid-chen',
        name: '陈逸凡',
        student_id: '2023302181034',
        admin_level: 'root_admin',
        bind_status: 'active',
        org_id: ''
      }
    ]
  };
  cacheClears = [];

  const rootResult = await invoke({
    openid: 'openid-chen',
    organizationId: 'org-43',
    role: 'admin'
  });
  assert.strictEqual(rootResult.status, 'success');
  assert.deepStrictEqual(rootResult.activeOrg, {
    id: 'org-43',
    name: '武汉大学第四十三届学生会'
  });
  assert.strictEqual(rootResult.user.adminLevel, 'root_admin');
  assert.deepStrictEqual(cacheClears, [
    { openid: 'openid-chen', orgId: 'org-43', role: 'admin' }
  ]);

  scenario.adminRecords = [{
    id: 'admin-42',
    openid: 'openid-admin',
    name: '第四十二届管理员',
    student_id: 'admin-42',
    admin_level: 'super_admin',
    bind_status: 'active',
    org_id: 'org-42'
  }];
  const deniedResult = await invoke({
    openid: 'openid-admin',
    organizationId: 'org-43',
    role: 'admin'
  });
  assert.strictEqual(deniedResult.status, 'org_access_denied');

  const allowedResult = await invoke({
    openid: 'openid-admin',
    organizationId: 'org-42',
    role: 'admin'
  });
  assert.strictEqual(allowedResult.status, 'success');

  const missingAuthResult = await invoke({ organizationId: 'org-43', role: 'admin' });
  assert.strictEqual(missingAuthResult.status, 'auth_failed');

  const missingOrgResult = await invoke({
    openid: 'openid-chen',
    organizationId: 'missing-org',
    role: 'admin'
  });
  assert.strictEqual(missingOrgResult.status, 'not_found');

  const invalidRoleResult = await invoke({
    openid: 'openid-chen',
    organizationId: 'org-43',
    role: 'invalid-role'
  });
  assert.strictEqual(invalidRoleResult.status, 'invalid_params');

  console.log('activateOrganization 路由集成测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
