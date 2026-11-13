'use strict';

const { assignmentPredicate } = require('./identityNatureEligibility');

// 配置授权所需的最小岗位目录；不读取学号、认证资料或补充资料值。
async function read(connection, organizationId, selection = null) {
  const selectedAssignment = selection && selection.role === 'user' ? selection.subjectId : null;
  const selectedAdmin = selection && selection.role === 'admin' ? selection.subjectId : null;
  const [assignments] = selection && selection.role && selection.role !== 'user' ? [[]] : await connection.query(`SELECT a.id AS assignmentId, m.person_id AS personId,
    p.name, a.assignment_kind AS natureId, n.name AS natureName,
    a.department_id AS departmentId, d.name AS departmentName,
    a.identity_id AS identityCategoryId, i.name AS identityCategoryName,
    a.work_group_id AS workGroupId, w.name AS workGroupName
    FROM membership_assignments a
    JOIN organization_memberships m ON m.id = a.membership_id AND m.org_id = a.org_id AND m.status = 'active'
    JOIN persons p ON p.id = m.person_id AND p.status = 'active'
    JOIN assignment_natures n ON n.id = a.assignment_kind COLLATE utf8mb4_unicode_ci
      AND n.org_id = a.org_id COLLATE utf8mb4_unicode_ci
    JOIN departments d ON d.id = a.department_id AND d.org_id = a.org_id
    JOIN identities i ON i.id = a.identity_id AND i.org_id = a.org_id
    LEFT JOIN work_groups w ON w.id = a.work_group_id AND w.org_id = a.org_id AND w.department_id = a.department_id
    WHERE a.org_id = ? AND a.status = 'active'
      AND ${assignmentPredicate('a')}
      ${selectedAssignment ? 'AND a.id = ?' : ''}
      AND (a.work_group_id IS NULL OR a.work_group_id = '' OR w.id IS NOT NULL)
    ORDER BY p.name, a.id`, selectedAssignment ? [organizationId, selectedAssignment] : [organizationId]);
  const includeSuper = Boolean(selection && selection.includeSuper);
  const [adminGrants] = selection && selection.role && selection.role !== 'admin' ? [[]] : await connection.query(`SELECT g.id AS adminGrantId, g.person_id AS personId, p.name
      ${includeSuper ? ', g.admin_level AS adminLevel' : ''}
    FROM admin_grants g JOIN persons p ON p.id = g.person_id AND p.status = 'active'
    WHERE ${includeSuper ? "(g.org_id = ? OR (g.org_id = '' AND g.admin_level = 'super_admin'))" : 'g.org_id = ?'}
      AND g.status = 'active' AND ${includeSuper ? "g.admin_level IN ('admin', 'super_admin')" : "g.admin_level = 'admin'"}
      ${selectedAdmin ? 'AND g.id = ?' : ''}
    ORDER BY p.name, g.id`, selectedAdmin ? [organizationId, selectedAdmin] : [organizationId]);
  return { assignments, adminGrants };
}

// 配置范围时可以选择尚未分配岗位的有效字典项，不从现有成员反推字典全集。
async function readDimensions(connection, organizationId) {
  const [nature] = await connection.query('SELECT id, name FROM assignment_natures WHERE org_id = ? ORDER BY name, id', [organizationId]);
  const [departments] = await connection.query('SELECT id, name FROM departments WHERE org_id = ? ORDER BY name, id', [organizationId]);
  const [identities] = await connection.query('SELECT id, name FROM identities WHERE org_id = ? ORDER BY name, id', [organizationId]);
  const [workGroups] = await connection.query(`SELECT w.id, w.name, w.department_id AS departmentId, d.name AS departmentName
    FROM work_groups w JOIN departments d ON d.id = w.department_id AND d.org_id = w.org_id
    WHERE w.org_id = ? ORDER BY w.name, w.id`, [organizationId]);
  return { natureId: nature, departmentId: departments,
    identityCategoryId: await require('./identityNature').decorate(connection, organizationId, identities), workGroupId: workGroups };
}

module.exports = { read, readDimensions };
