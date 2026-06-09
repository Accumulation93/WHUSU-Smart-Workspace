const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

async function getByRuleId(ruleId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ? ORDER BY id',
    [ruleId, orgId]
  );
  return rows;
}

async function getByRuleIds(ruleIds) {
  if (!ruleIds.length) return [];
  const orgId = await getCurrentOrgId();
  const placeholders = ruleIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT * FROM rate_rule_clauses WHERE rule_id IN (${placeholders}) AND org_id = ? ORDER BY rule_id, id`,
    [...ruleIds, orgId]
  );
  return rows;
}

async function create(id, ruleId, data) {
  const { scopeType, targetIdentityId, requireAllComplete } = data;
  const orgId = await getCurrentOrgId();
  await pool.query(
    `INSERT INTO rate_rule_clauses (id, rule_id, scope_type, target_identity_id, require_all_complete, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, ruleId, scopeType || '', targetIdentityId || '', requireAllComplete ? 1 : 0, orgId]
  );
}

async function removeByRuleId(ruleId) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [ruleId, orgId]);
}

module.exports = { getByRuleId, getByRuleIds, create, removeByRuleId };
