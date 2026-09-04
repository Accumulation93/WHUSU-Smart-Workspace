const assert = require('assert');

const storage = {
  token: 'expired-token',
  activeOrgId: 'org-44',
  activeOrgName: '第四十四届',
  activeRole: 'user',
  activeContextId: 'assignment:old:org-44',
  activeIdentityId: 'assignment:old',
  lastOrganizationId: 'org-44',
  lastIdentityId: 'assignment:old'
};
const requests = [];
const relaunches = [];
const toasts = [];
let protectedAttempts = 0;
let protectedFailuresRemaining = 1;
let refreshShouldSucceed = true;
let refreshedSelection = {
  organizationId: 'org-44',
  contextId: 'assignment:old:org-44',
  role: 'user'
};

global.getApp = function() { return null; };
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  login(options) { options.success({ code: 'fresh-wechat-code' }); },
  showToast(options) { toasts.push(options); },
  reLaunch(options) {
    relaunches.push(options.url);
    if (options.success) options.success();
  },
  request(options) {
    requests.push(options);
    if (options.url.endsWith('/auth/wechat/session')) {
      if (!refreshShouldSucceed) {
        options.success({
          statusCode: 401,
          data: { status: 'account_unavailable', message: '请重新微信登录' },
          header: {}
        });
        return;
      }
      options.success({
        statusCode: 200,
        data: {
          status: 'login_success',
          token: 'renewed-token',
          account: { id: 'account-1', name: '测试用户' },
          selection: {
            organizationId: refreshedSelection.organizationId,
            identityId: 'assignment:old',
            contextId: refreshedSelection.contextId
          },
          organizations: [{ id: refreshedSelection.organizationId, name: '第四十四届' }],
          identities: [{ identityId: 'assignment:old', organizationId: refreshedSelection.organizationId }],
          contexts: [{
            contextId: refreshedSelection.contextId,
            authIdentityId: 'assignment:old',
            role: refreshedSelection.role,
            organizationId: refreshedSelection.organizationId,
            organizationName: '第四十四届'
          }],
          context: {
            contextId: refreshedSelection.contextId,
            authIdentityId: 'assignment:old',
            role: refreshedSelection.role,
            organizationId: refreshedSelection.organizationId,
            organizationName: '第四十四届'
          },
          user: { id: 'hr-1', name: '测试用户', identity: '主席团成员' }
        },
        header: {}
      });
      return;
    }

    protectedAttempts += 1;
    if (protectedFailuresRemaining > 0 || !refreshShouldSucceed) {
      protectedFailuresRemaining = Math.max(0, protectedFailuresRemaining - 1);
      options.success({
        statusCode: 401,
        data: { status: 'auth_failed', message: '请重新微信登录' },
        header: {}
      });
      return;
    }
    options.success({ statusCode: 200, data: { status: 'success', value: 44 }, header: {} });
  }
};

const api = require('../miniprogram/utils/api');
const orgSession = require('../miniprogram/utils/orgSession');

async function run() {
  const recovered = await api.callFunction({ name: 'getCurrentOrganization', data: {} });
  assert.strictEqual(recovered.status, 'success');
  assert.strictEqual(recovered.value, 44);
  assert.strictEqual(orgSession.getSnapshot().token, 'renewed-token');
  assert.strictEqual(relaunches.length, 0, '可恢复的登录不得打断当前操作');
  assert.strictEqual(
    requests.filter((item) => item.url.endsWith('/getCurrentOrganization')).length,
    2,
    '原请求只允许重试一次'
  );
  assert.strictEqual(
    requests[requests.length - 1].header.Authorization,
    'Bearer renewed-token',
    '重试必须使用新令牌'
  );
  const firstRefreshRequest = requests.find((item) => item.url.endsWith('/auth/wechat/session'));
  assert.strictEqual(firstRefreshRequest.data.preferredContextId, 'assignment:old:org-44');
  assert.strictEqual(firstRefreshRequest.data.preferredOrganizationId, 'org-44');

  protectedFailuresRemaining = 1;
  refreshedSelection = {
    organizationId: 'org-other',
    contextId: 'admin:other:org-other',
    role: 'admin'
  };
  const attemptsBeforeMismatch = protectedAttempts;
  await assert.rejects(
    api.callFunction({ name: 'getCurrentOrganization', data: {} }),
    (error) => error && error.silent === true && error.status === 'request_cancelled'
  );
  assert.strictEqual(protectedAttempts, attemptsBeforeMismatch + 1, '工作角色回退后不得重放原请求');
  assert.strictEqual(relaunches[0], '/subpackages/main/pages/portal/portal');

  refreshShouldSucceed = false;
  protectedFailuresRemaining = 1;
  await assert.rejects(
    api.callFunction({ name: 'getCurrentScoreActivity', data: {} }),
    (error) => error && error.silent === true
  );
  assert.strictEqual(relaunches[1], '/subpackages/main/pages/login/login?reason=expired');
  assert.strictEqual(storage.authLoginNotice, '登录已过期，请重新登录');
  assert.strictEqual(storage.token, undefined, '无法恢复时必须清理失效登录');
  assert(toasts.some((item) => item.title === '登录已过期，请重新登录'));

  console.log('统一 API 登录过期无感恢复与明确回登录页测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
