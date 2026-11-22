'use strict';

const pool = require('../../config/db');
const identity = require('./authorizationIdentity');
const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');
const { assignmentPredicate } = require('./identityNatureEligibility');
const CATALOG = require('../services/authorizationCatalog').CATALOG;

const PERSON_RESOURCES = new Set(['auth.accounts', 'auth.identity', 'auth.recovery']);
const ACCOUNT_OPERATIONS = ['read', 'freeze', 'unbindWechat', 'resetPassphrase', 'revokePassphrase',
  'revokeSession', 'manageRecoveryCode', 'approveRecovery'];
function forbidden() { throw authorizationError('authorization_forbidden'); }

async function targetDirectory(connection, organizationId, personIds) {
  if (!personIds.length) return new Map();
  const placeholders = personIds.map(() => '?').join(',');
  const [rows] = await connection.query(`SELECT m.person_id AS personId, a.id AS accountId,
    job.id AS assignmentId, job.assignment_kind AS natureId, job.department_id AS departmentId,
    job.identity_id AS identityCategoryId, job.work_group_id AS workGroupId,
    EXISTS (SELECT 1 FROM admin_grants s WHERE s.person_id = m.person_id AND s.status = 'active'
      AND s.admin_level = 'super_admin') AS isSuper
    FROM organization_memberships m
    JOIN persons p ON p.id = m.person_id AND p.status = 'active'
    LEFT JOIN accounts a ON a.person_id = m.person_id
    LEFT JOIN membership_assignments job ON job.membership_id = m.id AND job.org_id = m.org_id
      AND job.status = 'active' AND ${assignmentPredicate('job')}
    WHERE m.org_id = ? AND m.status = 'active' AND m.person_id IN (${placeholders}) FOR SHARE`,
  [organizationId, ...personIds]);
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row.personId)) result.set(row.personId, { ...row, assignments: [] });
    if (row.assignmentId) result.get(row.personId).assignments.push({ id: row.assignmentId, personId: row.personId, organizationId,
      natureId: row.natureId, departmentId: row.departmentId, identityCategoryId: row.identityCategoryId, workGroupId: row.workGroupId, active: true });
  }
  return result;
}

function targetAllowed(session, capability, actor, target, record) {
  if (!record || (target.accountId && record.accountId !== target.accountId)) return false;
  const resourceType = CATALOG.get(capability).resourceType;
  const mutating = CATALOG.get(capability).action !== 'read';
  if (mutating && !actor.isSuper && Number(record.isSuper) === 1) return false;
  const primary = { type: resourceType, id: target.accountId || target.personId,
    organizationId: actor.organizationId, ownerPersonId: target.personId };
  const slots = record.assignments.length ? record.assignments : [null];
  const verdicts = slots.flatMap(assignment => {
    const check = key => session.check({ capability: key, resource: { ...primary, assignment }, businessAllowed: true });
    const decision = check(capability);
    if (resourceType === 'auth.accounts' && !['read', 'update'].includes(CATALOG.get(capability).action)) {
      // 历史合并动作继续识读；新动作的显式禁止仍阻断该请求。
      return [decision, check('auth.accounts.update')];
    }
    return [decision];
  });
  return !verdicts.some(result => result.reason === 'explicit_deny')
    && verdicts.some(result => result.allowed);
}

function accountOperations(session, actor, target, record) {
  const legacyWrite = session.hasExplicitEntry('auth.accounts.update');
  return Object.fromEntries(ACCOUNT_OPERATIONS.map(action => {
    const capability = 'auth.accounts.' + action;
    const hasCandidate = session.hasExplicitEntry(capability) || (action !== 'read' && legacyWrite);
    return [action, hasCandidate && targetAllowed(session, capability, actor, target, record)];
  }));
}

async function readAccountOperations(reference, target) {
  return pool.withTransaction(async connection => {
    const actor = await identity.loadActor(connection, reference, true);
    if (!actor || actor.unifiedAuthorization !== true) return null;
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    const records = await targetDirectory(connection, actor.organizationId, [target.personId]);
    return accountOperations(session, actor, target, records.get(target.personId));
  });
}

async function check(connection, reference, capability, target = {}) {
  const actor = await identity.loadActor(connection, reference, true);
  if (!actor || (actor.role !== 'admin' && actor.unifiedAuthorization !== true) || !CATALOG.has(capability)) forbidden();
  const session = await createAuthorizationSession(connection, reference, { lock: true });
  const resourceType = CATALOG.get(capability).resourceType;
  if (session.mode !== 'enforced') forbidden();
  if (actor.unifiedAuthorization === true && PERSON_RESOURCES.has(resourceType)) {
    if (target.personId) {
      const directory = await targetDirectory(connection, actor.organizationId, [target.personId]);
      if (!targetAllowed(session, capability, actor, target, directory.get(target.personId))) forbidden();
    } else if (target.accountId || (!session.hasExplicitEntry(capability)
      && (resourceType !== 'auth.accounts' || CATALOG.get(capability).action === 'read'
        || !session.hasExplicitEntry('auth.accounts.update')))) forbidden();
    return actor;
  }
  if (resourceType === 'auth.accounts' && CATALOG.get(capability).action !== 'read') capability = 'auth.accounts.update';
  if (target.personId) {
    const [members] = await connection.query(`SELECT id FROM organization_memberships
      WHERE person_id=? AND org_id=? AND status='active' FOR SHARE`, [target.personId, reference.organizationId]);
    if (!members.length) throw authorizationError('authorization_forbidden');
  }
  if (resourceType === 'auth.accounts' && !target.accountId && !target.personId) {
    if (session.mode !== 'enforced' || !session.hasExplicitEntry(capability)) throw authorizationError('authorization_forbidden');
    return actor;
  }
  const decision = session.check({ capability,
    resource: { type: resourceType, id: target.accountId || target.personId || '', organizationId: reference.organizationId },
    businessAllowed: true,
    legacyAllowed: false });
  if (session.mode !== 'enforced' || !decision.allowed) throw authorizationError('authorization_forbidden');
  return actor;
}

async function authorize(reference, capability, target) {
  return pool.withTransaction(connection => check(connection, reference, capability, target));
}

async function filterAuthorizedPeople(reference, capability, items) {
  return pool.withTransaction(async connection => {
    const actor = await check(connection, reference, capability);
    if (actor.unifiedAuthorization !== true) return items;
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    const ids = [...new Set(items.map(row => row.person_id || row.personId).filter(Boolean))];
    const directory = await targetDirectory(connection, actor.organizationId, ids);
    const allowed = items.filter(row => {
      const personId = row.person_id || row.personId;
      const accountId = row.account_id || row.accountId;
      return targetAllowed(session, capability, actor, { personId, accountId }, directory.get(personId));
    });
    if (actor.role !== 'user') return allowed;
    return allowed.map(row => {
      const { student_id, studentId, ...record } = row;
      return record;
    });
  });
}

module.exports = { check, authorize, filterAuthorizedPeople, targetDirectory, targetAllowed, accountOperations, readAccountOperations };
