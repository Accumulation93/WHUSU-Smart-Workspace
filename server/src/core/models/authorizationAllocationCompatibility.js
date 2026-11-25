'use strict';

const { CATALOG } = require('../services/authorizationCatalog');

// 旧接口仍读取独立表；正式分配的兼容镜像不再反过来重建角色或覆盖共享角色。
async function withMirrorSuppressed(connection, write) {
  await connection.query('SET @whusu_allocation_mirror = 1');
  try { return await write(); }
  finally { await connection.query('SET @whusu_allocation_mirror = NULL'); }
}

async function sync(connection, organizationId, before, policy, ruleName = before.name) {
  if (before.sourceKind !== 'legacy_allocation' || !before.sourceRef) return;
  const capabilities = policy.capabilities.map(key => CATALOG.get(key)?.allocationCapability).filter(Boolean).sort();
  await withMirrorSuppressed(connection, async () => {
    if (!capabilities.length) {
      await connection.query(`UPDATE authorization_delegations SET enabled=0, version=version+1
        WHERE org_id=? AND id=?`, [organizationId, before.sourceRef]);
      return;
    }
    const { allocationSubjects, ...envelope } = policy;
    envelope.id = before.sourceRef;
    envelope.subjects = allocationSubjects;
    envelope.capabilities = capabilities;
    envelope.effect = 'allow';
    await connection.query(`UPDATE authorization_delegations SET name=?,subjects_json=?,envelope_json=?,enabled=?,version=version+1
      WHERE org_id=? AND id=?`, [ruleName, JSON.stringify(policy.subjects), JSON.stringify(envelope),
      policy.enabled && policy.effect === 'allow' ? 1 : 0, organizationId, before.sourceRef]);
  });
}

async function remove(connection, organizationId, before) {
  if (before.sourceKind !== 'legacy_allocation' || !before.sourceRef) return;
  await withMirrorSuppressed(connection, () => connection.query('DELETE FROM authorization_delegations WHERE org_id=? AND id=?',
    [organizationId, before.sourceRef]));
}

module.exports = { sync, remove };
