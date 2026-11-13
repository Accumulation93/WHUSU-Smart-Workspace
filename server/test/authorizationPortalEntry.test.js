'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const { configurationCopyOptions, canOpenAuthorization } = require('../../shared/authorizationEntryView');

function harness() {
  const file = path.resolve(__dirname, '../../miniprogram/utils/adminPermissions.js');
  const localRequire = createRequire(file);
  let snapshot = { role: 'admin', orgId: 'org', contextId: 'context' };
  let profile = { adminLevel: 'super_admin', organizationId: 'org' };
  let access = { mode: 'enforced', canManageAuthorization: true, grantedCapabilities: ['authorization.rules.read'], capabilities: ['authorization.rules.read'] }, failFirst = false;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require(name) {
    if (name === './api') return { callFunction: async () => { if (failFirst) throw new Error('first request'); return { status: 'success', organizationId: 'org', permissions: {}, canAccessPermissionSystem: true }; } };
    if (name === './orgSession') return { getSnapshot: () => snapshot, isCurrent: value => value === snapshot };
    if (name === './authContext') return { getRuntimeProfile: () => profile, updateRuntimeProfile(_role, value) { profile = value; return value; } };
    if (name === './authorizationAccess') return { readCurrentAuthorizationAccess: async () => { if (access instanceof Error) throw access; return access; } };
    return localRequire(name);
  } }, { filename: file });
  return { permissions: module.exports, profile: () => profile, fail() { access = new Error('network'); },
    failFirst() { failFirst = true; }, nullAccess() { access = null; },
    switchRole() { snapshot = { role: 'user', orgId: 'org', contextId: 'next' }; } };
}

test('管理员刷新保存真实能力；失败清空能力并拒绝所有管理入口，不伪造模式', async () => {
  const state = harness();
  await state.permissions.refreshMyPermissions();
  assert.equal(state.profile().authorizationAccess.mode, 'enforced');
  assert.equal(state.permissions.canAccessPermissionSystem(state.profile()), true);
  state.fail();
  await assert.rejects(state.permissions.refreshMyPermissions(), /network/);
  assert.equal(state.profile().authorizationAccess, null);
  assert.equal(state.profile().authorizationAccessUnavailable, true);
  assert.equal(state.permissions.canAccessPermissionSystem(state.profile()), false);
  assert.equal(state.permissions.hasAny(state.profile(), ['anything']), false);
  assert.equal(state.permissions.filterTabs(['hrInfo'], state.profile()).length, 0);
});

test('迟到管理员权限不能覆盖切换后的普通岗位', async () => {
  const state = harness(), original = state.profile();
  const pending = state.permissions.refreshMyPermissions();
  state.switchRole();
  assert.equal(await pending, null);
  assert.equal(state.profile(), original);
});

test('首个权限读取失败或当前能力为空时均关闭旧管理入口', async () => {
  for (const failure of ['failFirst', 'nullAccess']) {
    const state = harness(); await state.permissions.refreshMyPermissions(); state[failure]();
    await assert.rejects(state.permissions.refreshMyPermissions());
    assert.equal(state.profile().authorizationAccessUnavailable, true);
    assert.equal(state.profile().authorizationAccess, null);
    assert.equal(state.permissions.canAccessPermissionSystem(state.profile()), false);
  }
});

test('复制入口按具体类型与分享接收分开；仅接收部门默认进入接收列表', () => {
  const access = { mode: 'enforced', grantedCapabilities: ['hr.departments.receive'] };
  assert.deepEqual(configurationCopyOptions(access, 'venue.purposes', 'source'), {
    kinds: ['hr.departments'], kind: 'hr.departments', tabs: ['incoming', 'drafts'], tab: 'incoming'
  });
  assert.equal(configurationCopyOptions({ mode: 'shadow', grantedCapabilities: access.grantedCapabilities }).kind, '');
});

test('原生门户权限卡真实页面定义直达新版，普通岗位不出现治理入口', () => {
  const file = path.resolve(__dirname, '../../miniprogram/subpackages/main/pages/portal/portal.js');
  const localRequire = createRequire(file); let definition, role = 'admin';
  const permission = harness().permissions;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(value) { definition = value; }, require(name) {
    if (name.endsWith('/orgSession')) return { getSnapshot: () => ({ role }) };
    if (name.endsWith('/authContext')) return { getRuntimeProfile: () => ({ name: 'Admin', adminLevel: 'super_admin' }) };
    if (name.endsWith('/adminPermissions')) return permission;
    if (name.includes('/locales/') || name.endsWith('/authorizationEntryView')) return localRequire(name);
    return {};
  } }, { filename: file });
  const page = Object.assign({}, definition, { setData() {}, _applyAppFilter() {} });
  assert.equal(page.refreshCurrentUser().portalCards.find(card => card.key === 'permissions').url, '/subpackages/org/pages/authorization/authorization');
  role = 'user'; page._copyEntryAllowed = true;
  const cards = page.refreshCurrentUser().portalCards;
  assert.equal(cards.some(card => card.key === 'permissions'), false);
  assert.equal(cards.some(card => card.key === 'organizationCopy'), true);
  page._authorizationEntryAllowed = true;
  assert.equal(page.refreshCurrentUser().portalCards.filter(card => card.key === 'permissions').length, 1);
  page._authorizationEntryAllowed = false;
  assert.equal(page.refreshCurrentUser().portalCards.some(card => card.key === 'permissions'), false);
});

test('权限入口仅采用明确资格，不从业务能力或治理读取能力猜测', () => {
  assert.equal(canOpenAuthorization({ mode: 'enforced', canManageAuthorization: true }), true);
  assert.equal(canOpenAuthorization({ mode: 'enforced', canInspectAuthorization: true }), true);
  assert.equal(canOpenAuthorization({ mode: 'enforced', grantedCapabilities: ['authorization.rules.read', 'venue.bookings.read'] }), false);
  assert.equal(canOpenAuthorization({ mode: 'enforced', canManageAuthorization: 'true' }), false);
  assert.equal(canOpenAuthorization({ mode: 'shadow', canManageAuthorization: true }), false);
  assert.equal(canOpenAuthorization(null), false);
});
