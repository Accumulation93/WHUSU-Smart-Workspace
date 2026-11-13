'use strict';

const { referenceFromRequest } = require('./authorizationReference');
const identity = require('../models/authorizationIdentity');
const model = require('../models/authorization');
const references = require('../models/authorizationReferences');
const candidates = require('../models/authorizationCandidates');
const { normalizePolicy, normalizeSubjects, canDelegate, subjectMatches } = require('./authorizationPolicy');
const { CATALOG } = require('./authorizationCatalog');

function forbidden() { throw Object.assign(new Error('authorization_forbidden'), { code: 'authorization_forbidden' }); }

async function activeDelegations(connection, actor, now = Date.now(), lock = false) {
  const rows = await model.listDelegations(connection, actor.organizationId, lock);
  const result = [];
  for (const row of rows) {
    if (!row.enabled) continue;
    const envelope = normalizePolicy(row.envelope, CATALOG);
    // 委托人的主体选择和“可授予谁”的主体选择分别保存，不可混用。
    const audience = normalizeSubjects(row.subjects);
    if (row.organizationId !== actor.organizationId || envelope.organizationId !== actor.organizationId
      || envelope.effect !== 'allow' || !envelope.enabled) forbidden();
    if ((envelope.startsAt && now < Date.parse(envelope.startsAt)) || (envelope.endsAt && now >= Date.parse(envelope.endsAt))) continue;
    if (audience.some(subject => subjectMatches(subject, actor))) {
      if (actor.role !== 'admin' && envelope.capabilities.some(key => CATALOG.get(key).governance)) forbidden();
      result.push({ id: row.id, name: row.name, version: row.version, envelope,
        includesOwnRole: envelope.subjects.some(subject => subject.kind === 'assignmentScope' && subjectMatches(subject, actor)) });
    }
  }
  return result;
}

async function activeEnvelopes(connection, actor, now = Date.now(), lock = false) {
  return (await activeDelegations(connection, actor, now, lock)).map(item => item.envelope);
}

function withinEnvelopes(policy, envelopes) {
  return envelopes.some(envelope => canDelegate(policy, envelope, CATALOG));
}

function schemeAllowed(capabilities, envelopes) {
  return Array.isArray(capabilities) && capabilities.length > 0 && envelopes.some(envelope => capabilities.every(key =>
    CATALOG.has(key) && !CATALOG.get(key).delegation && envelope.capabilities.includes(key)));
}

function createGuard(reference, delegationId) {
  let actor = null;
  let eligibleDelegationIds = null;
  return {
    async authorize(connection) {
      actor = await identity.loadActor(connection, reference, true);
      if (!actor) forbidden();
      if (!actor.isSuper && !(await activeEnvelopes(connection, actor)).length) forbidden();
      return actor;
    },
    async validateChange(connection, before, after, independentRead = false) {
      if (!actor) forbidden();
      const oldKeys = before && (before.capabilities || (typeof before.draft_capabilities_json === 'string'
        ? JSON.parse(before.draft_capabilities_json) : before.draft_capabilities_json)) || [];
      if (after && after.capabilities.some(key => CATALOG.get(key)?.systemControlled && !oldKeys.includes(key))) forbidden();
      if (after && after.kind !== 'scheme' && after.subjects.some(subject => subject.kind === 'adminGrants')
        && after.scopes.some(scope => Object.values(scope.dimensions || {}).includes('same'))) forbidden();
      if (actor.isSuper) return;
      // 此时 Model 已取得组织授权写锁，重新读取委托，不使用进入页面时的授权。
      const options = (await activeDelegations(connection, actor, Date.now(), true))
        .filter(item => (delegationId === undefined || item.id === delegationId)
          && (independentRead || eligibleDelegationIds === null || eligibleDelegationIds.includes(item.id)));
      if (after && after.kind === 'scheme') {
        const oldCapabilities = before && (typeof before.draft_capabilities_json === 'string'
          ? JSON.parse(before.draft_capabilities_json) : before.draft_capabilities_json);
        const matching = options.filter(({ envelope }) => schemeAllowed(after.capabilities, [envelope])
          && (!before || schemeAllowed(oldCapabilities, [envelope])));
        if (!matching.length) forbidden();
        if (!independentRead) eligibleDelegationIds = matching.map(item => item.id);
        return;
      }
      const matching = options.filter(({ envelope }) => (!before || withinEnvelopes(before, [envelope]))
        && (!after || withinEnvelopes(after, [envelope])));
      if (!matching.length) forbidden();
      if (!independentRead) eligibleDelegationIds = matching.map(item => item.id);
      // 普通权限分配人不能借编辑规则改变自身管理授权。
      for (const policy of [before, after]) {
        if (policy && policy.subjects.some(subject => subjectMatches(subject, actor))) forbidden();
      }
    },
    validateReferences: references.validateReferences
  };
}

