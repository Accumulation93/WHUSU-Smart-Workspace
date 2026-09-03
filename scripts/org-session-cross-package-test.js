const assert = require('assert');
const path = require('path');

const app = { globalData: {} };
let asynchronouslyPersistedSession = null;
const staleStorageSession = {
  token: 'token-current',
  role: 'user',
  contextId: 'assignment:old',
  orgId: 'org-old',
  orgName: '旧组织',
  version: 1,
  authState: {
    context: { role: 'user', contextId: 'assignment:old', organizationId: 'org-old' },
    profile: { name: '旧岗位' }
  }
};

global.getApp = function() { return app; };
global.wx = {
  getStorageSync(key) {
    if (key === 'authSession') return staleStorageSession;
    if (key === 'activeOrgVersion') return 1;
    return '';
  },
  setStorage(options) {
    // 鸿蒙登录临界路径不等待存储桥，但仍应投递完整的紧凑会话用于下次冷启动。
    if (options && options.key === 'authSession') asynchronouslyPersistedSession = options.data;
  },
  setStorageSync(key, value) {
    if (key === 'authSession') synchronouslyPersistedSession = value;
  },
  removeStorageSync() {}
};

const modulePath = path.resolve(__dirname, '..', 'miniprogram', 'utils', 'orgSession.js');
const firstPackageSession = require(modulePath);
delete require.cache[modulePath];
const alreadyLoadedOtherPackageSession = require(modulePath);
assert.strictEqual(alreadyLoadedOtherPackageSession.getSnapshot().role, 'user');

firstPackageSession.commitFastContext({
  token: 'token-current',
  role: 'admin',
  contextId: 'admin:super',
  orgId: 'org-43',
  orgName: '第四十三届学生会',
  persistForNavigation: true,
  authState: {
    context: {
      role: 'admin',
      contextId: 'admin:super',
      organizationId: 'org-43',
      adminLevel: 'super_admin'
    },
    profile: { name: '超级管理员', adminLevel: 'super_admin' }
  }
});

delete require.cache[modulePath];
const secondPackageSession = require(modulePath);
const snapshot = secondPackageSession.getSnapshot();
const authenticatedState = secondPackageSession.getAuthenticatedState();
const alreadyLoadedSnapshot = alreadyLoadedOtherPackageSession.getSnapshot();

assert.strictEqual(snapshot.role, 'admin');
assert.strictEqual(snapshot.contextId, 'admin:super');
assert.strictEqual(snapshot.orgId, 'org-43');
assert.strictEqual(authenticatedState.profile.adminLevel, 'super_admin');
assert.strictEqual(alreadyLoadedSnapshot.role, 'admin');
assert.strictEqual(alreadyLoadedSnapshot.contextId, 'admin:super');
assert.strictEqual(asynchronouslyPersistedSession.role, 'admin');
assert.strictEqual(asynchronouslyPersistedSession.contextId, 'admin:super');

secondPackageSession.clearAuthentication('user');
assert.strictEqual(app.globalData.__authSessionSnapshot, undefined);

console.log('小程序跨分包即时会话共享测试通过');
