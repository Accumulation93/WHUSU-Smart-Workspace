const localeCopy = require('../locales/zh-CN/generated/middleware/orgContext');
/**
 * 组织上下文中间件
 *
 * 从已验证的统一认证会话读取工作上下文，
 * 验证上下文仍然有效后，注入 AsyncLocalStorage，
 * 使所有后续 Model 调用自动使用正确的 org_id 过滤。
 *
 * 必须放在 authMiddleware 之后（需要 req.authContext）。
 */
const { orgStorage } = require('../utils/orgContext');

const ORG_CONTEXT_BYPASS_PATHS = new Set([
  '/api/listMyOrganizations',
  '/api/admin/listMyOrganizations',
  '/api/activateOrganization',
  '/api/userLogin',
  '/api/adminLogin',
  '/api/auth/wechat/session',
  '/api/auth/claims',
  '/api/auth/claims/verify',
  '/api/auth/claims/redeem',
  '/api/auth/password/session',
  '/api/auth/recovery/start',
  '/api/auth/recovery/complete',
  '/api/confirmAutoBind',
  '/api/bindUserInfo',
  '/api/bindAdminInfo'
]);

function clearOrgAccessCache(openid, orgId, role) {
  // 权限改为逐请求读取数据库；保留导出以兼容现有调用方。
  return Boolean(openid && orgId && role);
}

async function orgContextMiddleware(req, res, next) {
  if (ORG_CONTEXT_BYPASS_PATHS.has(req.path)) {
    return next();
  }

  const authContext = req.authContext;
  const orgId = authContext && String(authContext.organizationId || '').trim();

  if (!authContext || !orgId) {
    return res.status(401).json({
      status: 'auth_failed',
      message: localeCopy.copy_80a283f3f0,
      requestId: req.requestId || ''
    });
  }

  // 覆盖兼容请求头，禁止客户端自行选择组织或角色。
  req.headers['x-active-org'] = orgId;
  req.headers['x-role'] = String(authContext.role || '');

  // 注入组织上下文到 ALS
  orgStorage.run(orgId, () => next());
}

module.exports = { orgContextMiddleware, clearOrgAccessCache };
