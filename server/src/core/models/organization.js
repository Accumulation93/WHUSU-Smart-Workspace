const pool = require('../../config/db');

async function getAll() {
  const [rows] = await pool.query('SELECT * FROM organizations ORDER BY created_at DESC');
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM organizations WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create(id, name) {
  await pool.query('INSERT INTO organizations (id, name) VALUES (?, ?)', [id, name]);
  return { id, name };
}

async function update(id, name) {
  await pool.query('UPDATE organizations SET name = ? WHERE id = ?', [name, id]);
}

async function remove(id) {
  await pool.query('DELETE FROM organizations WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove };
