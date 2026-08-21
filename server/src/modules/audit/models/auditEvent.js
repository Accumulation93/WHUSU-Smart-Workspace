const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

/**
 * Insert an audit event.
 * @param {string} id - Event ID
 * @param {object} data - { submissionId, eventType, stepIndex, round, operatorHrId, operatorName, comment }
 */
async function create(id, data, conn) {
  const {
    submissionId,
    eventType,
    stepIndex,
    round,
    operatorHrId,
    operatorPersonId,
    operatorAssignmentId,
    operatorAdminGrantId,
    operatorName,
    operatorContextSnapshot,
    comment
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const contextSnapshot = operatorContextSnapshot && typeof operatorContextSnapshot === 'object'
    ? JSON.stringify(operatorContextSnapshot)
    : operatorContextSnapshot || null;
  await db.query(
    `INSERT INTO audit_events
       (id, submission_id, event_type, step_index, round, operator_hr_id,
        operator_person_id, operator_assignment_id, operator_admin_grant_id,
        operator_name, operator_context_snapshot, comment, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      submissionId,
      eventType,
      stepIndex || null,
      round || 1,
      operatorHrId || null,
      operatorPersonId || null,
      operatorAssignmentId || null,
      operatorAdminGrantId || null,
      operatorName || null,
      contextSnapshot,
      comment || null,
      orgId
    ]
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

async function hasStepActionByActor(data, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT id FROM audit_events
      WHERE submission_id = ? AND step_index = ? AND round = ? AND event_type = ? AND org_id = ?
        AND COALESCE(
          NULLIF(operator_assignment_id, ''),
          CASE
            WHEN JSON_VALID(operator_context_snapshot) THEN
              NULLIF(JSON_UNQUOTE(JSON_EXTRACT(operator_context_snapshot, '$.assignmentId')), '')
            ELSE NULL
          END
        ) = ?
      LIMIT 1`,
    [
      data.submissionId,
      data.stepIndex,
      data.round || 1,
      data.eventType,
      orgId,
      data.assignmentId
    ]
  );
  return rows.length > 0;
}

module.exports = { create, getBySubmissionId, hasStepActionByActor };
