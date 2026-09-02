const assert = require('assert');

const toasts = [];
const redirects = [];
const relaunches = [];
let navigateMode = 'success';

global.getCurrentPages = function() {
  return [{ route: 'subpackages/main/pages/login/login' }, { route: 'subpackages/main/pages/portal/portal' }];
};

global.wx = {
  navigateTo(options) {
    if (navigateMode === 'success') {
      options.success({ errMsg: 'navigateTo:ok' });
      return;
    }
    if (navigateMode === 'silent') return;
    options.fail({ errMsg: navigateMode === 'timeout' ? 'navigateTo:fail timeout' : 'navigateTo:fail page not found' });
  },
  redirectTo(options) {
    redirects.push(options.url);
    if (redirectMode === 'success') options.success({ errMsg: 'redirectTo:ok' });
    else options.fail({ errMsg: 'redirectTo:fail' });
  },
  reLaunch(options) {
    relaunches.push(options.url);
    if (typeof options.success === 'function') options.success({ errMsg: 'reLaunch:ok' });
  },
  showToast(options) {
    toasts.push(options || {});
  }
};

const { navigateToTrustedRoute, reLaunchTrustedRoute } = require('../miniprogram/utils/trustedNavigation');

let successCount = 0;
navigateToTrustedRoute('/subpackages/main/pages/portal/portal', {
  success() { successCount += 1; }
});
assert.deepStrictEqual(redirects, [], '正常导航不得启动第二种跳转');
assert.strictEqual(successCount, 1, '正常导航必须按成功处理');
assert.strictEqual(toasts.length, 0, '正常导航不得误报页面打开失败');

navigateMode = 'failure';
navigateToTrustedRoute('/subpackages/message/pages/messageCenter/messageCenter');
assert.deepStrictEqual(redirects, [], '分包失败时不得用 redirectTo 竞争原导航');
assert.deepStrictEqual(relaunches, [], '分包失败时不得用 reLaunch 破坏页面栈');
assert.strictEqual(toasts.length, 1, '明确失败时必须释放状态并提示');

navigateMode = 'success';
navigateToTrustedRoute('/subpackages/message/pages/messageCenter/messageCenter');
assert.strictEqual(successCount, 1, '未提供回调的正常导航不得产生额外副作用');

const nativeSetTimeout = global.setTimeout;
const nativeClearTimeout = global.clearTimeout;
let navigationTimeout = null;
global.setTimeout = function(callback) {
  navigationTimeout = callback;
  return 101;
};
global.clearTimeout = function() {};
navigateMode = 'silent';
navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
assert.strictEqual(typeof navigationTimeout, 'function', '跳转无回调时必须注册独立超时');
navigationTimeout();
assert.deepStrictEqual(redirects, [], '跳转回调丢失时也不得发起第二种导航');
assert.deepStrictEqual(relaunches, [], '跳转回调丢失时不得重建整个页面栈');
assert.strictEqual(toasts.length, 2, '超时必须释放状态并提示用户重试');
global.setTimeout = nativeSetTimeout;
global.clearTimeout = nativeClearTimeout;

reLaunchTrustedRoute('/subpackages/scoring/pages/admin/admin?subApp=scoring');
assert.deepStrictEqual(
  relaunches,
  ['/subpackages/scoring/pages/admin/admin?subApp=scoring'],
  '切换角色后的可信目标必须使用单次 reLaunch 重建页面栈'
);

console.log('小程序页面单航道跳转兼容测试通过');
