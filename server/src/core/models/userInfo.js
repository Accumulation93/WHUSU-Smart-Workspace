const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

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

// 跨组织全局查询 — 返回所有组织中该 openid 的绑定记录
async function getByOpenidGlobal(openid) {
  const [rows] = await pool.query(
    'SELECT * FROM user_info WHERE openid = ? ORDER BY created_at DESC',
    [openid]
  );
  return rows;
}

// 指定组织查询 — 不依赖 getCurrentOrgId()，直接按参数 orgId 过滤
async function getByOpenidInOrg(openid, orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] || null;
}

// 创建绑定到指定组织
async function createInOrg(id, openid, hrId, orgId) {
  await pool.query(
    'INSERT INTO user_info (id, openid, hr_id, org_id) VALUES (?, ?, ?, ?)',
    [id, openid, hrId || '', orgId]
  );
}

module.exports = {
  getByOpenid, getByOpenidGlobal, getByOpenidInOrg, getById, getByHrId, getAll,
  create, createInOrg, update, remove
};
