const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM rate_target_rules WHERE org_id = ? ORDER BY created_at DESC', [orgId]);
  return rows;
}

async function getByActivity(activityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM rate_target_rules WHERE activity_id = ? AND org_id = ?',
    [activityId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM rate_target_rules WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getByKey(activityId, scorerKey) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM rate_target_rules WHERE activity_id = ? AND scorer_key = ? AND org_id = ?',
    [activityId, scorerKey, orgId]
  );
  return rows[0] || null;
}

async function query(activityId, scorerDepartmentId, scorerIdentityId, isActive) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM rate_target_rules WHERE 1=1 AND org_id = ?';
  const params = [orgId];
  if (activityId) { sql += ' AND activity_id = ?'; params.push(activityId); }
  if (scorerDepartmentId) { sql += ' AND scorer_department_id = ?'; params.push(scorerDepartmentId); }
  if (scorerIdentityId) { sql += ' AND scorer_identity_id = ?'; params.push(scorerIdentityId); }
  if (isActive !== undefined) { sql += ' AND is_active = ?'; params.push(isActive ? 1 : 0); }
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function create(id, data) {
  const { activityId, scorerDepartmentId, scorerIdentityId, scorerKey, isActive, allowSelfAssessment } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO rate_target_rules (id, activity_id, scorer_department_id, scorer_identity_id, scorer_key, is_active, allow_self_assessment, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, activityId, scorerDepartmentId, scorerIdentityId, scorerKey || '', isActive ? 1 : 0, allowSelfAssessment !== false ? 1 : 0, orgId]
  );
}

async function update(id, data) {
  const { activityId, scorerDepartmentId, scorerIdentityId, scorerKey, isActive, allowSelfAssessment, updatedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE rate_target_rules SET activity_id = ?, scorer_department_id = ?, scorer_identity_id = ?,
     scorer_key = ?, is_active = ?, allow_self_assessment = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
    [activityId, scorerDepartmentId, scorerIdentityId, scorerKey || '', isActive ? 1 : 0, allowSelfAssessment !== false ? 1 : 0, updatedAt || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM rate_target_rules WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getAll, getByActivity, getById, getByKey, query, create, update, remove };
