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

/**
 * Get pending steps that the given approver can approve.
 * Supports both legacy flat fields and new step_conditions_json multi-condition OR logic.
 */
async function getPendingByApprover(hrId) {
  const orgId = await getCurrentOrgId();

  // Get the approver's HR info for identity/scope matching
  const [hrRows] = await pool.query(
    'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
    [hrId, orgId]
  );
  const approver = hrRows[0] || null;
  if (!approver) return [];

  // Direct matches: specific_person steps assigned to this hrId (legacy field)
  // Only include steps from in_progress submissions (not draft/pending/withdrawn/rejected/approved)
  const [directRows] = await pool.query(
    `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     WHERE ass.approver_hr_id = ? AND ass.status = 'pending' AND asub.status = 'in_progress' AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [hrId, orgId]
  );

  // Identity-based matches: steps with approver_type='identity' or step_conditions_json
  let rows = [...directRows];

  const [identityRows] = await pool.query(
    `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     WHERE ass.status = 'pending' AND asub.status = 'in_progress' AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [orgId]
  );

  // Deduplicate by step ID (a step might match via multiple paths)
  const seenIds = new Set(directRows.map((r) => r.id));

  // Load submitter info for all identity rows (needed for scope resolution)
  const submitterIds = [...new Set(identityRows.map((r) => r.submitted_by).filter(Boolean))];
  const submitterMap = {};
  if (submitterIds.length) {
    const [subRows] = await pool.query(
      'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id IN (?) AND org_id = ?',
      [submitterIds, orgId]
    );
    for (const s of subRows) submitterMap[s.id] = s;
  }

  for (const row of identityRows) {
    if (seenIds.has(row.id)) continue;

    // If already directly matched via approver_hr_id, skip
    if (row.approver_hr_id === hrId) {
      seenIds.add(row.id);
      continue;
    }

    const submitter = submitterMap[row.submitted_by] || null;

    // Check new step_conditions_json first
    if (row.step_conditions_json) {
      try {
        const conditions = JSON.parse(row.step_conditions_json);
        if (matchesAnyCondition(conditions, approver, submitter)) {
          rows.push(row);
          seenIds.add(row.id);
          continue;
        }
      } catch (_) { /* fall through to legacy check */ }
    }

    // Legacy check: approver_type='identity' with approver_identity_id match
    if (row.approver_type === 'identity' && row.approver_identity_id) {
      if (approver.identity_id === row.approver_identity_id) {
        if (matchesScope(row, approver, submitter)) {
          rows.push(row);
          seenIds.add(row.id);
        }
      }
    }
  }

  // Sort by created_at DESC
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows;
}

/**
 * Check whether the approver matches ANY condition in the conditions array (OR logic).
 * @param {Array} conditions - Parsed JSON array of approver conditions
 * @param {object} approver - Candidate approver HR info
 * @param {object} submitter - Submission submitter HR info
 * @returns {boolean}
 */
function matchesAnyCondition(conditions, approver, submitter) {
  if (!Array.isArray(conditions) || !conditions.length) return false;

  for (const cond of conditions) {
    if (cond.conditionType === 'person') {
      // Person condition: approver must be in the personHrIds list
      const personIds = (cond.personHrIds || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (personIds.includes(approver.id)) return true;
    } else if (cond.conditionType === 'identity_scope') {
      // Identity scope condition: all three dimensions must match
      if (matchesIdentityScopeCondition(cond, approver, submitter)) return true;
    }
  }

  return false;
}

/**
 * Check whether an approver matches an identity_scope condition.
 * Each dimension (department, work_group, identity) is independently resolved.
 * @param {object} cond - Single condition from step_conditions_json
 * @param {object} approver - Candidate approver
 * @param {object} submitter - Submission submitter
 * @returns {boolean}
 */
function matchesIdentityScopeCondition(cond, approver, submitter) {
  // Helper: check if a value is in a comma-separated list
  function inCsv(csv, value) {
    if (!csv || !value) return false;
    return csv.split(',').map(function(s) { return s.trim(); }).filter(Boolean).includes(String(value));
  }

  // Department check
  const deptScope = cond.departmentScope || 'all';
  if (deptScope === 'specific') {
    if (!inCsv(cond.specificDepartmentId || '', approver.department_id)) return false;
  } else if (deptScope === 'own') {
    if (!submitter || approver.department_id !== submitter.department_id) return false;
  }
  // 'all' means any department → pass

  // Work group check
  const wgScope = cond.workGroupScope || 'all';
  if (wgScope === 'specific') {
    if (!inCsv(cond.specificWorkGroupId || '', approver.work_group_id)) return false;
  } else if (wgScope === 'own') {
    if (!submitter || approver.work_group_id !== submitter.work_group_id) return false;
  }
  // 'all' means any work group → pass

  // Identity check
  const identScope = cond.identityScope || 'all';
  if (identScope === 'specific') {
    if (!inCsv(cond.specificIdentityId || '', approver.identity_id)) return false;
  } else if (identScope === 'own') {
    if (!submitter || approver.identity_id !== submitter.identity_id) return false;
  }
  // 'all' means any identity → pass

  return true;
}

/**
 * Legacy scope check for flat-field steps.
 * @param {object} step - The submission step row
 * @param {object} approver - The candidate approver's HR info
 * @param {object} submitter - The submission submitter's HR info
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
    scopeType, scopeDepartmentId, scopeWorkGroupId,
    stepConditionsJson
  } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_submission_steps
     (id, submission_id, template_step_id, sort_order, approver_type, approver_hr_id, approver_identity_id,
      scope_type, scope_department_id, scope_work_group_id,
      step_conditions_json,
      action_type, status, round, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id, submissionId, templateStepId || null, sortOrder || 1,
      approverType || 'identity', approverHrId || null, approverIdentityId || null,
      scopeType || null, scopeDepartmentId || null, scopeWorkGroupId || null,
      stepConditionsJson || null,
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

module.exports = {
  getBySubmissionId, getById, getCurrentStep, getPendingByApprover, create, updateStatus, getMaxRound,
  matchesScope, matchesAnyCondition, matchesIdentityScopeCondition
};
