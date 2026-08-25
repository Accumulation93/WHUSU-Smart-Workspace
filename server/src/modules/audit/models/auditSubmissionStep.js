const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { getColumns } = require('../services/auditSchemaCapabilities');
const {
  resolveActorAssignment,
  getSubmissionSubmitterAssignments
} = require('../services/auditAssignmentContext');

async function getBySubmissionId(submissionId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT * FROM audit_submission_steps WHERE submission_id = ? AND org_id = ? ORDER BY sort_order',
    [submissionId, orgId]
  );
  return rows;
}

async function getBySubmissionIdForUpdate(submissionId, conn) {
  const orgId = await getCurrentOrgId();
  const [rows] = await conn.query(
    `SELECT * FROM audit_submission_steps
      WHERE submission_id = ? AND org_id = ?
      ORDER BY round, sort_order, id
      FOR UPDATE`,
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

async function getByIdForUpdate(id, conn) {
  const orgId = await getCurrentOrgId();
  const [rows] = await conn.query(
    'SELECT * FROM audit_submission_steps WHERE id = ? AND org_id = ? FOR UPDATE',
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
 * Read current template conditions only while creating or explicitly editing a flow.
 * Historical submission authorization must never call this function.
 * @param {string} templateStepId
 * @returns {Array|null} parsed conditions array or null
 */
async function getTemplateStepConditions(templateStepId) {
  const orgId = await getCurrentOrgId();
  const [condRows] = await pool.query(
    'SELECT * FROM audit_flow_template_step_conditions WHERE template_step_id = ? AND org_id = ? ORDER BY sort_order',
    [templateStepId, orgId]
  );
  if (!condRows.length) return null;
  return condRows.map(c => ({
    conditionType: c.condition_type,
    personHrIds: c.person_hr_ids,
    assignmentIds: c.assignment_ids,
    departmentScope: c.department_scope,
    specificDepartmentId: c.specific_department_id,
    workGroupScope: c.work_group_scope,
    specificWorkGroupId: c.specific_work_group_id,
    identityScope: c.identity_scope,
    specificIdentityId: c.specific_identity_id
  }));
}

/**
 * Get pending steps that the given approver can approve.
 * Authorization is based exclusively on the immutable step_conditions_json snapshot.
 * Missing or corrupt historical snapshots fail closed and must never fall back to
 * the mutable template or legacy flat fields.
 */
async function getPendingByApprover(actor, approverOverride) {
  const orgId = await getCurrentOrgId();
  const approver = approverOverride || await resolveActorAssignment(actor, orgId);
  if (!approver) return [];
  const [pendingRows] = await pool.query(
    `SELECT asub.*, ass.*, ass.id AS id, ass.submission_id AS submission_id,
            asub.submission_number, asub.title, asub.submitted_by,
            asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     JOIN (
       SELECT submission_id, sort_order, MAX(round) as max_round
       FROM audit_submission_steps WHERE org_id = ?
       GROUP BY submission_id, sort_order
     ) mr ON mr.submission_id = ass.submission_id AND mr.sort_order = ass.sort_order AND mr.max_round = ass.round
     WHERE ass.status = 'pending' AND asub.status = 'in_progress'
       AND ass.sort_order = asub.current_step_index AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [orgId, orgId]
  );

  const submitterMap = new Map();
  let rows = [];

  for (const row of pendingRows) {
    if (!submitterMap.has(row.submission_id)) {
      submitterMap.set(
        row.submission_id,
        await getSubmissionSubmitterAssignments(row, orgId)
      );
    }
    const submitters = submitterMap.get(row.submission_id);

    if (!row.step_conditions_json) continue;
    try {
      const conditions = JSON.parse(row.step_conditions_json);
      if (matchesAnyCondition(conditions, approver, submitters)) rows.push(row);
    } catch (_) {
      // 快照缺失或损坏时失败关闭；模板后续修改不得重新授权历史步骤。
    }
  }

  // Deduplicate by submission_id: keep only the MAX round per submission.
  // After resubmission, old rounds' pending steps still exist in the DB,
  // but the approver should only see the latest round's pending step.
  let bestBySubmission = {};
  for (let ri = 0; ri < rows.length; ri++) {
    let r = rows[ri];
    let sid = r.submission_id;
    if (!bestBySubmission[sid] || r.round > bestBySubmission[sid].round) {
      bestBySubmission[sid] = r;
    }
  }
  rows = Object.values(bestBySubmission);


  // Sort by created_at DESC
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows;
}

/**
 * Helper: check if a value exists in a comma-separated list.
 * Both inputs are coerced to strings for robust comparison.
 */
function inCsv(csv, value) {
  if (csv == null || value == null) return false;
  let csvStr = String(csv).trim();
  let valStr = String(value).trim();
  if (!csvStr || !valStr) return false;
  return csvStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean).includes(valStr);
}

/**
 * Check whether the approver matches ANY condition in the conditions array.
 *
 * IMPORTANT: If ANY person-type conditions exist, they represent a narrowed scope
 * (someone explicitly designated specific approvers). In that case, ONLY person
 * conditions are checked — identity_scope conditions are stale and MUST be ignored.
 * If no person conditions exist, identity_scope conditions apply as usual.
 *
 * @param {Array} conditions - Parsed JSON array of approver conditions
 * @param {object} approver - Candidate approver HR info
 * @param {object} submitter - Submission submitter HR info
 * @returns {boolean}
 */
function matchesAnyCondition(conditions, approver, submitter) {
  if (!Array.isArray(conditions) || !conditions.length) return false;

  // If any person-type condition exists, the scope has been narrowed.
  // ONLY check person conditions; ignore identity_scope conditions.
  let hasPersonCondition = false;
  for (let ci = 0; ci < conditions.length; ci++) {
    if (conditions[ci].conditionType === 'person') {
      hasPersonCondition = true;
      break;
    }
  }

  for (const cond of conditions) {
    if (cond.conditionType === 'person') {
      // Person condition: approver must be in the personHrIds list
      let personIds = (cond.personHrIds || '').toString().split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      let personMatch = personIds.includes(String(approver.id));
      const assignmentIds = (cond.assignmentIds || cond.personAssignmentIds || '').toString()
        .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      // 人员条件必须同时绑定明确岗位。旧条件没有 assignmentIds 时失败关闭，
      // 禁止同一自然人切换到另一个岗位后继承原岗位的审批权限。
      const assignmentMatch = assignmentIds.length > 0 &&
        assignmentIds.includes(String(approver.assignment_id || ''));
      if (personMatch && assignmentMatch) return true;
    } else if (!hasPersonCondition) {
      // Only check identity_scope when scope has NOT been narrowed
      let identMatch = matchesIdentityScopeCondition(cond, approver, submitter);
      if (identMatch) return true;
    }
    // else: hasPersonCondition is true but this isn't a person condition → SKIP
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
  const submitters = Array.isArray(submitter) ? submitter.filter(Boolean) : (submitter ? [submitter] : []);
  // Department check
  let deptScope = cond.departmentScope || 'all';
  if (deptScope === 'specific') {
    let specificDeptId = (cond.specificDepartmentId || '').trim();
    if (!specificDeptId || !inCsv(specificDeptId, approver.department_id)) return false;
  } else if (deptScope === 'own') {
    let deptOwnMatch = submitters.some(function(item) {
      return String(approver.department_id) === String(item.department_id);
    });
    if (!deptOwnMatch) return false;
  }

  // Work group check
  let wgScope = cond.workGroupScope || 'all';
  if (wgScope === 'specific') {
    let specificWgId = (cond.specificWorkGroupId || '').trim();
    if (!specificWgId || !inCsv(specificWgId, approver.work_group_id)) return false;
  } else if (wgScope === 'own') {
    let wgOwnMatch = submitters.some(function(item) {
      return String(approver.work_group_id) === String(item.work_group_id);
    });
    if (!wgOwnMatch) return false;
  }
  // Identity check
  let identScope = cond.identityScope || 'all';
  if (identScope === 'specific') {
    let specificIdentId = (cond.specificIdentityId || '').trim();
    if (!specificIdentId || !inCsv(specificIdentId, approver.identity_id)) return false;
  } else if (identScope === 'own') {
    let identOwnMatch = submitters.some(function(item) {
      return String(approver.identity_id) === String(item.identity_id);
    });
    if (!identOwnMatch) return false;
  }
  return true;
}

/**
 * Legacy scope check for flat-field steps.
 * @param {object} step - The submission step row
 * @param {object} approver - The candidate approver's HR info
 * @param {object} submitter - The submission submitter's HR info
 */
function matchesScope(step, approver, submitter) {
  const submitters = Array.isArray(submitter) ? submitter.filter(Boolean) : (submitter ? [submitter] : []);
  const scopeType = (step.scope_type || '').trim();
  if (!scopeType || scopeType === 'all') return true;

  if (scopeType === 'same_department') {
    return submitters.some(function(item) {
      return String(approver.department_id) === String(item.department_id);
    });
  }

  if (scopeType === 'same_work_group') {
    return submitters.some(function(item) {
      return String(approver.work_group_id) === String(item.work_group_id);
    });
  }

  if (scopeType === 'specific_department') {
    const departmentId = String(step.scope_department_id || '').trim();
    return Boolean(departmentId) &&
      String(approver.department_id || '') === departmentId;
  }

  if (scopeType === 'specific_work_group') {
    const departmentId = String(step.scope_department_id || '').trim();
    const workGroupId = String(step.scope_work_group_id || '').trim();
    return Boolean(departmentId && workGroupId) &&
      String(approver.department_id || '') === departmentId &&
      String(approver.work_group_id || '') === workGroupId;
  }

  // Unknown or corrupt legacy scope values must never broaden approval access.
  return false;
}

async function create(id, data, conn) {
  const {
    submissionId, templateStepId, sortOrder,
    approverType, approverHrId, approverIdentityId,
    actionType, round, status,
    stepConditionsJson, stepName, allowApproverDesignation
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_submission_steps
     (id, submission_id, template_step_id, sort_order, approver_type, approver_hr_id, approver_identity_id,
      step_conditions_json,
       action_type, allow_approver_designation, step_name, status, round, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, submissionId, templateStepId || null, sortOrder || 1,
      approverType || 'identity', approverHrId || null, approverIdentityId || null,
      stepConditionsJson || null,
      actionType || 'sign', allowApproverDesignation ? 1 : 0, stepName || '', status || 'pending',
      Number.isInteger(Number(round)) && Number(round) >= 0 ? Number(round) : 1, orgId
    ]
  );
}

async function updateStatus(id, data, conn) {
  const {
    status,
    comment,
    rejectionReason,
    processedAt,
    processedPersonId,
    processedAssignmentId,
    processedContextSnapshot
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = ['status = ?'];
  const params = [status];

  if (comment !== undefined) { fields.push('comment = ?'); params.push(comment); }
  if (rejectionReason !== undefined) { fields.push('rejection_reason = ?'); params.push(rejectionReason); }
  if (processedAt !== undefined) { fields.push('processed_at = ?'); params.push(processedAt); }

  const availableColumns = await getColumns('audit_submission_steps', db);
  if (availableColumns.has('processed_person_id')) {
    fields.push('processed_person_id = ?');
    params.push(processedPersonId || null);
  }
  if (availableColumns.has('processed_assignment_id')) {
    fields.push('processed_assignment_id = ?');
    params.push(processedAssignmentId || null);
  }
  if (availableColumns.has('processed_context_snapshot')) {
    fields.push('processed_context_snapshot = ?');
    params.push(processedContextSnapshot && typeof processedContextSnapshot === 'object'
      ? JSON.stringify(processedContextSnapshot)
      : processedContextSnapshot || null);
  }

  params.push(id, orgId);
  await db.query(`UPDATE audit_submission_steps SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, params);
}

async function getMaxRound(submissionId, sortOrder, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT MAX(round) AS max_round FROM audit_submission_steps WHERE submission_id = ? AND sort_order = ? AND org_id = ?',
    [submissionId, sortOrder, orgId]
  );
  return (rows[0] && rows[0].max_round) || 1;
}

async function removeBySubmissionId(submissionId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM audit_submission_steps WHERE submission_id = ? AND org_id = ?', [submissionId, orgId]);
}

module.exports = {
  getBySubmissionId, getBySubmissionIdForUpdate, getById, getByIdForUpdate, getCurrentStep, getPendingByApprover, create, updateStatus, getMaxRound,
  removeBySubmissionId,
  getTemplateStepConditions,
  matchesScope, matchesAnyCondition, matchesIdentityScopeCondition
};
