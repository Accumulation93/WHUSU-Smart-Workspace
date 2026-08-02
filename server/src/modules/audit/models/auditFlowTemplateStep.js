const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const conditionModel = require('./auditFlowTemplateStepCondition');

async function getByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_template_steps WHERE template_id = ? AND org_id = ? ORDER BY sort_order',
    [templateId, orgId]
  );

  // Batch-load conditions for all steps
  if (rows.length > 0) {
    const stepIds = rows.map((r) => r.id);
    const [allConditions] = await pool.query(
      'SELECT * FROM audit_flow_template_step_conditions WHERE template_step_id IN (?) AND org_id = ? ORDER BY sort_order',
      [stepIds, orgId]
    );

    const conditionMap = {};
    for (const c of allConditions) {
      if (!conditionMap[c.template_step_id]) conditionMap[c.template_step_id] = [];
      conditionMap[c.template_step_id].push(c);
    }

    for (const row of rows) {
      row.conditions = conditionMap[row.id] || [];
    }
  }

  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_template_steps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  if (rows[0]) {
    rows[0].conditions = await conditionModel.getByTemplateStepId(id);
  }
  return rows[0] || null;
}

async function create(id, data) {
  const { templateId, sortOrder, actionType, name, allowApproverDesignation } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_flow_template_steps
     (id, template_id, sort_order, action_type, allow_approver_designation, name, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, sortOrder || 1, actionType || 'sign', allowApproverDesignation ? 1 : 0, name || '', orgId]
  );
}

async function removeByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  // FK CASCADE handles condition cleanup, but be explicit
  await conditionModel.removeByTemplateId(templateId);
  await pool.query('DELETE FROM audit_flow_template_steps WHERE template_id = ? AND org_id = ?', [templateId, orgId]);
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await conditionModel.removeByTemplateStepId(id);
  await pool.query('DELETE FROM audit_flow_template_steps WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByTemplateId, getById, create, removeByTemplateId, remove };
