const assert = require('assert');

const storage = {};
const requests = [];
const toasts = [];
const navigations = [];
let pageDefinition = null;

global.getApp = function() { return null; };
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  showToast(options) { toasts.push(options || {}); },
  navigateTo(options) { navigations.push(options.url); },
  request(options) {
    requests.push(options);
    options.success({
      statusCode: 200,
      data: { status: 'accepted', claimId: 'claim-1' },
      header: {}
    });
  }
};
global.Page = function(definition) {
  pageDefinition = definition;
};

const api = require('../miniprogram/utils/api');
require('../miniprogram/pages/login/login');

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = Object.assign({}, pageDefinition.data);
  page.setData = function(changes) {
    Object.assign(this.data, changes || {});
  };
  return page;
}

async function run() {
  assert(pageDefinition, '登录页必须成功注册');
  const page = createPage();
  storage.authLoginNotice = '登录已过期，请重新登录';
  page.onLoad();
  assert.strictEqual(page.data.authNotice, '登录已过期，请重新登录');
  assert.strictEqual(storage.authLoginNotice, undefined, '登录提示读取后应立即清除');

  page.handleWechatSession({
    status: 'need_claim',
    bootstrapToken: 'bootstrap-token',
    claimAvailable: true,
    organizations: [{ id: 'org-44', name: '第四十四届' }],
    recoveryMethods: { recoveryCode: false, passphrase: false }
  });

  assert.strictEqual(storage.token, 'bootstrap-token');
  assert.strictEqual(storage.activeRole, undefined);
  assert.strictEqual(storage.activeOrgId, undefined);
  assert.strictEqual(page.data.stage, 'claim');
  assert.strictEqual(page.data.organizationName, '第四十四届');

  await api.callFunction({
    name: 'auth/claims',
    data: { organizationId: 'org-44', name: '测试用户', studentId: '20260001' }
  });
  const request = requests[requests.length - 1];
  assert.strictEqual(request.header.Authorization, 'Bearer bootstrap-token');
  assert.strictEqual(request.header['X-Role'], '');
  assert.strictEqual(request.header['X-Active-Org'], '');

  page.handleWechatSession({
    status: 'login_success',
    token: 'access-token',
    context: {
      contextId: 'assignment:one:org-44',
      role: 'user',
      organizationId: 'org-44',
      organizationName: '第四十四届'
    },
    contexts: [{
      contextId: 'assignment:one:org-44',
      role: 'user',
      organizationId: 'org-44',
      organizationName: '第四十四届'
    }],
    user: { id: 'hr-1', name: '测试用户' },
    account: { id: 'account-1', name: '测试用户' }
  });

  assert.strictEqual(storage.token, 'access-token');
  assert.strictEqual(storage.activeRole, 'user');
  assert.strictEqual(storage.activeOrgId, 'org-44');
  assert.strictEqual(storage.activeContextId, 'assignment:one:org-44');
  assert(navigations.includes('/pages/portal/portal'));

  console.log('统一登录引导与认证令牌续接契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
