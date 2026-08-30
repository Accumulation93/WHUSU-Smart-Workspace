const pool = require('../../../config/db');

async function getAll(orgId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT * FROM score_question_templates WHERE org_id = ? ORDER BY name',
    [orgId]
  );
  return rows;
}

async function getById(id, orgId, connection = pool) {
  const [rows] = await connection.query(
    'SELECT * FROM score_question_templates WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, orgId, data, connection = pool) {
  const { name, description, createdBy } = data;
  await connection.query(
    'INSERT INTO score_question_templates (id, name, description, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
    [id, name || '', description || '', createdBy || '', orgId]
  );
}

async function update(id, orgId, data, connection = pool) {
  const { name, description, updatedBy, updatedAt } = data;
  const [result] = await connection.query(
    'UPDATE score_question_templates SET name = ?, description = ?, updated_by = ?, updated_at = ? WHERE id = ? AND org_id = ?',
    [name || '', description || '', updatedBy || '', updatedAt || null, id, orgId]
  );
  return Number(result.affectedRows || 0);
}

async function remove(id, orgId, connection = pool) {
  const [result] = await connection.query(
    'DELETE FROM score_question_templates WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return Number(result.affectedRows || 0);
}

module.exports = { getAll, getById, create, update, remove };
