'use strict';

const { CATALOG } = require('../services/authorizationCatalog');
const { canDelegate, normalizePolicy, normalizeSubjects, subjectMatches, subjectsWithin } = require('../services/authorizationPolicy');
const { authorityForRule, allocationDenied } = require('../services/authorizationAllocation');

function inEffect(policy, now) {
  return policy.enabled && policy.effect === 'allow'
    && (!policy.startsAt || now >= Date.parse(policy.startsAt))
    && (!policy.endsAt || now < Date.parse(policy.endsAt));
}

function matchesOwn(subjects, issuer, ownPositions) {
  return subjects.some(subject => subjectMatches(subject, issuer)
    || (ownPositions.get(issuer.personId) || []).some(actor => subjectMatches(subject, actor)));
}

function delegatedPermissionActive(policy, source, parent, issuer, ownPositions, denials = [], now = Date.now()) {
  return Boolean(source.parentDelegationId && parent && issuer
    && parent.subjects.some(subject => subjectMatches(subject, issuer))
    && !matchesOwn(policy.subjects, issuer, ownPositions)
    && !allocationDenied(issuer, policy, denials, now)
    && canDelegate(policy, parent.envelope, CATALOG, { unified: true }));
}

function resolveGrantSources(rows, delegations, issuers, now = Date.now(), related = [], rules = []) {
  const policyById = new Map(rules.map(rule => [rule.id, rule.policy]));
  const sources = new Map(rows.map(row => [row.objectKind + ':' + row.objectId, row]));
  const formal = rules.map(rule => { try { return authorityForRule(rule); } catch (_) { return null; } }).filter(Boolean);
  for (const rule of rules) {
    if (rule.sourceKind === 'legacy_allocation' && rule.sourceRef && sources.has('delegation:' + rule.sourceRef)) {
      sources.set('rule:' + rule.id, sources.get('delegation:' + rule.sourceRef));
    }
  }
  const aliases = new Set(formal.filter(row => row.sourceKind === 'delegation').map(row => row.id));
  const authorities = delegations.filter(row => !aliases.has(row.id)).map(row => ({ ...row,
    envelope: { ...row.envelope, allocationSubjects: row.envelope.subjects,
      capabilities: [...new Set(row.envelope.capabilities.flatMap(key =>
      CATALOG.has('assign:' + key) ? [key, 'assign:' + key] : [key]))].sort() } })).concat(formal);
  const candidates = new Map(authorities.map(row => [row.id, row]));
  const directory = new Map(issuers.map(issuer => [issuer.assignment.id, issuer]));
  const ownPositions = new Map();
  for (const item of related) {
    if (!ownPositions.has(item.personId)) ownPositions.set(item.personId, []);
    ownPositions.get(item.personId).push(item);
  }
  const resolved = new Map();
  const visiting = new Set();
  let denials = [];
  function resolve(id) {
    if (resolved.has(id)) return resolved.get(id);
    if (visiting.has(id)) return null;
    const row = candidates.get(id);
    if (!row || !row.enabled) return null;
    visiting.add(id);
    let result = null;
    try {
      const source = sources.get((row.sourceKind || 'delegation') + ':' + (row.sourceId || id));
      const envelope = normalizePolicy(row.envelope, CATALOG);
      const subjects = normalizeSubjects(row.subjects);
      if (inEffect(envelope, now) && envelope.organizationId === row.organizationId) {
        const parent = source?.parentDelegationId ? resolve(source.parentDelegationId) : null;
        const issuer = source?.issuerAssignmentId ? directory.get(source.issuerAssignmentId) : null;
        if (!source?.parentDelegationId || (parent
          && subjectsWithin(subjects, parent.envelope.subjects)
          && issuer && !matchesOwn(subjects, issuer, ownPositions)
          && delegatedPermissionActive(envelope, source, parent, issuer, ownPositions, denials, now))) {
          result = { ...row, envelope, subjects, allowRedelegation: true,
            parentDelegationId: source?.parentDelegationId || null };
        }
      }
    } catch (_) {
      // 损坏的授权来源不能授予权限。
    } finally {
      visiting.delete(id);
    }
    resolved.set(id, result);
    return result;
  }
  function filterRules(rules) {
    return rules.filter(rule => {
      const source = sources.get('rule:' + rule.id);
      if (!source?.parentDelegationId) return true;
      const parent = resolve(source.parentDelegationId);
      return delegatedPermissionActive(policyById.get(rule.id) || rule.policy, source, parent,
        directory.get(source.issuerAssignmentId), ownPositions, denials, now);
    });
  }
  // 先核实来源链，再让有效禁止规则约束分配与全部后代。
  denials = filterRules(rules).filter(rule => rule.policy.effect === 'deny');
  resolved.clear();
  const activeDelegations = authorities.map(row => resolve(row.id)).filter(Boolean);
  return { activeDelegations, filterRules, sources, denials };
}

