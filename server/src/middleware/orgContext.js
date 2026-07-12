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

// 用户-组织访问权缓存（2 分钟 TTL）
const _userOrgCache = new Map();
const USER_ORG_CACHE_TTL = 120000;

function _isAdminRoute(path) {
  return path && path.startsWith('/api/admin');
}

async function _userCanAccessOrg(openid, orgId) {
  if (!openid || !orgId) return false;
  const key = 'user::' + openid + '::' + orgId;
  const cached = _userOrgCache.get(key);
  if (cached && (Date.now() - cached.at) < USER_ORG_CACHE_TTL) {
    return cached.allowed;
  }
  let allowed = false;
  try {
    // 普通用户：只查 user_info 绑定（hr_id 必须有效）
    const [[userRows]] = await Promise.all([
      pool.query("SELECT 1 FROM user_info WHERE openid = ? AND org_id = ? AND hr_id != '' LIMIT 1", [openid, orgId])
    ]);
    allowed = userRows && userRows.length > 0;
  } catch (_) {
    allowed = false;
  }
  _userOrgCache.set(key, { allowed, at: Date.now() });
  _pruneCache();
  return allowed;
}

// root_admin 全局权限缓存（独立 key，跨组织共享）
const _rootAdminCache = new Map();
const ROOT_ADMIN_CACHE_TTL = 300000; // 5 分钟

async function _isRootAdmin(openid) {
  if (!openid) return false;
  const cached = _rootAdminCache.get(openid);
  if (cached && (Date.now() - cached.at) < ROOT_ADMIN_CACHE_TTL) {
    return cached.value;
  }
  let value = false;
  try {
    const [[rows]] = await Promise.all([
      pool.query("SELECT 1 FROM admin_info WHERE openid = ? AND admin_level = 'root_admin' AND bind_status = 'active' LIMIT 1", [openid])
    ]);
    value = rows && rows.length > 0;
  } catch (_) {
    value = false;
  }
  _rootAdminCache.set(openid, { value, at: Date.now() });
  return value;
}

async function _adminCanAccessOrg(openid, orgId) {
  if (!openid || !orgId) return false;

  // root_admin 可以访问所有组织
  if (await _isRootAdmin(openid)) return true;

  const key = 'admin::' + openid + '::' + orgId;
  const cached = _userOrgCache.get(key);
  if (cached && (Date.now() - cached.at) < USER_ORG_CACHE_TTL) {
    return cached.allowed;
  }
  let allowed = false;
  try {
    // 管理端：只查 admin_info 绑定
    const [[adminRows]] = await Promise.all([
      pool.query("SELECT 1 FROM admin_info WHERE openid = ? AND org_id = ? AND bind_status = 'active' LIMIT 1", [openid, orgId])
    ]);
    allowed = adminRows && adminRows.length > 0;
  } catch (_) {
    allowed = false;
  }
  _userOrgCache.set(key, { allowed, at: Date.now() });
  _pruneCache();
  return allowed;
}

function _pruneCache() {
  if (_userOrgCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of _userOrgCache.entries()) {
      if (now - v.at > USER_ORG_CACHE_TTL) _userOrgCache.delete(k);
    }
  }
}

async function orgContextMiddleware(req, res, next) {
  const orgId = (req.headers['x-active-org'] || '').trim();

  if (!orgId) {
    return next();
  }

  const openid = req.openid || '';
  if (!openid) {
    return next();
  }

  // 按路由类型选择不同的权限校验
  const allowed = _isAdminRoute(req.path)
    ? await _adminCanAccessOrg(openid, orgId)
    : await _userCanAccessOrg(openid, orgId);

  if (!allowed) {
    // 用户不属于该组织 → 忽略 header，回退系统默认组织
    return next();
  }

  // 注入组织上下文到 ALS
  orgStorage.run(orgId, () => next());
}

module.exports = { orgContextMiddleware };
