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
  assert.deepEqual(result.rules[0].scopes, [{ kind: 'self' }]);
  assert.equal(Object.hasOwn(result.rules[0], 'subjects'), false);
});

test('明确禁止优先，局部禁止仍保留范围说明', () => {
  const allow = { name: '允许', policy };
  const deny = { name: '禁止', policy: { ...policy, id: 'deny', effect: 'deny' } };
  assert.equal(explain([allow, deny]).status, 'conditional');
  deny.policy.scopes = [{ kind: 'organization' }];
  assert.equal(explain([allow, deny]).reason, 'explicit_deny');
});

test('其他岗位、其他组织、停用及过期规则不贡献权限', () => {
  for (const change of [{ subjects: [{ kind: 'assignments', ids: ['other-job'] }] },
    { organizationId: 'other' }, { enabled: false }, { endsAt: '2026-10-31T00:00:00.000Z' },
    { startsAt: '2026-11-01T00:00:00.000Z' }]) {
    const result = explain([{ policy: { ...policy, ...change } }]);
    assert.equal(result.reason, 'business_relationship_required');
    assert.deepEqual(result.rules, []);
    assert.notEqual(result.status, 'conditional');
  }
});

test('损坏规则拒绝普通授权，超级管理员仍须完成业务判断', () => {
  assert.equal(explain([{ policy: { ...policy, scopes: [] } }]).reason, 'invalid_policy');
  const admin = { ...actor, role: 'admin', isSuper: true, adminGrantId: 'grant', assignment: null };
  assert.equal(explain([{ policy: {} }], admin).status, 'business_check_required');
  assert.deepEqual(explainCapabilities({ ...admin, active: false }, [], CATALOG, now), []);
});

test('岗位身份不能解释成具有系统治理权', () => {
  const result = explainCapabilities(actor, [], CATALOG, now);
  assert.equal(result.find(item => item.capability === 'authorization.rules.create').reason, 'governance_role_required');
});

test('当前评分与公示活动的业务入口不扩展为管理目录权限', () => {
  const result = explainCapabilities(actor, [], CATALOG, now);
  assert.equal(result.find(item => item.capability === 'scoring.currentActivity.read').status, 'business_check_required');
  assert.equal(result.find(item => item.capability === 'scoring.latestPublishedActivity.read').reason, 'business_relationship_required');
  assert.equal(result.find(item => item.capability === 'scoring.activities.read').status, 'denied');
  const deny = { name: '禁止查看', policy: { ...policy, effect: 'deny', scopes: [{ kind: 'organization' }], capabilities: ['scoring.currentActivity.read'] } };
  assert.equal(explainCapabilities(actor, [deny], CATALOG, now).find(item => item.capability === 'scoring.currentActivity.read').status, 'denied');
});
