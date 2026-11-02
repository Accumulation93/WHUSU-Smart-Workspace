'use strict';

const crypto = require('crypto');
const { isDeepStrictEqual } = require('node:util');
const pool = require('../../config/db');
const inventoryModel = require('./authorizationLegacyInventory');
const { plan } = require('../services/authorizationLegacyPlan');
const { normalizePolicy } = require('../services/authorizationPolicy');
const { CATALOG } = require('../services/authorizationCatalog');
const { authorizationError } = require('../services/authorizationError');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const same = (left, right) => isDeepStrictEqual(left, right);

async function verifyExisting(connection, organizationId, previous) {
  for (const rule of previous.rules) {
    const [rows] = await connection.query('SELECT * FROM authorization_rules WHERE org_id=? AND id=? FOR UPDATE', [organizationId, rule.id]);
    const row = rows[0];
    if (!row || row.name !== rule.name || row.version !== 1 || row.source_kind !== 'legacy_permission'
      || row.source_ref !== rule.sourceRef || row.scheme_id !== null
      || !same(normalizePolicy(parse(row.policy_json), CATALOG), normalizePolicy(rule.policy, CATALOG))) {
      throw authorizationError('authorization_migration_edited');
    }
  }
  for (const delegation of previous.delegations) {
    const [rows] = await connection.query('SELECT * FROM authorization_delegations WHERE org_id=? AND id=? FOR UPDATE', [organizationId, delegation.id]);
    const row = rows[0];
    if (!row || row.name !== delegation.name || row.version !== 1 || Number(row.enabled) !== 1
      || !same(parse(row.subjects_json), delegation.subjects)
      || !same(normalizePolicy(parse(row.envelope_json), CATALOG), normalizePolicy(delegation.envelope, CATALOG))) {
      throw authorizationError('authorization_migration_edited');
    }
  }
}

// 仅由发布协调器调用；无公开HTTP入口，不借调用者参数授予权限。此步骤始终保持shadow。
async function stage(organizationId) {
  if (typeof organizationId !== 'string' || !organizationId) throw authorizationError('authorization_organization_missing');
  return pool.withTransaction(async connection => {
    const [organizations] = await connection.query('SELECT id FROM organizations WHERE id=? FOR UPDATE', [organizationId]);
    if (!organizations.length) throw authorizationError('authorization_organization_missing');
    await connection.query('INSERT IGNORE INTO authorization_organizations(org_id) VALUES (?)', [organizationId]);
    const [[state]] = await connection.query('SELECT mode FROM authorization_organizations WHERE org_id=? FOR UPDATE', [organizationId]);
    if (state.mode !== 'shadow') throw authorizationError('authorization_migration_already_enforced');
    const next = plan(await inventoryModel.read(connection, organizationId, true));
    const [ledgers] = await connection.query('SELECT plan_digest,plan_json FROM authorization_legacy_migrations WHERE org_id=? FOR UPDATE', [organizationId]);
    const previous = ledgers[0] ? parse(ledgers[0].plan_json) : null;
    if (previous) {
      await verifyExisting(connection, organizationId, previous);
      if (ledgers[0].plan_digest === next.digest) return { changed: false, digest: next.digest, ruleCount: next.rules.length, delegationCount: next.delegations.length };
      // 仅替换账本精确登记且未经人工编辑的转换结果，手工规则和方案保持不变。
      for (const row of previous.rules) await connection.query('DELETE FROM authorization_rules WHERE org_id=? AND id=?', [organizationId, row.id]);
      for (const row of previous.delegations) await connection.query('DELETE FROM authorization_delegations WHERE org_id=? AND id=?', [organizationId, row.id]);
    }
    for (const row of next.rules) {
      await connection.query(`INSERT INTO authorization_rules(id,org_id,name,policy_json,source_kind,source_ref)
        VALUES (?,?,?,?,'legacy_permission',?)`, [row.id, organizationId, row.name, JSON.stringify(row.policy), row.sourceRef]);
    }
    for (const row of next.delegations) {
      await connection.query('INSERT INTO authorization_delegations(id,org_id,name,subjects_json,envelope_json) VALUES (?,?,?,?,?)',
        [row.id, organizationId, row.name, JSON.stringify(row.subjects), JSON.stringify(row.envelope)]);
    }
    await connection.query(`INSERT INTO authorization_legacy_migrations(org_id,plan_digest,plan_json) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE plan_digest=VALUES(plan_digest),plan_json=VALUES(plan_json)`, [organizationId, next.digest, JSON.stringify(next)]);
    await connection.query(`INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
      VALUES (?,?,?,'legacy_stage',?,?,?)`, [crypto.randomUUID(), organizationId, 'migration:20261101130000', organizationId,
      previous ? JSON.stringify({ digest: ledgers[0].plan_digest }) : null,
      JSON.stringify({ digest: next.digest, rules: next.rules.length, delegations: next.delegations.length })]);
    return { changed: true, digest: next.digest, ruleCount: next.rules.length, delegationCount: next.delegations.length };
  });
}

async function compare(connection, organizationId) {
  const current = plan(await inventoryModel.read(connection, organizationId, true));
  const [[ledger]] = await connection.query('SELECT plan_digest,plan_json FROM authorization_legacy_migrations WHERE org_id=? FOR UPDATE', [organizationId]);
  if (!ledger || ledger.plan_digest !== current.digest) throw authorizationError('authorization_migration_stale');
  const previous = parse(ledger.plan_json);
  await verifyExisting(connection, organizationId, previous);
  const [[rules]] = await connection.query('SELECT COUNT(*) AS total FROM authorization_rules WHERE org_id=?', [organizationId]);
  const [[delegations]] = await connection.query('SELECT COUNT(*) AS total FROM authorization_delegations WHERE org_id=?', [organizationId]);
  if (Number(rules.total) !== current.rules.length || Number(delegations.total) !== current.delegations.length) {
    throw authorizationError('authorization_migration_unreviewed');
  }
  return { organizationId, digest: current.digest, ruleCount: current.rules.length, delegationCount: current.delegations.length };
}

module.exports = { stage, compare };
