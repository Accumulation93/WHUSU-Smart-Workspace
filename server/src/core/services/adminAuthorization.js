const crypto = require('crypto');
const { safeString } = require('../../utils/helpers');

const DIRECT_MANAGED_LEVEL = {
  root_admin: 'super_admin',
  super_admin: 'admin'
};
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function hashInviteCode(inviteCode) {
  return crypto.createHash('sha256').update(safeString(inviteCode).toUpperCase()).digest('hex');
}

function createInviteCredential() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';
  for (let i = 0; i < 8; i++) inviteCode += chars[crypto.randomInt(0, chars.length)];
  return {
    inviteCode,
    inviteCodeHash: hashInviteCode(inviteCode),
    invitedAt: new Date(),
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS)
  };
}

function canManageTarget(operator, target, orgId) {
  if (!operator || !target) return false;
  const expectedLevel = DIRECT_MANAGED_LEVEL[operator.admin_level];
  return Boolean(expectedLevel && target.admin_level === expectedLevel && target.org_id === orgId);
}

function canCreateLevel(operator, adminLevel) {
  return Boolean(operator && DIRECT_MANAGED_LEVEL[operator.admin_level] === adminLevel);
}

module.exports = {
  DIRECT_MANAGED_LEVEL,
  hashInviteCode,
  createInviteCredential,
  canManageTarget,
  canCreateLevel
};
