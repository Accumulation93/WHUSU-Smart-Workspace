const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT p.*, h.name AS grantee_name
       FROM audit_verification_permissions p
       JOIN hr_info h
         ON h.id = p.grantee_hr_id
        AND h.org_id = p.org_id
       JOIN organization_memberships om
         ON om.legacy_hr_id = h.id
        AND om.org_id = h.org_id
        AND om.status = 'active'
      WHERE p.org_id = ?
      ORDER BY p.created_at DESC`,
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
    `SELECT COUNT(*) AS cnt
       FROM audit_verification_permissions p
      WHERE p.grantee_hr_id = ? AND p.org_id = ?
        AND EXISTS (
          SELECT 1
            FROM hr_info h
            JOIN organization_memberships om
              ON om.legacy_hr_id = h.id
             AND om.org_id = h.org_id
             AND om.status = 'active'
           WHERE h.id = p.grantee_hr_id
             AND h.org_id = p.org_id
        )`,
    [hrId, orgId]
  );
  return (rows[0] && rows[0].cnt > 0);
}

async function create(id, data) {
  const { granteeHrId, grantedBy } = data;
  const orgId = await getCurrentOrgId();
  return pool.withTransaction(async (connection) => {
    const [granteeRows] = await connection.query(
      `SELECT h.id
         FROM hr_info h
         JOIN organization_memberships om
           ON om.legacy_hr_id = h.id
          AND om.org_id = h.org_id
          AND om.status = 'active'
        WHERE h.id = ? AND h.org_id = ?
        LIMIT 1
        FOR UPDATE`,
      [granteeHrId, orgId]
    );
    if (!granteeRows.length) return { status: 'grantee_not_found' };

    const [existingRows] = await connection.query(
      `SELECT id FROM audit_verification_permissions
        WHERE grantee_hr_id = ? AND org_id = ?
        LIMIT 1
        FOR UPDATE`,
      [granteeHrId, orgId]
    );
    if (existingRows.length) return { status: 'duplicate' };

    await connection.query(
      `INSERT INTO audit_verification_permissions (id, grantee_hr_id, granted_by, org_id)
       VALUES (?, ?, ?, ?)`,
      [id, granteeHrId, grantedBy || '', orgId]
    );
    return { status: 'success' };
  });
}

async function removeByGrantee(granteeHrId) {
  const orgId = await getCurrentOrgId();
  const [result] = await pool.query(
    'DELETE FROM audit_verification_permissions WHERE grantee_hr_id = ? AND org_id = ?',
    [granteeHrId, orgId]
  );
  return Boolean(result && result.affectedRows > 0);
}

module.exports = { getAll, getByGrantee, checkPermission, create, removeByGrantee };
