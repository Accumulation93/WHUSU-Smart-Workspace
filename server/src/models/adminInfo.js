const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByOpenid(openid) {
  // Used for admin login — must find root_admin (org_id = '') regardless of current org.
  // Use raw query without org_id filter.
  const [rows] = await pool.query(
    'SELECT * FROM admin_info WHERE openid = ? AND bind_status = ?',
    [openid, 'active']
  );
  return rows[0] || null;
}

async function getByOpenidAny(openid) {
  // Also used for login/check, bypass org filter
  const [rows] = await pool.query('SELECT * FROM admin_info WHERE openid = ?', [openid]);
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM admin_info WHERE id = ? AND (org_id = ? OR org_id = ?)',
    [id, orgId, '']
  );
  return rows[0] || null;
}

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    "SELECT * FROM admin_info WHERE org_id = ? OR admin_level = 'root_admin' ORDER BY admin_level, name",
    [orgId]
  );
  return rows;
}

async function create(id, data) {
  const { name, studentId, openid, adminLevel, bindStatus, inviteCode, invitedAt } = data;
  const orgId = (adminLevel === 'root_admin') ? '' : await getCurrentOrgId();
  await pool.query(
    `INSERT INTO admin_info (id, name, student_id, openid, admin_level, bind_status, invite_code, invited_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name || '', studentId || '', openid || '', adminLevel || 'super_admin',
     bindStatus || 'invited', inviteCode || null, invitedAt || null, orgId]
  );
}

async function update(id, data) {
  const fields = [];
  const values = [];
  const allowedFields = ['name', 'student_id', 'openid', 'admin_level', 'bind_status',
    'invite_code', 'invited_at', 'bound_at', 'updated_at', 'org_id'];

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

async function getByInviteCode(code) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    "SELECT * FROM admin_info WHERE invite_code = ? AND (org_id = ? OR org_id = '')",
    [code, orgId]
  );
  return rows[0] || null;
}

async function getRootAdmin() {
  // root_admin is global (org_id = ''), no org filter
  const [rows] = await pool.query(
    "SELECT * FROM admin_info WHERE admin_level = 'root_admin' LIMIT 1"
  );
  return rows[0] || null;
}

async function getByAdminLevel(level) {
  if (level === 'root_admin') {
    const [rows] = await pool.query("SELECT * FROM admin_info WHERE admin_level = 'root_admin'");
    return rows;
  }
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM admin_info WHERE admin_level = ? AND org_id = ?', [level, orgId]);
  return rows;
}

module.exports = {
  getByOpenid, getByOpenidAny, getById, getAll,
  create, update, remove, getByInviteCode, getRootAdmin, getByAdminLevel
};
