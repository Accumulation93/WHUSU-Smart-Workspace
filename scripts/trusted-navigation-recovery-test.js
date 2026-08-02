const assert = require('assert');

const redirects = [];
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
  redirectTo(options) {
    redirects.push(options.url);
    options.success({ errMsg: 'redirectTo:ok' });
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
assert.deepStrictEqual(redirects, ['/pages/portal/portal'], '目标页已进入页面栈但导航超时时必须原位重建目标页');
assert.strictEqual(successCount, 1, '原位重建成功后必须按导航成功处理');

navigateMode = 'failure';
navigateToTrustedRoute('/pages/portal/portal');
assert.strictEqual(toasts[toasts.length - 1].title, '页面未打开，请重试');

navigateMode = 'success';
navigateToTrustedRoute('/pages/messageCenter/messageCenter');
assert.strictEqual(successCount, 1, '未提供回调的正常导航不得产生额外副作用');

console.log('小程序页面跳转超时恢复测试通过');
