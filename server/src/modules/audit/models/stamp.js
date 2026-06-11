const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM stamps WHERE org_id = ? ORDER BY name',
    [orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM stamps WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const { name, imageData, createdBy } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO stamps (id, name, image_data, org_id, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name || '', imageData || null, orgId, createdBy || null]
  );
}

async function update(id, data) {
  const { name, imageData } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    'UPDATE stamps SET name = ?, image_data = ? WHERE id = ? AND org_id = ?',
    [name || '', imageData || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM stamps WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getAll, getById, create, update, remove };
