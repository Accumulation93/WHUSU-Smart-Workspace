const assert = require('assert');

const storage = new Map([
  ['activeOrgId', 'org-43'],
  ['activeOrgVersion', 3],
  ['activeRole', 'user'],
  ['token', 'test-token']
]);
let pendingRequest;

global.wx = {
  getStorageSync(key) { return storage.get(key); },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  request(options) { pendingRequest = options; },
  showToast() {}
};

const orgSession = require('../miniprogram/utils/orgSession');
const { callFunction } = require('../miniprogram/utils/api');

async function run() {
  let failCalled = false;
  let completeCalled = false;
  const promise = callFunction({
    name: 'submitScoreRecord',
    data: { activityId: 'activity-43' },
    fail() { failCalled = true; },
    complete() { completeCalled = true; }
  });
  assert(pendingRequest.data.clientRequestId, '写请求必须自动携带 clientRequestId');
  assert.strictEqual(pendingRequest.header['X-Active-Org'], 'org-43');
  assert(pendingRequest.header['X-Request-Id']);

  orgSession.commitContext({ orgId: 'org-44' });
  pendingRequest.success({ statusCode: 200, data: { status: 'success' }, header: {} });

  await assert.rejects(promise, (error) => error.status === 'request_cancelled' && error.silent === true);
  await Promise.resolve();
  assert.strictEqual(failCalled, false, '组织切换取消不得触发可见错误回调');
  assert.strictEqual(completeCalled, true, '组织切换取消仍需结束 loading 生命周期');

  const rolePromise = callFunction({ name: 'getCurrentScoreActivity' });
  orgSession.commitContext({ role: 'admin' });
  pendingRequest.success({ statusCode: 200, data: { status: 'success' }, header: {} });
  await assert.rejects(rolePromise, (error) => error.status === 'request_cancelled');

  console.log('统一 API 组织取消语义测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
