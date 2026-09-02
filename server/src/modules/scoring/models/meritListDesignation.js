const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getByPublication(publicationId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM merit_list_designations WHERE publication_id = ? AND org_id = ?',
    [publicationId, orgId]
  );
  return rows;
}

async function getByPermission(permissionId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM merit_list_designations WHERE clause_id = ? AND org_id = ?',
    [permissionId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM merit_list_designations WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

async function create(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO merit_list_designations
      (id, publication_id, clause_id, target_hr_id, target_assignment_id, target_context_snapshot,
       designated_by, designated_by_person_id, designated_by_assignment_id,
       designated_by_context_snapshot, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.publicationId,
      data.clauseId || data.permissionId,
      data.targetHrId,
      data.targetAssignmentId,
      data.targetContextSnapshot ? JSON.stringify(data.targetContextSnapshot) : null,
      data.designatedBy,
      data.designatedByPersonId || null,
      data.designatedByAssignmentId || null,
      data.designatedByContextSnapshot ? JSON.stringify(data.designatedByContextSnapshot) : null,
      orgId
    ]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM merit_list_designations WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function removeByPermission(permissionId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM merit_list_designations WHERE clause_id = ? AND org_id = ?', [permissionId, orgId]);
}

module.exports = { getByPublication, getByPermission, getById, create, remove, removeByPermission };
