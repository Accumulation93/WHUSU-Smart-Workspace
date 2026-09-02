const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const storage = {};
const events = [];
let activationResult = null;

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  setStorage(options) {
    storage[options.key] = options.data;
    if (typeof options.success === 'function') options.success();
  }
};

const apiPath = path.resolve(__dirname, '..', 'api.js');
require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    callFunction() { return Promise.resolve(activationResult); },
    markAuthenticationReady() {},
    beginContextActivation() {},
    endContextActivation() {}
  }
};

const eventBusPath = path.resolve(__dirname, '..', 'eventBus.js');
require.cache[eventBusPath] = {
  id: eventBusPath,
  filename: eventBusPath,
  loaded: true,
  exports: {
    emit(name, payload) { events.push({ name, payload }); }
  }
};

const authContext = require('../authContext');
const orgSession = require('../orgSession');

const userContext = {
  contextId: 'ctx-user-existing',
  role: 'user',
  organizationId: 'org-existing',
  organizationName: '既有组织',
  assignmentId: 'assignment-existing'
};
const adminContext = {
  contextId: 'ctx-admin-test',
  role: 'admin',
  organizationId: 'org-test',
  organizationName: '测试组织',
  adminGrantId: 'grant-global',
  adminLevel: 'super_admin',
  permissions: ['*']
};

test('切换到新组织超级管理员后原子替换运行时权限并阻止旧登录回写', async () => {
  authContext.applyAuthenticatedResult({
    status: 'login_success',
    token: 'token-user',
    account: { id: 'account-1', personId: 'person-1', name: '测试管理员', studentId: '20260001' },
    context: userContext,
    contexts: [userContext, adminContext],
    workContexts: [userContext, adminContext],
    organizations: [
      { id: 'org-existing', name: '既有组织', roles: ['user'] },
      { id: 'org-test', name: '测试组织', roles: ['admin'] }
    ],
    selection: { organizationId: 'org-existing', contextId: 'ctx-user-existing' },
    user: { id: 'hr-1', name: '测试管理员', assignmentId: 'assignment-existing' }
  });

  activationResult = {
    status: 'success',
    token: 'token-admin',
    context: adminContext,
    contexts: [userContext, adminContext],
    workContexts: [userContext, adminContext],
    organizations: [
      { id: 'org-existing', name: '既有组织', roles: ['user'] },
      { id: 'org-test', name: '测试组织', roles: ['admin'] }
    ],
    identities: [],
    selection: { organizationId: 'org-test', contextId: 'ctx-admin-test' },
    user: {
      id: 'admin-1',
      name: '测试管理员',
      adminLevel: 'super_admin',
      permissions: ['*']
    }
  };

  const activated = await authContext.activateContext('ctx-admin-test');
  assert.equal(activated.context.role, 'admin');
  assert.equal(activated.user.adminLevel, 'super_admin');
  assert.equal(activated.user.permissions['*'], true);
  assert.equal(authContext.getRuntimeProfile('user'), null);
  assert.equal(authContext.getRuntimeProfile('admin').permissions['*'], true);
  assert.deepEqual(orgSession.getSnapshot(), {
    token: 'token-admin',
    role: 'admin',
    contextId: 'ctx-admin-test',
    orgId: 'org-test',
    orgName: '测试组织',
    identityId: '',
    version: activated.version
  });

  await new Promise(function(resolve) { setTimeout(resolve, 900); });
  assert.equal(storage.activeRole, 'admin');
  assert.equal(storage.activeContextId, 'ctx-admin-test');
  assert.equal(storage.token, 'token-admin');
  assert.equal(storage.roleProfiles.admin.adminLevel, 'super_admin');
  assert.equal(storage.roleProfiles.admin.permissions['*'], true);
  assert.equal(storage.authSession.authState.context.contextId, 'ctx-admin-test');
  assert(events.some(function(item) { return item.name === 'auth:contextChanged'; }));
  assert(events.some(function(item) { return item.name === 'org:changed'; }));
});
