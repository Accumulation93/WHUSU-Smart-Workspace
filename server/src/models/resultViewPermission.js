const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByPublication(publicationId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM result_view_permissions WHERE publication_id = ? AND org_id = ?',
    [publicationId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM result_view_permissions WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO result_view_permissions (id, publication_id, grantee_department_id, grantee_identity_id, scope_type, target_identity_id, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.publicationId, data.granteeDepartmentId, data.granteeIdentityId, data.scopeType, data.targetIdentityId || null, orgId]
  );
}

async function update(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE result_view_permissions SET grantee_department_id = ?, grantee_identity_id = ?, scope_type = ?, target_identity_id = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [data.granteeDepartmentId, data.granteeIdentityId, data.scopeType, data.targetIdentityId || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM result_view_permissions WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByPublication, getById, create, update, remove };
