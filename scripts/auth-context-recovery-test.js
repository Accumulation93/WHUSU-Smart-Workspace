const assert = require('assert');
const path = require('path');

const storage = {
  authSession: {
    token: 'token-super-43',
    role: 'admin',
    contextId: 'ctx-super-43',
    orgId: 'org-43',
    orgName: '第四十三届学生会',
    version: 43
  }
};
const context = {
  contextId: 'ctx-super-43',
  role: 'admin',
  organizationId: 'org-43',
  organizationName: '第四十三届学生会',
  adminGrantId: 'grant-super',
  adminLevel: 'super_admin',
  name: '超级管理员',
  permissions: ['*']
};

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  setStorage(options) { storage[options.key] = options.data; }
};

const apiPath = path.resolve(__dirname, '..', 'miniprogram/utils/api.js');
require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    callFunction() {
      return Promise.resolve({
        status: 'success',
        currentContextId: context.contextId,
        context,
        user: {
          id: 'grant-super',
          name: '超级管理员',
          adminLevel: 'super_admin',
          permissions: ['*']
        },
        contexts: [context],
        workContexts: [context],
        selection: { organizationId: 'org-43', contextId: context.contextId },
        organizations: [{ id: 'org-43', name: '第四十三届学生会', roles: ['admin'] }],
        identities: []
      });
    },
    markAuthenticationReady() {},
    beginContextActivation() {},
    endContextActivation() {}
  }
};

const authContext = require('../miniprogram/utils/authContext');

(async () => {
  assert.strictEqual(authContext.getRuntimeProfile('admin'), null);
  await authContext.refreshCatalog();
  const profile = authContext.getRuntimeProfile('admin');
  assert(profile);
  assert.strictEqual(profile.adminLevel, 'super_admin');
  assert.strictEqual(profile.permissions['*'], true);
  assert.strictEqual(storage.authSession.authState.context.contextId, 'ctx-super-43');
  assert.strictEqual(storage.authSession.authState.profile.adminLevel, 'super_admin');
  console.log('不完整会话的当前工作角色恢复测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
