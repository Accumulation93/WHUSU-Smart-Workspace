const assert = require('assert');

const storage = new Map([
  ['activeOrgId', 'org-43'],
  ['activeOrgVersion', 7]
]);

global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); }
};

const orgSession = require('../miniprogram/utils/orgSession');
const page = {};

const initial = orgSession.consume(page);
assert.strictEqual(initial.changed, false);
assert.deepStrictEqual(initial.snapshot, { orgId: 'org-43', version: 7 });

const oldRequest = orgSession.beginRequest(page, 'results');
storage.set('activeOrgId', 'org-44');
orgSession.markChanged();
assert.strictEqual(orgSession.isRequestCurrent(page, oldRequest), false, '旧组织响应必须失效');

const switched = orgSession.consume(page);
assert.strictEqual(switched.changed, true);
assert.deepStrictEqual(switched.snapshot, { orgId: 'org-44', version: 8 });

const first = orgSession.beginRequest(page, 'results');
const second = orgSession.beginRequest(page, 'results');
assert.strictEqual(orgSession.isRequestCurrent(page, first), false, '同通道旧请求必须失效');
assert.strictEqual(orgSession.isRequestCurrent(page, second), true);

orgSession.invalidateRequests(page);
assert.strictEqual(orgSession.isRequestCurrent(page, second), false, '页面清屏后全部旧请求必须失效');

console.log('小程序组织会话与请求失效测试通过');
