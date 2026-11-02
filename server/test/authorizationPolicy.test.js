'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizePolicy, preparePolicies, evaluate, canDelegate, projectFields } = require('../src/core/services/authorizationPolicy');

const catalog = new Map([
  ['hr.read', { scopes: ['organization', 'self', 'records', 'assignmentScope'], fields: ['name', 'phone', 'studentId'], adminOnlyFields: ['studentId'], businessRoles: ['user'] }],
  ['venue.delete', { scopes: ['organization', 'records'], fields: [], adminOnlyFields: [] }],
  ['accounts.manage', { scopes: ['organization'], fields: [], adminOnlyFields: [], governance: true }],
  ['permissions.delegate', { scopes: ['organization'], fields: [], adminOnlyFields: [], governance: true, delegation: true }]
]);
const assignment = { id: 'job-a', personId: 'person-a', organizationId: 'org-a', active: true,
  natureId: 'staff', departmentId: 'dept-a', identityCategoryId: 'leader', workGroupId: 'group-a' };
const actor = { personId: 'person-a', organizationId: 'org-a', active: true, role: 'user', assignment };
const resource = { id: 'record-a', organizationId: 'org-a', ownerPersonId: 'person-b', assignment: {
  id: 'job-b', personId: 'person-b', organizationId: 'org-a', active: true,
  natureId: 'staff', departmentId: 'dept-a', identityCategoryId: 'member', workGroupId: 'group-b'
} };
function policy(overrides = {}) {
  return Object.assign({ id: 'allow-a', organizationId: 'org-a', effect: 'allow', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['job-a'] }], capabilities: ['hr.read'],
    scopes: [{ kind: 'organization' }], fields: null, startsAt: null, endsAt: null }, overrides);
}
function decision(policies, overrides = {}) {
  return evaluate(Object.assign({ actor, resource, capability: 'hr.read', policies, catalog,
    now: Date.parse('2026-10-31T00:00:00.000Z'), businessAllowed: true }, overrides));
}

test('未授权、未知能力、缺少业务校验均拒绝', () => {
  assert.equal(decision([]).allowed, false);
  assert.equal(decision([policy()], { capability: 'unknown' }).reason, 'unknown_capability');
  assert.equal(decision([policy()], { businessAllowed: undefined }).reason, 'business_requirement');
});

test('既有业务读取需要目录明确登记且调用方实际确认，不能扩展新增能力', () => {
  assert.equal(decision([], { businessGranted: true }).allowed, true);
  assert.equal(decision([], { businessGranted: true, capability: 'venue.delete' }).allowed, false);
  assert.equal(decision([], { businessGranted: true, capability: 'accounts.manage' }).allowed, false);
  assert.equal(decision([], { businessGranted: true, businessAllowed: false }).allowed, false);
  assert.equal(decision([], { businessGranted: true, resource: { ...resource, organizationId: 'another' } }).allowed, false);
  assert.equal(decision([], { businessGranted: true, actor: { ...actor, role: 'admin', adminGrantId: 'grant' } }).allowed, false);
});

test('既有业务读取仍服从明确禁止、字段保护和损坏规则拒绝', () => {
  const deny = policy({ effect: 'deny', fields: ['phone'] });
  assert.deepEqual(decision([deny], { businessGranted: true }).fields, ['name']);
  assert.equal(decision([deny], { businessGranted: true, requestedFields: ['phone'] }).allowed, false);
  assert.equal(decision([policy({ effect: 'deny' })], { businessGranted: true }).allowed, false);
  assert.equal(decision([{ invalid: true }], { businessGranted: true }).allowed, false);
});

test('组织、岗位归属和当前工作角色必须一致', () => {
  assert.equal(decision([policy()]).allowed, true);
  assert.equal(decision([policy()], { resource: Object.assign({}, resource, { organizationId: 'org-b' }) }).allowed, false);
  assert.equal(decision([policy()], { actor: Object.assign({}, actor, { assignment: Object.assign({}, assignment, { id: 'job-other' }) }) }).allowed, false);
  assert.equal(decision([policy()], { actor: Object.assign({}, actor, { assignment: Object.assign({}, assignment, { personId: 'another' }) }) }).allowed, false);
  assert.equal(decision([policy()], { actor: Object.assign({}, actor, { active: false }) }).allowed, false);
});

