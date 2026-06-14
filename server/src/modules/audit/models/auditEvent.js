const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

/**
 * Insert an audit event.
 * @param {string} id - Event ID
 * @param {object} data - { submissionId, eventType, stepIndex, round, operatorHrId, operatorName, comment }
 */
async function create(id, data, conn) {
  const { submissionId, eventType, stepIndex, round, operatorHrId, operatorName, comment } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_events (id, submission_id, event_type, step_index, round, operator_hr_id, operator_name, comment, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, submissionId, eventType, stepIndex || null, round || 1, operatorHrId || null, operatorName || null, comment || null, orgId]
  );
}

/**
 * Get all events for a submission, ordered by created_at ASC.
 * @param {string} submissionId
 * @returns {Array} events
 */
async function getBySubmissionId(submissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_events WHERE submission_id = ? AND org_id = ? ORDER BY created_at ASC',
    [submissionId, orgId]
  );
  return rows;
}

module.exports = { create, getBySubmissionId };
