const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getActiveSnapshot(connection = pool) {
  const orgId = await getCurrentOrgId();
  const [rows] = await connection.query(
    `SELECT s.*
       FROM org_hr_profile_template_settings settings
       JOIN org_hr_profile_template_snapshots s ON s.id = settings.active_snapshot_id
      WHERE settings.org_id = ? AND s.org_id = ? LIMIT 1`,
    [orgId, orgId]
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
  const [rows] = await connection.query(
    `SELECT t.*,
            COUNT(DISTINCT s.id) AS snapshot_count,
            COUNT(DISTINCT CASE WHEN settings.active_snapshot_id = s.id THEN settings.org_id END) AS active_org_count
       FROM hr_profile_templates t
       LEFT JOIN org_hr_profile_template_snapshots s ON s.source_template_id = t.id
       LEFT JOIN org_hr_profile_template_settings settings ON settings.active_snapshot_id = s.id
      GROUP BY t.id ORDER BY t.name`
  );
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
