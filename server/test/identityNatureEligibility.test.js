'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assignmentPredicate, isEnabled } = require('../src/core/models/identityNatureEligibility');
const { createScopeCompiler } = require('../src/core/services/authorizationSqlScope');

test('eligibility SQL accepts only static aliases and retains rollout protection', () => {
  assert.throws(() => assignmentPredicate('a; DROP TABLE persons'));
  const sql = assignmentPredicate('assignment_row');
  assert.match(sql, /identity_nature_rollouts/);
  assert.match(sql, /nr.enabled = 1/);
  assert.match(sql, /nl\.identity_id = assignment_row\.identity_id/);
  assert.match(sql, /nl\.nature_id = assignment_row\.assignment_kind/);
});

test('rollout state uses organization and never treats missing as enabled', async () => {
  const connection = { query: async (sql, params) => {
    assert.match(sql, /WHERE org_id=\?/);
    assert.deepEqual(params, ['organization']);
    return [[{ enabled: 1 }]];
  } };
  assert.equal(await isEnabled(connection, 'organization'), true);
  assert.equal(await isEnabled({ query: async () => [[]] }, 'organization'), false);
});

test('SQL scope rejects pending allow branches while retaining explicit denial', () => {
  const compile = createScopeCompiler({ resourceType: 'hr.people', organization: 'c.org_id', id: 'c.id',
    assignmentValid: 'c.assignment_valid', assignmentConfigured: 'c.assignment_configured',
    dimensions: { natureId: 'c.nature_id', identityCategoryId: 'c.identity_id' } });
  const actor = { personId: 'p', organizationId: 'o', role: 'user', active: true,
    assignment: { id: 'a', personId: 'p', organizationId: 'o', active: true } };
  const catalog = new Map([['hr.people.read', { resourceType: 'hr.people', scopes: ['organization', 'assignmentScope'],
    fields: [], adminOnlyFields: [] }]]);
  const policy = { id: 'allow', organizationId: 'o', effect: 'allow', enabled: true,
    capabilities: ['hr.people.read'], subjects: [{ kind: 'assignments', ids: ['a'] }],
    scopes: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'], identityCategoryId: ['identity'] } }],
    fields: null, startsAt: null, endsAt: null };
  const allowed = compile({ actor, capability: 'hr.people.read', catalog, policies: [policy], now: Date.now() });
  assert.match(allowed.sql, /c\.assignment_configured = 1/);
  const denied = compile({ actor, capability: 'hr.people.read', catalog,
    policies: [{ ...policy, scopes: [{ kind: 'organization' }] }, { ...policy, id: 'deny', effect: 'deny' }], now: Date.now() });
  assert.match(denied.sql, /AND NOT/);
  assert.doesNotMatch(denied.sql, /assignment_configured/);
});
