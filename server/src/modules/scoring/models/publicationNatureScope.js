'use strict';

const policy = require('../../../core/services/natureRulePolicy');
const identityNatureRule = require('../../../core/models/identityNatureRule');

function tables(kind) {
  if (kind === 'view') return ['pub_view_rules', 'pub_view_rule_clauses'];
  if (kind === 'merit') return ['pub_merit_rules', 'pub_merit_rule_clauses'];
  throw Object.assign(new Error('invalid_params'), { code: 'invalid_params' });
}

async function prepare(connection, organizationId, kind, source, clauses) {
  const [ruleTable, clauseTable] = tables(kind);
  const [rows] = await connection.query(
    `SELECT id,nature_ids FROM ${ruleTable} WHERE org_id=? AND publication_id=?
      AND ${source.id ? 'id=?' : 'grantee_department_id=? AND grantee_identity_id=?'} FOR UPDATE`,
    source.id ? [organizationId, source.publicationId, source.id]
      : [organizationId, source.publicationId, source.granteeDepartmentId, source.granteeIdentityId]);
  const existing = rows[0];
  const natureIds = source.natureIds == null && existing
    ? policy.normalize(existing.nature_ids) : policy.normalize(source.natureIds);
  await identityNatureRule.validate(connection, organizationId, natureIds, source.granteeIdentityId);
  if (existing) {
    const [previous] = await connection.query(`SELECT scope_type,target_identity_id,nature_ids FROM ${clauseTable}
      WHERE org_id=? AND rule_id=? FOR UPDATE`, [organizationId, existing.id]);
    policy.preserveMissing(clauses, previous.map(row => ({ scopeType: row.scope_type,
      targetIdentityId: row.target_identity_id, natureIds: policy.normalize(row.nature_ids) })),
    row => row.scopeType + '::' + (row.targetIdentityId || ''));
  }
  for (const clause of clauses) {
    clause.natureIds = await identityNatureRule.validate(connection, organizationId, clause.natureIds, clause.targetIdentityId);
  }
  return natureIds;
}

async function persist(connection, organizationId, kind, ruleId, input) {
  const [ruleTable, clauseTable] = tables(kind);
  await connection.query(`UPDATE ${ruleTable} SET nature_ids=? WHERE org_id=? AND id=?`,
    [input.natureIds === null ? null : JSON.stringify(input.natureIds), organizationId, ruleId]);
  for (const clause of input.clauses) {
    await connection.query(`UPDATE ${clauseTable} SET nature_ids=?
      WHERE org_id=? AND rule_id=? AND scope_type=? AND COALESCE(target_identity_id,'')=?`,
    [clause.natureIds === null ? null : JSON.stringify(clause.natureIds), organizationId, ruleId, clause.scopeType, clause.targetIdentityId || '']);
  }
}

module.exports = { prepare, persist };
