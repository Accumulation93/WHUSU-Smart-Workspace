'use strict';

const pool = require('../../config/db');
const legacy = require('./authorizationLegacyMigration');
const { authorizationError } = require('../services/authorizationError');
const PROTOCOL = 1;

async function stageAll() {
  const [organizations] = await pool.query('SELECT id FROM organizations ORDER BY id');
  const results = [];
  for (const organization of organizations) results.push({ organizationId: organization.id, ...await legacy.stage(organization.id) });
  return results;
}

async function activate(release, verifyDeployment) {
  if (!release || !/^[a-f0-9]{40}$/.test(release.compatibleSha || '') || !/^[a-f0-9]{40}$/.test(release.fallbackSha || '')
    || release.compatibleSha === release.fallbackSha
    || typeof verifyDeployment !== 'function') throw authorizationError('authorization_deployment_required');
  if (await verifyDeployment({ ...release, protocol: PROTOCOL }) !== true) throw authorizationError('authorization_deployment_not_ready');
  return pool.withTransaction(async connection => {
    const [[transition]] = await connection.query('SELECT * FROM authorization_runtime_transition WHERE id=1 FOR UPDATE');
    if (!transition) throw authorizationError('authorization_transition_missing');
    if (transition.phase === 'enforced') return { changed: false, protocol: transition.minimum_protocol,
      compatibleSha: transition.compatible_sha, fallbackSha: transition.fallback_sha };
    // 旧事由写入先锁存储阶段再锁组织；启用遵循相同顺序，不能持组织锁反等旧写入。
    await require('../../modules/venue/models/venuePurposeStorage').lockForActivation(connection);
    const [organizations] = await connection.query('SELECT id FROM organizations ORDER BY id FOR UPDATE');
    const comparison = [];
    for (const organization of organizations) {
      const [[state]] = await connection.query('SELECT mode FROM authorization_organizations WHERE org_id=? FOR UPDATE', [organization.id]);
      if (!state || state.mode !== 'shadow') throw authorizationError('authorization_migration_mixed_mode');
      comparison.push(await legacy.compare(connection, organization.id));
    }
    // 重新检查进程和兼容回退版本，避免对照期间发生发布切换。
    if (await verifyDeployment({ ...release, protocol: PROTOCOL }) !== true) throw authorizationError('authorization_deployment_not_ready');
    const purposes = await require('../../modules/venue/models/venuePurposeStorage').activateInTransaction(
      connection, release.compatibleSha, async () => true);
    await connection.query("UPDATE authorization_organizations SET mode='enforced',revision=revision+1,legacy_migrated_at=UTC_TIMESTAMP(3)");
    await connection.query(`UPDATE authorization_runtime_transition SET phase='enforced',minimum_protocol=?,compatible_sha=?,fallback_sha=?,
      comparison_json=?,activated_at=UTC_TIMESTAMP(3) WHERE id=1`, [PROTOCOL, release.compatibleSha, release.fallbackSha, JSON.stringify(comparison)]);
    return { changed: true, protocol: PROTOCOL, ...release, comparison, purposes };
  });
}

async function inheritOrganization(connection, organizationId) {
  const [[table]] = await connection.query("SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='authorization_runtime_transition'");
  if (!Number(table.total)) return;
  const [[state]] = await connection.query('SELECT phase FROM authorization_runtime_transition WHERE id=1 FOR SHARE');
  if (!state) throw authorizationError('authorization_transition_missing');
  if (state.phase === 'enforced') {
    await connection.query("INSERT INTO authorization_organizations(org_id,mode) VALUES (?,'enforced') ON DUPLICATE KEY UPDATE mode='enforced'", [organizationId]);
  }
}

module.exports = { stageAll, activate, inheritOrganization, PROTOCOL };
