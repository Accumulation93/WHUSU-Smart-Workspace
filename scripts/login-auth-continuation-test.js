const assert = require('assert');

const storage = {};
const requests = [];
const toasts = [];
let pageDefinition = null;

global.getApp = function() { return null; };
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  showToast(options) { toasts.push(options || {}); },
  request(options) {
    requests.push(options);
    options.success({
      statusCode: 200,
      data: { status: 'success' },
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

async function assertAuthenticatedRequest(role, token, apiName) {
  const page = createPage();
  page.handleLoginResult(role, {
    status: 'need_bind',
    token,
    bindingContext: role === 'user' ? 'binding-context' : '',
    bindingOrg: role === 'user' ? { id: 'org-44', name: '第四十四届' } : null
  });

  assert.strictEqual(storage.token, token);
  assert.strictEqual(storage.activeRole, role);
  assert.strictEqual(storage.activeOrgId, undefined);
  assert.strictEqual(page.data.showBind, true);

  await api.callFunction({ name: apiName, data: {} });
  const request = requests[requests.length - 1];
  assert.strictEqual(request.header.Authorization, `Bearer ${token}`);
  assert.strictEqual(request.header['X-Role'], role);
  assert.strictEqual(request.header['X-Active-Org'], '');
}

async function run() {
  assert(pageDefinition, '登录页必须成功注册');

  await assertAuthenticatedRequest('user', 'user-pre-bind-token', 'bindUserInfo');
  await assertAuthenticatedRequest('admin', 'admin-pre-bind-token', 'bindAdminInfo');

  const page = createPage();
  page.handleLoginResult('user', {
    status: 'need_bind',
    bindingContext: 'binding-context',
    bindingOrg: { id: 'org-44', name: '第四十四届' }
  });
  assert.strictEqual(page.data.showBind, false);
  assert(toasts.some((item) => item.title === '登录凭证异常'));

  console.log('登录到绑定的认证续接契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
