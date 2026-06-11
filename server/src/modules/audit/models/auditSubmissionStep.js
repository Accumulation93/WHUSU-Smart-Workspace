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

  // Get the approver's HR info for identity/scope matching
  const [hrRows] = await pool.query(
    'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
    [hrId, orgId]
  );
  const approver = hrRows[0] || null;

  // Direct matches: specific_person steps assigned to this hrId
  let rows = [];
  const [directRows] = await pool.query(
    `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     WHERE ass.approver_hr_id = ? AND ass.status = 'pending' AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [hrId, orgId]
  );
  rows = directRows;

  // Identity-based matches: steps with approver_type='identity' where the approver matches
  if (approver) {
    const [identityRows] = await pool.query(
      `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
       FROM audit_submission_steps ass
       JOIN audit_submissions asub ON asub.id = ass.submission_id
       WHERE ass.approver_type = 'identity'
         AND ass.approver_identity_id = ?
         AND ass.status = 'pending'
         AND ass.org_id = ?`,
      [approver.identity_id, orgId]
    );

    // Filter by scope — need submitter info for same_department / same_work_group
    const submitterIds = [...new Set(identityRows.map(r => r.submitted_by).filter(Boolean))];
    const submitterMap = {};
    if (submitterIds.length) {
      const [subRows] = await pool.query(
        'SELECT id, department_id, work_group_id FROM hr_info WHERE id IN (?) AND org_id = ?',
        [submitterIds, orgId]
      );
      for (const s of subRows) submitterMap[s.id] = s;
    }

    for (const row of identityRows) {
      const submitter = submitterMap[row.submitted_by] || null;
      if (matchesScope(row, approver, submitter)) {
        rows.push(row);
      }
    }
  }

  // Sort by created_at DESC
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows;
}

/**
 * Check if an approver matches the step's scope constraints.
 * @param {object} step - The submission step row
 * @param {object} approver - The candidate approver's HR info (must have department_id, work_group_id)
 * @param {object} submitter - The submission submitter's HR info (for same_department / same_work_group)
 */
function matchesScope(step, approver, submitter) {
  const scopeType = (step.scope_type || '').trim();
  if (!scopeType || scopeType === 'all') return true;

  if (scopeType === 'same_department') {
    if (!submitter) return false;
    return approver.department_id === submitter.department_id;
  }

  if (scopeType === 'same_work_group') {
    if (!submitter) return false;
    return approver.work_group_id === submitter.work_group_id;
  }

  if (scopeType === 'specific_department') {
    return approver.department_id === (step.scope_department_id || '');
  }

  if (scopeType === 'specific_work_group') {
    return approver.department_id === (step.scope_department_id || '') &&
           approver.work_group_id === (step.scope_work_group_id || '');
  }

  return true;
}

async function create(id, data) {
  const {
    submissionId, templateStepId, sortOrder,
    approverType, approverHrId, approverIdentityId,
    actionType, round,
    scopeType, scopeDepartmentId, scopeWorkGroupId
  } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_submission_steps
     (id, submission_id, template_step_id, sort_order, approver_type, approver_hr_id, approver_identity_id,
      scope_type, scope_department_id, scope_work_group_id,
      action_type, status, round, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id, submissionId, templateStepId || null, sortOrder || 1,
      approverType || 'identity', approverHrId || null, approverIdentityId || null,
      scopeType || null, scopeDepartmentId || null, scopeWorkGroupId || null,
      actionType || 'sign', round || 1, orgId
    ]
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

module.exports = { getBySubmissionId, getById, getCurrentStep, getPendingByApprover, create, updateStatus, getMaxRound, matchesScope };
