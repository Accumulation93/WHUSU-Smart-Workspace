'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fields = require('../src/core/models/authorizationProfileFields');
const { normalizePolicy, evaluate, canDelegate } = require('../src/core/services/authorizationPolicy');

const definition = { resourceType: 'hr.people', scopes: ['organization', 'records'], fields: ['name'],
  profileFieldKeys: true, adminOnlyFields: [] };
const base = new Map([['hr.people.read', definition], ['venue.read', { ...definition, profileFieldKeys: false }]]);
const actor = { active: true, organizationId: 'org', personId: 'person', role: 'admin', adminGrantId: 'grant' };
const resource = { id: 'member', type: 'hr.people', organizationId: 'org' };
const policy = { id: 'rule', organizationId: 'org', effect: 'allow', enabled: true,
  subjects: [{ kind: 'adminGrants', ids: ['grant'] }], capabilities: ['hr.people.read'],
  scopes: [{ kind: 'organization' }], fields: ['profile:phone'], startsAt: null, endsAt: null };

test('动态字段目录仅按组织读取有效定义，保持静态能力目录不变', async () => {
  const catalog = await fields.catalog({ async query(sql, params) {
    assert.match(sql, /s\.org_id=\? AND f\.is_active=1/);
    assert.deepEqual(params, ['org']);
    return [[{ id: 'phone', label: '联系电话', type: 'text' }]];
  } }, 'org', base);
  assert.deepEqual(catalog.get('hr.people.read').fields, ['name', 'profile:phone']);
  assert.equal(catalog.get('hr.people.read').fieldLabels['profile:phone'], '联系电话');
  assert.deepEqual(base.get('hr.people.read').fields, ['name']);
  const input = { actor, resource, capability: 'hr.people.read', policies: [policy], catalog, now: Date.now(), businessAllowed: true };
  assert.deepEqual(evaluate(input).fields, ['profile:phone']);
  assert.equal(evaluate({ ...input, requestedFields: ['name'] }).allowed, false);
  assert.equal(evaluate({ ...input, requestedFields: ['profile:other'] }).allowed, false);
});

test('字段编号支持完整业务主键，不能跨能力授予或绕过委托字段范围', () => {
  const fullKey = 'profile:' + 'a'.repeat(64);
  assert.deepEqual(normalizePolicy({ ...policy, fields: [fullKey] }, base).fields, [fullKey]);
  assert.throws(() => normalizePolicy({ ...policy, fields: [fullKey + 'a'] }, base));
  assert.throws(() => normalizePolicy({ ...policy, capabilities: ['venue.read'] }, base));
  assert.equal(canDelegate(policy, { ...policy, fields: ['profile:other'] }, base), false);
  assert.equal(canDelegate(policy, policy, base), true);
  const result = evaluate({ actor, resource, capability: 'hr.people.read', policies: [policy], catalog: base,
    now: Date.now(), businessAllowed: true, requestedFields: ['profile:phone'] });
  assert.equal(result.allowed, false);
});

test('普通岗位即使获授补充资料列也不能取得受保护身份字段', async () => {
  const catalog = await fields.catalog({ async query() {
    return [[{ id: 'student', label: '学号', type: 'text' }, { id: 'phone', label: '联系电话', type: 'text' }]];
  } }, 'org', base);
  const user = { ...actor, role: 'user', adminGrantId: null,
    assignment: { id: 'job', active: true, organizationId: 'org', personId: 'person' } };
  const grant = { ...policy, subjects: [{ kind: 'assignments', ids: ['job'] }], fields: ['profile:student', 'profile:phone'] };
  const input = { actor: user, resource, capability: 'hr.people.read', policies: [grant], catalog,
    now: Date.now(), businessAllowed: true };
  assert.deepEqual(evaluate(input).fields, ['profile:phone']);
  assert.equal(evaluate({ ...input, requestedFields: ['profile:student'] }).allowed, false);
});
