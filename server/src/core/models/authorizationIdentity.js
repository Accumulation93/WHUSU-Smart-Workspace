'use strict';

const { assignmentPredicate } = require('./identityNatureEligibility');

// 读取授权事实时不使用客户端岗位、姓名或微信标识；写事务可锁定同一会话重新核实。
async function loadActor(connection, reference, lock = false) {
  if (!reference || !reference.accountId || !reference.sessionId || !reference.contextId
    || !reference.organizationId || !reference.personId) return null;
  const suffix = lock ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(`SELECT a.id AS accountId, a.person_id AS personId,
    s.id AS sessionId, s.context_id AS contextId, s.organization_id AS organizationId,
    s.role, s.context_type AS contextType, s.context_subject_id AS subjectId
    FROM accounts a JOIN persons p ON p.id = a.person_id AND p.status = 'active'
    JOIN auth_sessions s ON s.account_id = a.id AND s.token_version = a.token_version
    JOIN organizations o ON o.id = s.organization_id
    WHERE a.id = ? AND a.person_id = ? AND a.status = 'verified'
      AND s.id = ? AND s.context_id = ? AND s.organization_id = ?
      AND s.status = 'active' AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP(3)${suffix}`,
  [reference.accountId, reference.personId, reference.sessionId, reference.contextId, reference.organizationId]);
  const session = rows[0];
  if (!session) return null;
  return loadRole(connection, session, lock);
}

async function loadRole(connection, session, lock) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const actor = { accountId: session.accountId, personId: session.personId, sessionId: session.sessionId,
    contextId: session.contextId, organizationId: session.organizationId, role: session.role,
    active: true, assignment: null, adminGrantId: null, isSuper: false };
  if (session.role === 'admin' && session.contextType === 'admin') {
    const [grants] = await connection.query(`SELECT id, admin_level, legacy_admin_id FROM admin_grants
      WHERE id = ? AND person_id = ? AND status = 'active'
        AND (org_id = ? OR (admin_level = 'super_admin' AND org_id = ''))${suffix}`,
    [session.subjectId, session.personId, session.organizationId]);
    const grant = grants[0];
    if (!grant || !['admin', 'super_admin'].includes(grant.admin_level)) return null;
    actor.adminGrantId = grant.id;
    actor.legacyAdminId = grant.legacy_admin_id || grant.id;
    actor.isSuper = grant.admin_level === 'super_admin';
    return actor;
  }
  if (session.role !== 'user' || !['assignment', 'membership'].includes(session.contextType)) return null;
  if (session.contextType === 'membership') {
    const [members] = await connection.query(`SELECT m.id FROM organization_memberships m
      WHERE m.id = ? AND m.person_id = ? AND m.org_id = ? AND m.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM membership_assignments a
          WHERE a.membership_id = m.id AND a.org_id = m.org_id AND a.status = 'active'
            AND ${assignmentPredicate('a')})${suffix}`,
    [session.subjectId, session.personId, session.organizationId]);
    return members.length ? actor : null;
  }
  const [assignments] = await connection.query(`SELECT a.id, a.org_id AS organizationId,
    m.person_id AS personId, a.assignment_kind AS natureId, a.department_id AS departmentId,
    a.identity_id AS identityCategoryId, a.work_group_id AS workGroupId
    FROM membership_assignments a
    JOIN organization_memberships m ON m.id = a.membership_id AND m.org_id = a.org_id AND m.status = 'active'
    JOIN departments d ON d.id = a.department_id AND d.org_id = a.org_id
    JOIN identities i ON i.id = a.identity_id AND i.org_id = a.org_id
    JOIN assignment_natures n ON n.id = a.assignment_kind COLLATE utf8mb4_unicode_ci
      AND n.org_id = a.org_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN work_groups w ON w.id = a.work_group_id AND w.org_id = a.org_id AND w.department_id = a.department_id
    WHERE a.id = ? AND a.org_id = ? AND m.person_id = ? AND a.status = 'active'
      AND ${assignmentPredicate('a')}
      AND (a.work_group_id IS NULL OR a.work_group_id = '' OR w.id IS NOT NULL)${suffix}`,
  [session.subjectId, session.organizationId, session.personId]);
  if (!assignments[0]) return null;
  actor.assignment = Object.assign({}, assignments[0], { active: true });
  return actor;
}

// 只供消息聚合逐角色读取；不激活角色，不允许用其结果执行任何业务写入。
async function loadMessageActor(connection, reference, targetContextId) {
  const current = await loadActor(connection, reference);
  if (!current) return null;
  if (current.contextId === targetContextId) return current;
  const contexts = await require('./unifiedIdentity').listContexts(current.accountId, connection);
  const target = contexts.find(item => item.contextId === targetContextId && item.personId === current.personId);
  if (!target) return null;
  return loadRole(connection, { accountId: current.accountId, personId: current.personId,
    sessionId: current.sessionId, contextId: target.contextId, organizationId: target.organizationId,
    role: target.role, contextType: target.identityType,
    subjectId: target.adminGrantId || target.assignmentId || target.membershipId }, false);
}

// 手机日历凭据仅能读取；不能用订阅解析出的角色建立业务写会话。
async function loadCalendarSubscriptionActor(connection, tokenHash, targetContextId) {
  const [rows] = await connection.query(`SELECT a.id AS accountId,a.person_id AS personId
    FROM calendar_subscriptions s JOIN accounts a ON a.id=s.account_id AND a.person_id=s.person_id AND a.status='verified'
    JOIN persons p ON p.id=a.person_id AND p.status='active'
    WHERE s.token_hash=? AND s.revoked=0 FOR SHARE`, [tokenHash]);
  const account = rows[0];
  if (!account) return null;
  const contexts = await require('./unifiedIdentity').listContexts(account.accountId, connection);
  const target = contexts.find(item => item.contextId === targetContextId && item.personId === account.personId);
  if (!target) return null;
  return loadRole(connection, { ...account, sessionId: null, contextId: target.contextId, organizationId: target.organizationId,
    role: target.role, contextType: target.identityType,
    subjectId: target.adminGrantId || target.assignmentId || target.membershipId }, false);
}

// 公开核验只从有效身份卡解析持有人；不接收查看者指定的人员或岗位，也不能用于写操作。
async function loadIdentityCardActor(connection, tokenHash) {
  const [rows] = await connection.query(`SELECT a.id AS accountId,a.person_id AS personId,c.org_id,c.context_id
    FROM identity_cards c JOIN accounts a ON a.id=c.account_id AND a.status='verified'
    JOIN persons p ON p.id=a.person_id AND p.status='active'
    WHERE c.token_hash=? AND c.expires_at>UTC_TIMESTAMP(3)`, [tokenHash]);
  const account = rows[0];
  if (!account) return null;
  const contexts = await require('./unifiedIdentity').listContexts(account.accountId, connection);
  const target = contexts.find(item => item.contextId === account.context_id && item.organizationId === account.org_id);
  if (!target) return null;
  const actor = await loadRole(connection, { accountId: account.accountId, personId: account.personId, sessionId: null,
    contextId: target.contextId, organizationId: target.organizationId, role: target.role,
    contextType: target.identityType, subjectId: target.adminGrantId || target.assignmentId || target.membershipId }, false);
  return actor ? { actor, context: target } : null;
}

module.exports = { loadActor, loadMessageActor, loadCalendarSubscriptionActor, loadIdentityCardActor };
