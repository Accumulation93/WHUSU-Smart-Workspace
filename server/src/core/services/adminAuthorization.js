const crypto = require('crypto');

const SUPER_ADMIN_LEVEL = 'super_admin';
const REGULAR_ADMIN_LEVEL = 'admin';
const ADMIN_LEVELS = [SUPER_ADMIN_LEVEL, REGULAR_ADMIN_LEVEL];
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function createInviteCredential() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';
  for (let i = 0; i < 8; i++) inviteCode += chars[crypto.randomInt(0, chars.length)];
  return {
    inviteCode,
    invitedAt: new Date(),
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS)
  };
}

function isSuperAdmin(admin) {
  return Boolean(admin && admin.admin_level === SUPER_ADMIN_LEVEL);
}

function canViewTarget(operator, target, orgId) {
  if (!operator || !target) return false;
  if (isSuperAdmin(operator)) {
    return (target.admin_level === SUPER_ADMIN_LEVEL && target.org_id === '')
      || (target.admin_level === REGULAR_ADMIN_LEVEL && target.org_id === orgId);
  }
  return operator.admin_level === REGULAR_ADMIN_LEVEL
    && target.admin_level === REGULAR_ADMIN_LEVEL
    && operator.org_id === orgId
    && target.org_id === orgId;
}

function canManageTarget(operator, target, orgId) {
  if (!canViewTarget(operator, target, orgId) || operator.id === target.id) return false;
  if (isSuperAdmin(operator)) return true;
  return operator.admin_level === REGULAR_ADMIN_LEVEL && target.admin_level === REGULAR_ADMIN_LEVEL;
}

function canCreateLevel(operator, adminLevel) {
  if (!operator || !ADMIN_LEVELS.includes(adminLevel)) return false;
  if (isSuperAdmin(operator)) return true;
  return operator.admin_level === REGULAR_ADMIN_LEVEL && adminLevel === REGULAR_ADMIN_LEVEL;
}

function canDeleteTarget(operator, target, orgId, activeSuperAdminCount) {
  if (!canManageTarget(operator, target, orgId)) return false;
  if (target.admin_level !== SUPER_ADMIN_LEVEL || target.bind_status !== 'active') return true;
  return Number(activeSuperAdminCount) > 1;
}

module.exports = {
  SUPER_ADMIN_LEVEL,
  REGULAR_ADMIN_LEVEL,
  ADMIN_LEVELS,
  createInviteCredential,
  isSuperAdmin,
  canViewTarget,
  canManageTarget,
  canCreateLevel,
  canDeleteTarget
};
