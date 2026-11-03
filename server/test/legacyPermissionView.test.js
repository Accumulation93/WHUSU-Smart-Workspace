'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLegacyPermissionView } = require('../../shared/legacyPermissionView');
const copy = require('../../shared/locales/zh-CN/legacyPermissions');
const view = createLegacyPermissionView(copy);

test('旧权限目录只从前端语料解释已知键，不扩大未知权限的可编辑状态', () => {
  const groups = view.groups([{ key: 'system', label: 'SERVER_GROUP', description: 'SERVER_DESCRIPTION', permissions: [
    { key: 'system.admin_accounts.read', label: 'SERVER_LABEL', description: 'SERVER_HELP', editable: true, granted: true },
    { key: 'scoring.templates.delete', editable: true, granted: false },
    { key: 'unknown', label: 'SERVER_UNKNOWN', editable: true, granted: true },
    { key: 'auth.accounts.audit', editable: true }
  ] }]);
  assert.equal(groups[0].label, copy.groups.system);
  assert.equal(groups[0].description, '');
  assert.equal(groups[0].permissions.length, 3);
  assert.equal(groups[0].permissions[0].label, copy.permissions['system.admin_accounts.read'][0]);
  assert.equal(groups[0].permissions[0].granted, true);
  assert.equal(groups[0].permissions[1].label, copy.deletePermissions['scoring.templates']);
  assert.equal(groups[0].permissions[2].label, copy.unknown);
  assert.equal(groups[0].permissions[2].editable, false);
  assert.equal(JSON.stringify(groups).includes('SERVER_'), false);
  assert.equal(view.groups([{ key: 'new-group', permissions: [{ key: 'hr.people', editable: true }] }])[0].permissions[0].editable, true);
});

test('管理员级别和认证状态只解释稳定枚举，未知值不冒充已认证', () => {
  for (const state of Object.keys(copy.accountStates)) {
    const result = view.admin({ name: '真实姓名', adminLevel: 'admin', authenticationStatus: state,
      adminLevelLabel: 'SERVER_ROLE', bindStatusLabel: 'SERVER_STATE' });
    assert.equal(result.name, '真实姓名');
    assert.equal(result.adminLevelLabel, copy.adminLevels.admin);
    assert.equal(result.bindStatusLabel, copy.accountStates[state]);
  }
  const unknown = view.admin({ adminLevel: 'new', authenticationStatus: 'new' });
  assert.equal(unknown.adminLevelLabel, copy.unknownAdminLevel);
  assert.equal(unknown.bindStatusLabel, copy.unknownAccountState);
});