test('同岗位属性同时匹配，不能使用其他岗位拼凑', () => {
  const input = policy({ subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'], identityCategoryId: ['leader'] } }] });
  assert.equal(decision([input]).allowed, true);
  const other = Object.assign({}, actor, { assignment: Object.assign({}, assignment, { identityCategoryId: 'member' }),
    assignments: [assignment] });
  assert.equal(decision([input], { actor: other }).allowed, false);
});

test('动态数据范围按本条岗位匹配，失效岗位不匹配', () => {
  const input = policy({ scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: 'same', identityCategoryId: ['member'] } }] });
  assert.equal(decision([input]).allowed, true);
  const unrelated = Object.assign({}, resource, { assignment: Object.assign({}, resource.assignment, { departmentId: 'dept-b' }), assignments: [resource.assignment] });
  assert.equal(decision([input], { resource: unrelated }).allowed, false);
  const inactive = Object.assign({}, resource, { assignment: Object.assign({}, resource.assignment, { active: false }) });
  assert.equal(decision([input], { resource: inactive }).allowed, false);
});

test('禁止优先，但仅影响匹配的记录', () => {
  const deny = policy({ id: 'deny-a', effect: 'deny', scopes: [{ kind: 'records', ids: ['record-a'] }] });
  assert.equal(decision([policy(), deny]).reason, 'explicit_deny');
  assert.equal(decision([policy(), deny], { resource: Object.assign({}, resource, { id: 'record-b' }) }).allowed, true);
});

test('字段授权不能扩散到其他人员，字段禁止从合并结果扣除', () => {
  const phone = policy({ scopes: [{ kind: 'records', ids: ['record-b'] }], fields: ['phone'] });
  const name = policy({ id: 'name', scopes: [{ kind: 'records', ids: ['record-a'] }], fields: ['name'] });
  assert.deepEqual(decision([phone, name]).fields, ['name']);
  const denyPhone = policy({ id: 'deny-phone', effect: 'deny', fields: ['phone'] });
  assert.deepEqual(decision([policy(), denyPhone]).fields, ['name']);
  assert.deepEqual(projectFields({ name: 'fixture', phone: '123', studentId: 'secret' }, decision([phone, name])), { name: 'fixture' });
});

test('普通岗位不能取得受保护学号或系统治理能力', () => {
  assert.deepEqual(decision([policy()]).fields, ['name', 'phone']);
  assert.throws(() => normalizePolicy(policy({ capabilities: ['accounts.manage'] }), catalog));
  assert.equal(decision([], { capability: 'accounts.manage' }).reason, 'governance_role_required');
});

test('字段写入必须整单获权，不能忽略越权字段后保存其余字段', () => {
  assert.equal(decision([policy({ fields: ['name'] })], { requestedFields: ['name'] }).allowed, true);
  assert.equal(decision([policy({ fields: ['name'] })], { requestedFields: ['name', 'phone'] }).reason, 'field_not_granted');
  assert.equal(decision([policy()], { requestedFields: ['studentId'] }).reason, 'field_not_granted');
  assert.equal(decision([policy()], { requestedFields: ['unknown'] }).reason, 'unknown_field');
});

test('能力不能用于其他类型的同组织资源', () => {
  const scopedCatalog = new Map(catalog);
  scopedCatalog.set('hr.read', Object.assign({}, catalog.get('hr.read'), { resourceType: 'people' }));
  assert.equal(decision([policy()], { catalog: scopedCatalog }).allowed, false);
  assert.equal(decision([policy()], { catalog: scopedCatalog, resource: Object.assign({}, resource, { type: 'people' }) }).allowed, true);
});

test('超级管理员保留管理能力，但仍需组织、业务和账号有效', () => {
  const superActor = Object.assign({}, actor, { role: 'admin', adminGrantId: 'grant-a', isSuper: true });
  assert.equal(decision([policy({ effect: 'deny' })], { actor: superActor }).reason, 'super_admin');
  assert.equal(decision([], { actor: superActor, businessAllowed: false }).allowed, false);
  assert.equal(decision([], { actor: Object.assign({}, superActor, { active: false }) }).allowed, false);
  assert.equal(decision([], { actor: superActor, resource: Object.assign({}, resource, { organizationId: 'org-b' }) }).allowed, false);
});

