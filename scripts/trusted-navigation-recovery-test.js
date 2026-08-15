const assert = require('assert');

const toasts = [];
const redirects = [];
let navigateMode = 'timeout';

global.getCurrentPages = function() {
  return [{ route: 'subpackages/main/pages/login/login' }, { route: 'subpackages/main/pages/portal/portal' }];
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
navigateToTrustedRoute('/subpackages/main/pages/portal/portal', {
  success() { successCount += 1; }
});
assert.deepStrictEqual(redirects, ['/subpackages/main/pages/portal/portal'], '目标页绘制切换超时时必须原位重建目标页面');
assert.strictEqual(successCount, 1, '页面重建完成后必须按导航成功处理');
assert.strictEqual(toasts.length, 0, '页面重建成功时不得误报页面打开失败');

navigateMode = 'failure';
navigateToTrustedRoute('/subpackages/main/pages/portal/portal');
assert.strictEqual(toasts[toasts.length - 1].title, '页面未打开，请重试');

navigateMode = 'success';
navigateToTrustedRoute('/subpackages/message/pages/messageCenter/messageCenter');
assert.strictEqual(successCount, 1, '未提供回调的正常导航不得产生额外副作用');

console.log('小程序页面跳转超时恢复测试通过');
