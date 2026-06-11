const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_template_steps WHERE template_id = ? AND org_id = ? ORDER BY sort_order',
    [templateId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_flow_template_steps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const { templateId, sortOrder, approverType, approverIdentityId, approverHrId, relatedRelation, actionType } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_flow_template_steps (id, template_id, sort_order, approver_type, approver_identity_id, approver_hr_id, related_relation, action_type, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, sortOrder || 1, approverType || 'identity', approverIdentityId || null, approverHrId || null, relatedRelation || null, actionType || 'sign', orgId]
  );
}

async function removeByTemplateId(templateId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM audit_flow_template_steps WHERE template_id = ? AND org_id = ?', [templateId, orgId]);
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM audit_flow_template_steps WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByTemplateId, getById, create, removeByTemplateId, remove };
