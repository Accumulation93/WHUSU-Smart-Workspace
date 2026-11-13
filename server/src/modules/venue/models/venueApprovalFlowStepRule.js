const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const identityNatureRule = require('../../../core/models/identityNatureRule');
const natureRulePolicy = require('../../../core/services/natureRulePolicy');
const {
  matchesRule,
  matchesAnyRule,
  parseCsvIds
} = require('../utils/venueApprovalRuleMatcher');

async function getByStepId(stepId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flow_step_rules WHERE step_id = ? AND org_id = ? ORDER BY sort_order',
    [stepId, orgId]
  );
  return rows.map(row => ({ ...row, natureIds: natureRulePolicy.normalize(row.nature_ids) }));
}

async function getByFlowId(flowId, connection = pool) {
  const orgId = await getCurrentOrgId();
  const [rows] = await connection.query(
    `SELECT r.* FROM venue_approval_flow_step_rules r
     JOIN venue_approval_flow_steps s ON s.id = r.step_id
     WHERE s.flow_id = ? AND r.org_id = ?
     ORDER BY s.sort_order, r.sort_order`,
    [flowId, orgId]
  );
  return rows.map(row => ({ ...row, natureIds: natureRulePolicy.normalize(row.nature_ids) }));
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM venue_approval_flow_step_rules WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] ? { ...rows[0], natureIds: natureRulePolicy.normalize(rows[0].nature_ids) } : null;
}

async function create(id, data, conn) {
  const {
    stepId, sortOrder,
    departmentScope, specificDepartmentId,
    workGroupScope, specificWorkGroupId,
    identityScope, specificIdentityId
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const natureIds = await identityNatureRule.validate(db, orgId, data.natureIds, specificIdentityId);
  await db.query(
    `INSERT INTO venue_approval_flow_step_rules
     (id, step_id, sort_order,
      department_scope, specific_department_id,
      work_group_scope, specific_work_group_id,
      identity_scope, specific_identity_id,
      nature_ids, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, stepId, sortOrder || 1,
      departmentScope || 'all', specificDepartmentId || null,
      workGroupScope || 'all', specificWorkGroupId || null,
      identityScope || 'all', specificIdentityId || null,
      natureIds === null ? null : JSON.stringify(natureIds),
      orgId
    ]
  );
}

async function update(id, data, conn) {
  const {
    departmentScope, specificDepartmentId,
    workGroupScope, specificWorkGroupId,
    identityScope, specificIdentityId
  } = data;
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  const fields = [];
  const values = [];
  if (data.natureIds !== undefined) {
    const natureIds = await identityNatureRule.validate(db, orgId, data.natureIds, specificIdentityId);
    fields.push('nature_ids = ?');
    values.push(natureIds === null ? null : JSON.stringify(natureIds));
  }
  if (departmentScope !== undefined) { fields.push('department_scope = ?'); values.push(departmentScope); }
  if (specificDepartmentId !== undefined) { fields.push('specific_department_id = ?'); values.push(specificDepartmentId || null); }
  if (workGroupScope !== undefined) { fields.push('work_group_scope = ?'); values.push(workGroupScope); }
  if (specificWorkGroupId !== undefined) { fields.push('specific_work_group_id = ?'); values.push(specificWorkGroupId || null); }
  if (identityScope !== undefined) { fields.push('identity_scope = ?'); values.push(identityScope); }
  if (specificIdentityId !== undefined) { fields.push('specific_identity_id = ?'); values.push(specificIdentityId || null); }
  if (!fields.length) return;
  values.push(id, orgId);
  await db.query(`UPDATE venue_approval_flow_step_rules SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`, values);
}

async function remove(id, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_approval_flow_step_rules WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function removeByStepId(stepId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query('DELETE FROM venue_approval_flow_step_rules WHERE step_id = ? AND org_id = ?', [stepId, orgId]);
}

async function removeByFlowId(flowId, conn) {
  const orgId = await getCurrentOrgId();
  const db = conn || pool;
  await db.query(
    `DELETE r FROM venue_approval_flow_step_rules r
     JOIN venue_approval_flow_steps s ON s.id = r.step_id
     WHERE s.flow_id = ? AND r.org_id = ?`,
    [flowId, orgId]
  );
}

module.exports = {
  getByStepId, getByFlowId, getById,
  matchesRule, matchesAnyRule,
  create, update, remove,
  removeByStepId, removeByFlowId
};
