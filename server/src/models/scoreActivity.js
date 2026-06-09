const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_activities WHERE org_id = ? ORDER BY created_at DESC', [orgId]);
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_activities WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getCurrent() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_activities WHERE is_current = 1 AND org_id = ? LIMIT 1', [orgId]);
  return rows[0] || null;
}

async function create(id, data) {
  const { name, description, startDate, endDate, isCurrent, isPaused, createdBy } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO score_activities (id, name, description, start_date, end_date, is_current, is_paused, created_by, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name || '', description || '', startDate || null, endDate || null, isCurrent ? 1 : 0, isPaused ? 1 : 0, createdBy || '', orgId]
  );
}

async function update(id, data) {
  const { name, description, startDate, endDate, isCurrent, isPaused, updatedBy, updatedAt } = data;
  const orgId = await getCurrentOrgId();
  if (isPaused != null) {
    await pool.query(
      `UPDATE score_activities SET name = ?, description = ?, start_date = ?, end_date = ?,
       is_current = ?, is_paused = ?, updated_by = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
      [name || '', description || '', startDate || null, endDate || null,
       isCurrent ? 1 : 0, isPaused ? 1 : 0, updatedBy || '', updatedAt || null, id, orgId]
    );
  } else {
    await pool.query(
      `UPDATE score_activities SET name = ?, description = ?, start_date = ?, end_date = ?,
       is_current = ?, updated_by = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
      [name || '', description || '', startDate || null, endDate || null,
       isCurrent ? 1 : 0, updatedBy || '', updatedAt || null, id, orgId]
    );
  }
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM score_activities WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function clearAllCurrent() {
  const orgId = await getCurrentOrgId();
  await pool.query('UPDATE score_activities SET is_current = 0 WHERE is_current = 1 AND org_id = ?', [orgId]);
}

async function togglePause(id, isPaused) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'UPDATE score_activities SET is_paused = ? WHERE id = ? AND org_id = ?',
    [isPaused ? 1 : 0, id, orgId]
  );
}

module.exports = { getAll, getById, getCurrent, create, update, remove, clearAllCurrent, togglePause };
