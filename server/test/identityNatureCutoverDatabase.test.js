'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { activate } = require('../src/core/models/identityNatureCutover');
if (!process.env.DEPLOY_TEST_DB_HOST) throw Error('isolated_database_required');

async function main() {
  const database = 'nature_cutover_test_' + process.pid + '_' + Date.now();
  const username = 'nature_cutover_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const configuration = { host: process.env.DEPLOY_TEST_DB_HOST, port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
    user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '', multipleStatements: true };
  const root = await mysql.createConnection(configuration);
  let pool;
  try {
    await root.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [database]);
    await root.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await root.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await root.query('USE ??', [database]);
    for (const file of ['init.sql', 'deploy/20261031160000_unified_authorization.sql',
      'deploy/20261102193000_authorization_runtime_transition.sql', 'deploy/20261111100000_identity_nature_links.sql']) {
      await root.query(fs.readFileSync(path.join(__dirname, '../db', file), 'utf8'));
    }
    await root.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20260907120000_performance_cache_versions.sql'), 'utf8').split('DELIMITER $$')[0]);
    Object.assign(process.env, { DB_HOST: configuration.host, DB_PORT: String(configuration.port), DB_USER: username,
      DB_PASSWORD: password, DB_NAME: database, AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('hex') });
    pool = require('../src/config/db');
    const { finalize } = require('../src/core/models/identityNature');
    await root.query("INSERT INTO organizations(id,name) VALUES ('org','Cutover test')");
    await root.query("INSERT INTO identities(id,name,org_id) VALUES ('identity','Member','org')");
    await root.query("UPDATE authorization_runtime_transition SET phase='enforced',minimum_protocol=1 WHERE id=1");
    const release = { compatibleSha: 'a'.repeat(40), fallbackSha: 'b'.repeat(40) };
    let checks = 0;
    await assert.rejects(activate(pool, 'org', release, async () => ++checks === 1, finalize), /deployment_not_ready/);
    assert.equal((await root.query("SELECT * FROM identity_nature_rollouts WHERE org_id='org'"))[0].length, 0);
    assert.equal((await root.query("SELECT * FROM identity_nature_states WHERE org_id='org'"))[0].length, 0);
    assert.equal(Number((await root.query('SELECT minimum_protocol FROM authorization_runtime_transition WHERE id=1'))[0][0].minimum_protocol), 1);
    const result = await activate(pool, 'org', release, async () => true, finalize);
    assert.equal(result.changed, true);
    assert.equal(Number((await root.query("SELECT enabled FROM identity_nature_rollouts WHERE org_id='org'"))[0][0].enabled), 1);
    const [states] = await root.query('SELECT minimum_protocol,compatible_sha,fallback_sha FROM authorization_runtime_transition WHERE id=1');
    assert.deepEqual({ ...states[0] }, { minimum_protocol: 2, compatible_sha: release.compatibleSha, fallback_sha: release.fallbackSha });
    assert.equal((await activate(pool, 'org', release, async () => true, finalize)).changed, false);
    console.log('identity nature cutover: rollback, persisted protocol, rollout readback and repeat activation passed');
  } finally {
    if (pool) await pool.end();
    await root.query('DROP DATABASE IF EXISTS ??', [database]);
    await root.query("DROP USER IF EXISTS ?@'%'", [username]);
    await root.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
