const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getByOpenid(openid) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT * FROM admin_info
     WHERE openid = ? AND bind_status = ?
       AND (org_id = ? OR admin_level = 'root_admin')
     ORDER BY admin_level = 'root_admin' DESC
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
  const { name, studentId, openid, adminLevel, bindStatus, inviteCodeHash, invitedAt, inviteExpiresAt } = data;
  const orgId = (adminLevel === 'root_admin') ? '' : await getCurrentOrgId();
  await pool.query(
    `INSERT INTO admin_info
      (id, name, student_id, openid, admin_level, bind_status, invite_code, invite_code_hash,
       invited_at, invite_expires_at, invite_consumed_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
    [id, name || '', studentId || '', openid || '', adminLevel || 'super_admin',
     bindStatus || 'invited', inviteCodeHash || null, invitedAt || null, inviteExpiresAt || null, orgId]
  );
}

async function update(id, data) {
  const fields = [];
  const values = [];
  const allowedFields = ['name', 'student_id', 'openid', 'admin_level', 'bind_status',
    'invite_code', 'invite_code_hash', 'invited_at', 'invite_expires_at', 'invite_consumed_at',
    'bound_at', 'updated_at', 'org_id'];

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

async function getByInviteHash(inviteCodeHash) {
  const [rows] = await pool.query(
    `SELECT * FROM admin_info
      WHERE invite_code_hash = ?
        AND bind_status = 'invited'
        AND invite_consumed_at IS NULL
        AND invite_expires_at > NOW()
      LIMIT 1`,
    [inviteCodeHash]
  );
  return rows[0] || null;
}

async function getRootAdmin() {
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

// 跨组织全局管理员查询 — 返回所有组织中该 openid 的活跃管理员记录（用于智能登录）
async function getByOpenidAcrossOrgs(openid) {
  const [rows] = await pool.query(
    'SELECT * FROM admin_info WHERE openid = ? AND bind_status = ?',
    [openid, 'active']
  );
  return rows;
}

module.exports = {
  getByOpenid, getByOpenidAny, getByOpenidGlobal, getByOpenidAcrossOrgs, getById, getAll,
  create, update, remove, getByInviteHash, getRootAdmin, getByAdminLevel
};
