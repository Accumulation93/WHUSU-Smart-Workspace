'use strict';

const { referenceFromRequest } = require('./authorizationReference');
const identity = require('../models/authorizationIdentity');
const model = require('../models/authorization');
const references = require('../models/authorizationReferences');
const candidates = require('../models/authorizationCandidates');
const { normalizePolicy, normalizeSubjects, canDelegate, subjectMatches, subjectsWithin } = require('./authorizationPolicy');
const { CATALOG } = require('./authorizationCatalog');
const grants = require('../models/authorizationGrantSources');
const { candidateActor } = require('./authorizationImpact');

function forbidden() { throw Object.assign(new Error('authorization_forbidden'), { code: 'authorization_forbidden' }); }

function specialCapabilities(keys, unified) {
  return unified === true ? keys.filter(key => CATALOG.get(key)?.classification === 'special') : [];
}

async function activeDelegations(connection, actor, now = Date.now(), lock = false) {
  let rows = await model.listDelegations(connection, actor.organizationId, lock);
  if (actor.unifiedAuthorization === true) {
    const runtime = await grants.readGrantSources(connection, actor.organizationId, rows, lock);
    rows = runtime.activeDelegations;
  }
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
      if (actor.unifiedAuthorization !== true && actor.role !== 'admin'
        && envelope.capabilities.some(key => CATALOG.get(key).governance)) forbidden();
      result.push({ id: row.id, name: row.name, version: row.version, envelope,
        allowRedelegation: row.allowRedelegation === true, parentDelegationId: row.parentDelegationId || null,
        includesOwnRole: envelope.subjects.some(subject => subject.kind === 'assignmentScope' && subjectMatches(subject, actor)) });
    }
  }
  return result;
}

async function activeEnvelopes(connection, actor, now = Date.now(), lock = false) {
  return (await activeDelegations(connection, actor, now, lock)).map(item => item.envelope);
}

function withinEnvelopes(policy, envelopes, unified = false) {
  return envelopes.some(envelope => canDelegate(policy, envelope, CATALOG, { unified }));
}

function schemeAllowed(capabilities, envelopes) {
  return Array.isArray(capabilities) && capabilities.length > 0 && envelopes.some(envelope => capabilities.every(key =>
    CATALOG.has(key) && !CATALOG.get(key).delegation && envelope.capabilities.includes(key)));
}

