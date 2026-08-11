const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByVenueId(venueId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT * FROM venue_booking_policies
      WHERE venue_id = ? AND org_id = ?
      LIMIT 1`,
    [venueId, orgId]
  );
  return rows[0] || null;
}

async function upsert(venueId, data, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO venue_booking_policies
      (id, venue_id, org_id,
       open_advance_mode, open_advance_days, open_advance_minutes,
       deadline_advance_mode, deadline_advance_days, deadline_advance_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       open_advance_mode = VALUES(open_advance_mode),
       open_advance_days = VALUES(open_advance_days),
       open_advance_minutes = VALUES(open_advance_minutes),
       deadline_advance_mode = VALUES(deadline_advance_mode),
       deadline_advance_days = VALUES(deadline_advance_days),
       deadline_advance_minutes = VALUES(deadline_advance_minutes)`,
    [
      data.id,
      venueId,
      orgId,
      data.openAdvanceMode || null,
      data.openAdvanceDays === null ? null : data.openAdvanceDays,
      data.openAdvanceMinutes === null ? null : data.openAdvanceMinutes,
      data.deadlineAdvanceMode || null,
      data.deadlineAdvanceDays === null ? null : data.deadlineAdvanceDays,
      data.deadlineAdvanceMinutes === null ? null : data.deadlineAdvanceMinutes
    ]
  );
}

module.exports = { getByVenueId, upsert };
