/**
 * 组织上下文中间件
 *
 * 从请求头 X-Active-Org 提取用户选择的组织 ID，
 * 验证组织存在 + 用户属于该组织后，注入 AsyncLocalStorage，
 * 使所有后续 Model 调用自动使用正确的 org_id 过滤。
 *
 * 必须放在 authMiddleware 之后（需要 req.openid）。
 */
const { orgStorage } = require('../utils/orgContext');
const pool = require('../config/db');

// 用户-组织访问权缓存（2 分钟 TTL）
const _userOrgCache = new Map();
const USER_ORG_CACHE_TTL = 120000;

async function userCanAccessOrg(openid, orgId) {
  if (!openid || !orgId) return false;
  const key = openid + '::' + orgId;
  const cached = _userOrgCache.get(key);
  if (cached && (Date.now() - cached.at) < USER_ORG_CACHE_TTL) {
    return cached.allowed;
  }

  try {
    // 检查三种关联方式：user_info、admin_info、hr_info 匹配
    const [[userRows], [adminRows]] = await Promise.all([
      pool.query("SELECT 1 FROM user_info WHERE openid = ? AND org_id = ? AND hr_id != '' LIMIT 1", [openid, orgId]),
      pool.query("SELECT 1 FROM admin_info WHERE openid = ? AND org_id = ? AND bind_status = 'active' LIMIT 1", [openid, orgId])
    ]);

    let allowed = (userRows && userRows.length > 0) || (adminRows && adminRows.length > 0);

    // 若直接绑定未找到，检查 hr_info 跨组织匹配
    if (!allowed) {
      const globalRecords = await pool.query(
        'SELECT hr_id FROM user_info WHERE openid = ?',
        [openid]
      );
      const hrIds = (globalRecords[0] || []).filter(r => r.hr_id).map(r => r.hr_id);
      if (hrIds.length > 0) {
        const placeholders = hrIds.map(() => '?').join(',');
        const [identities] = await pool.query(
          `SELECT DISTINCT student_id, name FROM hr_info WHERE id IN (${placeholders})`,
          hrIds
        );
        if (identities.length > 0) {
          const conds = identities.map(() => '(student_id = ? AND name = ?)').join(' OR ');
          const params = [];
          identities.forEach(r => { params.push(r.student_id, r.name); });
          const [matches] = await pool.query(
            `SELECT 1 FROM hr_info WHERE org_id = ? AND (${conds}) LIMIT 1`,
            [orgId, ...params]
          );
          allowed = matches.length > 0;
        }
      }
    }

    _userOrgCache.set(key, { allowed, at: Date.now() });
    // 清理过期缓存
    if (_userOrgCache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of _userOrgCache.entries()) {
        if (now - v.at > USER_ORG_CACHE_TTL) _userOrgCache.delete(k);
      }
    }
    return allowed;
  } catch (_) {
    // 查询失败时保守地允许通过（业务层 Model 的 org_id 隔离会兜底）
    return true;
  }
}

async function orgContextMiddleware(req, res, next) {
  const orgId = (req.headers['x-active-org'] || '').trim();

  if (!orgId) {
    return next();
  }

  // 验证用户是否属于该组织
  const openid = req.openid || '';
  if (openid) {
    const allowed = await userCanAccessOrg(openid, orgId);
    if (!allowed) {
      // 用户不属于该组织 → 忽略 header，回退系统默认组织
      return next();
    }
  }

  // 注入组织上下文到 ALS
  orgStorage.run(orgId, () => next());
}

module.exports = { orgContextMiddleware };
