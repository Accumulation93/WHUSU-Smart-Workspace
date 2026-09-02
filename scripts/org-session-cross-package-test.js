const assert = require('assert');
const path = require('path');

const app = { globalData: {} };
let synchronouslyPersistedSession = null;
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
  setStorage() {
    // 模拟旧版鸿蒙存储桥尚未完成落盘：跨分包只能依赖 App 级共享内存。
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
assert.strictEqual(synchronouslyPersistedSession.role, 'admin');
assert.strictEqual(synchronouslyPersistedSession.contextId, 'admin:super');

secondPackageSession.clearAuthentication('user');
assert.strictEqual(app.globalData.__authSessionSnapshot, undefined);

console.log('小程序跨分包即时会话共享测试通过');
