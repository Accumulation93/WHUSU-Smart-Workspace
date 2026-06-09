const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByPublication(publicationId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM merit_list_permissions WHERE publication_id = ? AND org_id = ?',
    [publicationId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM merit_list_permissions WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function getByPublicationAndTarget(publicationId, targetIdentityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM merit_list_permissions WHERE publication_id = ? AND target_identity_id = ? AND org_id = ?',
    [publicationId, targetIdentityId, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO merit_list_permissions (id, publication_id, grantee_department_id, grantee_identity_id, target_identity_id, quota_limit, require_exact_quota, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.publicationId, data.granteeDepartmentId, data.granteeIdentityId, data.targetIdentityId, data.quotaLimit || 0, data.requireExactQuota ? 1 : 0, orgId]
  );
}

async function update(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE merit_list_permissions SET grantee_department_id = ?, grantee_identity_id = ?, target_identity_id = ?, quota_limit = ?, require_exact_quota = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [data.granteeDepartmentId, data.granteeIdentityId, data.targetIdentityId, data.quotaLimit || 0, data.requireExactQuota ? 1 : 0, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM merit_list_permissions WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getByPublication, getById, getByPublicationAndTarget, create, update, remove };
