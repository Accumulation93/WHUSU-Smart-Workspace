const localeCopy = require('../locales/zh-CN/generated/middleware/adminPermission');
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
      message: localeCopy.copy_278fb8d3d0
    });
  }

  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) {
      return res.status(403).json({ status: 'forbidden', message: localeCopy.copy_b0eb464235 });
    }
    const orgId = await getCurrentOrgId();
    const effective = await loadEffectivePermissions(admin, orgId);
    if (!hasAnyPermission(effective, rule.anyOf)) {
      return res.status(403).json({
        status: 'permission_denied',
        permissionKey: rule.anyOf[0] || '',
        message: localeCopy.copy_9a6b810f66
      });
    }
    req.admin = admin;
    req.adminPermissions = effective;
    return next();
  } catch (error) {
    req.logger.error('Admin permission check failed', { error: error.message, path: routePath });
    return res.status(500).json({ status: 'error', message: localeCopy.copy_e58fa637eb });
  }
}

module.exports = { adminPermissionMiddleware };
