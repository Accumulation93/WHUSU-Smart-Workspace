const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByHrId(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM signature_templates WHERE hr_id = ? AND org_id = ? ORDER BY is_default DESC, created_at DESC',
    [hrId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM signature_templates WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function getDefault(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM signature_templates WHERE hr_id = ? AND org_id = ? AND is_default = 1 LIMIT 1',
    [hrId, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const { hrId, name, imageData, isDefault } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO signature_templates (id, hr_id, name, image_data, is_default, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, hrId, name || '', imageData || null, isDefault ? 1 : 0, orgId]
  );
}

async function update(id, data, hrId) {
  const { name, imageData, isDefault } = data;
  const orgId = await getCurrentOrgId();
  let sql = 'UPDATE signature_templates SET name = ?, image_data = ?, is_default = ? WHERE id = ? AND org_id = ?';
  const params = [name || '', imageData || null, isDefault ? 1 : 0, id, orgId];
  if (hrId) { sql += ' AND hr_id = ?'; params.push(hrId); }
  const [result] = await pool.query(sql, params);
  return result.affectedRows || 0;
}

async function clearDefaults(hrId) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'UPDATE signature_templates SET is_default = 0 WHERE hr_id = ? AND org_id = ?',
    [hrId, orgId]
  );
}

async function remove(id, hrId) {
  const orgId = await getCurrentOrgId();
  let sql = 'DELETE FROM signature_templates WHERE id = ? AND org_id = ?';
  const params = [id, orgId];
  if (hrId) { sql += ' AND hr_id = ?'; params.push(hrId); }
  const [result] = await pool.query(sql, params);
  return result.affectedRows || 0;
}

module.exports = { getByHrId, getById, getDefault, create, update, clearDefaults, remove };