async function matchesOwnPosition(connection, actor, subjects) {
  if (subjects.some(subject => subjectMatches(subject, actor))) return true;
  if (actor.unifiedAuthorization !== true) return false;
  const directory = await candidates.read(connection, actor.organizationId,
    { role: 'user', personIds: [actor.personId], unified: true });
  return directory.assignments.some(candidate => {
    const position = candidateActor(candidate, actor.organizationId, 'user');
    return subjects.some(subject => subjectMatches(subject, position));
  });
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
      const blocked = after ? specialCapabilities(after.capabilities, actor.unifiedAuthorization) : [];
      if (blocked.length) {
        if (!actor.isSuper) forbidden();
        if (!independentRead) throw Object.assign(new Error('authorization_special_capabilities'),
          { code: 'authorization_special_capabilities', blockedCapabilityKeys: blocked });
      }
      if (after && after.kind !== 'scheme' && actor.unifiedAuthorization !== true
        && after.subjects.some(subject => subject.kind !== 'adminGrants')
        && after.capabilities.some(key => CATALOG.get(key)?.governance)) forbidden();
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
      const currentSources = actor.unifiedAuthorization === true && before
        ? await grants.readGrantSources(connection, actor.organizationId, [], true) : null;
      const previousSource = currentSources?.sources.get('rule:' + before.id);
      const matching = options.filter(({ id, envelope }) => (!previousSource || previousSource.parentDelegationId === id)
        && (!before || withinEnvelopes(before, [envelope], actor.unifiedAuthorization))
        && (!after || withinEnvelopes(after, [envelope], actor.unifiedAuthorization)));
      if (!matching.length) forbidden();
      if (!independentRead) eligibleDelegationIds = matching.map(item => item.id);
      // 普通权限分配人不能借编辑规则改变自身管理授权。
      for (const policy of [before, after]) {
        if (policy && await matchesOwnPosition(connection, actor, policy.subjects)) forbidden();
      }
      if (actor.unifiedAuthorization === true && after && !before && !independentRead) {
        if (!actor.assignment) forbidden();
        return { parentDelegationId: matching[0].id, issuerAssignmentId: actor.assignment.id };
      }
    },
    async validateDelegationChange(connection, before, after) {
      if (!actor || actor.unifiedAuthorization !== true) forbidden();
      if (after && after.envelope.capabilities.some(key => CATALOG.get(key)?.classification === 'special')) forbidden();
      if (actor.isSuper) return after ? { parentDelegationId: before?.parentDelegationId,
        issuerAssignmentId: before?.issuerAssignmentId, allowRedelegation: after.allowRedelegation } : null;
      if (!actor.assignment || (before && before.issuerAssignmentId !== actor.assignment.id)) forbidden();
      const options = await activeDelegations(connection, actor, Date.now(), true);
      const chosen = before?.parentDelegationId || delegationId;
      const source = options.find(option => option.id === chosen && option.allowRedelegation);
      if (!source || (delegationId !== undefined && delegationId !== source.id)) forbidden();
      if (after && (!subjectsWithin(after.subjects, source.envelope.subjects)
        || await matchesOwnPosition(connection, actor, after.subjects.concat(after.envelope.subjects))
        || !withinEnvelopes(after.envelope, [source.envelope], true))) forbidden();
      return after ? { parentDelegationId: source.id, issuerAssignmentId: actor.assignment.id,
        allowRedelegation: after.allowRedelegation } : null;
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
  const state = await model.read(connection, actor.organizationId, false, actor.unifiedAuthorization === true);
  const { hasInspectableCandidate } = require('./authorizationInspection');
  const canInspectOthers = actor.isSuper || await hasInspectableCandidate(connection, actor, state.rules);
  if (!canManage) {
    // 只获授查询权限的管理员不能读取或编辑授权规则，也不需要取得分配权才能查询。
    return { revision: state.revision, mode: state.mode, isSuper: false, canManage: false,
      canInspectOwn: true, canInspectOthers, canManageDelegations: false, delegationOptions: [],
      rules: [], schemes: [], delegations: [], capabilityKeys: [],
      catalog: [...CATALOG.values()].map(item => ({ key: item.key, resourceType: item.resourceType, action: item.action,
        systemControlled: item.systemControlled })) };
  }
  const schemes = await model.listSchemes(connection, actor.organizationId);
  const capabilityKeys = actor.isSuper ? [...CATALOG.keys()] : [...new Set(envelopes.flatMap(envelope => envelope.capabilities))];
  const organizationCatalog = await require('../models/authorizationProfileFields').catalog(connection, actor.organizationId, CATALOG);
  const canEditRule = policy => actor.isSuper || withinEnvelopes(policy, envelopes, actor.unifiedAuthorization)
    && !policy.subjects.some(subject => subjectMatches(subject, actor));
  const canPublishScheme = scheme => {
    if (specialCapabilities(scheme.capabilities, actor.unifiedAuthorization).length) return false;
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
  const canManageDelegations = actor.isSuper || delegationOptions.some(item => item.allowRedelegation);
  const allDelegations = canManageDelegations ? await model.listDelegations(connection, actor.organizationId) : [];
  const runtime = actor.unifiedAuthorization === true && canManageDelegations
    ? await grants.readGrantSources(connection, actor.organizationId, allDelegations) : null;
  const delegations = allDelegations.map(row => {
    const source = runtime?.sources.get('delegation:' + row.id);
    return { ...row, ...source, sourceActive: !runtime || runtime.activeDelegations.some(item => item.id === row.id) };
  }).filter(row => actor.isSuper || row.issuerAssignmentId === actor.assignment?.id);
  return { revision: state.revision, mode: state.mode, roleBindingOnly: state.mode === 'enforced', isSuper: actor.isSuper, canManage: true,
    unifiedIdentity: actor.unifiedAuthorization === true,
    canInspectOwn: true, canInspectOthers, canManageDelegations, delegationOptions,
    rules: (actor.isSuper ? state.rules : state.rules.filter(rule => withinEnvelopes(rule.policy, envelopes)))
      .map(rule => ({ ...rule, canEdit: canEditRule(rule.policy) })),
    schemes: (actor.isSuper ? schemes : schemes.filter(scheme => schemeAllowed(scheme.capabilities, envelopes)
      || scheme.publishedVersion && schemeAllowed(scheme.publishedCapabilities, envelopes)))
      .map(scheme => ({ ...scheme, canEdit: !scheme.compatibilityOnly && (actor.isSuper || schemeAllowed(scheme.capabilities, envelopes)),
        draftRestrictedCapabilities: actor.isSuper ? specialCapabilities(scheme.capabilities, actor.unifiedAuthorization) : [],
        canPublish: !scheme.compatibilityOnly && canPublishScheme(scheme) })),
    delegations,
    basicCapabilities: actor.unifiedAuthorization === true ? [...CATALOG.values()]
      .filter(item => item.businessRoles.includes('user'))
      .map(item => ({ key: item.key, enabled: !state.disabledBasic.has(item.key) })) : [],
    capabilityKeys,
    catalog: capabilityKeys.map(key => {
      const definition = organizationCatalog.get(key);
      return { key, resourceType: definition.resourceType, action: definition.action,
        scopes: definition.scopes, fields: definition.fields, fieldLabels: definition.fieldLabels || {}, governance: definition.governance,
        adminOnlyFields: definition.adminOnlyFields,
        classification: definition.classification, specialCategory: definition.specialCategory,
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
