'use strict';

const pool = require('../../config/db');
const { createAuthorizationSession } = require('../services/authorizationSession');
const { authorizationError } = require('../services/authorizationError');
const identity = require('./authorizationIdentity');
const migration = require('./hrProfileMigration');

async function actor(reference, capability, connection) {
  const run = async db => {
    const current = await identity.loadActor(db, reference, true);
    const session = await createAuthorizationSession(db, reference, { lock: true });
    if (!current || current.role !== 'admin' || session.mode !== 'enforced' || !session.check({ capability,
      resource: { type: 'hr.profileMigration', organizationId: reference.organizationId }, businessAllowed: true }).allowed) {
      throw authorizationError('authorization_forbidden');
    }
    return { personId: current.personId, orgId: current.organizationId, isSuper: current.isSuper,
      admin: { id: current.legacyAdminId }, authorized: true, authorizationReference: reference,
      requesterGrantId: current.adminGrantId, requesterAccountId: current.accountId };
  };
  return connection ? run(connection) : pool.withTransaction(run);
}

async function organizations() {
  const [rows] = await pool.query('SELECT id,name FROM organizations ORDER BY created_at,id');
  return rows;
}

async function saveRequest(reference, built, token, direct) {
  if (built.blockers.length || !built.plan.persons.length) throw authorizationError('authorization_forbidden');
  const service = require('../services/hrProfileMigrationService');
  const payload = service.decodeToken(token);
  if (payload.planHash !== service.hashPlan(built.plan) || payload.targetOrgId !== reference.organizationId
    || payload.sourceOrgId !== built.plan.sourceOrgId) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    const current = await actor(reference, direct ? 'hr.profileMigration.execute' : 'hr.profileMigration.request', connection);
    if (current.orgId !== built.plan.targetOrgId || (direct && !current.isSuper)) throw authorizationError('authorization_forbidden');
    const plan = { ...built.plan, requesterAuthorization: { accountId: current.requesterAccountId, adminGrantId: current.requesterGrantId,
      personId: current.personId, contextId: reference.contextId, organizationId: reference.organizationId } };
    // 令牌绑定原业务计划，不把内部会话信息作为客户端可控内容。
    if (direct) await require('../services/hrProfileMigrationService').executePlan(current, built.plan, token, connection);
    const id = await migration.createMigration({ sourceOrgId: plan.sourceOrgId, targetOrgId: plan.targetOrgId,
      status: direct ? 'executed' : 'pending', requestedByPersonId: current.personId, requestedByContextId: reference.contextId,
      plan, sourceSnapshotId: plan.sourceSnapshotId, targetSnapshotId: plan.targetSnapshotId,
      result: { token, copied: direct ? plan.persons.length : 0 } }, connection);
    await migration.createItems(id, plan.targetOrgId, plan.persons.map(person => ({ personId: person.personId,
      sourceHrId: person.sourceHrId, targetHrId: person.targetHrId, status: direct ? 'executed' : 'pending' })), connection);
    return { id };
  });
}

async function review(reference, id, action, reason) {
  if (!['approve','reject'].includes(action) || (action === 'reject' && !reason)) throw authorizationError('authorization_forbidden');
  return pool.withTransaction(async connection => {
    const current = await actor(reference, 'hr.profileMigration.approve', connection);
    const record = await migration.getById(id, connection, true);
    if (!record || record.status !== 'pending' || record.sourceOrgId !== current.orgId) throw authorizationError('authorization_forbidden');
    if (action === 'approve') {
      const targetReference = record.plan.requesterAuthorization;
      if (!targetReference || targetReference.personId !== record.requestedByPersonId
        || targetReference.contextId !== record.requestedByContextId || targetReference.organizationId !== record.targetOrgId) {
        throw authorizationError('authorization_forbidden');
      }
      await verifyRequester(connection, targetReference);
      const { requesterAuthorization, ...businessPlan } = record.plan;
      const service = require('../services/hrProfileMigrationService');
      // 预览令牌在提交申请时已验证；人工审批不受浏览器预览有效期限制。
      // 这里只为已锁定的待审申请签发本次内部执行证明，不能传回客户端重复执行。
      const executionToken = service.encodeToken({ sourceOrgId: businessPlan.sourceOrgId, targetOrgId: businessPlan.targetOrgId,
        sourceSnapshotId: businessPlan.sourceSnapshotId, targetSnapshotId: businessPlan.targetSnapshotId,
        planHash: service.hashPlan(businessPlan), expiresAt: Date.now() + 60000 });
      await service.executePlan(current, businessPlan, executionToken, connection);
    }
    await migration.updateStatus(id, { status: action === 'approve' ? 'executed' : 'rejected', reviewedByPersonId: current.personId,
      reviewedByContextId: reference.contextId, rejectReason: action === 'reject' ? reason : '',
      result: { ...record.result, copied: action === 'approve' ? record.plan.persons.length : 0 } }, connection);
    const items = await migration.getItems(id, connection);
    for (const item of items) await migration.updateItem(item.id, { status: action === 'approve' ? 'executed' : 'rejected' }, connection);
    return record;
  });
}

// 来源审批执行已保存的目标组织申请，不要求申请人的浏览器仍停留在原角色；
// 只从服务端保存的申请身份重新核验账号、管理授权和当前规则，不能用于任意代办。
async function verifyRequester(connection, reference) {
  const [rows] = await connection.query(`SELECT g.id,g.admin_level,g.legacy_admin_id FROM admin_grants g
    JOIN persons p ON p.id=g.person_id AND p.status='active'
    JOIN accounts a ON a.person_id=p.id AND a.status='verified'
    WHERE a.id=? AND p.id=? AND g.id=? AND g.status='active'
      AND (g.org_id=? OR (g.org_id='' AND g.admin_level='super_admin')) FOR UPDATE`,
  [reference.accountId, reference.personId, reference.adminGrantId, reference.organizationId]);
  const grant = rows[0];
  if (!grant) throw authorizationError('authorization_forbidden');
  const state = await require('./authorization').read(connection, reference.organizationId, true);
  const { CATALOG } = require('../services/authorizationCatalog');
  const { preparePolicies, evaluate } = require('../services/authorizationPolicy');
  const requestActor = { accountId: reference.accountId, personId: reference.personId, organizationId: reference.organizationId,
    contextId: reference.contextId, role: 'admin', active: true, assignment: null, adminGrantId: grant.id, isSuper: grant.admin_level === 'super_admin' };
  if (state.mode !== 'enforced' || !evaluate({ actor: requestActor, resource: { type: 'hr.profileMigration', organizationId: reference.organizationId },
    capability: 'hr.profileMigration.request', catalog: CATALOG, prepared: preparePolicies(state.rules.map(rule => rule.policy), CATALOG),
    now: Date.now(), businessAllowed: true }).allowed) throw authorizationError('authorization_forbidden');
}

async function cancel(reference, id) {
  return pool.withTransaction(async connection => {
    const current = await actor(reference, 'hr.profileMigration.request', connection);
    const record = await migration.getById(id, connection, true);
    if (!record || record.status !== 'pending' || record.targetOrgId !== current.orgId
      || record.requestedByPersonId !== current.personId || record.requestedByContextId !== reference.contextId) throw authorizationError('authorization_forbidden');
    await migration.updateStatus(id, { status: 'cancelled' }, connection);
    return record;
  });
}

module.exports = { actor, organizations, saveRequest, review, cancel };
