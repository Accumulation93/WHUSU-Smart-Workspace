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
 * Get template step conditions for fallback matching.
 * Used when a submission step has no step_conditions_json (legacy submission)
 * or the conditions failed to parse.
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
    departmentScope: c.department_scope,
    specificDepartmentId: c.specific_department_id,
    workGroupScope: c.work_group_scope,
    specificWorkGroupId: c.specific_work_group_id,
    identityScope: c.identity_scope,
    specificIdentityId: c.specific_identity_id
  }));
}

/**
 * Batch-load template step conditions for multiple template_step_ids.
 * Returns a map: template_step_id → conditions array.
 */
async function _batchLoadTemplateConditions(templateStepIds) {
  const orgId = await getCurrentOrgId();
  const map = {};
  if (!templateStepIds.length) return map;

  const [tplCondRows] = await pool.query(
    `SELECT * FROM audit_flow_template_step_conditions
     WHERE template_step_id IN (?) AND org_id = ?
     ORDER BY template_step_id, sort_order`,
    [templateStepIds, orgId]
  );
  for (const tc of tplCondRows) {
    if (!map[tc.template_step_id]) map[tc.template_step_id] = [];
    map[tc.template_step_id].push({
      conditionType: tc.condition_type,
      personHrIds: tc.person_hr_ids,
      departmentScope: tc.department_scope,
      specificDepartmentId: tc.specific_department_id,
      workGroupScope: tc.work_group_scope,
      specificWorkGroupId: tc.specific_work_group_id,
      identityScope: tc.identity_scope,
      specificIdentityId: tc.specific_identity_id
    });
  }
  return map;
}

/**
 * Get pending steps that the given approver can approve.
 * Supports both legacy flat fields and new step_conditions_json multi-condition OR logic.
 * Also falls back to template step conditions for legacy submissions.
 */
