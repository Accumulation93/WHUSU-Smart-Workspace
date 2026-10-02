const pool = require('../../../config/db');
const { memo } = require('../../../utils/requestWork');
const systemConfig = require('../../../core/models/systemConfig');
const { getSystemDate } = require('../../../utils/dateTime');

async function getPendingVenueBookings(orgId) {
  const [rows] = await pool.query(
    `SELECT b.*, v.name AS venue_name, v.location AS venue_location
       FROM venue_bookings b
       JOIN venues v ON v.id = b.venue_id
      WHERE b.status = 'pending'
        AND b.approval_org_id = ?
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
    `SELECT id, name, department_id, identity_id, work_group_id
       FROM hr_info
      WHERE id IN (${placeholders}) AND org_id = ?`,
    [...ids, orgId]
  );
  return rows;
}

async function getPendingHrProfiles(orgId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.hr_id, r.requested_at, r.updated_at, h.name
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
    `SELECT h.id, h.name, om.person_id, ma.id AS assignment_id,
            ma.department_id, ma.identity_id, ma.work_group_id
       FROM organization_memberships om
       JOIN accounts a ON a.person_id = om.person_id AND a.status = 'verified'
       JOIN persons p ON p.id = om.person_id AND p.status = 'active'
       JOIN membership_assignments ma ON ma.membership_id = om.id AND ma.org_id = om.org_id AND ma.status = 'active'
       JOIN hr_info h ON h.id = om.legacy_hr_id AND h.org_id = om.org_id
      WHERE om.org_id = ? AND om.status = 'active'
      ORDER BY h.id, ma.id`,
    [orgId]
  );
  return rows;
}

async function listCurrentScoringActivities() {
  const config = await systemConfig.get();
  const today = getSystemDate(Date.now(), config.timezone);
  const [rows] = await pool.query(
    `SELECT * FROM score_activities
      WHERE is_current = 1 AND is_paused = 0
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
      ORDER BY org_id, created_at DESC`, [today, today]
  );
  return rows;
}

async function getScoringActivityForEvent(activityId, orgId) {
  const [rows] = await pool.query('SELECT * FROM score_activities WHERE id = ? AND org_id = ?', [activityId, orgId]);
  return rows[0] || null;
}

async function listPublicationRecipients(publicationId, orgId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT om.legacy_hr_id AS hr_id
       FROM organization_memberships om
       JOIN accounts a ON a.person_id = om.person_id AND a.status = 'verified'
       JOIN persons p ON p.id = om.person_id AND p.status = 'active'
       JOIN membership_assignments ma ON ma.membership_id = om.id AND ma.org_id = om.org_id AND ma.status = 'active'
       JOIN pub_view_rules vr
         ON vr.publication_id = ?
        AND vr.org_id = om.org_id
        AND vr.grantee_department_id = ma.department_id
        AND vr.grantee_identity_id = ma.identity_id
      WHERE om.org_id = ? AND om.status = 'active' AND om.legacy_hr_id IS NOT NULL AND om.legacy_hr_id <> ''`,
    [publicationId, orgId]
  );
  return rows.map((row) => row.hr_id);
}

module.exports = {
  getPendingVenueBookings: (orgId) => memo('pendingVenue:' + orgId, () => getPendingVenueBookings(orgId)),
  getVenueFlowSteps,
  getVenueStepRules,
  getHrPeople: (ids, orgId) => memo('messagePeople:' + orgId + ':' + JSON.stringify(ids.slice().sort()), () => getHrPeople(ids, orgId)),
  getPendingHrProfiles: (orgId) => memo('pendingProfiles:' + orgId, () => getPendingHrProfiles(orgId)),
  listBoundUsersInOrg,
  listCurrentScoringActivities,
  getScoringActivityForEvent,
  listPublicationRecipients
};
