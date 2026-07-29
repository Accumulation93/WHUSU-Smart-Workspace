const adminInfoModel = require('../core/models/adminInfo');
const { getCurrentOrgId } = require('../utils/orgContext');
const { ROUTE_RULES, loadEffectivePermissions, hasAnyPermission } = require('../core/services/adminPermissions');

async function adminPermissionMiddleware(req, res, next) {
  const routePath = req.path.startsWith('/api/') ? req.path.slice(4) : req.path;
  const rule = ROUTE_RULES.get(routePath);
  if (!rule) return next();

  const selectedRole = String(req.get('X-Role') || '').toLowerCase();
  if (selectedRole !== 'admin') {
    if (selectedRole === 'user' && rule.allowUserRole) return next();
    return res.status(403).json({
      status: 'admin_role_required',
      message: '请切换到管理员身份后重试'
    });
  }

  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) {
      return res.status(403).json({ status: 'forbidden', message: '请重新选择管理员身份' });
    }
    const orgId = await getCurrentOrgId();
    const effective = await loadEffectivePermissions(admin, orgId);
    if (!hasAnyPermission(effective, rule.anyOf)) {
      return res.status(403).json({
        status: 'permission_denied',
        permissionKey: rule.anyOf[0] || '',
        message: '请使用有相应权限的管理员身份'
      });
    }
    req.admin = admin;
    req.adminPermissions = effective;
    return next();
  } catch (error) {
    req.logger.error('Admin permission check failed', { error: error.message, path: routePath });
    return res.status(500).json({ status: 'error', message: '请稍后重试' });
  }
}

module.exports = { adminPermissionMiddleware };
