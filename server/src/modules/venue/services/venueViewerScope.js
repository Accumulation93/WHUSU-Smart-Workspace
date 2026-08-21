const pool = require('../../../config/db');
const { safeString } = require('../../../utils/helpers');

/**
 * 场地借用跨组织可见性所需的查看者作用域。
 *
 * - isSuperAdmin：任意活跃超级管理员身份（admin_info 或 admin_grants）即为全局可见；
 * - globalOrgAccess：存在 org_id='' 的活跃管理员授权，视为属于所有组织；
 * - orgs：查看者所属组织集合（组织成员关系 + admin_info 活跃行 + admin_grants 活跃授权）；
 * - hrIds：本人组织成员的兼容 hr id 集合（仅用于识别旧借用记录）；
 * - adminIds：本人管理员 id 集合（跨组织）。
 */
async function resolveVenueViewerScope(openid, personId) {
  const orgs = new Set();
  const hrIds = new Set();
  const adminIds = new Set();
  let isSuperAdmin = false;
  let globalOrgAccess = false;

  if (!openid) {
    return { isSuperAdmin, globalOrgAccess, personId: safeString(personId), orgs, hrIds, adminIds };
  }

  if (safeString(personId)) {
    const [membershipRows] = await pool.query(
      `SELECT DISTINCT om.org_id, om.legacy_hr_id
         FROM organization_memberships om
        WHERE om.person_id = ? AND om.status = 'active'`,
      [safeString(personId)]
    );
    for (const row of membershipRows) {
      const org = safeString(row.org_id);
      if (org) orgs.add(org);
      const hrId = safeString(row.legacy_hr_id);
      if (hrId) hrIds.add(hrId);
    }
  } else {
    // 旧令牌没有 person_id 时保留只读兼容，不参与岗位规则判权。
    const [userRows] = await pool.query(
      'SELECT DISTINCT org_id, hr_id FROM user_info WHERE openid = ?',
      [openid]
    );
    for (const row of userRows) {
      const org = safeString(row.org_id);
      if (org) orgs.add(org);
      const hrId = safeString(row.hr_id);
      if (hrId) hrIds.add(hrId);
    }
  }

  // 管理员活跃行
  const [adminRows] = await pool.query(
    'SELECT id, org_id, admin_level FROM admin_info WHERE openid = ? AND bind_status = ?',
    [openid, 'active']
  );
  for (const row of adminRows) {
    const id = safeString(row.id);
    if (id) adminIds.add(id);
    const org = safeString(row.org_id);
    if (org) orgs.add(org);
    if (safeString(row.admin_level) === 'super_admin') isSuperAdmin = true;
  }

  // 跨组织管理员授权（通过 legacy_admin_id 关联到 admin_info）
  const [grantRows] = await pool.query(
    `SELECT g.org_id, g.admin_level
       FROM admin_grants g
       JOIN admin_info a ON a.id = g.legacy_admin_id
      WHERE a.openid = ? AND a.bind_status = ? AND g.status = ?`,
    [openid, 'active', 'active']
  );
  for (const row of grantRows) {
    const org = safeString(row.org_id);
    if (org) orgs.add(org);
    else globalOrgAccess = true;
    if (safeString(row.admin_level) === 'super_admin') isSuperAdmin = true;
  }

  // 统一身份流程可能直接以 person_id 建立授权，无 legacy_admin_id
  if (safeString(personId)) {
    const [personGrantRows] = await pool.query(
      `SELECT org_id, admin_level
         FROM admin_grants
        WHERE person_id = ? AND status = ?`,
      [safeString(personId), 'active']
    );
    for (const row of personGrantRows) {
      const org = safeString(row.org_id);
      if (org) orgs.add(org);
      else globalOrgAccess = true;
      if (safeString(row.admin_level) === 'super_admin') isSuperAdmin = true;
    }
  }

  return { isSuperAdmin, globalOrgAccess, personId: safeString(personId), orgs, hrIds, adminIds };
}

/**
 * 借用记录详情可见性：
 * 超级管理员全局可见；或 creator/approval 组织任一命中查看者组织集合；
 * 或本人创建（普通岗位 hr_id / 管理员 id）的记录。
 */
function canViewBookingDetails(booking, scope) {
  if (scope.isSuperAdmin) return true;
  const creatorOrg = safeString(booking.creator_org_id);
  const approvalOrg = safeString(booking.approval_org_id);
  if (scope.globalOrgAccess && (creatorOrg || approvalOrg)) return true;
  if (scope.orgs.has(creatorOrg) || scope.orgs.has(approvalOrg)) return true;
  const creatorPersonId = safeString(booking.creator_person_id);
  if (creatorPersonId && creatorPersonId === safeString(scope.personId)) return true;
  const userHrId = safeString(booking.user_hr_id);
  if (userHrId && scope.hrIds.has(userHrId)) return true;
  const creatorAdminId = safeString(booking.creator_admin_id);
  if (creatorAdminId && scope.adminIds.has(creatorAdminId)) return true;
  return false;
}

/**
 * 批量解析组织名称，供借用记录详情展示；organizations 为全局组织表。
 */
async function resolveVenueOrgNames(orgIds) {
  const ids = [...new Set((orgIds || []).map(id => safeString(id)).filter(Boolean))];
  if (!ids.length) return {};
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, name FROM organizations WHERE id IN (${placeholders})`,
    ids
  );
  const map = {};
  (rows || []).forEach(r => { map[r.id] = r.name || ''; });
  return map;
}

module.exports = { resolveVenueViewerScope, canViewBookingDetails, resolveVenueOrgNames };
