'use strict';

const policy = require('../../../core/services/natureRulePolicy');
const associations = require('../../../core/models/identityNatureRule');

async function prepare(connection, orgId, source, clauses) {
  const [existing] = await connection.query(
    `SELECT id, nature_ids FROM rate_target_rules WHERE org_id = ?
      AND ((? <> '' AND id = ?) OR (? = '' AND activity_id = ? AND scorer_key = ?)) FOR UPDATE`,
    [orgId, source.id || '', source.id || '', source.id || '', source.activityId,
      source.scorerDepartmentId + '::' + source.scorerIdentityId]
  );
  const previous = existing[0];
  const natureIds = await associations.validate(connection, orgId,
    source.natureIds == null && previous ? previous.nature_ids : source.natureIds,
    [source.scorerIdentityId]);
  if (previous) {
    const [oldClauses] = await connection.query(
      'SELECT scope_type, target_identity_id, nature_ids FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ? FOR UPDATE',
      [previous.id, orgId]
    );
    policy.preserveMissing(clauses, oldClauses.map(item => ({ scopeType: item.scope_type,
      targetIdentityId: item.target_identity_id || '', natureIds: policy.normalize(item.nature_ids) })),
    item => item.scopeType + '::' + (item.targetIdentityId || ''));
  }
  for (const clause of clauses) {
    clause.natureIds = await associations.validate(connection, orgId, clause.natureIds,
      clause.targetIdentityId ? [clause.targetIdentityId] : []);
  }
  return natureIds;
}

async function persist(connection, orgId, ruleId, natureIds) {
  await connection.query('UPDATE rate_target_rules SET nature_ids = ? WHERE id = ? AND org_id = ?',
    [natureIds === null ? null : JSON.stringify(natureIds), ruleId, orgId]);
}

module.exports = { prepare, persist };
