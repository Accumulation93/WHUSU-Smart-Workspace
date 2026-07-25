const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getActiveSnapshot(connection = pool) {
  const orgId = await getCurrentOrgId();
  const [rows] = await connection.query(
    'SELECT * FROM org_hr_profile_template_snapshots WHERE org_id = ? LIMIT 1',
    [orgId]
  );
  return rows[0] || null;
}

async function getByTemplateKey() {
  return getActiveSnapshot();
}

async function getById(id, connection = pool) {
  const [rows] = await connection.query('SELECT * FROM hr_profile_templates WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getAll(connection = pool) {
  const [rows] = await connection.query('SELECT * FROM hr_profile_templates ORDER BY name');
  return rows;
}

async function create(id, data, connection = pool) {
  const { name, description, editMode, createdBy } = data;
  await connection.query(
    `INSERT INTO hr_profile_templates (id, name, description, edit_mode, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, description || '', editMode || 'direct', createdBy || null, createdBy || null]
  );
}

async function update(id, data, connection = pool) {
  const { name, description, editMode, updatedBy, updatedAt } = data;
  await connection.query(
    `UPDATE hr_profile_templates
        SET name = ?, description = ?, edit_mode = ?, updated_by = ?, updated_at = ?
      WHERE id = ?`,
    [name, description || '', editMode || 'direct', updatedBy || null, updatedAt || new Date(), id]
  );
}

async function remove(id, connection = pool) {
  await connection.query('DELETE FROM hr_profile_templates WHERE id = ?', [id]);
}

module.exports = { getActiveSnapshot, getByTemplateKey, getById, getAll, create, update, remove };
