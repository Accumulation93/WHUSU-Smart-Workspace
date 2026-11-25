'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const { normalizePolicy, canDelegate, evaluate } = require('../src/core/services/authorizationPolicy');
const { authorityForRule, allocationDenied, allocationSourceId } = require('../src/core/services/authorizationAllocation');
const policyStorage = require('../src/core/models/authorizationPolicyStorage');
const { resolveGrantSources } = require('../src/core/models/authorizationGrantSources');

const subjects = (...ids) => [{ kind: 'assignments', ids }];
const policy = (id, holder, capabilities, extra = {}) => ({ id, organizationId: 'org', subjects: subjects(holder),
  effect: 'allow', enabled: true, capabilities, scopes: [{ kind: 'organization' }], fields: ['name'], startsAt: null, endsAt: null, ...extra });
const actor = id => ({ organizationId: 'org', active: true, personId: 'person-' + id, role: 'user', unifiedAuthorization: true,
  assignment: { id, active: true, organizationId: 'org', personId: 'person-' + id } });
const rule = (id, holder, targets) => ({ id, name: id, version: 1,
  policy: policy(id, holder, ['assign:hr.people.read'], { allocationSubjects: subjects(...targets) }) });
const source = (id, parent, issuer) => ({ objectKind: 'rule', objectId: id, parentDelegationId: parent, issuerAssignmentId: issuer, allowRedelegation: false });

test('allocation capabilities are ordinary general capabilities with their original business boundary', () => {
  const item = CATALOG.get('assign:hr.people.read');
  assert.equal(item.allocationCapability, 'hr.people.read');
  assert.equal(item.classification, 'general');
  assert.equal(item.systemControlled, false);
  assert.deepEqual(item.scopes, CATALOG.get('hr.people.read').scopes);
  for (const key of ['authorization.rules.create', 'authorization.delegations.create', 'system.superAdministrators.create']) {
    assert.equal(CATALOG.has('assign:' + key), false);
  }
  assert.throws(() => normalizePolicy(policy('missing', 'issuer', [item.key]), CATALOG), error => error.path === 'allocationSubjects');
});

test('old runtime projections stay valid and disabled while full ordinary allocation policies remain authoritative', () => {
  const original = rule('allocation', 'issuer', ['target']).policy;
  const encoded = policyStorage.encode(original);
  const oldCatalog = new Map([...CATALOG].filter(([, definition]) => !definition.allocationCapability));
  const oldPolicy = normalizePolicy(JSON.parse(encoded.legacy), oldCatalog);
  assert.equal(oldPolicy.enabled, false);
  assert.deepEqual(oldPolicy.capabilities, ['hr.people.read']);
  assert.equal(Object.hasOwn(oldPolicy, 'allocationSubjects'), false);
  assert.deepEqual(JSON.parse(encoded.allocation), original);
  const operation = policy('operation', 'target', ['hr.people.read']);
  assert.equal(policyStorage.encode(operation).allocation, null);
  assert.deepEqual(JSON.parse(policyStorage.encode(operation).legacy), operation);
  assert(allocationSourceId('x'.repeat(64)).length <= 64);
  assert.equal(allocationSourceId('standard'), 'rule:standard');
});

test('business use leaves the center while management, identity and special checks stay authoritative', () => {
  const ordinary = actor('issuer');
  const input = { actor: ordinary, resource: { id: 'event', type: 'calendar.events', organizationId: 'org' },
    capability: 'calendar.events.read', catalog: CATALOG, now: Date.now(), businessAllowed: true,
    policies: [{ ...policy('deny', 'issuer', ['calendar.events.read']), fields: null, effect: 'deny' }] };
  assert.equal(evaluate({ ...input, businessGranted: true }).allowed, true);
  assert.equal(evaluate({ ...input, businessGranted: false }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, businessAllowed: false }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, actor: { ...ordinary,
    assignment: { ...ordinary.assignment, active: false } } }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, actor: { ...ordinary,
    assignment: { ...ordinary.assignment, organizationId: 'other' } } }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, capability: 'system.keys.manage',
    resource: { type: 'system.keys', organizationId: 'org' } }).reason, 'special_permission_required');
  for (const definition of CATALOG.values()) {
    if (definition.businessOnly) assert.equal(CATALOG.has('assign:' + definition.key), false);
  }
});

