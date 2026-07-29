const assert = require('assert');

let pageStack = [];
const navigationCalls = [];
global.wx = {
  getStorageSync: function() { return ''; },
  navigateBack: function() { navigationCalls.push({ type: 'back' }); },
  reLaunch: function(options) { navigationCalls.push({ type: 'portal', url: options.url }); }
};
global.getCurrentPages = function() { return pageStack; };

const guard = require('../miniprogram/utils/contextRouteGuard');

function activated(role, permissions, adminLevel) {
  return {
    context: { role: role },
    user: {
      adminLevel: adminLevel || '',
      permissions: permissions || {}
    }
  };
}

assert.strictEqual(
  guard.isPageSupported({ route: 'pages/home/home', _subApp: 'hr' }, activated('user')),
  true,
  '普通岗位应继续停留在普通用户子应用'
);
assert.strictEqual(
  guard.isPageSupported({ route: 'pages/home/home', _subApp: 'hr' }, activated('admin', { 'hr.people': true })),
  false,
  '切换到管理身份后不应留在普通用户子应用'
);
assert.strictEqual(
  guard.isPageSupported(
    { route: 'subpackages/scoring/pages/admin/admin', _subApp: 'hr' },
    activated('admin', { 'hr.people': true })
  ),
  true,
  '具备人事权限的管理员应继续停留在人事管理页'
);
assert.strictEqual(
  guard.isPageSupported(
    { route: 'subpackages/scoring/pages/admin/admin', _subApp: 'hr' },
    activated('admin', { 'scoring.activities': true })
  ),
  false,
  '不具备人事权限的管理员应返回门户'
);
assert.strictEqual(
  guard.isPageSupported(
    { route: 'subpackages/scoring/pages/admin/admin', _subApp: 'scoring' },
    activated('user')
  ),
  false,
  '切换到普通岗位后不应留在管理子应用'
);
assert.strictEqual(
  guard.isPageSupported(
    { route: 'subpackages/venue/pages/venueManage/venueManage' },
    activated('admin', {}, 'super_admin')
  ),
  true,
  '超级管理员应继续使用场地管理'
);
assert.strictEqual(
  guard.isPageSupported(
    { route: 'subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals' },
    activated('admin', { 'venue.approvals': true })
  ),
  true,
  '具备审批权限的管理员应继续使用场地待审批页'
);
assert.strictEqual(
  guard.isPageSupported(
    { route: 'subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals' },
    activated('admin', { 'venue.resources': true })
  ),
  false,
  '缺少审批权限的管理员应返回门户'
);
assert.strictEqual(
  guard.isPageSupported({ route: 'pages/messageCenter/messageCenter' }, activated('user')),
  true,
  '消息中心应支持所有已登录身份'
);

pageStack = [
  { route: 'subpackages/scoring/pages/admin/admin', _subApp: 'hr' },
  { route: 'subpackages/org/pages/identitySwitch/identitySwitch' }
];
assert.strictEqual(guard.finishSwitch(activated('user')), 'portal');
assert.deepStrictEqual(navigationCalls.pop(), { type: 'portal', url: '/pages/portal/portal' });

pageStack = [
  { route: 'subpackages/scoring/pages/admin/admin', _subApp: 'hr' },
  { route: 'subpackages/org/pages/identitySwitch/identitySwitch' }
];
assert.strictEqual(guard.finishSwitch(activated('admin', { 'hr.people': true })), 'back');
assert.deepStrictEqual(navigationCalls.pop(), { type: 'back' });

console.log('context route guard tests passed');
