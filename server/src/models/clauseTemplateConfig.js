const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByClauseId(clauseId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM clause_template_configs WHERE clause_id = ? AND org_id = ? ORDER BY sort_order',
    [clauseId, orgId]
  );
  return rows;
}

async function getByClauseIds(clauseIds) {
  if (!clauseIds.length) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = clauseIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM clause_template_configs WHERE clause_id IN (${placeholders}) AND org_id = ? ORDER BY clause_id, sort_order`,
    [...clauseIds, orgId]
  );
  return rows;
}

async function create(id, clauseId, sortOrder, templateId, weight, calculationMethod, trimHighCount, trimLowCount) {
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO clause_template_configs (id, clause_id, sort_order, template_id, weight, calculation_method, trim_high_count, trim_low_count, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, clauseId, sortOrder, templateId, weight != null ? weight : 1,
     calculationMethod || 'weighted_average', trimHighCount || 0, trimLowCount || 0, orgId]
  );
}

async function removeByClauseId(clauseId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM clause_template_configs WHERE clause_id = ? AND org_id = ?', [clauseId, orgId]);
}

module.exports = { getByClauseId, getByClauseIds, create, removeByClauseId };
