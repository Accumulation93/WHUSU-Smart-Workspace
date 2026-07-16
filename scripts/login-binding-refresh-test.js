const assert = require('assert');
const Module = require('module');

let pageDefinition = null;
let scenario = 'expired-user-bind';
let bindAttempts = 0;
let autoBindAttempts = 0;
const calls = [];
const storage = {};
const toasts = [];
const redirects = [];

async function callFunction(options) {
  calls.push({ name: options.name, data: Object.assign({}, options.data || {}) });
  if (scenario === 'expired-user-bind') {
    if (options.name === 'bindUserInfo') {
      bindAttempts += 1;
      if (bindAttempts === 1) {
        return { status: 'challenge_expired', message: '绑定验证已过期，请重新登录' };
      }
      return { status: 'success', message: '绑定成功' };
    }
    if (options.name === 'userLogin') {
      return {
        status: 'need_bind',
        token: 'fresh-token',
        bindingContext: 'fresh-binding-context',
        bindingOrg: { id: 'org-44', name: '第四十四届' }
      };
    }
  }
  if (scenario === 'auto-bind') {
    if (options.name === 'confirmAutoBind') {
      autoBindAttempts += 1;
      if (autoBindAttempts === 1) {
        return { status: 'challenge_expired', message: '绑定验证已过期，请重新登录' };
      }
      return {
        status: 'success',
        activeOrg: { id: 'org-44', name: '第四十四届' },
        availableOrgs: [{ id: 'org-44', name: '第四十四届' }],
        user: { id: 'display-user', name: '测试用户', studentId: '20260001' }
      };
    }
    if (options.name === 'userLogin') {
      return {
        status: 'auto_bind_available',
        token: 'fresh-auto-bind-token',
        autoBindChallenge: 'fresh-auto-bind-challenge',
        targetOrg: { id: 'org-44', name: '第四十四届' },
        availableOrgs: []
      };
    }
  }
  throw new Error('未预期的 API 调用：' + options.name);
}

global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  login(options) { options.success({ code: 'fresh-wx-code' }); },
  showToast(options) { toasts.push(options); },
  redirectTo(options) { redirects.push(options.url); }
};
global.Page = function(definition) { pageDefinition = definition; };

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../utils/api') {
    return {
      callFunction,
      showShortToast(title, icon) {
        toasts.push({ title, icon: icon || 'none' });
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
require('../miniprogram/pages/login/login');
Module._load = originalLoad;

function createPage(overrides) {
  const page = Object.assign({}, pageDefinition);
  page.data = Object.assign({}, pageDefinition.data, overrides || {});
  page.setData = function(changes) {
    Object.assign(this.data, changes || {});
  };
  return page;
}

async function run() {
  assert(pageDefinition, '登录页应成功注册');

  const page = createPage({
    activeRole: 'user',
    name: '测试用户',
    studentId: '20260001',
    bindingContext: 'expired-binding-context'
  });
  let handled = null;
  page.handleBindResult = function(role, result) {
    handled = { role, result };
  };

  await page.onBind();

  assert.strictEqual(bindAttempts, 2, '挑战过期后应只重试一次绑定');
  assert.deepStrictEqual(calls.map((item) => item.name), [
    'bindUserInfo',
    'userLogin',
    'bindUserInfo'
  ]);
  assert.strictEqual(calls[0].data.bindingContext, 'expired-binding-context');
  assert.strictEqual(calls[2].data.bindingContext, 'fresh-binding-context');
  assert.strictEqual(calls[2].data.name, '测试用户');
  assert.strictEqual(calls[2].data.studentId, '20260001');
  assert.strictEqual(storage.token, 'fresh-token');
  assert.strictEqual(page.data.bindingContext, 'fresh-binding-context');
  assert.strictEqual(page.data.bindingOrgName, '第四十四届');
  assert.strictEqual(page.data.loading, false);
  assert.strictEqual(handled.role, 'user');
  assert.strictEqual(handled.result.status, 'success');

  scenario = 'auto-bind';
  calls.length = 0;
  const autoPage = createPage({ activeRole: 'user' });
  await autoPage.confirmAutoBind({
    token: 'auto-bind-token',
    autoBindChallenge: 'auto-bind-challenge',
    targetOrg: { id: 'org-44', name: '第四十四届' },
    availableOrgs: []
  });
  assert.strictEqual(autoBindAttempts, 2, '自动绑定挑战过期后应只重试一次');
  assert.deepStrictEqual(calls.map((item) => item.name), [
    'confirmAutoBind',
    'userLogin',
    'confirmAutoBind'
  ]);
  assert.strictEqual(calls[2].data.autoBindChallenge, 'fresh-auto-bind-challenge');
  assert.strictEqual(storage.token, 'fresh-auto-bind-token');
  assert(toasts.some((item) => item.title === '同步成功'));
  assert(redirects.includes('/pages/portal/portal'));

  console.log('登录绑定挑战自动刷新测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
