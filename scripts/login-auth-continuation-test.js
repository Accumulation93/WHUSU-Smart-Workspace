const assert = require('assert');

const storage = {};
const requests = [];
const toasts = [];
const navigations = [];
const relaunches = [];
let pageDefinition = null;

global.getApp = function() { return null; };
global.wx = {
  setNavigationBarTitle() {},
  getStorageSync(key) { return storage[key]; },
  getStorage(options) {
    if (Object.prototype.hasOwnProperty.call(storage, options.key)) {
      options.success({ data: storage[options.key] });
    } else if (options.fail) {
      options.fail({ errMsg: 'getStorage:fail data not found' });
    }
  },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  setStorage(options) {
    storage[options.key] = options.data;
    if (typeof options.success === 'function') options.success();
  },
  batchSetStorage(options) {
    (options.kvList || []).forEach(function(item) { storage[item.key] = item.value; });
    if (typeof options.success === 'function') options.success();
  },
  removeStorage(options) {
    delete storage[options.key];
    if (typeof options.success === 'function') options.success();
  },
  showToast(options) { toasts.push(options || {}); },
  nextTick(callback) { callback(); },
  navigateTo(options) {
    navigations.push(options.url);
    if (typeof options.success === 'function') options.success();
  },
  reLaunch(options) {
    relaunches.push(options.url);
    if (typeof options.success === 'function') options.success();
  },
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
const orgSession = require('../miniprogram/utils/orgSession');
require('../miniprogram/subpackages/main/pages/login/login');

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = Object.assign({}, pageDefinition.data);
  page.setData = function(changes, callback) {
    Object.assign(this.data, changes || {});
    if (typeof callback === 'function') callback();
  };
  return page;
}

async function run() {
  assert(pageDefinition, '登录页必须成功注册');
  const page = createPage();
  storage.authLoginNotice = '登录已过期，请重新登录';
  page.onLoad();
  await new Promise(function(resolve) { setImmediate(resolve); });
  assert.strictEqual(page.data.authNotice, '登录已过期，请重新登录');
  assert.strictEqual(storage.authLoginNotice, undefined, '登录提示读取后应立即清除');

  await page.handleWechatSession({
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

  await page.handleWechatSession({
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

  assert.strictEqual(orgSession.getSnapshot().token, 'access-token');
  assert.strictEqual(orgSession.getSnapshot().role, 'user');
  assert.strictEqual(orgSession.getSnapshot().orgId, 'org-44');
  assert.strictEqual(orgSession.getSnapshot().contextId, 'assignment:one:org-44');
  assert(relaunches.includes('/subpackages/main/pages/portal/portal'));
  assert.strictEqual(page.data.stage, 'login', '进入门户前必须卸载登录页认证弹层');
  assert.strictEqual(page._portalNavigating, false, '门户导航完成后必须释放导航锁');

  console.log('统一登录引导与认证令牌续接契约测试通过');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
