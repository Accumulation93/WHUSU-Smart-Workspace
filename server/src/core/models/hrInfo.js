const pool = require('../../config/db');
const { getCurrentOrgId } = require('../../utils/orgContext');
const unifiedIdentityModel = require('./unifiedIdentity');

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
  await pool.withTransaction(async (connection) => {
    await connection.query(
      `INSERT INTO hr_info (id, name, student_id, department_id, identity_id, work_group_id, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name || '', studentId || '', departmentId || '', identityId || '', workGroupId || '', orgId]
    );
    await unifiedIdentityModel.syncLegacyHrRecords(connection, [id]);
  });
}

async function update(id, data) {
  const { name, studentId, departmentId, identityId, workGroupId, updatedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.withTransaction(async (connection) => {
    await connection.query(
      `UPDATE hr_info SET name = ?, student_id = ?, department_id = ?, identity_id = ?,
       work_group_id = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
      [name || '', studentId || '', departmentId || '', identityId || '', workGroupId || '', updatedAt || null, id, orgId]
    );
    await unifiedIdentityModel.syncLegacyHrRecords(connection, [id]);
  });
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.withTransaction(async (connection) => {
    await unifiedIdentityModel.removeLegacyHrRecord(connection, id, orgId);
    await connection.query('DELETE FROM hr_info WHERE id = ? AND org_id = ?', [id, orgId]);
  });
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

// 跨组织全局查询 — 返回所有组织中匹配该学号的 hr_info 记录
async function getByStudentIdGlobal(studentId) {
  const [rows] = await pool.query(
    'SELECT * FROM hr_info WHERE student_id = ? ORDER BY created_at DESC',
    [studentId]
  );
  return rows;
}

// 指定组织查询 — 不依赖 getCurrentOrgId()，直接按参数 orgId 过滤
async function getByStudentIdInOrg(studentId, orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM hr_info WHERE student_id = ? AND org_id = ?',
    [studentId, orgId]
  );
  return rows[0] || null;
}

// 指定组织按 ID 查询
async function getByIdInOrg(id, orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM hr_info WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

module.exports = { getAll, getById, getByIdInOrg, getByIds, getByStudentId, getByStudentIdGlobal, getByStudentIdInOrg, getByScopes, create, update, remove };
