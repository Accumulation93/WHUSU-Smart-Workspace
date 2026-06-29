const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

/**
 * Get bookings for a venue, optionally filtered by datetime range.
 * @param {string} venueId
 * @param {object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.timeFrom] - "YYYY-MM-DD HH:MM:SS" — return bookings ending after this
 * @param {string} [filters.timeTo]   - "YYYY-MM-DD HH:MM:SS" — return bookings starting before this
 */
async function getByVenueId(venueId, filters) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM venue_bookings WHERE venue_id = ? AND org_id = ?';
  const params = [venueId, orgId];
  if (filters) {
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters.timeFrom) { sql += ' AND time_end > ?'; params.push(filters.timeFrom); }
    if (filters.timeTo) { sql += ' AND time_start < ?'; params.push(filters.timeTo); }
  }
  sql += ' ORDER BY time_start ASC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getByUserId(userHrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT vb.*, v.name AS venue_name, v.location AS venue_location FROM venue_bookings vb JOIN venues v ON vb.venue_id = v.id WHERE vb.user_hr_id = ? AND vb.org_id = ? ORDER BY vb.time_start DESC',
    [userHrId, orgId]
  );
  return rows;
}

async function getAll(filters) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT vb.*, v.name AS venue_name, v.location AS venue_location FROM venue_bookings vb JOIN venues v ON vb.venue_id = v.id WHERE vb.org_id = ?';
  const params = [orgId];
  if (filters) {
    if (filters.venueId) { sql += ' AND vb.venue_id = ?'; params.push(filters.venueId); }
    if (filters.status) { sql += ' AND vb.status = ?'; params.push(filters.status); }
    if (filters.timeFrom) { sql += ' AND vb.time_end > ?'; params.push(filters.timeFrom); }
    if (filters.timeTo) { sql += ' AND vb.time_start < ?'; params.push(filters.timeTo); }
    if (filters.userHrId) { sql += ' AND vb.user_hr_id = ?'; params.push(filters.userHrId); }
  }
  sql += ' ORDER BY vb.time_start DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT vb.*, v.name AS venue_name, v.location AS venue_location FROM venue_bookings vb JOIN venues v ON vb.venue_id = v.id WHERE vb.id = ? AND vb.org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data, conn) {
  const { venueId, userHrId, title, description, timeStart, timeEnd, status, approvalFlowId, approvalTotalSteps } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_bookings (id, venue_id, user_hr_id, org_id, title, description, time_start, time_end, status,
      approval_flow_id, approval_current_step, approval_total_steps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, venueId, userHrId, orgId, title || '', description || '',
     timeStart, timeEnd, status || 'pending',
     approvalFlowId || null, 0, approvalTotalSteps || 0]
  );
}

async function updateStatus(id, status, approverHrId, approvalComment, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    'UPDATE venue_bookings SET status = ?, approver_hr_id = ?, approval_comment = ? WHERE id = ? AND org_id = ?',
    [status, approverHrId || null, approvalComment || null, id, orgId]
  );
}

async function updateTimeEnd(id, timeEnd, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    'UPDATE venue_bookings SET time_end = ? WHERE id = ? AND org_id = ?',
    [timeEnd, id, orgId]
  );
}

/**
 * Check for booking conflicts — overlapping datetime range on the same venue.
 * Two bookings conflict if: existing.time_start < new.time_end AND existing.time_end > new.time_start
 * @param {string} venueId
 * @param {string} timeStart - DATETIME string for new booking start
 * @param {string} timeEnd   - DATETIME string for new booking end
 * @param {string} [excludeId] - booking ID to exclude (for approvals)
 * @param {*} [conn] - transaction connection
 */
async function findConflict(venueId, timeStart, timeEnd, excludeId, conn, forUpdate) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  let sql = `SELECT * FROM venue_bookings
    WHERE venue_id = ? AND org_id = ?
      AND status IN ('approved', 'pending')
      AND time_start < ? AND time_end > ?`;
  const params = [venueId, orgId, timeEnd, timeStart];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  if (forUpdate) sql += ' FOR UPDATE';
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

module.exports = { getByVenueId, getByUserId, getAll, getById, create, updateStatus, updateTimeEnd, findConflict };
