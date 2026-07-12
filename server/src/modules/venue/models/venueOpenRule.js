const pool = require('../../../config/db');

// 开放时间规则已解绑组织 — 只与场地关联
async function getByVenueId(venueId) {
  const [rows] = await pool.query(
    'SELECT * FROM venue_open_rules WHERE venue_id = ? ORDER BY cycle_type, time_start',
    [venueId]
  );
  return rows;
}

async function getById(id) {
  const [rows] = await pool.query(
    'SELECT * FROM venue_open_rules WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { venueId, name, cycleType, cycleValues, timeStart, timeEnd } = data;
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_open_rules (id, venue_id, name, cycle_type, cycle_values, time_start, time_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, venueId, name || '', cycleType || 'weekly',
     cycleValues ? JSON.stringify(cycleValues) : null,
     timeStart || '09:00:00', timeEnd || '18:00:00']
  );
}

async function update(id, data, conn) {
  const { name, cycleType, cycleValues, timeStart, timeEnd, isActive } = data;
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (cycleType !== undefined) { fields.push('cycle_type = ?'); values.push(cycleType); }
  if (cycleValues !== undefined) { fields.push('cycle_values = ?'); values.push(JSON.stringify(cycleValues)); }
  if (timeStart !== undefined) { fields.push('time_start = ?'); values.push(timeStart); }
  if (timeEnd !== undefined) { fields.push('time_end = ?'); values.push(timeEnd); }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (!fields.length) return;
  values.push(id);
  await db.query(`UPDATE venue_open_rules SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function remove(id, conn) {
  const db = conn || pool;
  await db.query('DELETE FROM venue_open_rules WHERE id = ?', [id]);
}

module.exports = { getByVenueId, getById, create, update, remove };
