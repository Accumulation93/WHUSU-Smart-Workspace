const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM hr_info WHERE org_id = ? ORDER BY name', [orgId]);
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM hr_info WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getByStudentId(studentId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM hr_info WHERE student_id = ? AND org_id = ?', [studentId, orgId]);
  return rows[0] || null;
}

async function create(id, data) {
  const { name, studentId, departmentId, identityId, workGroupId } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO hr_info (id, name, student_id, department_id, identity_id, work_group_id, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name || '', studentId || '', departmentId || '', identityId || '', workGroupId || '', orgId]
  );
}

async function update(id, data) {
  const { name, studentId, departmentId, identityId, workGroupId, updatedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE hr_info SET name = ?, student_id = ?, department_id = ?, identity_id = ?,
     work_group_id = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
    [name || '', studentId || '', departmentId || '', identityId || '', workGroupId || '', updatedAt || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM hr_info WHERE id = ? AND org_id = ?', [id, orgId]);
}

async function getByIds(ids) {
  if (!ids.length) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM hr_info WHERE id IN (${placeholders}) AND org_id = ? ORDER BY name`,
    [...ids, orgId]
  );
  return rows;
}

async function getByScopes(scopes) {
  if (!scopes.length) return [];
  const orgId = await getCurrentOrgId();
  const conditions = [];
  const params = [];
  for (const s of scopes) {
    if (s.scopeType === 'all_people') {
      const [rows] = await pool.query('SELECT * FROM hr_info WHERE org_id = ? ORDER BY name', [orgId]);
      return rows;
    }
    const parts = [];
    if (s.departmentId) { parts.push('department_id = ?'); params.push(s.departmentId); }
    if (s.identityId) { parts.push('identity_id = ?'); params.push(s.identityId); }
    if (s.workGroupId) { parts.push('work_group_id = ?'); params.push(s.workGroupId); }
    if (parts.length) conditions.push(`(${parts.join(' AND ')})`);
  }
  if (!conditions.length) return [];
  params.push(orgId);
  const [rows] = await pool.query(
    `SELECT * FROM hr_info WHERE (${conditions.join(' OR ')}) AND org_id = ? ORDER BY name`,
    params
  );
  return rows;
}

module.exports = { getAll, getById, getByIds, getByStudentId, getByScopes, create, update, remove };
