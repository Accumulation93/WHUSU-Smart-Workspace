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
  const state = await storage.read(connection, actor.organizationId, false, actor.unifiedAuthorization === true);
  const policies = state.rules.map(rule => rule.policy);
  const now = Date.now();
  let selected = { actor, accountAvailable: true };
  const ownSubject = actor.role === 'admin' ? actor.adminGrantId : actor.assignment && actor.assignment.id;
  if (input.subjectId || input.role) {
    if (input.subjectId !== ownSubject || input.role !== actor.role) {
      selected = await targets.target(connection, actor.organizationId, input.role, input.subjectId, actor.unifiedAuthorization === true);
      if (!selected) forbidden();
      const decision = evaluate({ actor, resource: { id: input.subjectId, type: 'authorization.effective',
        organizationId: actor.organizationId, ownerPersonId: selected.actor.personId, assignment: selected.actor.assignment },
      capability: 'authorization.effective.read', policies, catalog: CATALOG, now, businessAllowed: true });
      if (!decision.allowed) forbidden();
    }
  }
  const explanationCatalog = await require('../models/authorizationProfileFields').catalog(connection, actor.organizationId, CATALOG);
  const capabilities = selected.accountAvailable ? explainCapabilities(selected.actor, state.rules, explanationCatalog, now, state.disabledBasic, true, state.relationshipRole)
    : [...CATALOG.keys()].map(capability => ({ capability, status: 'denied', reason: 'account_unavailable', rules: [],
      grantState: 'unavailable', grantBasis: 'none', hasRestrictions: false, businessEntry: false }));
  const usedDimensions = new Map();
  const usedFields = new Set();
  for (const capability of capabilities) {
    const definition = explanationCatalog.get(capability.capability);
    for (const rule of capability.rules) {
      rule.displayFields = definition.fields.filter(field => (rule.fields === null || rule.fields.includes(field))
        && (selected.actor.role === 'admin'
          || !definition.adminOnlyFields.includes(field)
          || (selected.actor.unifiedAuthorization === true && Array.isArray(rule.fields) && rule.fields.includes(field))));
      for (const field of rule.displayFields) usedFields.add(field);
      for (const scope of rule.scopes) {
        for (const [key, values] of Object.entries(scope.dimensions || {})) {
          if (!Array.isArray(values)) continue;
          if (!usedDimensions.has(key)) usedDimensions.set(key, new Set());
          values.forEach(value => usedDimensions.get(key).add(value));
        }
      }
    }
  }
  const dimensions = usedDimensions.size ? await candidates.readDimensions(connection, actor.organizationId) : {};
  const scopeDirectory = { assignments: [], adminGrants: [], dimensions: {} };
  for (const [key, ids] of usedDimensions) {
    scopeDirectory.dimensions[key] = (dimensions[key] || []).filter(item => ids.has(item.id))
      .map(item => ({ id: item.id, name: item.name }));
  }
  const fieldLabels = {};
  for (const definition of explanationCatalog.values()) {
    for (const [key, label] of Object.entries(definition.fieldLabels || {})) {
      if (usedFields.has(key)) fieldLabels[key] = label;
    }
  }
  return { mode: state.mode, revision: state.revision, accountAvailable: selected.accountAvailable,
    role: selected.actor.role, subjectId: selected.actor.role === 'admin'
      ? selected.actor.adminGrantId : selected.actor.assignment && selected.actor.assignment.id || '',
    scopeDirectory, fieldLabels,
    capabilities: capabilities.map(item => ({ ...item, systemControlled: CATALOG.get(item.capability).systemControlled,
      classification: CATALOG.get(item.capability).classification,
      specialCategory: CATALOG.get(item.capability).specialCategory,
      supportsFields: explanationCatalog.get(item.capability).fields.length > 0 })) };
}

// 查询他人权限的候选也逐岗位授权，不能把规则编辑候选目录当作读取他人权限的许可。
async function inspectableCandidates(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor) forbidden();
  const state = await storage.read(connection, actor.organizationId, false, actor.unifiedAuthorization === true);
  const permitted = candidatePermission(actor, state.rules);
  if (!permitted) return { assignments: [], adminGrants: [] };
  const directory = await candidates.read(connection, actor.organizationId, { includeSuper: true });
  function minimal(item) {
    const value = Object.assign({}, item);
    delete value.personId;
    return value;
  }
  return { assignments: directory.assignments.filter(item => permitted(item, 'user')).map(minimal),
    adminGrants: directory.adminGrants.filter(item => permitted(item, 'admin')).map(minimal) };
}

async function hasInspectableCandidate(connection, actor, rules) {
  const permitted = candidatePermission(actor, rules);
  if (!permitted) return false;
  const directory = await candidates.read(connection, actor.organizationId, { includeSuper: true });
  return directory.assignments.some(item => permitted(item, 'user'))
    || directory.adminGrants.some(item => permitted(item, 'admin'));
}

function candidatePermission(actor, rules) {
  const policies = rules.map(rule => rule.policy);
  const capability = 'authorization.effective.read';
  if (!actor.isSuper && !policies.some(policy => policy.enabled && policy.capabilities.includes(capability))) {
    return null;
  }
  const prepared = preparePolicies(policies, CATALOG);
  const now = Date.now();
  const ownSubject = actor.role === 'admin' ? actor.adminGrantId : actor.assignment && actor.assignment.id;
  return function permitted(item, role) {
    const id = role === 'admin' ? item.adminGrantId : item.assignmentId;
    if (role === actor.role && id === ownSubject) return false;
    const selected = candidateActor(item, actor.organizationId, role);
    return evaluate({ actor, resource: { id, type: 'authorization.effective', organizationId: actor.organizationId,
      ownerPersonId: selected.personId, assignment: selected.assignment }, capability, prepared,
      catalog: CATALOG, now, businessAllowed: true }).allowed;
  };
}

module.exports = { inspect, inspectableCandidates, hasInspectableCandidate };
