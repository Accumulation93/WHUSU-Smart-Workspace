const pool = require('../../config/db');

async function getOverrides(orgId, adminId, connection) {
  const db = connection || pool;
  const [rows] = await db.query(
    'SELECT permission_key, granted FROM admin_permission_overrides WHERE org_id = ? AND admin_id = ?',
    [orgId, adminId]
  );
  return rows;
}

async function listTargets(orgId, levels) {
  const safeLevels = (levels || []).filter((level) => level === 'super_admin' || level === 'admin');
  if (!safeLevels.length) return [];
  const placeholders = safeLevels.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, name, student_id, admin_level, bind_status, org_id
       FROM admin_info
      WHERE org_id = ? AND admin_level IN (${placeholders})
      ORDER BY FIELD(admin_level, 'super_admin', 'admin'), name, student_id`,
    [orgId].concat(safeLevels)
  );
  return rows;
}

async function getTarget(orgId, adminId, connection, lock) {
  const db = connection || pool;
  const [rows] = await db.query(
    `SELECT id, name, student_id, admin_level, bind_status, org_id
       FROM admin_info
      WHERE id = ? AND org_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [adminId, orgId]
  );
  return rows[0] || null;
}

async function replaceOverrides(connection, data) {
  await connection.query(
    'DELETE FROM admin_permission_overrides WHERE org_id = ? AND admin_id = ?',
    [data.orgId, data.adminId]
  );
  for (const item of data.items) {
    await connection.query(
      `INSERT INTO admin_permission_overrides
        (id, org_id, admin_id, permission_key, granted, configured_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [item.id, data.orgId, data.adminId, item.permissionKey, item.granted ? 1 : 0, data.operatorId]
    );
  }
}

async function createAuditLog(connection, data) {
  await connection.query(
    `INSERT INTO admin_permission_audit_logs
      (id, org_id, operator_admin_id, target_admin_id, action, snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [data.id, data.orgId, data.operatorId, data.targetAdminId, data.action, JSON.stringify(data.snapshot)]
  );
}

module.exports = { getOverrides, listTargets, getTarget, replaceOverrides, createAuditLog };
