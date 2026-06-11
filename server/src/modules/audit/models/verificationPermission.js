const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_verification_permissions WHERE org_id = ? ORDER BY created_at DESC',
    [orgId]
  );
  return rows;
}

async function getByGrantee(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM audit_verification_permissions WHERE grantee_hr_id = ? AND org_id = ?',
    [hrId, orgId]
  );
  return rows[0] || null;
}

async function checkPermission(hrId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM audit_verification_permissions WHERE grantee_hr_id = ? AND org_id = ?',
    [hrId, orgId]
  );
  return (rows[0] && rows[0].cnt > 0);
}

async function create(id, data) {
  const { granteeHrId, grantedBy } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO audit_verification_permissions (id, grantee_hr_id, granted_by, org_id)
     VALUES (?, ?, ?, ?)`,
    [id, granteeHrId, grantedBy || '', orgId]
  );
}

async function removeByGrantee(granteeHrId) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    'DELETE FROM audit_verification_permissions WHERE grantee_hr_id = ? AND org_id = ?',
    [granteeHrId, orgId]
  );
}

module.exports = { getAll, getByGrantee, checkPermission, create, removeByGrantee };
