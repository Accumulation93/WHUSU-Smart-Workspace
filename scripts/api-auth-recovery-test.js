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
let refreshShouldSucceed = true;

global.getApp = function() { return null; };
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  login(options) { options.success({ code: 'fresh-wechat-code' }); },
  showToast(options) { toasts.push(options); },
  reLaunch(options) { relaunches.push(options.url); },
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
            organizationId: 'org-44',
            identityId: 'assignment:old',
            contextId: 'assignment:old:org-44'
          },
          organizations: [{ id: 'org-44', name: '第四十四届' }],
          identities: [{ identityId: 'assignment:old', organizationId: 'org-44' }],
          contexts: [{
            contextId: 'assignment:old:org-44',
            authIdentityId: 'assignment:old',
            role: 'user',
            organizationId: 'org-44',
            organizationName: '第四十四届'
          }],
          context: {
            contextId: 'assignment:old:org-44',
            authIdentityId: 'assignment:old',
            role: 'user',
            organizationId: 'org-44',
            organizationName: '第四十四届'
          },
          user: { id: 'hr-1', name: '测试用户', identity: '主席团成员' }
        },
        header: {}
      });
      return;
    }

    protectedAttempts += 1;
    if (protectedAttempts === 1 || !refreshShouldSucceed) {
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

  refreshShouldSucceed = false;
  await assert.rejects(
    api.callFunction({ name: 'getCurrentScoreActivity', data: {} }),
    (error) => error && error.silent === true
  );
  assert.strictEqual(relaunches[0], '/subpackages/main/pages/login/login?reason=expired');
  assert.strictEqual(storage.authLoginNotice, '登录已过期，请重新登录');
  assert.strictEqual(storage.token, undefined, '无法恢复时必须清理失效登录');
  assert(toasts.some((item) => item.title === '登录已过期，请重新登录'));

  console.log('统一 API 登录过期无感恢复与明确回登录页测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
