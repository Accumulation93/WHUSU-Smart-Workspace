const assert = require('assert');
const Module = require('module');

let pageDefinition = null;
let scenario = 'claim';
const calls = [];
const storage = {};
const toasts = [];
const navigations = [];
const redirects = [];

async function callFunction(options) {
  calls.push({ name: options.name, data: Object.assign({}, options.data || {}) });
  if (options.name === 'auth/wechat/session') {
    return {
      status: 'need_claim',
      bootstrapToken: 'bootstrap-token',
      organizations: [{ id: 'org-44', name: '第四十四届' }],
      recoveryMethods: { recoveryCode: false, passphrase: false }
    };
  }
  if (options.name === 'auth/claims') {
    return { status: 'accepted', claimId: 'claim-1' };
  }
  if (options.name === 'auth/claims/verify') {
    return {
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
      user: { id: 'hr-1', name: '测试用户' }
    };
  }
  if (options.name === 'auth/recovery/start' && scenario === 'recovery') {
    return { status: 'accepted', recoveryRequestId: 'recovery-1' };
  }
  throw new Error('未预期的 API 调用：' + options.name);
}

global.wx = {
  setNavigationBarTitle() {},
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  login(options) { options.success({ code: 'fresh-wx-code' }); },
  showToast(options) { toasts.push(options); },
  nextTick(callback) { callback(); },
  navigateTo(options) {
    navigations.push(options.url);
    if (typeof options.success === 'function') options.success();
  },
  redirectTo(options) {
    redirects.push(options.url);
    if (typeof options.success === 'function') options.success();
  }
};
global.Page = function(definition) { pageDefinition = definition; };

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../utils/api') {
    return {
      callFunction,
      showShortToast(title, icon) { toasts.push({ title, icon: icon || 'none' }); },
      getErrorText(error, fallback) { return error && error.message ? error.message : fallback; }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
require('../miniprogram/pages/login/login');
Module._load = originalLoad;

function createPage(overrides) {
  const page = Object.assign({}, pageDefinition);
  page.data = Object.assign({}, pageDefinition.data, overrides || {});
  page.setData = function(changes, callback) {
    Object.assign(this.data, changes || {});
    if (typeof callback === 'function') callback();
  };
  return page;
}

async function run() {
  assert(pageDefinition, '登录页应成功注册');

  const page = createPage();
  page.onLoad();
  page.onLogin();
  page.onLogin();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(calls.filter((item) => item.name === 'auth/wechat/session').length, 1);
  assert.strictEqual(page.data.stage, 'claim');

  page.setData({ name: '测试用户', studentId: '20260001' });
  await page.submitClaim();
  assert.strictEqual(page.data.stage, 'verify');
  assert.strictEqual(page.data.claimId, 'claim-1');

  page.setData({ verificationCode: 'ABCD1234' });
  await page.verifyClaim();
  assert.strictEqual(storage.token, 'access-token');
  assert.strictEqual(storage.activeContextId, 'assignment:one:org-44');
  assert(redirects.includes('/pages/portal/portal'));
  assert.strictEqual(page.data.stage, 'login', '进入门户前必须卸载登录页认证弹层');

  scenario = 'recovery';
  const recoveryPage = createPage({
    stage: 'recovery',
    organizations: [{ id: 'org-44', name: '第四十四届' }],
    name: '测试用户',
    studentId: '20260001',
    recoveryMethodValues: []
  });
  await recoveryPage.startRecovery();
  assert.strictEqual(recoveryPage.data.stage, 'recoveryPending');
  assert.strictEqual(recoveryPage.data.recoveryRequestId, 'recovery-1');

  console.log('统一登录、认领与默认人工恢复流程测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
