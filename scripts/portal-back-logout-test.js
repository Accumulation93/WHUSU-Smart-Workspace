const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  getPortalExitTargetRoute,
  shouldClearAuthenticationOnPortalExit
} = require('../miniprogram/utils/portalExit');

const loginPage = { route: 'pages/login/login' };
const portalPage = { route: 'pages/portal/portal' };
const businessPage = { route: 'pages/home/home' };

assert.strictEqual(
  shouldClearAuthenticationOnPortalExit([loginPage, portalPage], portalPage),
  true,
  '门户从页面栈返回登录页时必须退出登录'
);
assert.strictEqual(
  shouldClearAuthenticationOnPortalExit([loginPage], portalPage),
  true,
  '门户卸载后页面栈只剩登录页时必须退出登录'
);
assert.strictEqual(
  shouldClearAuthenticationOnPortalExit([portalPage], portalPage),
  false,
  '关闭唯一门户页面时不能误判为返回登录页'
);
assert.strictEqual(
  shouldClearAuthenticationOnPortalExit([portalPage, businessPage], portalPage),
  false,
  '进入业务页面时不能清除登录状态'
);
assert.strictEqual(
  shouldClearAuthenticationOnPortalExit([loginPage, portalPage, businessPage], portalPage),
  false,
  '门户隐藏在业务页面下方时不能把历史登录页误判为返回目标'
);
assert.strictEqual(getPortalExitTargetRoute([], portalPage), '', '空页面栈不应产生退出目标');

const portalSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'miniprogram', 'pages', 'portal', 'portal.js'),
  'utf8'
);
const loginSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'miniprogram', 'pages', 'login', 'login.js'),
  'utf8'
);
assert.match(
  portalSource,
  /shouldClearAuthenticationOnPortalExit\(getCurrentPages\(\), this\)/,
  '门户卸载时必须判断是否返回登录页'
);
assert.match(
  portalSource,
  /if \(returningToLogin\) authContext\.clearUnifiedAuthentication\(\)/,
  '门户返回登录页时必须复用完整退出登录清理'
);
assert.match(
  loginSource,
  /wx\.navigateTo\(\{[\s\S]*url: '\/pages\/portal\/portal'/,
  '登录成功必须保留登录页，使门户显示原生返回键'
);
assert.doesNotMatch(
  loginSource,
  /wx\.redirectTo\(\{ url: '\/pages\/portal\/portal' \}\)/,
  '登录成功不能替换登录页，否则门户不会显示原生返回键'
);
assert.match(
  fs.readFileSync(
    path.resolve(__dirname, '..', 'miniprogram', 'pages', 'login', 'login.wxml'),
    'utf8'
  ),
  /<viewport-portal\s+wx:if="\{\{stage !== 'login'\}\}">/,
  '登录页认证弹层关闭时必须卸载，不能覆盖已经进入的门户页面'
);
assert.match(
  portalSource,
  /previousPage\.route === 'pages\/login\/login'[\s\S]*wx\.navigateBack\(\)/,
  '门户显式退出时应返回现有登录页，避免叠加重复登录页'
);
assert.match(
  portalSource,
  /wx\.reLaunch\(\{ url: '\/pages\/login\/login' \}\)/,
  '门户没有历史登录页时应重建干净的登录页'
);

console.log('门户返回登录页退出测试通过。');