test('one allocation source covers holder, further recipients, data, fields and term without combining sources', () => {
  const root = rule('root', 'issuer', ['middle', 'target']);
  root.policy.scopes = [{ kind: 'records', ids: ['person-target'] }];
  root.policy.startsAt = '2026-01-01T00:00:00.000Z';
  root.policy.endsAt = '2099-01-01T00:00:00.000Z';
  const envelope = authorityForRule(root).envelope;
  assert.deepEqual(envelope.capabilities, ['assign:hr.people.read', 'hr.people.read']);
  const child = { ...root.policy, id: 'child', subjects: subjects('middle'), allocationSubjects: subjects('target') };
  assert.equal(canDelegate(child, envelope, CATALOG, { unified: true }), true);
  for (const changed of [
    { subjects: subjects('outside') }, { allocationSubjects: subjects('outside') },
    { scopes: [{ kind: 'organization' }] }, { fields: ['studentId'] },
    { startsAt: null }, { endsAt: null }, { capabilities: ['assign:hr.people.update'] }, { organizationId: 'other' }
  ]) assert.equal(canDelegate({ ...child, ...changed }, envelope, CATALOG, { unified: true }), false, JSON.stringify(changed));
});

test('ordinary allocation assignments cascade on revoke, narrowing and issuer invalidation without a redelegation switch', () => {
  const root = rule('root', 'issuer', ['middle', 'target', 'recipient']);
  const middle = rule('middle', 'middle', ['target', 'recipient']);
  const target = rule('target', 'target', ['recipient']);
  const final = { id: 'final', policy: policy('final', 'recipient', ['hr.people.read']) };
  const all = [root, middle, target, final];
  const provenance = [source('middle', 'rule:root', 'issuer'), source('target', 'rule:middle', 'middle'), source('final', 'rule:target', 'target')];
  const issuers = ['issuer', 'middle', 'target'].map(actor);
  const runtime = rows => resolveGrantSources(provenance, [], issuers, Date.now(), [], rows);
  assert.deepEqual(runtime(all).filterRules(all), all);
  assert.equal(runtime(all).activeDelegations.length, 3);
  assert.equal(runtime([{ ...root, policy: { ...root.policy, enabled: false } }, ...all.slice(1)]).filterRules(all).includes(final), false);
  const narrowed = { ...root, policy: { ...root.policy, allocationSubjects: subjects('middle') } };
  assert.equal(runtime([narrowed, ...all.slice(1)]).filterRules(all).includes(final), false);
  assert.equal(resolveGrantSources(provenance, [], issuers.slice(1), Date.now(), [], all).filterRules(all).includes(final), false);
  const own = { ...middle, policy: { ...middle.policy, subjects: subjects('issuer') } };
  assert.equal(runtime([root, own, target, final]).filterRules([own]).length, 0);
});

test('allocation denial overrides a source and all dependent grants while disjoint record scopes stay independent', () => {
  const root = rule('root', 'issuer', ['middle', 'target']);
  const child = rule('middle', 'middle', ['target']);
  const final = { id: 'final', policy: policy('final', 'target', ['hr.people.read']) };
  const deny = { id: 'deny', policy: policy('deny', 'middle', ['assign:hr.people.read'], { effect: 'deny' }) };
  const all = [root, child, final, deny];
  const runtime = resolveGrantSources([source('middle', 'rule:root', 'issuer'), source('final', 'rule:middle', 'middle')],
    [], ['issuer', 'middle'].map(actor), Date.now(), [], all);
  assert.equal(runtime.filterRules(all).includes(final), false);
  const recordDeny = { ...deny, policy: { ...deny.policy, scopes: [{ kind: 'records', ids: ['blocked'] }] } };
  assert.equal(allocationDenied(actor('middle'), { ...final.policy, scopes: [{ kind: 'records', ids: ['permitted'] }] }, [recordDeny]), false);
  assert.equal(allocationDenied(actor('middle'), { ...final.policy, scopes: [{ kind: 'records', ids: ['blocked'] }] }, [recordDeny]), true);
  const targetDeny = { ...deny, policy: { ...deny.policy, allocationSubjects: subjects('different-target') } };
  assert.equal(allocationDenied(actor('middle'), final.policy, [targetDeny]), false);
  assert.equal(allocationDenied(actor('middle'), { ...final.policy, subjects: subjects('different-target') }, [targetDeny]), true);
});
