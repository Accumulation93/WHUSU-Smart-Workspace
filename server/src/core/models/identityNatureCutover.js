'use strict';

const PROTOCOL = 2;
const SHA = /^[a-f0-9]{40}$/;

async function activate(pool, organizationId, release, verifyDeployment, finalize) {
  if (!release || !SHA.test(release.compatibleSha || '') || !SHA.test(release.fallbackSha || '')
    || release.compatibleSha === release.fallbackSha || typeof verifyDeployment !== 'function'
    || typeof finalize !== 'function') throw Error('authorization_deployment_required');
  const verify = async () => {
    if (await verifyDeployment({ ...release, protocol: PROTOCOL }) !== true) throw Error('authorization_deployment_not_ready');
  };
  await verify();
  return pool.withTransaction(async connection => {
    const [[state]] = await connection.query('SELECT phase,minimum_protocol FROM authorization_runtime_transition WHERE id=1 FOR UPDATE');
    if (!state || state.phase !== 'enforced') throw Error('authorization_transition_invalid');
    if (Number(state.minimum_protocol) > PROTOCOL) throw Error('authorization_release_incompatible');
    const result = await finalize(connection, organizationId);
    await verify();
    await connection.query(`UPDATE authorization_runtime_transition SET minimum_protocol=?,compatible_sha=?,fallback_sha=? WHERE id=1`,
      [PROTOCOL, release.compatibleSha, release.fallbackSha]);
    return { ...result, protocol: PROTOCOL, ...release };
  });
}

module.exports = { activate, PROTOCOL };
