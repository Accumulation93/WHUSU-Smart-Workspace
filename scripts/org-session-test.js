const assert = require('assert');

const storage = new Map([
  ['activeOrgId', 'org-43'],
  ['activeOrgVersion', 7],
  ['activeRole', 'user'],
  ['token', 'token-43']
]);

global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); }
};

const orgSession = require('../miniprogram/utils/orgSession');
const page = {};

const initial = orgSession.consume(page);
assert.strictEqual(initial.changed, false);
assert.deepStrictEqual(initial.snapshot, {
  orgId: 'org-43',
  role: 'user',
  contextId: '',
  identityId: '',
  token: 'token-43',
  version: 7
});

const oldRequest = orgSession.beginRequest(page, 'results');
orgSession.commitContext({ orgId: 'org-44', orgName: '第四十四届' });
assert.strictEqual(orgSession.isRequestCurrent(page, oldRequest), false, '旧组织响应必须失效');

const switched = orgSession.consume(page);
assert.strictEqual(switched.changed, true);
assert.deepStrictEqual(switched.snapshot, {
  orgId: 'org-44',
  role: 'user',
  contextId: '',
  identityId: '',
  token: 'token-43',
  version: 8
});

const first = orgSession.beginRequest(page, 'results');
const second = orgSession.beginRequest(page, 'results');
assert.strictEqual(orgSession.isRequestCurrent(page, first), false, '同通道旧请求必须失效');
assert.strictEqual(orgSession.isRequestCurrent(page, second), true);

orgSession.invalidateRequests(page);
assert.strictEqual(orgSession.isRequestCurrent(page, second), false, '页面清屏后全部旧请求必须失效');

const roleRequest = orgSession.beginRequest(page, 'role');
orgSession.commitContext({ role: 'admin' });
assert.strictEqual(orgSession.isRequestCurrent(page, roleRequest), false, '同组织切换角色必须使旧请求失效');

const tokenRequest = orgSession.beginRequest(page, 'token');
orgSession.commitContext({ token: 'token-admin-new' });
assert.strictEqual(orgSession.isRequestCurrent(page, tokenRequest), false, '重新登录更换凭证必须使旧请求失效');

const cleared = orgSession.clearAuthentication('user');
assert.strictEqual(cleared.changed, true);
assert.strictEqual(storage.has('token'), false);
assert.strictEqual(storage.has('activeOrgId'), false);
assert.strictEqual(storage.get('activeRole'), 'user');

console.log('小程序组织会话与请求失效测试通过');
