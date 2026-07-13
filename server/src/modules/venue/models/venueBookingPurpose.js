const pool = require('../../../config/db');

async function getAll() {
  const [rows] = await pool.query(
    'SELECT * FROM venue_booking_purposes ORDER BY sort_order, created_at'
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query(
    'SELECT * FROM venue_booking_purposes WHERE id = ?', [id]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const { text, sortOrder } = data;
  await pool.query(
    'INSERT INTO venue_booking_purposes (id, text, sort_order) VALUES (?, ?, ?)',
    [id, text || '', sortOrder || 1]
  );
}

async function update(id, data) {
  const { text, sortOrder } = data;
  const fields = [];
  const values = [];
  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
  if (!fields.length) return;
  values.push(id);
  await pool.query(
    `UPDATE venue_booking_purposes SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

async function remove(id) {
  await pool.query('DELETE FROM venue_booking_purposes WHERE id = ?', [id]);
}

module.exports = { getAll, getById, create, update, remove };
