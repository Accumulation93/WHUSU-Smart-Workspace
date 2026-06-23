const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_booking_purposes WHERE org_id = ? ORDER BY sort_order, created_at',
    [orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_booking_purposes WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const { text, sortOrder } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    'INSERT INTO venue_booking_purposes (id, org_id, text, sort_order) VALUES (?, ?, ?, ?)',
    [id, orgId, text || '', sortOrder || 1]
  );
}

async function update(id, data) {
  const { text, sortOrder } = data;
  const orgId = await getCurrentOrgId();
  const fields = [];
  const values = [];
  if (text !== undefined) { fields.push('text = ?'); values.push(text); }
  if (sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(sortOrder); }
  if (!fields.length) return;
  values.push(id, orgId);
  await pool.query(
    `UPDATE venue_booking_purposes SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`,
    values
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'DELETE FROM venue_booking_purposes WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
}

module.exports = { getAll, getById, create, update, remove };
