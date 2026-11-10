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
const url = '/subpackages/org/pages/assignmentNatures/assignmentNatures';
assert.equal(require('../miniprogram/utils/trustedNavigation').isTrustedRoute(url), true);
const markup = fs.readFileSync(path.resolve(__dirname, '../miniprogram/subpackages/scoring/pages/admin/adminWorkbenchContent.wxml'), 'utf8');
const editorLine = markup.split('\n').find(line => line.includes('<assignment-nature-editor '));
assert.ok(editorLine && editorLine.includes('wx:if="{{activeTab === \'assignmentNatures\' && hasPermission && permissionChecked}}"'), '编辑器须由当前页签与已确认读取权限共同控制');
assert.doesNotMatch(markup, /bindtap="openAssignmentNatures"/);
methods.applySubAppFilter.call(page, { authorizationAccess: access([]) });
assert.equal(page.data.visibleTabs.includes('assignmentNatures'), false, '撤销读取权限后不保留页签');
assert.equal(navigations.length, 0, '人事页签不应跳转独立页面');
console.log('岗位性质入口：独立读权、页签内编辑、撤权隐藏与旧深链白名单检查通过');
