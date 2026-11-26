const SUPER_ADMIN_LEVEL = 'super_admin';
// 旧组织管理员授权只作历史权限的内部引用，不再作为可管理身份。
const ADMIN_LEVELS = [SUPER_ADMIN_LEVEL];
function isSuperAdmin(admin) {
  return Boolean(admin && admin.admin_level === SUPER_ADMIN_LEVEL);
}

function canViewTarget(operator, target, orgId) {
  if (!operator || !target) return false;
  return isSuperAdmin(operator) && target.admin_level === SUPER_ADMIN_LEVEL && target.org_id === '';
}

function canManageTarget(operator, target, orgId) {
  if (!canViewTarget(operator, target, orgId) || operator.id === target.id) return false;
  return isSuperAdmin(operator);
}

function canCreateLevel(operator, adminLevel) {
  if (!operator || !ADMIN_LEVELS.includes(adminLevel)) return false;
  return isSuperAdmin(operator);
}

function canDeleteTarget(operator, target, orgId, activeSuperAdminCount) {
  if (!canManageTarget(operator, target, orgId)) return false;
  if (target.admin_level !== SUPER_ADMIN_LEVEL || target.bind_status !== 'active') return true;
  return Number(activeSuperAdminCount) > 1;
}

module.exports = {
  SUPER_ADMIN_LEVEL,
  ADMIN_LEVELS,
  isSuperAdmin,
  canViewTarget,
  canManageTarget,
  canCreateLevel,
  canDeleteTarget
};
