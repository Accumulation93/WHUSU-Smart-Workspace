const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByOpenid(openid) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM user_info WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM user_info WHERE org_id = ? ORDER BY created_at DESC', [orgId]);
  return rows;
}

async function create(id, openid, hrId) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'INSERT INTO user_info (id, openid, hr_id, org_id) VALUES (?, ?, ?, ?)',
    [id, openid, hrId || '', orgId]
  );
}

async function update(id, hrId, updatedAt) {
  const orgId = await getCurrentOrgId();
  await pool.query('UPDATE user_info SET hr_id = ?, updated_at = ? WHERE id = ? AND org_id = ?', [hrId || '', updatedAt || null, id, orgId]);
}

async function getByHrId(hrId, excludeOpenid) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM user_info WHERE hr_id = ? AND openid != ? AND org_id = ? LIMIT 1',
    [hrId, excludeOpenid, orgId]
  );
  return rows[0] || null;
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM user_info WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByOpenid, getById, getByHrId, getAll, create, update, remove };
