const pool = require('../../../config/db');

async function getPendingVenueBookings(orgId) {
  const [rows] = await pool.query(
    `SELECT b.*, v.name AS venue_name, v.location AS venue_location
       FROM venue_bookings b
       JOIN venues v ON v.id = b.venue_id
      WHERE b.status = 'pending'
        AND b.approval_org_id = ?
        AND b.approval_flow_id IS NOT NULL
        AND b.approval_total_steps > 0
      ORDER BY b.created_at DESC`,
    [orgId]
  );
  return rows;
}

async function getVenueFlowSteps(flowIds, orgId) {
  if (!flowIds.length) return [];
  const placeholders = flowIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM venue_approval_flow_steps
      WHERE flow_id IN (${placeholders}) AND org_id = ?
      ORDER BY flow_id, sort_order`,
    [...flowIds, orgId]
  );
  return rows;
}

async function getVenueStepRules(stepIds, orgId) {
  if (!stepIds.length) return [];
  const placeholders = stepIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM venue_approval_flow_step_rules
      WHERE step_id IN (${placeholders}) AND org_id = ?
      ORDER BY step_id, sort_order`,
    [...stepIds, orgId]
  );
  return rows;
}

async function getHrPeople(ids, orgId) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, name, student_id, department_id, identity_id, work_group_id
       FROM hr_info
      WHERE id IN (${placeholders}) AND org_id = ?`,
    [...ids, orgId]
  );
  return rows;
}

async function getPendingHrProfiles(orgId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.hr_id, r.requested_at, r.updated_at, h.name, h.student_id
       FROM hr_profile_records r
       JOIN hr_info h ON h.id = r.hr_id AND h.org_id = r.org_id
      WHERE r.org_id = ? AND r.audit_status = 'pending'
      ORDER BY COALESCE(r.requested_at, r.updated_at) DESC`,
    [orgId]
  );
  return rows;
}

async function listBoundUsersInOrg(orgId) {
  const [rows] = await pool.query(
    `SELECT ui.hr_id, h.name, h.student_id, h.department_id, h.identity_id, h.work_group_id
       FROM user_info ui
       JOIN hr_info h ON h.id = ui.hr_id AND h.org_id = ui.org_id
      WHERE ui.org_id = ? AND ui.hr_id IS NOT NULL AND ui.hr_id <> ''`,
    [orgId]
  );
  return rows;
}

async function listCurrentScoringActivities() {
  const [rows] = await pool.query(
    `SELECT * FROM score_activities
      WHERE is_current = 1 AND is_paused = 0
        AND (start_date IS NULL OR start_date <= CURDATE())
        AND (end_date IS NULL OR end_date >= CURDATE())
      ORDER BY org_id, created_at DESC`
  );
  return rows;
}

async function listPublicationRecipients(publicationId, orgId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT ui.hr_id
       FROM user_info ui
       JOIN hr_info h ON h.id = ui.hr_id AND h.org_id = ui.org_id
       JOIN pub_view_rules vr
         ON vr.publication_id = ?
        AND vr.org_id = h.org_id
        AND vr.grantee_department_id = h.department_id
        AND vr.grantee_identity_id = h.identity_id
      WHERE ui.org_id = ? AND ui.hr_id IS NOT NULL AND ui.hr_id <> ''`,
    [publicationId, orgId]
  );
  return rows.map((row) => row.hr_id);
}

module.exports = {
  getPendingVenueBookings,
  getVenueFlowSteps,
  getVenueStepRules,
  getHrPeople,
  getPendingHrProfiles,
  listBoundUsersInOrg,
  listCurrentScoringActivities,
  listPublicationRecipients
};
