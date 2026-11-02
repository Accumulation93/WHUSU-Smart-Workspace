'use strict';

const { inspect } = require('../services/authorizationLegacyInventory');

// 必须在同一只读事务内取得旧授权、关联关系和覆盖值，不按姓名或账号状态补配。
async function read(connection, organizationId, lock = false) {
  if (typeof organizationId !== 'string' || !organizationId) throw Error('authorization_organization_missing');
  const [grants] = await connection.query(`SELECT id, legacy_admin_id FROM admin_grants
    WHERE org_id = ? AND admin_level = 'admin' AND status = 'active' ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [organizationId]);
  const [admins] = await connection.query(`SELECT id, org_id, admin_level FROM admin_info
    WHERE org_id = ? AND admin_level = 'admin' ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [organizationId]);
  const [overrides] = await connection.query(`SELECT admin_id, permission_key, granted
    FROM admin_permission_overrides WHERE org_id = ? ORDER BY admin_id, permission_key${lock ? ' FOR UPDATE' : ''}`, [organizationId]);
  const byAdmin = new Map(admins.map(admin => [admin.id, admin]));
  const grouped = new Map();
  for (const row of overrides) {
    if (!grouped.has(row.admin_id)) grouped.set(row.admin_id, []);
    grouped.get(row.admin_id).push(row);
  }
  const linked = new Set();
  const issues = [];
  const baselines = [];
  for (const grant of grants) {
    const admin = byAdmin.get(grant.legacy_admin_id);
    if (!admin) {
      issues.push({ kind: 'missing_legacy_admin', adminGrantId: grant.id });
      continue;
    }
    if (linked.has(admin.id)) {
      issues.push({ kind: 'ambiguous_legacy_admin', legacyAdminId: admin.id });
      continue;
    }
    linked.add(admin.id);
    const baseline = inspect({ organizationId, adminGrantId: grant.id, admin, overrides: grouped.get(admin.id) || [] });
    baselines.push(baseline);
    issues.push(...baseline.issues.map(issue => ({ ...issue, adminGrantId: grant.id })));
  }
  for (const admin of admins) {
    if (!linked.has(admin.id)) issues.push({ kind: 'unlinked_legacy_admin', legacyAdminId: admin.id });
  }
  for (const id of grouped.keys()) {
    if (!byAdmin.has(id)) issues.push({ kind: 'unmatched_override', legacyAdminId: id });
  }
  return { organizationId, baselines, issues, readyForCutover: false };
}

module.exports = { read };
