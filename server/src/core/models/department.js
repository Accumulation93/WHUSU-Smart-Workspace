const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM departments WHERE org_id = ? ORDER BY name', [orgId]);
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM departments WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function create(id, name, description = '') {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'INSERT INTO departments (id, name, description, org_id) VALUES (?, ?, ?, ?)',
    [id, name || '', description || '', orgId]
  );
  return { id, name, description };
}

async function update(id, name, description, updatedAt) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'UPDATE departments SET name = ?, description = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    [name, description || '', updatedAt || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM departments WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getAll, getById, create, update, remove };
