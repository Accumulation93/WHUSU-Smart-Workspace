/**
 * 组织上下文中间件
 *
 * 从请求头 X-Active-Org 提取用户选择的组织 ID，
 * 验证组织存在后注入 AsyncLocalStorage，使所有后续 Model 调用
 * 自动使用正确的 org_id 过滤。
 *
 * 必须放在 authMiddleware 之后（需要 req.openid）。
 */
const { orgStorage } = require('../utils/orgContext');
const pool = require('../config/db');

// 组织存在性缓存（1 分钟 TTL，避免每次请求都查 DB）
const _orgExistsCache = new Map();
const ORG_CACHE_TTL = 60000;

async function orgExists(orgId) {
  const cached = _orgExistsCache.get(orgId);
  if (cached && (Date.now() - cached.at) < ORG_CACHE_TTL) {
    return cached.exists;
  }
  try {
    const [rows] = await pool.query('SELECT id FROM organizations WHERE id = ?', [orgId]);
    const exists = rows && rows.length > 0;
    _orgExistsCache.set(orgId, { exists, at: Date.now() });
    // 清理过期缓存
    if (_orgExistsCache.size > 500) {
      const now = Date.now();
      for (const [key, val] of _orgExistsCache.entries()) {
        if (now - val.at > ORG_CACHE_TTL) _orgExistsCache.delete(key);
      }
    }
    return exists;
  } catch (_) {
    return false;
  }
}

async function orgContextMiddleware(req, res, next) {
  const orgId = (req.headers['x-active-org'] || '').trim();

  if (!orgId) {
    // 无 header → 走系统默认组织（getCurrentOrgId 的 fallback 路径）
    return next();
  }

  // 验证组织是否存在
  const exists = await orgExists(orgId);
  if (!exists) {
    // 组织不存在 → 忽略 header，回退默认组织
    return next();
  }

  // 注入组织上下文到 ALS，该请求链路中所有 getCurrentOrgId() 返回此值
  orgStorage.run(orgId, () => next());
}

module.exports = { orgContextMiddleware };
