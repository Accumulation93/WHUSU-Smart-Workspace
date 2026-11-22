'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const { evaluate } = require('../src/core/services/authorizationPolicy');
const { createScopeCompiler } = require('../src/core/services/authorizationSqlScope');
const { resolveGrantSources } = require('../src/core/models/authorizationGrantSources');

const organizationId = 'org-1';
const now = Date.parse('2026-11-22T10:00:00.000Z');
const assignments = (...ids) => [{ kind: 'assignments', ids }];
const org = [{ kind: 'organization' }];
const actor = (id, extra = {}) => ({ active: true, role: 'user', unifiedAuthorization: true, organizationId,
  personId: 'person-' + id, assignment: { active: true, id, organizationId, personId: 'person-' + id }, ...extra });
const policy = (id, subjects, capability, scopes = org, extra = {}) => ({ id, organizationId, subjects,
  scopes, capabilities: [capability], fields: null, effect: 'allow', enabled: true, startsAt: null, endsAt: null, ...extra });
const envelope = (id, ...ids) => policy(id, assignments(...ids), 'audit.submissions.read');
const delegation = (id, recipientId, bounds) => ({ id, organizationId, enabled: true, subjects: assignments(recipientId), envelope: bounds });
const source = (objectKind, objectId, parentDelegationId, issuerAssignmentId, allowRedelegation = false) =>
  ({ objectKind, objectId, parentDelegationId, issuerAssignmentId, allowRedelegation });

test('general sensitive account actions match authorized people while special governance stays super-only', () => {
  const ordinary = actor('one');
  const allow = policy('account', assignments('one'), 'auth.accounts.freeze', [{ kind: 'people', ids: ['recipient'] }]);
  const payload = { actor: ordinary, resource: { type: 'auth.accounts', organizationId, ownerPersonId: 'recipient' },
    capability: 'auth.accounts.freeze', policies: [allow], catalog: CATALOG, now, businessAllowed: true };
  assert.equal(evaluate(payload).allowed, true);
  assert.equal(evaluate({ ...payload, resource: { ...payload.resource, ownerPersonId: 'other' } }).allowed, false);
  assert.equal(evaluate({ ...payload, resource: { ...payload.resource, organizationId: 'other-org' } }).allowed, false);
  const scopes = createScopeCompiler({ resourceType: 'auth.accounts', organization: 'a.org_id', id: 'a.id',
    ownerPersonId: 'a.person_id' })(payload);
  assert.deepEqual(scopes.params, [organizationId, 'recipient']);
  const merged = policy('old-merge', [{ kind: 'adminGrants', ids: ['old-admin'] }], 'auth.persons.merge');
  const resource = { type: 'auth.persons', organizationId };
  const old = actor('one', { role: 'admin', adminGrantId: 'old-admin' });
  assert.equal(evaluate({ ...payload, actor: old, resource, capability: 'auth.persons.merge', policies: [merged] }).reason,
    'special_permission_required');
  assert.equal(evaluate({ ...payload, actor: { ...old, isSuper: true }, resource, capability: 'auth.persons.merge', policies: [] }).allowed, true);
});

test('snapshot legacy grants and explicitly authorized protected fields stay distinct', () => {
  const member = actor('chosen', { legacyAdminGrantIds: ['old-admin'] });
  const legacy = policy('legacy', [{ kind: 'adminGrants', ids: ['old-admin'] }], 'hr.people.read');
  const ordinary = policy('general', assignments('chosen', 'future'), 'hr.people.read');
  const request = { resource: { type: 'hr.people', organizationId }, capability: 'hr.people.read', catalog: CATALOG,
    now, businessAllowed: true, requestedFields: ['studentId'] };
  assert.equal(evaluate({ ...request, actor: member, policies: [legacy, ordinary] }).allowed, true);
  assert.equal(evaluate({ ...request, actor: actor('future'), policies: [legacy, ordinary] }).allowed, false);
  const explicit = { ...ordinary, fields: ['studentId'] };
  assert.equal(evaluate({ ...request, actor: actor('future'), policies: [explicit] }).allowed, true);
});

test('delegate lineage checks recipient, issuer and scope and revokes just its own rules', () => {
  const top = delegation('top', 'issuer', envelope('top', 'middle', 'target'));
  const middle = delegation('middle-grant', 'middle', envelope('middle-grant', 'target'));
  const provenance = [
    source('delegation', 'top', null, null, true),
    source('delegation', 'middle-grant', 'top', 'issuer'),
    source('rule', 'dependent', 'middle-grant', 'middle')
  ];
  const receiving = assignments('target');
  const original = { id: 'standalone', policy: policy('standalone', receiving, 'audit.submissions.read') };
  const dependent = { id: 'dependent', policy: policy('dependent', receiving, 'audit.submissions.read') };
  const rules = [original, dependent];
  const issuers = [actor('issuer'), actor('middle')];
  assert.deepEqual(resolveGrantSources(provenance, [top, middle], issuers, now).filterRules(rules), rules);
  assert.deepEqual(resolveGrantSources(provenance, [middle], issuers, now).filterRules(rules), [original]);
  assert.deepEqual(resolveGrantSources(provenance, [top, middle], issuers.slice(0, 1), now).filterRules(rules), [original]);
  assert.deepEqual(resolveGrantSources(provenance, [{ ...top, envelope: envelope('top', 'middle') }, middle], issuers, now).filterRules(rules), [original]);
  const recycled = [
    source('delegation', 'top', 'middle-grant', 'middle', true),
    source('delegation', 'middle-grant', 'top', 'issuer', true)
  ];
  assert.deepEqual(resolveGrantSources(recycled, [top, middle], issuers, now).activeDelegations, []);
});
