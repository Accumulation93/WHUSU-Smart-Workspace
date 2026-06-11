const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_records WHERE org_id = ? ORDER BY submitted_at DESC', [orgId]);
  return rows;
}

async function getByActivity(activityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM score_records WHERE activity_id = ? AND org_id = ? ORDER BY submitted_at DESC',
    [activityId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_records WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getByScorerTarget(scorerId, targetId, activityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM score_records WHERE scorer_id = ? AND target_id = ? AND activity_id = ? AND org_id = ? ORDER BY submitted_at DESC',
    [scorerId, targetId, activityId, orgId]
  );
  return rows;
}

async function getByScorer(scorerId, activityId) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM score_records WHERE scorer_id = ? AND org_id = ?';
  const params = [scorerId, orgId];
  if (activityId) { sql += ' AND activity_id = ?'; params.push(activityId); }
  const [rows] = await pool.query(sql + ' ORDER BY submitted_at DESC', params);
  return rows;
}

async function query(conditions = {}) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM score_records WHERE 1=1 AND org_id = ?';
  const params = [orgId];
  for (const [key, value] of Object.entries(conditions)) {
    if (value !== undefined && value !== null) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      sql += ` AND ${dbKey} = ?`;
      params.push(value);
    }
  }
  const [rows] = await pool.query(sql + ' ORDER BY submitted_at DESC', params);
  return rows;
}

async function create(id, data) {
  const { activityId, ruleId, scorerId, targetId, templateConfigSignature, submittedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO score_records (id, activity_id, rule_id, scorer_id, target_id, template_config_signature, submitted_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, activityId, ruleId, scorerId, targetId, templateConfigSignature || '', submittedAt || null, orgId]
  );
}

async function update(id, data) {
  const { activityId, ruleId, scorerId, targetId, templateConfigSignature, submittedAt } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE score_records SET activity_id = ?, rule_id = ?, scorer_id = ?, target_id = ?,
     template_config_signature = ?, submitted_at = ? WHERE id = ? AND org_id = ?`,
    [activityId, ruleId, scorerId, targetId, templateConfigSignature || '', submittedAt || null, id, orgId]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM score_records WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = { getAll, getByActivity, getById, getByScorerTarget, getByScorer, query, create, update, remove };
