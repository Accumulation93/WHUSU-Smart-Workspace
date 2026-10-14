'use strict';
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const departmentModel = require('../../../core/models/department');
const identityModel = require('../../../core/models/identity');
const workGroupModel = require('../../../core/models/workGroup');

// 审核编辑只返回名称与岗位选择所需字段，不读取学号或补充资料。
async function people() {
  const orgId = await getCurrentOrgId();
  const [[rows], [assignments]] = await Promise.all([
    pool.query(`SELECT h.id, p.name FROM hr_info h
      JOIN organization_memberships om ON om.legacy_hr_id = h.id AND om.org_id = h.org_id AND om.status = 'active'
      JOIN persons p ON p.id = om.person_id AND p.status = 'active'
      WHERE h.org_id = ? ORDER BY p.name, h.id`, [orgId]),
    pool.query(`SELECT ma.id AS assignment_id, om.legacy_hr_id AS hr_id,
      ma.department_id, d.name AS department_name, ma.identity_id, i.name AS identity_name,
      ma.work_group_id, wg.name AS work_group_name
      FROM membership_assignments ma
      JOIN organization_memberships om ON om.id = ma.membership_id AND om.org_id = ma.org_id AND om.status = 'active'
      JOIN persons p ON p.id = om.person_id AND p.status = 'active'
      LEFT JOIN departments d ON d.id = ma.department_id AND d.org_id = ma.org_id
      LEFT JOIN identities i ON i.id = ma.identity_id AND i.org_id = ma.org_id
      LEFT JOIN work_groups wg ON wg.id = ma.work_group_id AND wg.org_id = ma.org_id
      WHERE ma.org_id = ? AND ma.status = 'active' ORDER BY ma.id`, [orgId])
  ]);
  const grouped = new Map();
  assignments.forEach(item => {
    if (!grouped.has(item.hr_id)) grouped.set(item.hr_id, []);
    grouped.get(item.hr_id).push(item);
  });
  return rows.map(row => ({ id: row.id, name: row.name,
    assignments: (grouped.get(row.id) || []).map(item => ({
      assignmentId: item.assignment_id, assignmentLabel: [item.identity_name, item.department_name, item.work_group_name].filter(Boolean).join(' · '),
      departmentId: item.department_id, department: item.department_name,
      identityCategoryId: item.identity_id, identity: item.identity_name,
      workGroupId: item.work_group_id, workGroup: item.work_group_name
    })) }));
}
async function templates() {
  const [members, departments, identities, workGroups] = await Promise.all([
    people(), departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
  ]);
  const dictionary = rows => rows.map(row => ({ id: row.id, name: row.name,
    ...(row.department_id ? { departmentId: row.department_id } : {}) }));
  return { people: members, departments: dictionary(departments), identities: dictionary(identities), workGroups: dictionary(workGroups) };
}
module.exports = { people, templates };
