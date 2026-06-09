const pool = require('../config/db');

async function getAll() {
  const [rows] = await pool.query('SELECT * FROM score_question_templates ORDER BY name');
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM score_question_templates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create(id, data) {
  const { name, description, createdBy } = data;
  await pool.query(
    'INSERT INTO score_question_templates (id, name, description, created_by) VALUES (?, ?, ?, ?)',
    [id, name || '', description || '', createdBy || '']
  );
}

async function update(id, data) {
  const { name, description, updatedBy, updatedAt } = data;
  await pool.query(
    'UPDATE score_question_templates SET name = ?, description = ?, updated_by = ?, updated_at = ? WHERE id = ?',
    [name || '', description || '', updatedBy || '', updatedAt || null, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM score_question_templates WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove };
