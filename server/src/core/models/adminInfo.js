const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getByOpenid(openid) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT * FROM admin_info
     WHERE openid = ? AND bind_status = ?
       AND (org_id = ? OR (admin_level = 'super_admin' AND org_id = ''))
     ORDER BY admin_level = 'super_admin' DESC
     LIMIT 1`,
    [openid, 'active', orgId]
  );
  return rows[0] || null;
}

async function getByOpenidAny(openid) {
  const [rows] = await pool.query('SELECT * FROM admin_info WHERE openid = ?', [openid]);
  return rows[0] || null;
}

// 跨组织全局管理员查询 — 场地等全局模块使用，不限制 org_id
async function getByOpenidGlobal(openid) {
  const [rows] = await pool.query(
    'SELECT * FROM admin_info WHERE openid = ? AND bind_status = ? LIMIT 1',
    [openid, 'active']
  );
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    "SELECT * FROM admin_info WHERE id = ? AND (org_id = ? OR (admin_level = 'super_admin' AND org_id = ?))",
    [id, orgId, '']
  );
  return rows[0] || null;
}

async function getByIdGlobal(id, connection, lock) {
  const db = connection || pool;
  const [rows] = await db.query(
    `SELECT * FROM admin_info WHERE id = ? AND admin_level IN ('super_admin', 'admin') LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return rows[0] || null;
}

async function listVisible(operator, orgId, connection) {
  const db = connection || pool;
  if (operator.admin_level === 'super_admin') {
    const [rows] = await db.query(
      `SELECT * FROM admin_info
        WHERE (admin_level = 'super_admin' AND org_id = '')
           OR (admin_level = 'admin' AND org_id = ?)
        ORDER BY FIELD(admin_level, 'super_admin', 'admin'), name, student_id`,
      [orgId]
    );
    return rows;
  }
  const [rows] = await db.query(
    "SELECT * FROM admin_info WHERE admin_level = 'admin' AND org_id = ? ORDER BY name, student_id",
    [orgId]
  );
  return rows;
}

async function getAll(operator) {
  const orgId = await getCurrentOrgId();
  return listVisible(operator, orgId);
}

async function listByIdsInOrg(ids, orgId) {
  const adminIds = Array.isArray(ids) ? [...new Set(ids.filter(Boolean))] : [];
  if (!adminIds.length || !orgId) return [];
  const [rows] = await pool.query(
    `SELECT id, name
       FROM admin_info
      WHERE id IN (?)
        AND (org_id = ? OR (admin_level = 'super_admin' AND org_id = ''))`,
    [adminIds, orgId]
  );
  return rows;
}

async function create(id, data, connection) {
  const db = connection || pool;
  const { name, studentId, openid, adminLevel, bindStatus, inviteCode, invitedAt, inviteExpiresAt } = data;
  const orgId = adminLevel === 'super_admin' ? '' : (data.orgId || await getCurrentOrgId());
  await db.query(
    `INSERT INTO admin_info
      (id, name, student_id, openid, admin_level, bind_status, invite_code,
       invited_at, invite_expires_at, invite_consumed_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [id, name || '', studentId || '', openid || '', adminLevel || 'admin',
     bindStatus || 'invited', inviteCode || null, invitedAt || null, inviteExpiresAt || null, orgId]
  );
}

async function update(id, data) {
  const fields = [];
  const values = [];
  const allowedFields = ['name', 'student_id', 'openid', 'bind_status',
    'invite_code', 'invited_at', 'invite_expires_at', 'invite_consumed_at',
    'bound_at', 'updated_at'];

  for (const [key, value] of Object.entries(data)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(dbKey)) {
      fields.push(`${dbKey} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return;

  const orgId = await getCurrentOrgId();
  values.push(id, orgId);

  await pool.query(`UPDATE admin_info SET ${fields.join(', ')} WHERE id = ? AND (org_id = ? OR org_id = '')`, values);
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM admin_info WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function studentExists(studentId, orgId, excludeId, connection) {
  const db = connection || pool;
  const params = [studentId, orgId];
  let sql = 'SELECT id FROM admin_info WHERE student_id = ? AND org_id = ?';
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  const [rows] = await db.query(sql, params);
  return rows.length > 0;
}

async function updateProfile(connection, target, data) {
  const [result] = await connection.query(
    `UPDATE admin_info SET name = ?, student_id = ?, updated_at = NOW()
      WHERE id = ? AND admin_level = ? AND org_id = ?`,
    [data.name, data.studentId, target.id, target.admin_level, target.org_id]
  );
  return result.affectedRows === 1;
}

async function updateInvite(connection, target, invite) {
  const [result] = await connection.query(
    `UPDATE admin_info
        SET invite_code = ?, invited_at = ?, invite_expires_at = ?,
            invite_consumed_at = NULL,
            openid = IF(bind_status = 'invited', NULL, openid),
            updated_at = NOW()
      WHERE id = ? AND admin_level = ? AND org_id = ?`,
    [invite.inviteCode, invite.invitedAt, invite.inviteExpiresAt,
      target.id, target.admin_level, target.org_id]
  );
  return result.affectedRows === 1;
}

async function removeExact(connection, target) {
  const [result] = await connection.query(
    'DELETE FROM admin_info WHERE id = ? AND admin_level = ? AND org_id = ?',
    [target.id, target.admin_level, target.org_id]
  );
  return result.affectedRows === 1;
}

async function lockSuperAdmins(connection) {
  const [rows] = await connection.query(
    "SELECT id, bind_status FROM admin_info WHERE admin_level = 'super_admin' AND org_id = '' FOR UPDATE"
  );
  return rows;
}

async function getByInviteCode(inviteCode) {
  const [rows] = await pool.query(
    `SELECT * FROM admin_info
      WHERE invite_code = ?
        AND bind_status = 'invited'
        AND invite_consumed_at IS NULL
        AND invite_expires_at > NOW()
      LIMIT 1`,
    [inviteCode]
  );
  return rows[0] || null;
}

async function getSuperAdmin() {
  const [rows] = await pool.query(
    "SELECT * FROM admin_info WHERE admin_level = 'super_admin' AND org_id = '' LIMIT 1"
  );
  return rows[0] || null;
}

async function getByAdminLevel(level) {
  if (level === 'super_admin') {
    const [rows] = await pool.query("SELECT * FROM admin_info WHERE admin_level = 'super_admin' AND org_id = ''");
    return rows;
  }
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM admin_info WHERE admin_level = ? AND org_id = ?', [level, orgId]);
  return rows;
}

// 跨组织全局管理员查询 — 返回所有组织中该 openid 的活跃管理员记录（用于智能登录）
async function getByOpenidAcrossOrgs(openid) {
  const [rows] = await pool.query(
    'SELECT * FROM admin_info WHERE openid = ? AND bind_status = ?',
    [openid, 'active']
  );
  return rows;
}

module.exports = {
  getByOpenid, getByOpenidAny, getByOpenidGlobal, getByOpenidAcrossOrgs, getById, getByIdGlobal,
  listVisible, getAll, listByIdsInOrg, create, update, remove, studentExists, updateProfile, updateInvite, removeExact,
  lockSuperAdmins, getByInviteCode, getSuperAdmin, getByAdminLevel
};
