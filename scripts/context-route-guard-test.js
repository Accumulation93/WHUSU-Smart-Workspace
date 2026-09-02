const assert = require('assert');
const fs = require('fs');
const path = require('path');

const navigationCalls = [];
global.wx = {
  navigateBack: function() { navigationCalls.push({ type: 'back' }); },
  reLaunch: function(options) { navigationCalls.push({ type: 'portal', url: options.url }); }
};

const guard = require('../miniprogram/utils/contextRouteGuard');

assert.strictEqual(guard.finishSwitch(), 'portal');
assert.deepStrictEqual(navigationCalls, [{
  type: 'portal',
  url: '/subpackages/main/pages/portal/portal'
}]);
assert.strictEqual(navigationCalls.some(function(item) { return item.type === 'back'; }), false);

const root = path.resolve(__dirname, '..');
const portalWxml = fs.readFileSync(
  path.join(root, 'miniprogram/subpackages/main/pages/portal/portal.wxml'),
  'utf8'
);
const heroSource = fs.readFileSync(
  path.join(root, 'miniprogram/components/workspace-hero/workspace-hero.js'),
  'utf8'
);
assert.match(portalWxml, /tone="\{\{isAdminRole \? 'admin' : 'blue'\}\}"/);
assert.doesNotMatch(heroSource, /roleProfiles|accountProfile/);

console.log('工作角色切换重建页面栈测试通过');
