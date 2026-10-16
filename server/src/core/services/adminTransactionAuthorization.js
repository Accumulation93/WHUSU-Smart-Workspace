'use strict';

const { loadEffectivePermissions, hasAnyPermission } = require('./adminPermissions');
function fail(code) { throw Object.assign(new Error(code), { code }); }

// 锁定当前会话对应的授权，不按同一个人的其他管理角色扩大权限。
async function authorizePermission(db, actor, permission) {
  if (!permission || !actor || !actor.orgId || !actor.personId || !actor.grantId || !actor.accountId || !actor.sessionId || !actor.contextId) fail('forbidden');
  const [accounts] = await db.query('SELECT status, token_version FROM accounts WHERE id = ? AND person_id = ? FOR UPDATE', [actor.accountId, actor.personId]);
  if (!accounts[0] || accounts[0].status !== 'verified') fail('forbidden');
  const [sessions] = await db.query("SELECT token_version FROM auth_sessions WHERE id = ? AND account_id = ? AND context_id = ? AND organization_id = ? AND role = 'admin' AND status = 'active' AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE", [actor.sessionId, actor.accountId, actor.contextId, actor.orgId]);
  if (!sessions[0] || Number(sessions[0].token_version) !== Number(accounts[0].token_version)) fail('forbidden');
  const [people] = await db.query("SELECT status FROM persons WHERE id = ? FOR UPDATE", [actor.personId]);
  if (!people[0] || people[0].status !== 'active') fail('forbidden');
  const [grants] = await db.query("SELECT * FROM admin_grants WHERE id = ? AND person_id = ? AND (org_id = ? OR (admin_level = 'super_admin' AND (org_id = '' OR org_id IS NULL))) FOR UPDATE", [actor.grantId, actor.personId, actor.orgId]);
  const grant = grants[0];
  if (!grant || grant.status !== 'active' || (grant.admin_level !== 'super_admin' && grant.org_id !== actor.orgId)) fail('forbidden');
  const admin = { id: grant.legacy_admin_id || grant.id, org_id: grant.org_id, admin_level: grant.admin_level };
  const effective = await loadEffectivePermissions(admin, actor.orgId, db);
  if (!hasAnyPermission(effective, [permission])) fail('forbidden');
  return { admin, effective };
}

module.exports = { authorizePermission };