async function getPendingByApprover(hrId) {
  const orgId = await getCurrentOrgId();

  // Get the approver's HR info for identity/scope matching
  const [hrRows] = await pool.query(
    'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
    [hrId, orgId]
  );
  const approver = hrRows[0] || null;
  if (!approver) {
    console.log('[audit:getPendingByApprover] No hr_info found for hrId=' + hrId + ' orgId=' + orgId);
    return [];
  }
  console.log('[audit:getPendingByApprover] approver hrId=' + hrId +
    ' dept=' + (approver.department_id || 'none') +
    ' ident=' + (approver.identity_id || 'none') +
    ' wg=' + (approver.work_group_id || 'none'));

  // Direct matches: specific_person steps assigned to this hrId (legacy field)
  // Only include steps that are the CURRENT step of in_progress submissions
  const [directRows] = await pool.query(
    `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     WHERE ass.approver_hr_id = ? AND ass.status = 'pending' AND asub.status = 'in_progress'
       AND ass.sort_order = asub.current_step_index AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [hrId, orgId]
  );

  // Identity-based matches: steps with approver_type='identity' or step_conditions_json
  let rows = [...directRows];

  const [identityRows] = await pool.query(
    `SELECT ass.*, asub.submission_number, asub.title, asub.submitted_by, asub.status AS submission_status, asub.type AS submission_type
     FROM audit_submission_steps ass
     JOIN audit_submissions asub ON asub.id = ass.submission_id
     WHERE ass.status = 'pending' AND asub.status = 'in_progress'
       AND ass.sort_order = asub.current_step_index AND ass.org_id = ?
     ORDER BY ass.created_at DESC`,
    [orgId]
  );

  // Deduplicate by step ID (a step might match via multiple paths)
  const seenIds = new Set(directRows.map((r) => r.id));

  console.log('[audit:getPendingByApprover] direct=' + directRows.length +
    ' identityRows=' + identityRows.length + ' total candidates');

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

  // Batch-load template step conditions for fallback matching
  const tplStepIds = [...new Set(identityRows.map((r) => r.template_step_id).filter(Boolean))];
  const templateConditionMap = await _batchLoadTemplateConditions(tplStepIds);

  for (const row of identityRows) {
    if (seenIds.has(row.id)) continue;

    // If already directly matched via approver_hr_id, skip
    // Use inCsv to handle comma-separated multi-person IDs in legacy steps
    if (row.approver_hr_id && inCsv(row.approver_hr_id, hrId)) {
      seenIds.add(row.id);
      continue;
    }

    const submitter = submitterMap[row.submitted_by] || null;

    // Check new step_conditions_json first
    if (row.step_conditions_json) {
      try {
        const conditions = JSON.parse(row.step_conditions_json);
        const matched = matchesAnyCondition(conditions, approver, submitter);
        console.log('[audit:getPendingByApprover] step=' + row.id +
          ' submission=' + row.submission_id +
          ' sort_order=' + row.sort_order +
          ' has_conditions_json=true condCount=' + conditions.length +
          ' match=' + matched);
        if (matched) {
          rows.push(row);
          seenIds.add(row.id);
          continue;
        }
      } catch (e) {
        console.log('[audit:getPendingByApprover] step=' + row.id +
          ' JSON parse error: ' + e.message);
      }
    } else {
      console.log('[audit:getPendingByApprover] step=' + row.id +
        ' submission=' + row.submission_id +
        ' sort_order=' + row.sort_order +
        ' has_conditions_json=false hasTemplateStep=' + !!row.template_step_id +
        ' legacy_type=' + (row.approver_type || 'none') +
        ' legacy_ident=' + (row.approver_identity_id || 'none'));
    }

    // Fallback: if submission step has no conditions or they failed to match,
    // try template step conditions (e.g., legacy submissions or steps created
    // before conditions were properly serialized)
    if (row.template_step_id && templateConditionMap[row.template_step_id]) {
      const tplConds = templateConditionMap[row.template_step_id];
      const tplMatched = matchesAnyCondition(tplConds, approver, submitter);
      console.log('[audit:getPendingByApprover] step=' + row.id +
        ' templateConditionFallback condCount=' + tplConds.length +
        ' match=' + tplMatched);
      if (tplMatched) {
        rows.push(row);
        seenIds.add(row.id);
        continue;
      }
    }

    // Legacy check: approver_type='identity' with approver_identity_id match
    // Use inCsv() to handle comma-separated multi-identity fields
    if (row.approver_type === 'identity' && row.approver_identity_id) {
      const identMatch = inCsv(row.approver_identity_id, approver.identity_id);
      const scopeMatch = identMatch ? matchesScope(row, approver, submitter) : false;
      console.log('[audit:getPendingByApprover] step=' + row.id +
        ' legacyCheck identMatch=' + identMatch + ' scopeMatch=' + scopeMatch);
      if (identMatch && scopeMatch) {
        rows.push(row);
        seenIds.add(row.id);
      }
    }
  }

  console.log('[audit:getPendingByApprover] final pending count=' + rows.length);

  // Deduplicate by submission_id: keep only the MAX round per submission.
  // After resubmission, old rounds' pending steps still exist in the DB,
  // but the approver should only see the latest round's pending step.
  var bestBySubmission = {};
  for (var ri = 0; ri < rows.length; ri++) {
    var r = rows[ri];
    var sid = r.submission_id;
    if (!bestBySubmission[sid] || r.round > bestBySubmission[sid].round) {
      bestBySubmission[sid] = r;
    }
  }
  rows = Object.values(bestBySubmission);
  console.log('[audit:getPendingByApprover] after dedup by max round, count=' + rows.length);

  // Separation of duties: filter out submissions where the user already approved
  // a step in the same round. Prevents the same person from approving multiple
  // consecutive steps in one round.
  if (rows.length > 0) {
    const subIds = [...new Set(rows.map(function(r) { return r.submission_id; }))];
    const [prevApprovals] = await pool.query(
      'SELECT submission_id, round FROM audit_events WHERE submission_id IN (?) AND event_type = ? AND operator_hr_id = ? AND org_id = ?',
      [subIds, 'approve', hrId, orgId]
    );
    const approvedSet = new Set();
    for (var pai = 0; pai < prevApprovals.length; pai++) {
      approvedSet.add(prevApprovals[pai].submission_id + '_' + prevApprovals[pai].round);
    }
    var filteredRows = [];
    for (var fri = 0; fri < rows.length; fri++) {
      var key = rows[fri].submission_id + '_' + (rows[fri].round || 1);
      if (!approvedSet.has(key)) {
        filteredRows.push(rows[fri]);
      } else {
        console.log('[audit:getPendingByApprover] DUTY_SEPARATION: filtered out submission=' +
          rows[fri].submission_id + ' round=' + (rows[fri].round || 1) +
          ' — user already approved a step in this round');
      }
    }
    rows = filteredRows;
  }
  console.log('[audit:getPendingByApprover] after duty-separation filter, count=' + rows.length);

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
  var csvStr = String(csv).trim();
  var valStr = String(value).trim();
  if (!csvStr || !valStr) return false;
  return csvStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean).includes(valStr);
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
      var personIds = (cond.personHrIds || '').toString().split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      var personMatch = personIds.includes(String(approver.id));
      console.log('[audit:matchesAnyCondition] personCond hrId=' + approver.id +
        ' personIds=[' + personIds.join(',') + '] match=' + personMatch);
      if (personMatch) return true;
    } else {
      // identity_scope or unknown type — treat as identity_scope
      console.log('[audit:matchesAnyCondition] checking identity_scope cond:' +
        ' deptScope=' + (cond.departmentScope || 'all') +
        ' specDept=' + (cond.specificDepartmentId || 'none') +
        ' wgScope=' + (cond.workGroupScope || 'all') +
        ' specWg=' + (cond.specificWorkGroupId || 'none') +
        ' identScope=' + (cond.identityScope || 'all') +
        ' specIdent=' + (cond.specificIdentityId || 'none'));
      var identMatch = matchesIdentityScopeCondition(cond, approver, submitter);
      console.log('[audit:matchesAnyCondition] identity_scope result=' + identMatch);
      if (identMatch) return true;
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
  // Department check
  var deptScope = cond.departmentScope || 'all';
  if (deptScope === 'specific') {
    var specificDeptId = (cond.specificDepartmentId || '').trim();
    // Treat 'specific' with no IDs as 'all' (malformed condition fallback)
    if (specificDeptId) {
      var deptMatch = inCsv(specificDeptId, approver.department_id);
      console.log('[audit:matchesIdentityScope] deptScope=specific approverDept=' + (approver.department_id || 'none') +
        ' condDeptIds=' + specificDeptId + ' match=' + deptMatch);
      if (!deptMatch) return false;
    }
  } else if (deptScope === 'own') {
    var deptOwnMatch = submitter && String(approver.department_id) === String(submitter.department_id);
    console.log('[audit:matchesIdentityScope] deptScope=own approverDept=' + (approver.department_id || 'none') +
      ' submitterDept=' + (submitter ? submitter.department_id : 'none') + ' match=' + deptOwnMatch);
    if (!deptOwnMatch) return false;
  }
  // 'all' or 'specific' with no IDs means any department → pass

  // Work group check
  var wgScope = cond.workGroupScope || 'all';
  if (wgScope === 'specific') {
    var specificWgId = (cond.specificWorkGroupId || '').trim();
    if (specificWgId) {
      var wgMatch = inCsv(specificWgId, approver.work_group_id);
      console.log('[audit:matchesIdentityScope] wgScope=specific approverWg=' + (approver.work_group_id || 'none') +
        ' condWg=' + specificWgId + ' match=' + wgMatch);
      if (!wgMatch) return false;
    }
  } else if (wgScope === 'own') {
    var wgOwnMatch = submitter && String(approver.work_group_id) === String(submitter.work_group_id);
    if (!wgOwnMatch) return false;
  }
  // 'all' or 'specific' with no IDs means any work group → pass

  // Identity check
  var identScope = cond.identityScope || 'all';
  if (identScope === 'specific') {
    var specificIdentId = (cond.specificIdentityId || '').trim();
    if (specificIdentId) {
      var identMatch = inCsv(specificIdentId, approver.identity_id);
      console.log('[audit:matchesIdentityScope] identScope=specific approverIdent=' + (approver.identity_id || 'none') +
        ' condIdentIds=' + specificIdentId + ' match=' + identMatch);
      if (!identMatch) return false;
    }
  } else if (identScope === 'own') {
    var identOwnMatch = submitter && String(approver.identity_id) === String(submitter.identity_id);
    if (!identOwnMatch) return false;
  }
  // 'all' or 'specific' with no IDs means any identity → pass

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
    return String(approver.department_id) === String(submitter.department_id);
  }

  if (scopeType === 'same_work_group') {
    if (!submitter) return false;
    return String(approver.work_group_id) === String(submitter.work_group_id);
  }

  if (scopeType === 'specific_department') {
    return String(approver.department_id) === String(step.scope_department_id || '');
  }

  if (scopeType === 'specific_work_group') {
    return String(approver.department_id) === String(step.scope_department_id || '') &&
           String(approver.work_group_id) === String(step.scope_work_group_id || '');
  }

  return true;
}

async function create(id, data, conn) {
  const {
    submissionId, templateStepId, sortOrder,
    approverType, approverHrId, approverIdentityId,
    actionType, round,
    stepConditionsJson
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `INSERT INTO audit_submission_steps
     (id, submission_id, template_step_id, sort_order, approver_type, approver_hr_id, approver_identity_id,
      step_conditions_json,
      action_type, status, round, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      id, submissionId, templateStepId || null, sortOrder || 1,
      approverType || 'identity', approverHrId || null, approverIdentityId || null,
      stepConditionsJson || null,
      actionType || 'sign', round || 1, orgId
    ]
  );
}

async function updateStatus(id, data, conn) {
  const { status, comment, rejectionReason, processedAt } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = ['status = ?'];
  const params = [status];

  if (comment !== undefined) { fields.push('comment = ?'); params.push(comment); }
  if (rejectionReason !== undefined) { fields.push('rejection_reason = ?'); params.push(rejectionReason); }
  if (processedAt !== undefined) { fields.push('processed_at = ?'); params.push(processedAt); }

  params.push(id, orgId);
  await db.query(`UPDATE audit_submission_steps SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, params);
}

async function getMaxRound(submissionId, sortOrder) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
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
  getBySubmissionId, getById, getCurrentStep, getPendingByApprover, create, updateStatus, getMaxRound,
  removeBySubmissionId,
  getTemplateStepConditions,
  matchesScope, matchesAnyCondition, matchesIdentityScopeCondition
};
