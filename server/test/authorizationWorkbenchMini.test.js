'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const authorizationCopy = require('../../shared/locales/zh-CN/authorization');

function home({ role = 'user', profile = { name: '成员甲' } } = {}) {
  const filename = path.resolve(__dirname, '../../miniprogram/subpackages/workspace/pages/home/home.js');
  let definition, finish;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; },
    require(name) {
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      if (name.endsWith('/authorizationAccess')) return { readCurrentAuthorizationAccess: () => new Promise(resolve => { finish = resolve; }) };
      if (name.endsWith('/authorizationAccessView')) return require('../../shared/authorizationAccessView');
      if (name.endsWith('/deviceMetadataReport')) return { cancel() {} };
      if (name.endsWith('/orgSession')) return { getSnapshot: () => ({ role }), invalidateRequests() {} };
      if (name.endsWith('/authContext')) return { getRuntimeProfile: requested => requested === role ? profile : null };
      return {};
    }
  }, { filename });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), _isPageVisible: true,
    setData(patch) { Object.assign(this.data, patch); }, loadAuditBadgeCounts() {}, loadAuditVerificationAccess() {} };
  return { page, finish: value => finish(value) };
}

test('原人事、审核、评分页面按明确授权出现管理页签，业务关系权限不冒充管理权', async () => {
  for (const [subApp, capability] of [['hr', 'hr.people.read'], ['audit', 'audit.templates.create'], ['scoring', 'scoring.tasks.read']]) {
    const state = home();
    state.page._subApp = subApp;
    state.page.data.hasUser = true;
    state.page.applySubAppFilter();
    const pending = state.page.loadManagementAccess();
    state.finish({ mode: 'enforced', role: 'user', capabilities: [capability], grantedCapabilities: [capability] });
    await pending;
    assert(state.page.data.userTabs.some(tab => tab.key === 'management' && tab.label === authorizationCopy.businessManagement));
    state.page.switchUserTab({ currentTarget: { dataset: { tab: 'management' } } });
    assert.equal(state.page.data.activeTab, 'management');
    const revoke = state.page.loadManagementAccess();
    state.finish({ mode: 'enforced', role: 'user', capabilities: [capability], grantedCapabilities: [] });
    await revoke;
    assert.equal(state.page.data.canManageSubApp, false);
    assert.notEqual(state.page.data.activeTab, 'management');
  }
});

test('超级管理员使用同一业务工作台时保留深色身份卡并按授权打开管理页签', async () => {
  const profile = { name: '超级管理员甲', adminLevel: 'super_admin', identityModel: 'unified' };
  const { page, finish } = home({ role: 'admin', profile });
  page._subApp = 'hr';
  page._openManagementArea = true;
  page.refreshCurrentUser();
  assert.equal(page.data.heroTone, 'admin');
  assert.equal(page.data.isAdminRole, false);
  const pending = page.loadManagementAccess();
  finish({ mode: 'enforced', role: 'admin', capabilities: ['hr.people.read'], grantedCapabilities: ['hr.people.read'] });
  await pending;
  assert.equal(page.data.activeTab, 'management');
  assert.equal(page.data.heroTone, 'admin');
  const ordinary = home(); ordinary.page.refreshCurrentUser();
  assert.equal(ordinary.page.data.heroTone, 'blue');
});

test('页面隐藏后迟到授权不能恢复管理内容，触底只转发给当前工作台', async () => {
  const state = home();
  state.page._subApp = 'hr';
  const pending = state.page.loadManagementAccess();
  state.page.onHide();
  state.finish({ mode: 'enforced', role: 'user', grantedCapabilities: ['hr.people.read'] });
  await pending;
  assert.equal(state.page.data.canManageSubApp, false);
  let calls = 0;
  state.page.selectComponent = () => ({ workbenchReachBottom() { calls++; } });
  state.page.data.activeTab = 'profile';
  state.page.onReachBottom();
  assert.equal(calls, 0);
  state.page.data.activeTab = 'management';
  state.page.onReachBottom();
  assert.equal(calls, 1);
});

test('共享组件只初始化一次，页面隐藏和销毁清理，弹窗把键盘高度交给宿主', () => {
  const filename = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/adminWorkbench.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Component(value) { definition = value; }, require() { return {}; } }, { filename });
  const calls = [], events = [];
  const component = { data: { subApp: 'audit', dictionaryUsageDialog: { visible: false }, adminCandidatePickerVisible: true, dialogKeyboardHeight: 260 },
    workbenchLoad(options) { calls.push(options.subApp); }, workbenchShow() { calls.push('show'); },
    workbenchHide() { calls.push('hide'); }, workbenchUnload() { calls.push('unload'); },
    triggerEvent(name, detail) { events.push({ name, detail }); } };
  definition.lifetimes.attached.call(component);
  definition.pageLifetimes.show.call(component);
  assert.deepEqual(calls, ['audit', 'show']);
  Object.values(definition.observers)[0].call(component);
  assert.equal(events[0].detail.visible, true);
  assert.equal(events[0].detail.keyboardHeight, 260);
  definition.pageLifetimes.hide.call(component);
  definition.pageLifetimes.show.call(component);
  definition.lifetimes.detached.call(component);
  assert.deepEqual(calls, ['audit', 'show', 'hide', 'show', 'unload']);
  assert.equal(events.at(-1).detail.visible, false);
});