async function readManagement(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor) forbidden();
  const delegationOptions = actor.isSuper ? [] : await activeDelegations(connection, actor);
  const envelopes = delegationOptions.map(item => item.envelope);
  const canManage = actor.isSuper || envelopes.length > 0;
  const { inspectableCandidates } = require('./authorizationInspection');
  const visible = actor.isSuper ? null : await inspectableCandidates(connection, reference);
  const canInspectOthers = actor.isSuper || visible.assignments.length > 0 || visible.adminGrants.length > 0;
  if (!canManage) {
    // 只获授查询权限的管理员不能读取或编辑授权规则，也不需要取得分配权才能查询。
    const state = await model.read(connection, actor.organizationId);
    return { revision: state.revision, mode: state.mode, isSuper: false, canManage: false,
      canInspectOwn: true, canInspectOthers, canManageDelegations: false, delegationOptions: [],
      rules: [], schemes: [], delegations: [], capabilityKeys: [],
      catalog: [...CATALOG.values()].map(item => ({ key: item.key, resourceType: item.resourceType, action: item.action,
        systemControlled: item.systemControlled })) };
  }
  const state = await model.read(connection, actor.organizationId);
  const schemes = await model.listSchemes(connection, actor.organizationId);
  const capabilityKeys = actor.isSuper ? [...CATALOG.keys()] : [...new Set(envelopes.flatMap(envelope => envelope.capabilities))];
  const organizationCatalog = await require('../models/authorizationProfileFields').catalog(connection, actor.organizationId, CATALOG);
  const canEditRule = policy => actor.isSuper || withinEnvelopes(policy, envelopes)
    && !policy.subjects.some(subject => subjectMatches(subject, actor));
  const canPublishScheme = scheme => {
    const linked = state.rules.filter(rule => rule.schemeId === scheme.id);
    try {
      for (const rule of linked) {
        const next = normalizePolicy({ ...rule.policy, capabilities: scheme.capabilities }, CATALOG);
        if (next.capabilities.some(key => CATALOG.get(key).systemControlled && !rule.policy.capabilities.includes(key))
          || next.subjects.some(subject => subject.kind === 'adminGrants')
            && next.scopes.some(scope => Object.values(scope.dimensions || {}).includes('same'))) return false;
      }
    } catch (_) { return false; }
    return actor.isSuper || envelopes.some(envelope => schemeAllowed(scheme.capabilities, [envelope])
      && linked.every(rule => canEditRule(rule.policy) && withinEnvelopes(rule.policy, [envelope])
        && withinEnvelopes({ ...rule.policy, capabilities: scheme.capabilities }, [envelope])));
  };
  return { revision: state.revision, mode: state.mode, isSuper: actor.isSuper, canManage: true,
    canInspectOwn: true, canInspectOthers, canManageDelegations: actor.isSuper, delegationOptions,
    rules: (actor.isSuper ? state.rules : state.rules.filter(rule => withinEnvelopes(rule.policy, envelopes)))
      .map(rule => ({ ...rule, canEdit: canEditRule(rule.policy) })),
    schemes: (actor.isSuper ? schemes : schemes.filter(scheme => schemeAllowed(scheme.capabilities, envelopes)
      || scheme.publishedVersion && schemeAllowed(scheme.publishedCapabilities, envelopes)))
      .map(scheme => ({ ...scheme, canEdit: actor.isSuper || schemeAllowed(scheme.capabilities, envelopes),
        canPublish: canPublishScheme(scheme) })),
    delegations: actor.isSuper ? await model.listDelegations(connection, actor.organizationId) : [],
    capabilityKeys,
    catalog: capabilityKeys.map(key => {
      const definition = organizationCatalog.get(key);
      return { key, resourceType: definition.resourceType, action: definition.action,
        scopes: definition.scopes, fields: definition.fields, fieldLabels: definition.fieldLabels || {}, governance: definition.governance,
        adminOnlyFields: definition.adminOnlyFields,
        delegation: definition.delegation, systemControlled: definition.systemControlled };
    }) };
}

async function readCandidates(connection, reference) {
  const actor = await identity.loadActor(connection, reference);
  if (!actor) forbidden();
  const envelopes = actor.isSuper ? [] : await activeEnvelopes(connection, actor);
  if (!actor.isSuper && !envelopes.length) forbidden();
  const result = await candidates.read(connection, actor.organizationId);
  result.dimensions = await candidates.readDimensions(connection, actor.organizationId);
  if (actor.isSuper) return result;
  function permitted(target) {
    // 动态条件只能分配同形或更窄条件，不能变成调岗后仍永久生效的指定岗位授权。
    return envelopes.some(envelope => envelope.subjects.some(subject => subject.kind !== 'assignmentScope'
      && subjectMatches(subject, target)));
  }
  return {
    dimensions: result.dimensions,
    assignments: result.assignments.filter(item => item.assignmentId !== (actor.assignment && actor.assignment.id) && permitted({ role: 'user', active: true,
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
