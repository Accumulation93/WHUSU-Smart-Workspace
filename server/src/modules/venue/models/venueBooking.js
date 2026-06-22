const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByVenueId(venueId, filters) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM venue_bookings WHERE venue_id = ? AND org_id = ?';
  const params = [venueId, orgId];
  if (filters) {
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters.date) { sql += ' AND booking_date = ?'; params.push(filters.date); }
    if (filters.dateFrom) { sql += ' AND booking_date >= ?'; params.push(filters.dateFrom); }
    if (filters.dateTo) { sql += ' AND booking_date <= ?'; params.push(filters.dateTo); }
  }
  sql += ' ORDER BY booking_date DESC, time_start ASC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getByUserId(userHrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT vb.*, v.name AS venue_name, v.location AS venue_location FROM venue_bookings vb JOIN venues v ON vb.venue_id = v.id WHERE vb.user_hr_id = ? AND vb.org_id = ? ORDER BY vb.booking_date DESC, vb.time_start ASC',
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
    if (filters.date) { sql += ' AND vb.booking_date = ?'; params.push(filters.date); }
    if (filters.dateFrom) { sql += ' AND vb.booking_date >= ?'; params.push(filters.dateFrom); }
    if (filters.dateTo) { sql += ' AND vb.booking_date <= ?'; params.push(filters.dateTo); }
    if (filters.userHrId) { sql += ' AND vb.user_hr_id = ?'; params.push(filters.userHrId); }
  }
  sql += ' ORDER BY vb.booking_date DESC, vb.time_start ASC LIMIT 200';
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
  const { venueId, userHrId, title, description, bookingDate, timeStart, timeEnd, status } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_bookings (id, venue_id, user_hr_id, org_id, title, description, booking_date, time_start, time_end, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, venueId, userHrId, orgId, title || '', description || '',
     bookingDate, timeStart, timeEnd, status || 'pending']
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

/**
 * Check for booking conflicts on the same venue, date, and overlapping time.
 * Returns the conflicting booking or null.
 */
async function findConflict(venueId, bookingDate, timeStart, timeEnd, excludeId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  let sql = `SELECT * FROM venue_bookings
    WHERE venue_id = ? AND org_id = ? AND booking_date = ?
      AND status IN ('approved', 'pending')
      AND time_start < ? AND time_end > ?`;
  const params = [venueId, orgId, bookingDate, timeEnd, timeStart];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

module.exports = { getByVenueId, getByUserId, getAll, getById, create, updateStatus, findConflict };
