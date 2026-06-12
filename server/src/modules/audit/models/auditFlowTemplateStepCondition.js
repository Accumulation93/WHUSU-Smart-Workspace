const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByTemplateStepId(templateStepId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_template_step_conditions WHERE template_step_id = ? AND org_id = ? ORDER BY sort_order',
    [templateStepId, orgId]
  );
  return rows;
}

async function getByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT c.* FROM audit_flow_template_step_conditions c
     JOIN audit_flow_template_steps s ON s.id = c.template_step_id
     WHERE s.template_id = ? AND c.org_id = ?
     ORDER BY s.sort_order, c.sort_order`,
    [templateId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_template_step_conditions WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const {
    templateStepId, sortOrder, conditionType,
    personHrIds,
    departmentScope, specificDepartmentId,
    workGroupScope, specificWorkGroupId,
    identityScope, specificIdentityId
  } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_flow_template_step_conditions
     (id, template_step_id, sort_order, condition_type,
      person_hr_ids,
      department_scope, specific_department_id,
      work_group_scope, specific_work_group_id,
      identity_scope, specific_identity_id,
      org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, templateStepId, sortOrder || 1, conditionType || 'identity_scope',
      personHrIds || null,
      departmentScope || 'all', specificDepartmentId || null,
      workGroupScope || 'all', specificWorkGroupId || null,
      identityScope || 'all', specificIdentityId || null,
      orgId
    ]
  );
}

async function removeByTemplateStepId(templateStepId) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'DELETE FROM audit_flow_template_step_conditions WHERE template_step_id = ? AND org_id = ?',
    [templateStepId, orgId]
  );
}

async function removeByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `DELETE c FROM audit_flow_template_step_conditions c
     JOIN audit_flow_template_steps s ON s.id = c.template_step_id
     WHERE s.template_id = ? AND c.org_id = ?`,
    [templateId, orgId]
  );
}

module.exports = {
  getByTemplateStepId,
  getByTemplateId,
  getById,
  create,
  removeByTemplateStepId,
  removeByTemplateId
};
