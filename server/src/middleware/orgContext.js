/**
 * 组织上下文中间件
 *
 * 从请求头 X-Active-Org 提取用户选择的组织 ID，
 * 验证用户属于该组织后，注入 AsyncLocalStorage，
 * 使所有后续 Model 调用自动使用正确的 org_id 过滤。
 *
 * 必须放在 authMiddleware 之后（需要 req.openid）。
 *
 * 权限隔离：
 *  - 普通用户路由（/api/* 非 admin）→ 只查 user_info + hr_info 绑定
 *  - 管理端路由（/api/admin*）        → 只查 admin_info 绑定
 *  - 两端数据与权限不互通
 */
const { orgStorage } = require('../utils/orgContext');
const pool = require('../config/db');

const ORG_CONTEXT_BYPASS_PATHS = new Set([
  '/api/listMyOrganizations',
  '/api/admin/listMyOrganizations',
  '/api/activateOrganization',
  '/api/userLogin',
  '/api/adminLogin',
  '/api/auth/wechat/session',
  '/api/auth/claims',
  '/api/auth/claims/verify',
  '/api/auth/recovery/start',
  '/api/auth/recovery/complete',
  '/api/confirmAutoBind',
  '/api/bindUserInfo',
  '/api/bindAdminInfo'
]);

function _isAdminRoute(req) {
  // 1. 前端显式指定 X-Role: admin
  const roleHeader = (req.headers['x-role'] || '').toLowerCase();
  if (roleHeader === 'admin') return true;
  // 2. 兼容：路径以 /api/admin 开头
  if (req.path && req.path.startsWith('/api/admin')) return true;
  return false;
}

async function _userCanAccessOrg(openid, orgId) {
  if (!openid || !orgId) return false;
  try {
    const [rows] = await pool.query(
      `SELECT 1
         FROM user_info ui
         JOIN hr_info h ON h.id = ui.hr_id AND h.org_id = ui.org_id
        WHERE ui.openid = ? AND ui.org_id = ? AND ui.hr_id != ''
        LIMIT 1`,
      [openid, orgId]
    );
    return rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function _isGlobalSuperAdmin(openid) {
  if (!openid) return false;
  try {
    const [rows] = await pool.query(
      "SELECT 1 FROM admin_info WHERE openid = ? AND admin_level = 'super_admin' AND org_id = '' AND bind_status = 'active' LIMIT 1",
      [openid]
    );
    return rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function _adminCanAccessOrg(openid, orgId) {
  if (!openid || !orgId) return false;

  // 全局超级管理员可以访问所有组织
  if (await _isGlobalSuperAdmin(openid)) return true;

  try {
    const [rows] = await pool.query(
      "SELECT 1 FROM admin_info WHERE openid = ? AND org_id = ? AND bind_status = 'active' LIMIT 1",
      [openid, orgId]
    );
    return rows.length > 0;
  } catch (_) {
    return false;
  }
}

function clearOrgAccessCache(openid, orgId, role) {
  // 权限改为逐请求读取数据库；保留导出以兼容现有调用方。
  return Boolean(openid && orgId && role);
}

async function orgContextMiddleware(req, res, next) {
  if (ORG_CONTEXT_BYPASS_PATHS.has(req.path)) {
    return next();
  }

  const orgId = (req.headers['x-active-org'] || '').trim();

  if (!orgId) {
    return res.status(400).json({
      status: 'org_context_required',
      message: '缺少组织上下文，请重新登录或更新小程序',
      requestId: req.requestId || ''
    });
  }

  const openid = req.openid || '';
  if (!openid) {
    return res.status(401).json({
      status: 'auth_failed',
      message: '请先登录',
      requestId: req.requestId || ''
    });
  }

  // 按路由类型选择不同的权限校验
  const allowed = _isAdminRoute(req)
    ? await _adminCanAccessOrg(openid, orgId)
    : await _userCanAccessOrg(openid, orgId);

  if (!allowed) {
    return res.status(403).json({
      status: 'org_access_denied',
      message: '当前账号无权访问所选组织，请重新选择',
      requestId: req.requestId || ''
    });
  }

  // 注入组织上下文到 ALS
  orgStorage.run(orgId, () => next());
}

module.exports = { orgContextMiddleware, clearOrgAccessCache };
