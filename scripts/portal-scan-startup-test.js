'use strict';

/**
 * 门户页两项能力回归：
 *   1. 默认落地门户：本地无会话时先问一次微信，未绑定才去登录页；失败不冒充未绑定。
 *   2. 扫一扫双入口：标题行快捷键 + 应用服务卡片；站内地址才跳转，其他内容只展示与复制。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const portalJs = path.join(root, 'miniprogram/subpackages/main/pages/portal/portal.js');
const portalWxml = fs.readFileSync(path.join(root, 'miniprogram/subpackages/main/pages/portal/portal.wxml'), 'utf8');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
const localRequire = require('node:module').createRequire(portalJs);

// —— 默认落地页 ——
assert.strictEqual(appJson.pages[0], 'subpackages/main/pages/portal/portal', '默认落地页必须是门户');
assert.ok(appJson.pages.indexOf('subpackages/main/pages/login/login') >= 0, '登录页仍须注册在主包顶层');

// —— 双入口 ——
assert.ok(portalWxml.indexOf('bindtap="onScanQuickTap"') >= 0, '标题行必须有扫一扫快捷键入口');
assert.ok(portalWxml.indexOf('data-key="{{item.key}}"') >= 0, '应用服务卡片入口必须保留');
assert.ok(!/扫一扫/.test(portalWxml), '扫一扫文案必须来自语言系统，不得写死在 WXML');

/** 用桩模块加载门户页定义，便于直接调用页面方法。 */
function createPage(options) {
  const settings = options || {};
  const calls = { navigate: [], reLaunch: [], modal: [], clipboard: [], applied: [], toasts: [], scanned: [] };
  let definition = null;
  const sandbox = {
    console,
    module: { exports: {} },
    getCurrentPages: () => [],
    Page: (value) => { definition = value; return value; },
    require: (name) => {
      if (name.indexOf('/locales/') >= 0) return localRequire(name);
      if (name.endsWith('/utils/trustedNavigation')) {
        // 用真实的受信路由白名单，但导航动作只记录：真实实现依赖宿主 wx 与页面栈。
        const real = localRequire(name);
        return {
          isTrustedRoute: real.isTrustedRoute,
          navigateToTrustedRoute: (url, handlers) => {
            if (!real.isTrustedRoute(url)) return false;
            calls.navigate.push(url);
            if (handlers && typeof handlers.success === 'function') handlers.success();
            return true;
          },
          reLaunchPortalThenNavigate: (url) => { calls.reLaunch.push(url); return true; }
        };
      }
      if (name.endsWith('/utils/startupSession')) {
        return { probeStartupSession: () => Promise.resolve(settings.probe || { state: 'unavailable' }) };
      }
      if (name.endsWith('/utils/api')) {
        return {
          API_BASE: 'https://example.test/api', CLIENT_VERSION: 'test',
          callFunction: () => Promise.resolve({ status: 'success' }),
          formatAuditTime: () => '',
          showShortToast: (text) => calls.toasts.push(String(text)),
          recordMessageRender: () => {}
        };
      }
      if (name.endsWith('/utils/authContext')) {
        return {
          applyAuthenticatedResult: (result) => calls.applied.push(result),
          clearUnifiedAuthentication: () => { calls.cleared = (calls.cleared || 0) + 1; }
        };
      }
      if (name.endsWith('/utils/orgSession')) {
        // 真实 orgSession 依赖宿主 wx；这里只要一个“没有会话”的快照和空实现。
        return {
          getSnapshot: () => ({ token: '', role: '', orgId: '', orgName: '', contextId: '' }),
          getAuthenticatedState: () => null,
          consume: () => ({ changed: false }),
          markChanged: () => {},
          invalidateRequests: () => {},
          isRequestCurrent: () => true,
          beginRequest: () => ({ channel: 'test', sequence: 1 }),
          commitFastContext: () => true,
          clearAuthentication: () => {}
        };
      }
      return {};
    },
    wx: {
      getStorageSync: () => '',
      setStorageSync: () => {},
      setNavigationBarTitle: () => {},
      reLaunch: (value) => calls.reLaunch.push(value && value.url),
      navigateTo: (value) => calls.navigate.push(value && value.url),
      showModal: (value) => { calls.modal.push(value); },
      setClipboardData: (value) => calls.clipboard.push(value && value.data),
      scanCode: (value) => {
        calls.scanned.push(value);
        if (settings.scanResult) value.success({ result: settings.scanResult });
      },
      showToast: () => {},
      login: () => {},
      request: () => {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(portalJs, 'utf8'), sandbox, { filename: portalJs });
  // 页面方法直接挂在 Page 定义顶层（不是组件的 methods），因此整体合并后再覆盖 data/setData。
  const page = Object.assign({}, definition, {
    data: Object.assign({}, definition.data),
    setData(patch, callback) {
      Object.keys(patch).forEach((key) => {
        const segments = key.split('.');
        let target = this.data;
        segments.slice(0, -1).forEach((part) => { target = target[part]; });
        target[segments[segments.length - 1]] = patch[key];
      });
      if (callback) callback();
    },
    _isPageVisible: true
  }, settings.overrides || {});
  return { page, calls };
}

(async () => {
  // 未绑定微信：去登录页
  let harness = createPage({ probe: { state: 'unbound' } });
  harness.page.onShow();
  assert.strictEqual(harness.page.data.portalAuthState, 'checking', '确认期间必须给出进度状态');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(harness.calls.reLaunch, ['/subpackages/main/pages/login/login'], '未绑定必须去登录页');

  // 已绑定微信：直接进门户，不再要求点一次登录
  harness = createPage({ probe: { state: 'authenticated', result: { status: 'login_success' } } });
  let continued = 0;
  harness.page.continuePortalShow = () => { continued += 1; };
  harness.page.onShow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(harness.calls.applied, [{ status: 'login_success' }], '必须落地微信会话');
  assert.strictEqual(continued, 1, '确认成功后必须继续加载门户');
  assert.deepStrictEqual(harness.calls.reLaunch, [], '已绑定不得再跳登录页');

  // 网络等失败：留在门户并给出重试，不得冒充未绑定
  harness = createPage({ probe: { state: 'unavailable' } });
  harness.page.onShow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(harness.calls.reLaunch, [], '无法确认登录状态时不得跳登录页');
  assert.strictEqual(harness.page.data.portalAuthState, 'unavailable', '必须提示可重试或手动登录');
  assert.strictEqual(harness.page.data.portalAuthFrozen, false);

  // 冻结账号：留在门户给出说明，用户可主动去登录
  harness = createPage({ probe: { state: 'frozen' } });
  harness.page.onShow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(harness.page.data.portalAuthFrozen, true);
  assert.deepStrictEqual(harness.calls.reLaunch, []);
  harness.page.logout();
  assert.deepStrictEqual(harness.calls.reLaunch, ['/subpackages/main/pages/login/login'], '手动登录入口必须可用');

  // 扫一扫：站内地址直接跳转
  harness = createPage({});
  harness.page.handleScanPayload('/subpackages/venue/pages/venueBooking/venueBooking');
  assert.deepStrictEqual(harness.calls.navigate, ['/subpackages/venue/pages/venueBooking/venueBooking']);
  assert.strictEqual(harness.calls.modal.length, 0);

  // 扫一扫：外部地址只展示与复制，不自动打开
  harness = createPage({});
  harness.page.handleScanPayload('https://example.com/abc');
  assert.strictEqual(harness.calls.navigate.length, 0, '外部地址不得直接跳转');
  assert.strictEqual(harness.calls.modal.length, 1, '外部地址必须只展示并让用户复制');
  assert.ok(harness.calls.modal[0].content.indexOf('https://example.com/abc') >= 0);
  harness.calls.modal[0].success({ confirm: true });
  assert.deepStrictEqual(harness.calls.clipboard, ['https://example.com/abc']);

  // 扫一扫：非站内路径不被信任导航放行
  harness = createPage({});
  harness.page.handleScanPayload('/subpackages/unknown/pages/whatever/whatever');
  assert.strictEqual(harness.calls.navigate.length, 0, '未登记路径不得跳转');
  assert.strictEqual(harness.calls.modal.length, 1);

  // 两个入口都走同一段扫描逻辑
  harness = createPage({ scanResult: '/subpackages/message/pages/messageCenter/messageCenter' });
  harness.page.onScanQuickTap();
  assert.strictEqual(harness.calls.scanned.length, 1, '快捷键入口必须能唤起相机');
  assert.deepStrictEqual(harness.calls.navigate, ['/subpackages/message/pages/messageCenter/messageCenter']);
  harness = createPage({ scanResult: '/subpackages/message/pages/messageCenter/messageCenter' });
  harness.page.data.portalCards = [
    { key: 'scan', label: '扫一扫', iconName: 'scan', url: '', action: 'scan', disabled: false }
  ];
  harness.page.onCardTap({ currentTarget: { dataset: { key: 'scan' } } });
  assert.strictEqual(harness.calls.scanned.length, 1, '应用服务卡片入口必须能唤起相机');

  console.log('门户扫一扫双入口与启动静默登录口径通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
