const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');
const TEMPLATE_KEY = 'default_hr_profile_template';

async function getByTemplateKey(key = TEMPLATE_KEY) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM hr_profile_templates WHERE template_key = ? AND org_id = ? LIMIT 1',
    [key, orgId]
  );
  return rows[0] || null;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM hr_profile_templates WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function create(id, data) {
  const { templateKey, description, editMode, updatedBy } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO hr_profile_templates (id, template_key, description, edit_mode, updated_by, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, templateKey || TEMPLATE_KEY, description || '', editMode || 'direct', updatedBy || '', orgId]
  );
}

async function update(id, data) {
  const { templateKey, description, editMode, updatedBy, updatedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE hr_profile_templates SET template_key = ?, description = ?, edit_mode = ?,
     updated_by = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
    [templateKey || TEMPLATE_KEY, description || '', editMode || 'direct', updatedBy || '', updatedAt || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM hr_profile_templates WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByTemplateKey, getById, create, update, remove, TEMPLATE_KEY };
