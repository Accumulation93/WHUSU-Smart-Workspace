const assert = require('assert');

const toasts = [];
const redirects = [];
const relaunches = [];
let navigateMode = 'timeout';
let redirectMode = 'success';

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
    options.success({ errMsg: 'reLaunch:ok' });
  },
  showToast(options) {
    toasts.push(options || {});
  }
};

const { navigateToTrustedRoute } = require('../miniprogram/utils/trustedNavigation');

let successCount = 0;
navigateToTrustedRoute('/subpackages/main/pages/portal/portal', {
  success() { successCount += 1; }
});
assert.deepStrictEqual(redirects, [], '目标页已经打开时不得重复跳转');
assert.strictEqual(successCount, 1, '目标页已经打开时必须按导航成功处理');
assert.strictEqual(toasts.length, 0, '页面重建成功时不得误报页面打开失败');

navigateMode = 'failure';
navigateToTrustedRoute('/subpackages/message/pages/messageCenter/messageCenter');
assert.deepStrictEqual(redirects, ['/subpackages/message/pages/messageCenter/messageCenter'], '普通导航失败时必须替换当前页继续进入功能');
assert.strictEqual(toasts.length, 0, '替换页面成功时不得误报页面打开失败');

redirectMode = 'failure';
navigateToTrustedRoute('/subpackages/workspace/pages/home/home?subApp=scoring');
assert.deepStrictEqual(relaunches, ['/subpackages/workspace/pages/home/home?subApp=scoring'], '替换页面失败时必须重建页面栈');
assert.strictEqual(toasts.length, 0, '重建页面栈成功时不得误报页面打开失败');

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
redirectMode = 'success';
navigateToTrustedRoute('/subpackages/org/pages/identitySwitch/identitySwitch');
assert.strictEqual(typeof navigationTimeout, 'function', '跳转无回调时必须注册独立恢复超时');
navigationTimeout();
assert.deepStrictEqual(
  redirects,
  [
    '/subpackages/message/pages/messageCenter/messageCenter',
    '/subpackages/workspace/pages/home/home?subApp=scoring',
    '/subpackages/org/pages/identitySwitch/identitySwitch'
  ],
  '跳转回调丢失时必须主动替换当前页进入目标功能'
);
global.setTimeout = nativeSetTimeout;
global.clearTimeout = nativeClearTimeout;

console.log('小程序页面跳转超时恢复测试通过');
