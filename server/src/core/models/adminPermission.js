const pool = require('../../config/db');

async function isLegacyReadOnly(orgId, connection) {
  const [rows] = await (connection || pool).query('SELECT mode FROM authorization_organizations WHERE org_id = ?', [orgId]);
  return rows.length > 0 && rows[0].mode !== 'shadow';
}

async function getOverrides(orgId, adminId, connection) {
  const db = connection || pool;
  const [rows] = await db.query(
    'SELECT permission_key, granted FROM admin_permission_overrides WHERE org_id = ? AND admin_id = ?' + (connection ? ' FOR UPDATE' : ''),
    [orgId, adminId]
  );
  return rows;
}

async function listTargets(orgId, levels) {
  const safeLevels = (levels || []).filter((level) => level === 'admin');
  if (!safeLevels.length) return [];
  const placeholders = safeLevels.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, name, student_id, admin_level, bind_status, org_id
       FROM admin_info
      WHERE org_id = ? AND admin_level IN (${placeholders})
      ORDER BY name, student_id`,
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

async function upsertOverrides(connection, data) {
  // 与新授权切换共用组织行锁；等待切换完成后必须读取当前模式，不能用旧事务快照写回。
  await connection.query('INSERT IGNORE INTO authorization_organizations (org_id) VALUES (?)', [data.orgId]);
  const [states] = await connection.query('SELECT mode FROM authorization_organizations WHERE org_id = ? FOR UPDATE', [data.orgId]);
  if (states.length !== 1 || states[0].mode !== 'shadow') {
    throw Object.assign(new Error('authorization_legacy_read_only'), { code: 'authorization_legacy_read_only' });
  }
  for (const item of data.items) {
    await connection.query(
      `INSERT INTO admin_permission_overrides
        (id, org_id, admin_id, permission_key, granted, configured_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE granted = VALUES(granted), configured_by = VALUES(configured_by), updated_at = NOW()`,
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

module.exports = { getOverrides, listTargets, getTarget, upsertOverrides, createAuditLog, isLegacyReadOnly };
