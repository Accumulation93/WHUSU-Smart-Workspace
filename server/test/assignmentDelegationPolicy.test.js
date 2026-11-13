'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeSubjects, normalizePolicy, subjectMatches, canDelegate } = require('../src/core/services/authorizationPolicy');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const actor = { role: 'user', active: true, organizationId: 'org', personId: 'person',
  assignment: { id: 'job', active: true, organizationId: 'org', personId: 'person', natureId: 'staff', departmentId: 'department' } };
const base = { id: 'policy', organizationId: 'org', effect: 'allow', enabled: true,
  subjects: [{ kind: 'assignments', ids: ['job'] }], capabilities: ['venue.bookings.read'],
  scopes: [{ kind: 'organization' }], fields: null, startsAt: null, endsAt: null };

test('委托受领主体独立规范化不放宽治理规则', () => {
  assert.deepEqual(normalizeSubjects(base.subjects), base.subjects);
  assert.throws(() => normalizeSubjects([{ kind: 'assignments', ids: [] }]));
  assert.throws(() => normalizeSubjects([{ kind: 'persons', ids: ['person'] }]));
  assert.throws(() => normalizePolicy({ ...base, capabilities: ['authorization.rules.read'] }, CATALOG));
});

test('显式岗位与动态条件都能识别本人，不匹配同人另一岗位', () => {
  assert.equal(subjectMatches(base.subjects[0], actor), true);
  assert.equal(subjectMatches({ kind: 'assignments', ids: ['other-job'] }, actor), false);
  assert.equal(subjectMatches({ kind: 'assignmentScope', dimensions: { natureId: ['staff'], departmentId: ['department'] } }, actor), true);
});

test('动态委托不可即时展开成永久岗位子授权', () => {
  const envelope = { ...base, subjects: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'], departmentId: ['department'] } }] };
  assert.equal(subjectMatches(envelope.subjects[0], actor), true);
  assert.equal(canDelegate(base, envelope, CATALOG), false);
  assert.equal(canDelegate(envelope, envelope, CATALOG), true);
  assert.equal(canDelegate({ ...envelope, subjects: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'] } }] }, envelope, CATALOG), false);
});

test('受限委托不合并能力或延长有效期限', () => {
  const envelope = { ...base, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z' };
  assert.equal(canDelegate(base, envelope, CATALOG), false);
  assert.equal(canDelegate(envelope, envelope, CATALOG), true);
  assert.equal(canDelegate({ ...envelope, capabilities: ['venue.bookings.delete'] }, envelope, CATALOG), false);
});
