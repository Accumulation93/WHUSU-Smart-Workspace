const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByVenueId(venueId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_activity_rules WHERE venue_id = ? AND org_id = ? ORDER BY cycle_type, time_start',
    [venueId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_activity_rules WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { venueId, activityName, cycleType, cycleValues, timeStart, timeEnd } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_activity_rules (id, venue_id, org_id, activity_name, cycle_type, cycle_values, time_start, time_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, venueId, orgId, activityName || '', cycleType || 'weekly',
     cycleValues ? JSON.stringify(cycleValues) : null,
     timeStart || '09:00:00', timeEnd || '18:00:00']
  );
}

async function update(id, data, conn) {
  const { activityName, cycleType, cycleValues, timeStart, timeEnd, isActive } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (activityName !== undefined) { fields.push('activity_name = ?'); values.push(activityName); }
  if (cycleType !== undefined) { fields.push('cycle_type = ?'); values.push(cycleType); }
  if (cycleValues !== undefined) { fields.push('cycle_values = ?'); values.push(JSON.stringify(cycleValues)); }
  if (timeStart !== undefined) { fields.push('time_start = ?'); values.push(timeStart); }
  if (timeEnd !== undefined) { fields.push('time_end = ?'); values.push(timeEnd); }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (!fields.length) return;
  values.push(id, orgId);
  await db.query(`UPDATE venue_activity_rules SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_activity_rules WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByVenueId, getById, create, update, remove };
