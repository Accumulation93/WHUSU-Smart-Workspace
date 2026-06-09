const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM work_groups WHERE org_id = ? ORDER BY name', [orgId]);
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM work_groups WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function create(id, name, departmentId, description = '') {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'INSERT INTO work_groups (id, name, department_id, description, org_id) VALUES (?, ?, ?, ?, ?)',
    [id, name, departmentId, description || '', orgId]
  );
  return { id, name, departmentId };
}

async function update(id, name, departmentId, description, updatedAt) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'UPDATE work_groups SET name = ?, department_id = ?, description = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    [name, departmentId, description || '', updatedAt || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM work_groups WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function getByDepartment(departmentId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM work_groups WHERE department_id = ? AND org_id = ?', [departmentId, orgId]);
  return rows;
}

module.exports = { getAll, getById, create, update, remove, getByDepartment };
