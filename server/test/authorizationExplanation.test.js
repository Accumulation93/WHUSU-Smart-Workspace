'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explainCapabilities } = require('../src/core/services/authorizationExplanation');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const now = Date.parse('2026-10-31T00:00:00.000Z');
const actor = { active: true, organizationId: 'org', personId: 'p', role: 'user',
  assignment: { id: 'job', personId: 'p', organizationId: 'org', active: true, departmentId: 'd' } };
const policy = { id: 'r', organizationId: 'org', enabled: true, effect: 'allow',
  subjects: [{ kind: 'assignments', ids: ['job'] }], capabilities: ['venue.bookings.read'],
  scopes: [{ kind: 'self' }], fields: null };
function explain(entries, current = actor) {
  return explainCapabilities(current, entries, CATALOG, now).find(item => item.capability === 'venue.bookings.read');
}

test('有限范围只能表示有条件授权，不表示可读取全组织记录', () => {
  const result = explain([{ name: '本人借用', policy }]);
  assert.equal(result.status, 'conditional');
  assert.equal(result.reason, 'scope_and_business_check_required');
  assert.equal(result.grantState, 'granted');
  assert.equal(result.grantBasis, 'rule');
  assert.equal(result.hasRestrictions, false);
  assert.deepEqual(result.rules[0].scopes, [{ kind: 'self' }]);
  assert.equal(Object.hasOwn(result.rules[0], 'subjects'), false);
});

test('明确禁止优先，局部禁止仍保留范围说明', () => {
  const allow = { name: '允许', policy };
  const deny = { name: '禁止', policy: { ...policy, id: 'deny', effect: 'deny' } };
  assert.equal(explain([allow, deny]).status, 'conditional');
  assert.equal(explain([allow, deny]).grantState, 'granted');
  assert.equal(explain([allow, deny]).hasRestrictions, true);
  deny.policy.scopes = [{ kind: 'organization' }];
  assert.equal(explain([allow, deny]).reason, 'explicit_deny');
  assert.equal(explain([allow, deny]).grantState, 'blocked');
  assert.equal(explain([allow, deny]).grantBasis, 'none');
});

test('其他岗位、其他组织、停用及过期规则不贡献权限', () => {
  for (const change of [{ subjects: [{ kind: 'assignments', ids: ['other-job'] }] },
    { organizationId: 'other' }, { enabled: false }, { endsAt: '2026-10-31T00:00:00.000Z' },
    { startsAt: '2026-11-01T00:00:00.000Z' }]) {
    const result = explain([{ policy: { ...policy, ...change } }]);
    assert.equal(result.reason, 'business_relationship_required');
    assert.deepEqual(result.rules, []);
    assert.notEqual(result.status, 'conditional');
    assert.equal(result.grantState, 'not_granted');
    assert.equal(result.grantBasis, 'none');
  }
});

test('损坏规则拒绝普通授权，超级管理员仍须完成业务判断', () => {
  assert.equal(explain([{ policy: { ...policy, scopes: [] } }]).reason, 'invalid_policy');
  assert.equal(explain([{ policy: { ...policy, scopes: [] } }]).grantState, 'unavailable');
  const admin = { ...actor, role: 'admin', isSuper: true, adminGrantId: 'grant', assignment: null };
  assert.equal(explain([{ policy: {} }], admin).status, 'business_check_required');
  assert.equal(explain([{ policy: {} }], admin).grantState, 'granted');
  assert.equal(explain([{ policy: {} }], admin).grantBasis, 'super_admin');
  assert.deepEqual(explainCapabilities({ ...admin, active: false }, [], CATALOG, now), []);
});

test('岗位身份不能解释成具有系统治理权', () => {
  const result = explainCapabilities(actor, [], CATALOG, now);
  assert.equal(result.find(item => item.capability === 'authorization.rules.create').reason, 'governance_role_required');
  assert.equal(result.find(item => item.capability === 'authorization.rules.create').grantState, 'not_granted');
});

test('当前评分与公示活动的业务入口不扩展为管理目录权限', () => {
  const result = explainCapabilities(actor, [], CATALOG, now);
  assert.equal(result.find(item => item.capability === 'scoring.currentActivity.read').status, 'business_check_required');
  assert.equal(result.find(item => item.capability === 'scoring.currentActivity.read').grantState, 'not_granted');
  assert.equal(result.find(item => item.capability === 'scoring.currentActivity.read').businessEntry, true);
  assert.equal(result.find(item => item.capability === 'scoring.latestPublishedActivity.read').reason, 'business_relationship_required');
  assert.equal(result.find(item => item.capability === 'scoring.activities.read').status, 'denied');
  const deny = { name: '禁止查看', policy: { ...policy, effect: 'deny', scopes: [{ kind: 'organization' }], capabilities: ['scoring.currentActivity.read'] } };
  assert.equal(explainCapabilities(actor, [deny], CATALOG, now).find(item => item.capability === 'scoring.currentActivity.read').status, 'denied');
  assert.equal(explainCapabilities(actor, [deny], CATALOG, now).find(item => item.capability === 'scoring.currentActivity.read').grantState, 'blocked');
});

test('全目录保留未授权项目，已授权集合不混入业务关系入口', () => {
  const result = explainCapabilities(actor, [{ name: '组织范围读取', policy: { ...policy,
    scopes: [{ kind: 'organization' }] } }], CATALOG, now);
  assert.equal(result.length, CATALOG.size);
  assert.deepEqual(result.filter(item => item.grantState === 'granted').map(item => item.capability), ['venue.bookings.read']);
  assert.equal(result.find(item => item.capability === 'venue.bookings.read').hasRestrictions, false);
  assert.equal(result.find(item => item.capability === 'scoring.currentActivity.read').grantState, 'not_granted');
});

test('禁止部分资料项不伪装为整项禁止，保留两类规则供展开核对', () => {
  const definition = CATALOG.get('hr.people.read');
  assert(definition.fields.includes('name'));
  const allow = { ...policy, capabilities: ['hr.people.read'], scopes: [{ kind: 'organization' }] };
  const deny = { ...allow, id: 'deny-name', effect: 'deny', fields: ['name'] };
  const result = explainCapabilities(actor, [{ name: '允许读取', policy: allow }, { name: '限制姓名', policy: deny }], CATALOG, now)
    .find(item => item.capability === 'hr.people.read');
  assert.equal(result.grantState, 'granted');
  assert.equal(result.hasRestrictions, true);
  assert.deepEqual(result.rules.map(item => item.effect), ['allow', 'deny']);
});
