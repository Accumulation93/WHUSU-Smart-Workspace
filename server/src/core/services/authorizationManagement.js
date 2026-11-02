'use strict';

const { referenceFromRequest } = require('./authorizationReference');
const identity = require('../models/authorizationIdentity');
const model = require('../models/authorization');
const references = require('../models/authorizationReferences');
const candidates = require('../models/authorizationCandidates');
const { normalizePolicy, canDelegate, subjectMatches } = require('./authorizationPolicy');
const { CATALOG } = require('./authorizationCatalog');

function forbidden() { throw Object.assign(new Error('authorization_forbidden'), { code: 'authorization_forbidden' }); }

async function activeEnvelopes(connection, actor, now = Date.now(), lock = false) {
  const rows = await model.listDelegations(connection, actor.organizationId, lock);
  const result = [];
  for (const row of rows) {
    if (!row.enabled) continue;
    const envelope = normalizePolicy(row.envelope, CATALOG);
    // 委托人的主体选择和“可授予谁”的主体选择分别保存，不可混用。
    const audience = normalizePolicy({ id: row.id, organizationId: row.organizationId, enabled: true,
      effect: 'allow', capabilities: ['authorization.rules.read'], subjects: row.subjects,
      scopes: [{ kind: 'organization' }], fields: null }, CATALOG);
    if (row.organizationId !== actor.organizationId || envelope.organizationId !== actor.organizationId
      || envelope.effect !== 'allow' || !envelope.enabled) forbidden();
    if ((envelope.startsAt && now < Date.parse(envelope.startsAt)) || (envelope.endsAt && now >= Date.parse(envelope.endsAt))) continue;
    if (audience.subjects.some(subject => subjectMatches(subject, actor))) result.push(envelope);
  }
  return result;
}

function withinEnvelopes(policy, envelopes) {
  return envelopes.some(envelope => canDelegate(policy, envelope, CATALOG));
}

function schemeAllowed(capabilities, envelopes) {
  return Array.isArray(capabilities) && capabilities.length > 0 && envelopes.some(envelope => capabilities.every(key =>
    CATALOG.has(key) && !CATALOG.get(key).delegation && envelope.capabilities.includes(key)));
}

function createGuard(reference) {
  let actor = null;
  return {
    async authorize(connection) {
      actor = await identity.loadActor(connection, reference, true);
      if (!actor || actor.role !== 'admin') forbidden();
      if (!actor.isSuper && !(await activeEnvelopes(connection, actor)).length) forbidden();
      return actor;
    },
    async validateChange(connection, before, after) {
      if (!actor) forbidden();
      if (actor.isSuper) return;
      // 此时 Model 已取得组织授权写锁，重新读取委托，不使用进入页面时的授权。
      const envelopes = await activeEnvelopes(connection, actor, Date.now(), true);
      if (after && after.kind === 'scheme') {
        const oldCapabilities = before && (typeof before.draft_capabilities_json === 'string'
          ? JSON.parse(before.draft_capabilities_json) : before.draft_capabilities_json);
        if (!schemeAllowed(after.capabilities, envelopes) || (before && !schemeAllowed(oldCapabilities, envelopes))) forbidden();
        return;
      }
      if ((before && !withinEnvelopes(before, envelopes)) || (after && !withinEnvelopes(after, envelopes))) forbidden();
      // 普通权限分配人不能借编辑规则改变自身管理授权。
      for (const policy of [before, after]) {
        if (policy && policy.subjects.some(subject => subject.kind === 'adminGrants' && subject.ids.includes(actor.adminGrantId))) forbidden();
      }
    },
    validateReferences: references.validateReferences
  };
}

async function readManagement(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor || actor.role !== 'admin') forbidden();
  const envelopes = actor.isSuper ? [] : await activeEnvelopes(connection, actor);
  const canManage = actor.isSuper || envelopes.length > 0;
  if (!canManage) {
    // 只获授查询权限的管理员不能读取或编辑授权规则，也不需要取得分配权才能查询。
    const { inspectableCandidates } = require('./authorizationInspection');
    const visible = await inspectableCandidates(connection, reference);
    if (!visible.assignments.length && !visible.adminGrants.length) forbidden();
    const state = await model.read(connection, actor.organizationId);
    return { revision: state.revision, mode: state.mode, isSuper: false, canManage: false,
      rules: [], schemes: [], delegations: [], capabilityKeys: [],
      catalog: [...CATALOG.values()].map(item => ({ key: item.key, resourceType: item.resourceType, action: item.action })) };
  }
  const state = await model.read(connection, actor.organizationId);
  const schemes = await model.listSchemes(connection, actor.organizationId);
  const capabilityKeys = actor.isSuper ? [...CATALOG.keys()] : [...new Set(envelopes.flatMap(envelope => envelope.capabilities))];
  const organizationCatalog = await require('../models/authorizationProfileFields').catalog(connection, actor.organizationId, CATALOG);
  return { revision: state.revision, mode: state.mode, isSuper: actor.isSuper, canManage: true,
    rules: actor.isSuper ? state.rules : state.rules.filter(rule => withinEnvelopes(rule.policy, envelopes)),
    schemes: actor.isSuper ? schemes : schemes.filter(scheme => schemeAllowed(scheme.capabilities, envelopes)
      && (!scheme.publishedVersion || schemeAllowed(scheme.publishedCapabilities, envelopes))),
    delegations: actor.isSuper ? await model.listDelegations(connection, actor.organizationId) : [],
    capabilityKeys,
    catalog: capabilityKeys.map(key => {
      const definition = organizationCatalog.get(key);
      return { key, resourceType: definition.resourceType, action: definition.action,
        scopes: definition.scopes, fields: definition.fields, fieldLabels: definition.fieldLabels || {}, governance: definition.governance,
        delegation: definition.delegation };
    }) };
}

async function readCandidates(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor || actor.role !== 'admin') forbidden();
  const envelopes = actor.isSuper ? [] : await activeEnvelopes(connection, actor);
  if (!actor.isSuper && !envelopes.length) forbidden();
  const result = await candidates.read(connection, actor.organizationId);
  result.dimensions = await candidates.readDimensions(connection, actor.organizationId);
  if (actor.isSuper) return result;
  function permitted(target) {
    return envelopes.some(envelope => envelope.subjects.some(subject => subjectMatches(subject, target)));
  }
  return {
    dimensions: result.dimensions,
    assignments: result.assignments.filter(item => permitted({ role: 'user', active: true,
      organizationId: actor.organizationId, personId: item.personId,
      assignment: { id: item.assignmentId, active: true, organizationId: actor.organizationId,
        personId: item.personId, natureId: item.natureId, departmentId: item.departmentId,
        identityCategoryId: item.identityCategoryId, workGroupId: item.workGroupId } })),
    adminGrants: result.adminGrants.filter(item => item.adminGrantId !== actor.adminGrantId && permitted({
      role: 'admin', active: true, organizationId: actor.organizationId, personId: item.personId,
      adminGrantId: item.adminGrantId }))
  };
}

module.exports = { referenceFromRequest, createGuard, readManagement, readCandidates, activeEnvelopes };
