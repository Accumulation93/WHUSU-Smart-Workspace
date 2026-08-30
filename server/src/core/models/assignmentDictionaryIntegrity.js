const pool = require('../../config/db');

async function listOrganizationAssignments(organizationId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT assignment_row.id, assignment_row.membership_id, assignment_row.org_id,
            assignment_row.status, assignment_row.department_id,
            assignment_row.identity_id, assignment_row.work_group_id,
            department_row.org_id AS department_org_id,
            identity_row.org_id AS identity_org_id,
            work_group_row.org_id AS work_group_org_id,
            work_group_row.department_id AS work_group_department_id
       FROM membership_assignments assignment_row
       LEFT JOIN departments department_row ON department_row.id = assignment_row.department_id
       LEFT JOIN identities identity_row ON identity_row.id = assignment_row.identity_id
       LEFT JOIN work_groups work_group_row ON work_group_row.id = assignment_row.work_group_id
      WHERE assignment_row.org_id = ?
      ORDER BY assignment_row.created_at ASC, assignment_row.id ASC`,
    [organizationId]
  );
  return rows;
}

module.exports = {
  listOrganizationAssignments
};
