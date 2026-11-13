'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { activate } = require('../src/core/models/identityNatureCutover');
const release = { compatibleSha: 'a'.repeat(40), fallbackSha: 'b'.repeat(40) };

test('CLI without deployment lock rejects before database initialization and prints no environment', () => {
  const path = require('node:path');
  const cp = require('node:child_process');
  const result = cp.spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/finalizeIdentityNatures.js'),
    'org', '--enable-after-rollout', release.compatibleSha, release.fallbackSha], {
    encoding: 'utf8', env: { ...process.env, DB_USER: '', DB_PASSWORD: '', WHUSU_SMART_WORKSPACE_DEPLOY_DIR: path.join(__dirname, 'missing-deploy-directory') }
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /authorization_deployment_lock_required|ENOENT/);
  assert.doesNotMatch(result.stderr, /DB_USER|DB_PASSWORD|environment variables/);
});

function fixture() {
  const writes = [];
  const connection = { query: async (sql, values) => {
    if (sql.startsWith('SELECT')) return [[{ phase: 'enforced', minimum_protocol: 1 }]];
    writes.push(values); return [{}];
  } };
  return { writes, pool: { withTransaction: async action => {
    try { return await action(connection); } catch (error) { writes.length = 0; throw error; }
  } } };
}

test('nature activation requires independent runtime-verified releases and updates rollback protocol', async () => {
  const { pool, writes } = fixture();
  const checks = [];
  const result = await activate(pool, 'org', release, async value => { checks.push(value); return true; }, async () => ({ changed: true }));
  assert.equal(result.protocol, 2);
  assert.equal(checks.length, 2);
  assert.ok(checks.every(value => value.protocol === 2));
  assert.deepEqual(writes, [[2, release.compatibleSha, release.fallbackSha]]);
  await assert.rejects(activate(pool, 'org', { ...release, fallbackSha: release.compatibleSha }, async () => true, async () => ({})), /independent|deployment_required/);
});

test('runtime change during finalization rolls back activation and protocol together', async () => {
  const { pool, writes } = fixture();
  let checks = 0;
  await assert.rejects(activate(pool, 'org', release, async () => ++checks === 1, async () => { writes.push('finalize'); return {}; }), /deployment_not_ready/);
  assert.deepEqual(writes, []);
});

test('incompatible runtime is rejected before any database work', async () => {
  let called = false;
  await assert.rejects(activate({ withTransaction: async () => { called = true; } }, 'org', release, async () => false, async () => ({})), /deployment_not_ready/);
  assert.equal(called, false);
});
