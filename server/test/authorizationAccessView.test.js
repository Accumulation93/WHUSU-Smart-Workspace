'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bindAccess, hasCapability, managementTabAllowed } = require('../../shared/authorizationAccessView');
const context = { organizationId: 'org', contextId: 'job', role: 'user' };
const response = { ...context, mode: 'enforced', revision: 2,
  capabilities: ['venue.bookings.read', 'audit.templates.create'], grantedCapabilities: ['audit.templates.create'] };

test('当前岗位业务入口不扩大成管理入口，动作不能互相替代', () => {
  const access = bindAccess(response, context);
  assert.equal(hasCapability(access, 'venue.bookings.read'), true);
  assert.equal(hasCapability(access, 'venue.bookings.read', true), false);
  assert.equal(hasCapability(access, 'audit.templates.create', true), true);
  assert.equal(hasCapability(access, 'audit.templates.update', true), false);
  assert.equal(hasCapability(access, 'audit.templates', true), false);
});

test('跨组织、跨岗位、角色改变及损坏响应全部拒绝', () => {
  for (const change of [{ organizationId: 'other' }, { contextId: 'other' }, { role: 'admin' },
    { mode: 'unknown' }, { capabilities: null }, { grantedCapabilities: ['auth.accounts.update'] }]) {
    assert.equal(bindAccess({ ...response, ...change }, context), null);
  }
  assert.equal(bindAccess(response, null), null);
});

test('shadow不使用试算能力，绑定结果不受原数组后续变化影响', () => {
  const input = { ...response, capabilities: response.capabilities.slice(), grantedCapabilities: response.grantedCapabilities.slice() };
  const access = bindAccess(input, context);
  input.grantedCapabilities.push('venue.bookings.read');
  assert.equal(hasCapability(access, 'venue.bookings.read', true), false);
  assert.equal(hasCapability(bindAccess({ ...response, mode: 'shadow' }, context), 'audit.templates.create', true), false);
});

test('两端管理页签按明确动作登记，未来新增动作不自动出现入口', () => {
  const access = bindAccess(response, context);
  assert.equal(managementTabAllowed(access, 'auditTemplates'), true);
  assert.equal(managementTabAllowed(access, 'auditSubmissions'), false);
  assert.equal(managementTabAllowed(access, '__proto__'), false);
  const future = bindAccess({ ...response, capabilities: ['scoring.activities.future'], grantedCapabilities: ['scoring.activities.future'] }, context);
  assert.equal(managementTabAllowed(future, 'activities'), false);
});

test('场地管理分别识别资源、借用、审批与事由，不把普通查看权当管理权', () => {
  const make = granted => bindAccess({ ...response, capabilities: ['venue.bookings.read', ...granted], grantedCapabilities: granted }, context);
  assert.equal(managementTabAllowed(make([]), 'bookings'), false);
  assert.equal(managementTabAllowed(make(['venue.bookings.approve']), 'pending'), true);
  assert.equal(managementTabAllowed(make(['venue.bookings.approve']), 'venue'), false);
  assert.equal(managementTabAllowed(make(['venue.approvals.update']), 'venue'), true);
  assert.equal(managementTabAllowed(make(['venue.approvals.update']), 'pending'), false);
  assert.equal(managementTabAllowed(make(['venue.purposes.create']), 'purposes'), true);
  assert.equal(managementTabAllowed(make(['venue.purposes.share']), 'purposes'), false);
});