test('管理授权不复制到同一人的普通岗位', () => {
  const input = policy({ subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }] });
  assert.equal(decision([input]).allowed, false);
  assert.equal(decision([input], { actor: Object.assign({}, actor, { role: 'admin', adminGrantId: 'grant-a' }) }).allowed, true);
});

test('空条件、未知属性、损坏规则拒绝，不能跳过损坏禁止', () => {
  for (const patch of [{ scopes: [] }, { subjects: [] }, { fields: [] }, { capabilities: ['*'] },
    { subjects: [{ kind: 'assignmentScope', dimensions: {} }] },
    { scopes: [{ kind: 'assignmentScope', dimensions: { unknown: ['x'] } }] }, { effect: 'forbid' }]) {
    assert.throws(() => normalizePolicy(policy(patch), catalog));
    assert.equal(decision([policy(), policy(patch)]).reason, 'invalid_policy');
  }
});

test('生效时间包含起点、不包含终点，禁用规则不生效', () => {
  const time = '2026-10-31T00:00:00.000Z';
  assert.equal(decision([policy({ startsAt: time })]).allowed, true);
  assert.equal(decision([policy({ endsAt: time })]).allowed, false);
  assert.equal(decision([policy({ enabled: false })]).allowed, false);
  assert.throws(() => normalizePolicy(policy({ startsAt: '2026-02-30T00:00:00.000Z' }), catalog));
});

test('永久删除可单独授予普通岗位，不代表业务校验已完成', () => {
  const input = policy({ capabilities: ['venue.delete'], scopes: [{ kind: 'records', ids: ['record-a'] }] });
  assert.equal(decision([input], { capability: 'venue.delete' }).allowed, true);
  assert.equal(decision([input], { capability: 'venue.delete', businessAllowed: false }).allowed, false);
});

test('委托校验同时约束对象、能力、记录、字段和时间', () => {
  const envelope = policy({ scopes: [{ kind: 'records', ids: ['record-a'] }], fields: ['name'], endsAt: '2026-11-01T00:00:00.000Z' });
  const child = policy({ scopes: [{ kind: 'records', ids: ['record-a'] }], fields: ['name'], endsAt: envelope.endsAt });
  assert.equal(canDelegate(child, envelope, catalog), true);
  for (const patch of [{ fields: null }, { endsAt: null }, { organizationId: 'other' },
    { subjects: [{ kind: 'assignments', ids: ['job-other'] }] },
    { scopes: [{ kind: 'organization' }] }, { capabilities: ['venue.delete'] }]) {
    assert.equal(canDelegate(policy(Object.assign({}, child, patch)), envelope, catalog), false);
  }
});

test('委托动态范围不能移除限制，也不能转授分配权', () => {
  const envelope = policy({ subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'], identityCategoryId: ['leader', 'member'] } }] });
  const narrower = policy({ subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'], identityCategoryId: ['leader'] } }] });
  assert.equal(canDelegate(narrower, envelope, catalog), true);
  assert.equal(canDelegate(policy({ subjects: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dept-a'] } }] }), envelope, catalog), false);
  const delegation = policy({ subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }], capabilities: ['permissions.delegate'] });
  assert.equal(canDelegate(delegation, delegation, catalog), false);
});

test('同一请求预编译规则与逐次计算等价，源数据修改不能改变编译结果', () => {
  const input = [policy(), policy({ id: 'deny-phone', effect: 'deny', fields: ['phone'] })];
  const expected = decision(input);
  const prepared = preparePolicies(input, catalog);
  assert.deepEqual(decision(undefined, { prepared }), expected);
  input[1].enabled = false;
  assert.deepEqual(decision(undefined, { prepared }), expected);
  assert.equal(decision(undefined, { prepared: {} }).reason, 'invalid_policy');
  assert.equal(decision(undefined, { prepared, catalog: new Map(catalog) }).reason, 'invalid_policy');
});
