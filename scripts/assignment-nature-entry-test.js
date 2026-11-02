'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const accessView = require('../shared/authorizationAccessView');
const access = capabilities => ({ mode: 'enforced', capabilities, grantedCapabilities: capabilities });
assert.equal(accessView.managementTabAllowed(access(['hr.assignmentNatures.read']), 'assignmentNatures'), true);
for (const keys of [[], ['hr.people.read'], ['hr.assignmentNatures.create'], ['hr.departments.read']]) {
  assert.equal(accessView.managementTabAllowed(access(keys), 'assignmentNatures'), false);
}
global.Behavior = value => value;
global.wx = { getStorageSync() {}, getSystemInfoSync: () => ({ windowWidth: 390 }) };
const filename = path.resolve(__dirname, '../miniprogram/subpackages/scoring/package-resources/subpackages/scoring/pages/admin/adminWorkbenchBehavior.js');
const localRequire = createRequire(filename);
const navigations = [];
const context = { module: { exports: {} }, Behavior: value => value,
  require(name) { return name.endsWith('/trustedNavigation') ? { navigateToTrustedRoute: url => navigations.push(url) } : localRequire(name); }
};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
const methods = context.module.exports.methods;
const page = { _subApp: 'hr', _pageVisible: true,
  data: { authorizationEnforced: true, actionCapabilities: { 'hr.assignmentNatures.read': true } },
  setData(patch) { Object.assign(this.data, patch); } };
methods.applySubAppFilter.call(page, { authorizationAccess: access(['hr.assignmentNatures.read']) });
assert.deepEqual(Array.from(page.data.visibleTabs), ['assignmentNatures']);
assert.equal(page.data.activeTab, 'assignmentNatures');
methods.openAssignmentNatures.call(page);
const url = '/subpackages/org/pages/assignmentNatures/assignmentNatures';
assert.deepEqual(navigations, [url]);
assert.equal(require('../miniprogram/utils/trustedNavigation').isTrustedRoute(url), true);
page.data.actionCapabilities = {};
methods.openAssignmentNatures.call(page);
page._pageVisible = false; page.data.actionCapabilities = { 'hr.assignmentNatures.read': true };
methods.openAssignmentNatures.call(page);
assert.equal(navigations.length, 1, '撤权或隐藏后不得从旧入口跳转');
console.log('岗位性质入口：独立读权、实际人事页签、真实导航白名单及撤权隐藏检查通过');
