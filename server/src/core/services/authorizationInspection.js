'use strict';

const identity = require('../models/authorizationIdentity');
const storage = require('../models/authorization');
const targets = require('../models/authorizationInspection');
const candidates = require('../models/authorizationCandidates');
const { candidateActor } = require('./authorizationImpact');
const { CATALOG } = require('./authorizationCatalog');
const { evaluate, preparePolicies } = require('./authorizationPolicy');
const { explainCapabilities } = require('./authorizationExplanation');

function forbidden() { throw Object.assign(new Error('authorization_forbidden'), { code: 'authorization_forbidden' }); }

async function inspect(connection, reference, input = {}) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor) forbidden();
  const state = await storage.read(connection, actor.organizationId);
  const policies = state.rules.map(rule => rule.policy);
  const now = Date.now();
  let selected = { actor, accountAvailable: true };
  const ownSubject = actor.role === 'admin' ? actor.adminGrantId : actor.assignment && actor.assignment.id;
  if (input.subjectId || input.role) {
    if (input.subjectId !== ownSubject || input.role !== actor.role) {
      selected = await targets.target(connection, actor.organizationId, input.role, input.subjectId);
      if (!selected) forbidden();
      const decision = evaluate({ actor, resource: { id: input.subjectId, type: 'authorization.effective',
        organizationId: actor.organizationId, ownerPersonId: selected.actor.personId, assignment: selected.actor.assignment },
      capability: 'authorization.effective.read', policies, catalog: CATALOG, now, businessAllowed: true });
      if (!decision.allowed) forbidden();
    }
  }
  const capabilities = selected.accountAvailable ? explainCapabilities(selected.actor, state.rules, CATALOG, now)
    : [...CATALOG.keys()].map(capability => ({ capability, status: 'denied', reason: 'account_unavailable', rules: [] }));
  return { mode: state.mode, revision: state.revision, accountAvailable: selected.accountAvailable,
    role: selected.actor.role, subjectId: selected.actor.role === 'admin'
      ? selected.actor.adminGrantId : selected.actor.assignment && selected.actor.assignment.id || '', capabilities };
}

// 查询他人权限的候选也逐岗位授权，不能把规则编辑候选目录当作读取他人权限的许可。
async function inspectableCandidates(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor) forbidden();
  const state = await storage.read(connection, actor.organizationId);
  const policies = state.rules.map(rule => rule.policy);
  const capability = 'authorization.effective.read';
  if (!actor.isSuper && !policies.some(policy => policy.enabled && policy.capabilities.includes(capability))) {
    return { assignments: [], adminGrants: [] };
  }
  const prepared = preparePolicies(policies, CATALOG);
  const now = Date.now();
  const directory = await candidates.read(connection, actor.organizationId, { includeSuper: true });
  function permitted(item, role) {
    const selected = candidateActor(item, actor.organizationId, role);
    const id = role === 'admin' ? item.adminGrantId : item.assignmentId;
    return evaluate({ actor, resource: { id, type: 'authorization.effective', organizationId: actor.organizationId,
      ownerPersonId: selected.personId, assignment: selected.assignment }, capability, prepared,
      catalog: CATALOG, now, businessAllowed: true }).allowed;
  }
  function minimal(item) {
    const value = Object.assign({}, item);
    delete value.personId;
    return value;
  }
  return { assignments: directory.assignments.filter(item => permitted(item, 'user')).map(minimal),
    adminGrants: directory.adminGrants.filter(item => permitted(item, 'admin')).map(minimal) };
}

module.exports = { inspect, inspectableCandidates };
