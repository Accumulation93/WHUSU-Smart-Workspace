const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');

function uniqueIds(values) {
  return Array.from(new Set((values || []).map(safeString).filter(Boolean)));
}

function placeholders(values) {
  return values.map(() => '?').join(',');
}

async function resolvePersonByLegacyHrId(legacyHrId, connection, includeFormer = false) {
  const db = connection || pool;
  const [rows] = await db.query(
    `SELECT p.id, p.name, p.student_id
       FROM organization_memberships om
       JOIN persons p ON p.id = om.person_id AND p.status = 'active'
      WHERE om.legacy_hr_id = ? AND ${includeFormer ? "om.status IN ('active', 'left')" : "om.status = 'active'"}
      LIMIT 1`,
    [safeString(legacyHrId)]
  );
  return rows[0] || null;
}

async function listPersonIdentityData(legacyHrId, readableOrganizationIds, editableOrganizationIds) {
  const organizationIds = uniqueIds(readableOrganizationIds);
  if (!organizationIds.length) return null;
  const person = await resolvePersonByLegacyHrId(legacyHrId, null, true);
  if (!person) return null;
  const orgSql = placeholders(organizationIds);
  const [membershipRows, assignmentRows, grantRows] = await Promise.all([
    pool.query(
      `SELECT om.id AS membership_id, o.id AS org_id, om.legacy_hr_id, o.name AS organization_name,
              om.status AS membership_status, om.created_at AS joined_at,
              CASE WHEN om.status = 'left' THEN om.updated_at ELSE NULL END AS left_at
         FROM organizations o
         LEFT JOIN organization_memberships om
           ON om.org_id = o.id AND om.person_id = ? AND om.status IN ('active', 'left')
        WHERE o.id IN (${orgSql})
          AND (
            om.id IS NOT NULL
            OR EXISTS (
              SELECT 1
                FROM admin_grants ag
               WHERE ag.person_id = ? AND ag.org_id = o.id AND ag.status = 'active'
            )
          )
        ORDER BY o.created_at DESC, o.name ASC`,
      [person.id, ...organizationIds, person.id]
    ).then((result) => result[0]),
    pool.query(
      `SELECT ma.id, ma.membership_id, ma.org_id, ma.assignment_kind, ma.title,
              om.status AS membership_status,
              ma.department_id, ma.identity_id, ma.work_group_id,
              d.name AS department_name, i.name AS identity_name, w.name AS work_group_name
         FROM organization_memberships om
         JOIN membership_assignments ma
          ON ma.membership_id = om.id AND ma.org_id = om.org_id
          AND ((om.status = 'active' AND ma.status = 'active')
            OR (om.status = 'left' AND ma.status = 'revoked'
              AND ma.revoked_by_departure_id = om.departure_batch_id))
         LEFT JOIN departments d ON d.id = ma.department_id AND d.org_id = ma.org_id
         LEFT JOIN identities i ON i.id = ma.identity_id AND i.org_id = ma.org_id
         LEFT JOIN work_groups w ON w.id = ma.work_group_id AND w.org_id = ma.org_id
        WHERE om.person_id = ? AND om.status IN ('active', 'left') AND om.org_id IN (${orgSql})
        ORDER BY ma.created_at ASC, ma.id ASC`,
      [person.id, ...organizationIds]
    ).then((result) => result[0]),
    pool.query(
      `SELECT ag.id, ag.person_id, ag.org_id, ag.admin_level, ag.legacy_admin_id,
              ai.name, ai.student_id, ai.bind_status,
              a.status AS account_status,
              EXISTS (
                SELECT 1 FROM account_wechat_bindings b
                 WHERE b.account_id = a.id AND b.status = 'active'
              ) AS has_active_binding
         FROM admin_grants ag
         LEFT JOIN admin_info ai ON ai.id = ag.legacy_admin_id
         LEFT JOIN accounts a ON a.person_id = ag.person_id
        WHERE ag.person_id = ? AND ag.status = 'active'
          AND (ag.org_id = '' OR ag.org_id IN (${orgSql}))
        ORDER BY ag.admin_level = 'super_admin' DESC, ag.created_at ASC`,
      [person.id, ...organizationIds]
    ).then((result) => result[0])
  ]);

  const editableIds = uniqueIds(editableOrganizationIds);
  let dictionaries = { departments: [], identities: [], workGroups: [] };
  if (editableIds.length) {
    const editableSql = placeholders(editableIds);
    const [departments, identities, workGroups] = await Promise.all([
      pool.query(
        `SELECT id, org_id, name FROM departments WHERE org_id IN (${editableSql}) ORDER BY name`,
        editableIds
      ).then((result) => result[0]),
      pool.query(
        `SELECT id, org_id, name FROM identities WHERE org_id IN (${editableSql}) ORDER BY name`,
        editableIds
      ).then((result) => result[0]),
      pool.query(
        `SELECT id, org_id, department_id, name FROM work_groups
          WHERE org_id IN (${editableSql}) ORDER BY name`,
        editableIds
      ).then((result) => result[0])
    ]);
    dictionaries = { departments, identities, workGroups };
  }

  return {
    person,
    memberships: membershipRows,
    assignments: assignmentRows,
    grants: grantRows,
    dictionaries
  };
}

module.exports = {
  resolvePersonByLegacyHrId,
  listPersonIdentityData
};
