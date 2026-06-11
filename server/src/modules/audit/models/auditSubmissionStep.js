const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getBySubmissionId(submissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_steps WHERE submission_id = ? AND org_id = ? ORDER BY sort_order',
    [submissionId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_steps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function getCurrentStep(submissionId, currentStepIndex) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_submission_steps WHERE submission_id = ? AND sort_order = ? AND org_id = ? ORDER BY round DESC LIMIT 1',
    [submissionId, currentStepIndex, orgId]
  );
  return rows[0] || null;
}

async function getPendingByApprover(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     WHERE ass.approver_hr_id = ? AND ass.status = 'pending' AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [hrId, orgId]
  );
  return rows;
}

async function create(id, data) {
  const { submissionId, templateStepId, sortOrder, approverType, approverHrId, approverIdentityId, actionType, round } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_submission_steps (id, submission_id, template_step_id, sort_order, approver_type, approver_hr_id, approver_identity_id, action_type, status, round, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, submissionId, templateStepId || null, sortOrder || 1, approverType || 'identity', approverHrId || null, approverIdentityId || null, actionType || 'sign', round || 1, orgId]
  );
}

async function updateStatus(id, data) {
  const { status, comment, rejectionReason, processedAt } = data;
  const orgId = await getCurrentOrgId();
  const fields = ['status = ?'];
  const params = [status];

  if (comment !== undefined) { fields.push('comment = ?'); params.push(comment); }
  if (rejectionReason !== undefined) { fields.push('rejection_reason = ?'); params.push(rejectionReason); }
  if (processedAt !== undefined) { fields.push('processed_at = ?'); params.push(processedAt); }

  params.push(id, orgId);
  await pool.query(`UPDATE audit_submission_steps SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, params);
}

async function getMaxRound(submissionId, sortOrder) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT MAX(round) AS max_round FROM audit_submission_steps WHERE submission_id = ? AND sort_order = ? AND org_id = ?',
    [submissionId, sortOrder, orgId]
  );
  return (rows[0] && rows[0].max_round) || 1;
}

module.exports = { getBySubmissionId, getById, getCurrentStep, getPendingByApprover, create, updateStatus, getMaxRound };
