const assert = require('assert');

const toasts = [];
let navigateMode = 'timeout';

global.getCurrentPages = function() {
  return [{ route: 'pages/login/login' }, { route: 'pages/portal/portal' }];
};

global.wx = {
  navigateTo(options) {
    if (navigateMode === 'success') {
      options.success({ errMsg: 'navigateTo:ok' });
      return;
    }
    options.fail({ errMsg: navigateMode === 'timeout' ? 'navigateTo:fail timeout' : 'navigateTo:fail page not found' });
  },
  showToast(options) {
    toasts.push(options || {});
  }
};

const { navigateToTrustedRoute } = require('../miniprogram/utils/trustedNavigation');

let successCount = 0;
navigateToTrustedRoute('/pages/portal/portal', {
  success() { successCount += 1; }
});
assert.strictEqual(successCount, 1, '目标页已进入页面栈时，延迟的超时回调必须按成功处理');
assert.strictEqual(toasts.length, 0, '目标页已进入页面栈时不得误报页面打开失败');

navigateMode = 'failure';
navigateToTrustedRoute('/pages/portal/portal');
assert.strictEqual(toasts[toasts.length - 1].title, '页面未打开，请重试');

navigateMode = 'success';
navigateToTrustedRoute('/pages/messageCenter/messageCenter');
assert.strictEqual(successCount, 1, '未提供回调的正常导航不得产生额外副作用');

console.log('小程序页面跳转超时恢复测试通过');
