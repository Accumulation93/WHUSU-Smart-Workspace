'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { isDeepStrictEqual } = require('node:util');

async function run() {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'auth_migration_' + process.pid + '_' + Date.now();
  const username = 'authmig_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const connection = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await connection.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await connection.query('USE ??', [database]);
    await connection.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await connection.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32), version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY(org_id,domain)); INSERT INTO organizations(id,name) VALUES ('migration-org','迁移隔离组织'),('other-org','其他组织')`);
    for (const name of ['20261031160000_unified_authorization.sql', '20261101130000_authorization_legacy_migration_ledger.sql',
      '20261101013000_organization_venue_purposes.sql', '20261101100000_venue_purpose_storage_transition.sql',
      '20261102193000_authorization_runtime_transition.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../db/deploy', name), 'utf8');
      await connection.query(sql);
      await connection.query(sql);
    }
    await connection.query(`INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES
      ('migration-a','测试甲','TEST-MIGRATION-A','TEST-MIGRATION-A'),('migration-b','测试乙','TEST-MIGRATION-B','TEST-MIGRATION-B');
      INSERT INTO admin_info(id,name,org_id) VALUES ('admin-a','测试甲','migration-org'),('admin-b','测试乙','migration-org');
      INSERT INTO admin_grants(id,person_id,org_id,legacy_admin_id) VALUES
        ('grant-a','migration-a','migration-org','admin-a'),('grant-b','migration-b','migration-org','admin-b')`);
    const legacy = require('../src/core/services/adminPermissions');
    const { CATALOG, capabilitiesForLegacy } = require('../src/core/services/authorizationCatalog');
    const { canDelegate } = require('../src/core/services/authorizationPolicy');
    for (const adminId of ['admin-a', 'admin-b']) {
      for (const key of legacy.listPermissionKeys()) {
        if (!legacy.isApplicable(key, 'admin')) continue;
        const granted = adminId === 'admin-a'
          ? ['venue.purposes', 'permissions.manage_regular_admins'].includes(key) : key === 'scoring.templates';
        await connection.query('INSERT INTO admin_permission_overrides(id,org_id,admin_id,permission_key,granted,configured_by) VALUES (?,?,?,?,?,?)',
          [crypto.randomUUID(), 'migration-org', adminId, key, granted ? 1 : 0, 'fixture']);
      }
    }
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const migration = require('../src/core/models/authorizationLegacyMigration');
    const read = async () => {
      const [[row]] = await connection.query("SELECT plan_json FROM authorization_legacy_migrations WHERE org_id='migration-org'");
      return typeof row.plan_json === 'string' ? JSON.parse(row.plan_json) : row.plan_json;
    };
    const first = await migration.stage('migration-org');
    assert.equal(first.changed, true);
    const initial = await read();
    assert(initial.rules.every(rule => rule.policy.effect === 'allow' && rule.policy.subjects[0].kind === 'adminGrants'));
    assert.deepEqual(initial.rules.filter(rule => rule.adminGrantId === 'grant-a').flatMap(rule => rule.policy.capabilities).sort(), capabilitiesForLegacy(['venue.purposes']).sort());
    assert.equal(initial.delegations.length, 1);
    assert.deepEqual(initial.delegations[0].subjects, [{ kind: 'adminGrants', ids: ['grant-a'] }]);
    assert.deepEqual(initial.delegations[0].envelope.subjects, [{ kind: 'adminGrants', ids: ['grant-b'] }]);
    const bounded = { ...initial.delegations[0].envelope, id: 'new-grant' };
    assert.equal(canDelegate(bounded, initial.delegations[0].envelope, CATALOG), true);
    assert.equal(canDelegate({ ...bounded, subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }] }, initial.delegations[0].envelope, CATALOG), false);
    assert.equal(canDelegate({ ...bounded, capabilities: ['venue.purposes.delete'] }, initial.delegations[0].envelope, CATALOG), false);
    const repeated = await migration.stage('migration-org');
    assert.equal(repeated.changed, false);
    assert.equal(repeated.digest, first.digest);
    assert(isDeepStrictEqual(await read(), initial));
    const [[state]] = await connection.query("SELECT mode,legacy_migrated_at FROM authorization_organizations WHERE org_id='migration-org'");
    assert.equal(state.mode, 'shadow');
    assert.equal(state.legacy_migrated_at, null);
    const manual = { ...initial.rules[0].policy, id: 'manual-keep' };
    await connection.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('manual-keep','migration-org','人工规则',?)", [JSON.stringify(manual)]);
    await connection.query("UPDATE admin_permission_overrides SET granted=1 WHERE admin_id='admin-a' AND permission_key='venue.purposes.delete'");
    const refreshed = await migration.stage('migration-org');
    assert.equal(refreshed.changed, true);
    assert.notEqual(refreshed.digest, first.digest);
    assert((await read()).rules.some(rule => rule.legacyKey === 'venue.purposes.delete'));
    assert.equal((await connection.query("SELECT id FROM authorization_rules WHERE id='manual-keep'"))[0].length, 1);
    await connection.query("INSERT INTO admin_permission_overrides(id,org_id,admin_id,permission_key,granted,configured_by) VALUES ('unknown','migration-org','admin-a','future.permission',1,'fixture')");
    await assert.rejects(migration.stage('migration-org'), error => error.code === 'authorization_migration_unresolved');
    assert.equal((await read()).digest, refreshed.digest);
    await connection.query("DELETE FROM admin_permission_overrides WHERE id='unknown'");
    const target = (await read()).rules[0];
    await connection.query('UPDATE authorization_rules SET name=?,version=version+1 WHERE id=?', ['已人工编辑', target.id]);
    await assert.rejects(migration.stage('migration-org'), error => error.code === 'authorization_migration_edited');
    assert.equal((await connection.query('SELECT name FROM authorization_rules WHERE id=?', [target.id]))[0][0].name, '已人工编辑');
    await connection.query('UPDATE authorization_rules SET name=?,version=1 WHERE id=?', [target.name, target.id]);
    const cutover = require('../src/core/models/authorizationCutover');
    const release = { compatibleSha: 'a'.repeat(40), fallbackSha: 'b'.repeat(40) };
    await cutover.stageAll();
    await assert.rejects(cutover.activate(release, async () => false), error => error.code === 'authorization_deployment_not_ready');
    await assert.rejects(cutover.activate(release, async () => true), error => error.code === 'authorization_migration_unreviewed');
    await connection.query("DELETE FROM authorization_rules WHERE id='manual-keep'");
    await connection.query("UPDATE admin_permission_overrides SET granted=0 WHERE admin_id='admin-a' AND permission_key='venue.purposes.delete'");
    await assert.rejects(cutover.activate(release, async () => true), error => error.code === 'authorization_migration_stale');
    await cutover.stageAll();
    let checks = 0;
    await assert.rejects(cutover.activate(release, async () => ++checks === 1), error => error.code === 'authorization_deployment_not_ready');
    assert.equal((await connection.query('SELECT phase FROM authorization_runtime_transition WHERE id=1'))[0][0].phase, 'shadow');
    assert.equal((await connection.query('SELECT phase FROM venue_purpose_storage_transition WHERE id=1'))[0][0].phase, 'legacy');
    assert((await connection.query('SELECT mode FROM authorization_organizations'))[0].every(row => row.mode === 'shadow'));
    await connection.query("CREATE TRIGGER fixture_cutover_failure BEFORE UPDATE ON authorization_organizations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated cutover rollback'");
    await assert.rejects(cutover.activate(release, async () => true), /isolated cutover rollback/);
    assert.equal((await connection.query('SELECT phase FROM authorization_runtime_transition WHERE id=1'))[0][0].phase, 'shadow');
    assert.equal((await connection.query('SELECT phase FROM venue_purpose_storage_transition WHERE id=1'))[0][0].phase, 'legacy');
    await connection.query('DROP TRIGGER fixture_cutover_failure');
    const legacyWriter = await pool.getConnection();
    await legacyWriter.beginTransaction();
    await legacyWriter.query('SELECT phase FROM venue_purpose_storage_transition WHERE id=1 FOR SHARE');
    const activation = cutover.activate(release, async () => true);
    await new Promise(resolve => setTimeout(resolve, 100));
    // 模拟旧事由写入已经持存储锁、随后才取得组织锁；启用应等待它完成而非相互等待。
    await require('../src/core/models/authorizationBusinessRoute').requireLegacyWrite(legacyWriter, 'migration-org');
    await legacyWriter.commit();
    legacyWriter.release();
    const activated = await activation;
    assert.equal(activated.changed, true);
    assert.equal(activated.comparison.length, 2);
    assert((await connection.query('SELECT mode FROM authorization_organizations'))[0].every(row => row.mode === 'enforced'));
    assert.equal((await connection.query('SELECT phase FROM venue_purpose_storage_transition WHERE id=1'))[0][0].phase, 'organization');
    assert.equal((await cutover.activate(release, async () => true)).changed, false);
    await pool.withTransaction(async transaction => {
      await cutover.inheritOrganization(transaction, 'future-org');
      await transaction.query("INSERT INTO organizations(id,name) VALUES ('future-org','后续组织')");
    });
    assert.equal((await connection.query("SELECT mode FROM authorization_organizations WHERE org_id='future-org'"))[0][0].mode, 'enforced');
    await assert.rejects(migration.stage('migration-org'), error => error.code === 'authorization_migration_already_enforced');
    assert.equal((await connection.query("SELECT id FROM authorization_rules WHERE org_id='other-org'"))[0].length, 0);
    console.log('旧权限暂存与启用：双次建表、保存回读、委托边界、来源变化、人工规则拒绝、进程验证失败、事务中断整单回滚、全组织与事由同事务启用、重复执行、新组织继承及启用后拒绝旧写通过。');
  } finally {
    if (pool) await pool.end();
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.query("DROP USER IF EXISTS ?@'%'", [username]);
    await connection.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
