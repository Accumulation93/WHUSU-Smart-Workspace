'use strict';

// 规则配置专用目录，不依赖人事管理权，也不读取学号、账号或补充资料。
async function read(connection, organizationId) {
  const [assignments] = await connection.query(`SELECT a.id AS assignmentId, m.legacy_hr_id AS hrId,
      p.name, d.name AS department, i.name AS identity, w.name AS workGroup
    FROM membership_assignments a
    JOIN organization_memberships m ON m.id = a.membership_id AND m.org_id = a.org_id AND m.status = 'active'
    JOIN persons p ON p.id = m.person_id AND p.status = 'active'
    JOIN departments d ON d.id = a.department_id AND d.org_id = a.org_id
    JOIN identities i ON i.id = a.identity_id AND i.org_id = a.org_id
    LEFT JOIN work_groups w ON w.id = a.work_group_id AND w.org_id = a.org_id AND w.department_id = a.department_id
    WHERE a.org_id = ? AND a.status = 'active'
      AND (a.work_group_id IS NULL OR a.work_group_id = '' OR w.id IS NOT NULL)
    ORDER BY p.name, a.id`, [organizationId]);
  const [identities] = await connection.query('SELECT id, name FROM identities WHERE org_id = ? ORDER BY name, id', [organizationId]);
  const [departments] = await connection.query('SELECT id, name FROM departments WHERE org_id = ? ORDER BY name, id', [organizationId]);
  const [workGroups] = await connection.query(`SELECT w.id, w.name, w.department_id AS departmentId
    FROM work_groups w JOIN departments d ON d.id=w.department_id AND d.org_id=w.org_id
    WHERE w.org_id = ? ORDER BY w.name, w.id`, [organizationId]);
  return { assignments: assignments.map(row => ({ ...row,
    assignmentLabel: [row.identity, row.department, row.workGroup].filter(Boolean).join(' · ') })),
  identities, departments, workGroups };
}

module.exports = { read };