async function readGrantSources(connection, organizationId, delegations, lock = false, suppliedRules = null) {
  let rules = suppliedRules;
  if (rules === null) {
    const [ruleRows] = await connection.query(`SELECT * FROM authorization_rules WHERE org_id = ?` + (lock ? ' FOR SHARE' : ''), [organizationId]);
    rules = ruleRows.map(row => ({ id: row.id, name: row.name, version: Number(row.version),
      sourceKind: row.source_kind, sourceRef: row.source_ref,
      policy: typeof (row.allocation_policy_json || row.policy_json) === 'string'
        ? JSON.parse(row.allocation_policy_json || row.policy_json) : row.allocation_policy_json || row.policy_json }));
  }
  const [rows] = await connection.query(`SELECT object_kind AS objectKind, object_id AS objectId,
    parent_delegation_id AS parentDelegationId, issuer_assignment_id AS issuerAssignmentId,
    allow_redelegation AS allowRedelegation
    FROM authorization_grant_sources WHERE org_id = ?` + (lock ? ' FOR SHARE' : ''), [organizationId]);
  const sourceIds = [...new Set(rows.map(row => row.issuerAssignmentId).filter(Boolean))];
  const { loadEffectiveAssignmentsForAuthorization } = require('./authorizationIdentity');
  const issuers = sourceIds.length ? await loadEffectiveAssignmentsForAuthorization(connection, organizationId, sourceIds, lock) : [];
  const people = [...new Set(issuers.map(issuer => issuer.personId))];
  const otherPositions = people.length
    ? (await require('./authorizationCandidates').read(connection, organizationId,
      { role: 'user', unified: true, personIds: people })).assignments
    : [];
  const { candidateActor } = require('../services/authorizationImpact');
  const legacyIds = [...new Set(delegations.flatMap(row => (row.subjects || []).concat(row.envelope?.subjects || []))
    .concat(rules.flatMap(row => row.policy.subjects.concat(row.policy.allocationSubjects || [])))
    .filter(subject => subject.kind === 'adminGrants').flatMap(subject => subject.ids))];
  let projected = delegations;
  let projectedRules = rules;
  if (legacyIds.length) {
    const [bindings] = await connection.query(`SELECT l.admin_grant_id AS grantId,l.assignment_id AS assignmentId
      FROM authorization_identity_assignment_links l
      JOIN admin_grants g ON g.id=l.admin_grant_id AND g.org_id=l.org_id AND g.status='active'
      WHERE l.org_id=? AND l.admin_grant_id IN (${legacyIds.map(() => '?').join(',')})` + (lock ? ' FOR SHARE' : ''),
    [organizationId, ...legacyIds]);
    const assigned = new Map();
    for (const row of bindings) {
      if (!assigned.has(row.grantId)) assigned.set(row.grantId, []);
      assigned.get(row.grantId).push(row.assignmentId);
    }
    const projectSubjects = original => {
      const ids = [...new Set(original.filter(subject => subject.kind === 'adminGrants')
        .flatMap(subject => subject.ids.flatMap(id => assigned.get(id) || [])))];
      if (!ids.length) return original;
      const subjects = original.filter(subject => subject.kind !== 'adminGrants');
      const explicit = new Set(subjects.filter(subject => subject.kind === 'assignments').flatMap(subject => subject.ids));
      for (const id of ids) explicit.add(id);
      return [
        ...subjects.filter(subject => subject.kind !== 'assignments'), { kind: 'assignments', ids: [...explicit] }
      ];
    };
    projected = delegations.map(row => ({ ...row, subjects: projectSubjects(row.subjects),
      envelope: { ...row.envelope, subjects: projectSubjects(row.envelope.subjects) } }));
    projectedRules = rules.map(row => ({ ...row, policy: { ...row.policy, subjects: projectSubjects(row.policy.subjects),
      ...(row.policy.allocationSubjects ? { allocationSubjects: projectSubjects(row.policy.allocationSubjects) } : {}) } }));
  }
  return { ...resolveGrantSources(rows.map(row => ({ ...row, allowRedelegation: Boolean(row.allowRedelegation) })), projected,
    issuers, Date.now(), otherPositions.map(item => candidateActor(item, organizationId, 'user')), projectedRules), legacyDelegations: delegations };
}

async function persistSource(connection, organizationId, kind, id, source) {
  if (!source) return;
  await connection.query(`INSERT INTO authorization_grant_sources
    (org_id, object_kind, object_id, parent_delegation_id, issuer_assignment_id, allow_redelegation)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE parent_delegation_id = VALUES(parent_delegation_id),
      issuer_assignment_id = VALUES(issuer_assignment_id), allow_redelegation = VALUES(allow_redelegation)`,
  [organizationId, kind, id, source.parentDelegationId || null, source.issuerAssignmentId || null, source.allowRedelegation ? 1 : 0]);
}

async function readBasicExclusions(connection, organizationId, lock = false) {
  const [rows] = await connection.query(`SELECT capability_key FROM authorization_basic_role_exclusions
    WHERE org_id = ?` + (lock ? ' FOR SHARE' : ''), [organizationId]);
  return new Set(rows.map(row => row.capability_key));
}

module.exports = { resolveGrantSources, readGrantSources, persistSource, readBasicExclusions };
