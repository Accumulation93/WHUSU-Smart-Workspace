const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

/**
 * Get all grade bands for a given pub_view_rule, ordered by sort_order.
 */
async function getByRuleId(ruleId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM pub_grade_bands WHERE rule_id = ? AND org_id = ? ORDER BY sort_order ASC',
    [ruleId, orgId]
  );
  return rows;
}

/**
 * Get a single grade band by id.
 */
async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM pub_grade_bands WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return rows[0] || null;
}

/**
 * Create a new grade band.
 */
async function create(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO pub_grade_bands (id, rule_id, min_score, max_score, grade_name, sort_order, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.ruleId, data.minScore, data.maxScore, data.gradeName, data.sortOrder || 1, orgId]
  );
}

/**
 * Update an existing grade band.
 */
async function update(id, data) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `UPDATE pub_grade_bands SET min_score = ?, max_score = ?, grade_name = ?, sort_order = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [data.minScore, data.maxScore, data.gradeName, data.sortOrder || 1, id, orgId]
  );
}

/**
 * Delete a single grade band by id.
 */
async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM pub_grade_bands WHERE id = ? AND org_id = ?', [id, orgId]);
}

/**
 * Delete all grade bands for a given rule.
 */
async function removeByRuleId(ruleId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM pub_grade_bands WHERE rule_id = ? AND org_id = ?', [ruleId, orgId]);
}

module.exports = { getByRuleId, getById, create, update, remove, removeByRuleId };
