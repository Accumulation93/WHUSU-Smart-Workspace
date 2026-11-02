'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeRuleImpact, describeDelegationImpact } = require('../src/core/services/authorizationImpact');
const { normalizePolicy } = require('../src/core/services/authorizationPolicy');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const directory = {
  assignments: [{ assignmentId: 'a', personId: 'p', name: '甲', departmentId: 'd1' },
    { assignmentId: 'b', personId: 'p', name: '甲', departmentId: 'd2' },
    { assignmentId: 'c', personId: 'q', name: '甲', departmentId: 'd1' }],
  adminGrants: [{ adminGrantId: 'g', personId: 'p', name: '甲' }]
};
const policy = normalizePolicy({ id: 'r', organizationId: 'org', effect: 'allow', enabled: true,
  subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['d1'] } }],
  capabilities: ['venue.bookings.read'], scopes: [{ kind: 'organization' }], fields: null }, CATALOG);

test('预览按岗位匹配，同名不同人及一个人的管理身份均不混合', () => {
  const result = describeRuleImpact(null, policy, directory, 'org');
  assert.equal(result.peopleCount, 2);
  assert.equal(result.roleCount, 2);
  assert.deepEqual(result.roles.map(item => item.subjectId), ['a', 'c']);
  assert.equal(result.kind, 'rule_conditions');
});

test('切换指定岗位同时显示撤销和新增，不将两个岗位合并', () => {
  const before = { ...policy, subjects: [{ kind: 'assignments', ids: ['a'] }] };
  const after = { ...policy, subjects: [{ kind: 'assignments', ids: ['b'] }] };
  const result = describeRuleImpact(before, after, directory, 'org');
  assert.equal(result.peopleCount, 1);
  assert.equal(result.roleCount, 2);
  assert.equal(result.roles[0].after, null);
  assert.equal(result.roles[1].before, null);
});

test('删除禁止、修改数据范围、期限和停用均属于影响，未来授权不漏计', () => {
  const deny = { ...policy, effect: 'deny' };
  assert.equal(describeRuleImpact(deny, null, directory, 'org').roleCount, 2);
  assert.equal(describeRuleImpact(policy, { ...policy, scopes: [{ kind: 'self' }] }, directory, 'org').roleCount, 2);
  assert.equal(describeRuleImpact(policy, { ...policy, enabled: false }, directory, 'org').roleCount, 2);
  assert.equal(describeRuleImpact(null, { ...policy, startsAt: '2099-01-01T00:00:00.000Z' }, directory, 'org').roleCount, 2);
});

test('语义相同的条件顺序变化不制造权限变更，不跨组织预览', () => {
  const before = { ...policy, capabilities: ['venue.bookings.read', 'venue.bookings.create'] };
  const after = { ...before, capabilities: [...before.capabilities].reverse() };
  assert.equal(describeRuleImpact(before, after, directory, 'org').roleCount, 0);
  assert.equal(describeRuleImpact(null, policy, directory, 'other').roleCount, 0);
});

test('委托范围修改显示具体管理身份，不影响同人的普通岗位或既有业务授权', () => {
  const before = { organizationId: 'org', enabled: true,
    subjects: [{ kind: 'adminGrants', ids: ['g'] }], envelope: policy };
  const after = { ...before, envelope: { ...policy, capabilities: ['venue.bookings.read', 'venue.bookings.create'] } };
  const result = describeDelegationImpact(before, after, directory, 'org');
  assert.equal(result.kind, 'delegation_bounds');
  assert.equal(result.existingRulesUnchanged, true);
  assert.equal(result.peopleCount, 1);
  assert.equal(result.roleCount, 1);
  assert.deepEqual(result.roles.map(row => row.subjectId), ['g']);
  assert.deepEqual(result.roles[0].after.capabilities, after.envelope.capabilities);
  assert.equal(describeDelegationImpact(after, { ...after, name: '只改名' }, directory, 'org').roleCount, 0);
  assert.equal(describeDelegationImpact(null, after, directory, 'other').roleCount, 0);
});

test('撤销、停用和未来生效的委托均有完整预览，重复候选不多计', () => {
  const delegation = { organizationId: 'org', enabled: true,
    subjects: [{ kind: 'adminGrants', ids: ['g'] }],
    envelope: { ...policy, startsAt: '2099-01-01T00:00:00.000Z' } };
  const repeated = { ...directory, adminGrants: directory.adminGrants.concat(directory.adminGrants) };
  assert.equal(describeDelegationImpact(null, delegation, repeated, 'org').roleCount, 1);
  const removed = describeDelegationImpact(delegation, null, repeated, 'org');
  assert.equal(removed.roles[0].after, null);
  assert.equal(removed.roleCount, 1);
  assert.equal(describeDelegationImpact(delegation, { ...delegation, enabled: false }, directory, 'org').roleCount, 1);
  assert.equal(describeDelegationImpact(delegation, { ...delegation, envelope: { ...delegation.envelope, enabled: false } }, directory, 'org').roleCount, 1);
});
