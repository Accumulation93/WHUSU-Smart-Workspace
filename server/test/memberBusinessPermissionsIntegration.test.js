'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { randomBytes } = require('node:crypto');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const { evaluate } = require('../src/core/services/authorizationPolicy');
const { createScopeCompiler } = require('../src/core/services/authorizationSqlScope');
const { explainCapabilities } = require('../src/core/services/authorizationExplanation');

const read = name => fs.readFileSync(path.join(__dirname, '../db/deploy', name), 'utf8');
const now = Date.parse('2026-11-25T00:00:00.000Z');
const actor = { active: true, role: 'user', unifiedAuthorization: true, organizationId: 'org', personId: 'person',
  assignment: { id: 'job', active: true, organizationId: 'org', personId: 'person' } };
const deny = { id: 'old-business-switch', organizationId: 'org', enabled: true, effect: 'deny',
  subjects: [{ kind: 'assignments', ids: ['job'] }], capabilities: ['calendar.events.read'],
  scopes: [{ kind: 'organization' }], fields: null };

test('ordinary business eligibility is independent of central management grants and retains identity and organization boundaries', () => {
  const input = { actor, resource: { id: 'event', type: 'calendar.events', organizationId: 'org' },
    capability: 'calendar.events.read', policies: [deny], catalog: CATALOG, now, businessAllowed: true };
  assert.equal(evaluate({ ...input, businessGranted: true }).allowed, true);
  assert.equal(evaluate({ ...input, businessGranted: false }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, businessAllowed: false }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, resource: { ...input.resource, organizationId: 'other' } }).allowed, false);
  assert.equal(evaluate({ ...input, businessGranted: true, actor: { ...actor, active: false } }).allowed, false);
  const compile = createScopeCompiler({ resourceType: 'calendar.events', id: 'e.id', organization: 'e.org_id' });
  assert.deepEqual(compile({ ...input, businessGranted: true }), { sql: 'COALESCE(CAST(e.org_id AS BINARY) IN (?), 0)', params: ['org'] });
  assert(compile({ ...input, businessGranted: false }).sql.includes('1 = 0'));
  const explanation = explainCapabilities(actor, [{ policy: deny }], CATALOG, now, new Set(['calendar.events.read']));
  const entry = explanation.find(item => item.capability === 'calendar.events.read');
  assert.equal(entry.status, 'business_check_required');
  assert.equal(entry.grantBasis, 'none');
  assert.equal(entry.roleId, undefined);
  const central = explainCapabilities(actor, [], CATALOG, now, new Set(), true, { includeBusiness: false });
  assert.equal(central.find(item => item.capability === 'calendar.events.read').businessEntry, false);
  assert.equal(central.find(item => item.capability === 'calendar.events.read').status, 'denied');
});

test('identity card business controls migrate once, preserve native restrictions and keep immutable role history', async () => {
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3362,
    user: process.env.TEST_DB_ADMIN_USER || 'root', password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  const database = 'member_business_' + process.pid + '_' + Date.now();
  const username = 'business_' + process.pid;
  const password = randomBytes(24).toString('hex');
  let pool;
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await connection.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await connection.query('USE ??', [database]);
    await connection.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await connection.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32), version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY(org_id, domain)); INSERT INTO organizations(id,name) VALUES ('org','Org'),('other','Other'),('zz-empty','Empty')`);
    await connection.query(read('20261031160000_unified_authorization.sql'));
    await connection.query(read('20261122170000_authorization_grant_sources.sql'));
    await connection.query(read('20261123120500_identity_card_policy.sql'));
    const legacy = read('20261124131000_bind_member_relationship_permissions_to_roles.sql');
    const [definitions, procedures] = legacy.split('DELIMITER $$');
    const [program, backfill] = procedures.split('DELIMITER ;');
    await connection.query(definitions);
    for (const statement of program.split('$$').map(sql => sql.trim()).filter(Boolean)) await connection.query(statement);
    await connection.query(backfill);
    const [[role]] = await connection.query("SELECT * FROM authorization_relationship_role_assignments WHERE org_id='org'");
    const [[version]] = await connection.query('SELECT * FROM authorization_scheme_versions WHERE scheme_id=?', [role.scheme_id]);
    const capabilities = version.capabilities_json.filter(key => key !== 'identity.cards.create');
    await connection.query('UPDATE authorization_scheme_versions SET capabilities_json=? WHERE scheme_id=?', [JSON.stringify(capabilities), role.scheme_id]);
    await connection.query("INSERT INTO identity_card_policies(org_id,issue_enabled,public_verification_enabled,version) VALUES ('other',0,0,4)");
    const historical = (await connection.query('SELECT * FROM authorization_scheme_versions ORDER BY id'))[0];
    const migrate = require('./helpers/applyMemberBusinessControlsMigration');
    await migrate(connection);
    const policies = async () => (await connection.query('SELECT org_id,issue_enabled,public_verification_enabled,version FROM identity_card_policies ORDER BY org_id'))[0];
    assert.deepEqual(await policies(), [
      { org_id: 'org', issue_enabled: 0, public_verification_enabled: 1, version: 1 },
      { org_id: 'other', issue_enabled: 0, public_verification_enabled: 0, version: 4 },
      { org_id: 'zz-empty', issue_enabled: 1, public_verification_enabled: 1, version: 1 }
    ]);
    await migrate(connection);
    assert.deepEqual((await connection.query('SELECT * FROM authorization_scheme_versions ORDER BY id'))[0], historical);
    assert.equal((await connection.query('SELECT COUNT(*) AS total FROM authorization_business_policy_transfers'))[0][0].total, 3);
    Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3362', DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const organizations = require('../src/core/models/organization');
    assert.deepEqual(await organizations.findDependencies(connection, 'zz-empty'), [], '迁移默认配置不把空组织变成不可删除');
    await connection.query("UPDATE identity_card_policies SET issue_enabled=0,version=version+1 WHERE org_id='zz-empty'");
    assert((await organizations.findDependencies(connection, 'zz-empty')).includes('identity_card_policies'), '真正修改的业务配置继续保护');
    // 子应用此后允许重新开放；迁移重跑不能再用已经退役的开关覆盖新设置。
    await connection.query("UPDATE identity_card_policies SET issue_enabled=1,version=2 WHERE org_id='org'");
    await migrate(connection);
    assert.equal((await policies())[0].issue_enabled, 1);
    assert.equal((await policies())[0].version, 2);
    const publishLegacy = async (organizationId, nextCapabilities) => {
      const [[scheme]] = await connection.query(`SELECT s.id,s.published_version FROM authorization_relationship_role_assignments a
        JOIN authorization_schemes s ON s.org_id=a.org_id AND s.id=a.scheme_id WHERE a.org_id=?`, [organizationId]);
      await connection.query(`INSERT INTO authorization_scheme_versions(id,org_id,scheme_id,version,capabilities_json,actor_context_id)
        VALUES (UUID(),?,?,?,?, 'previous-release')`, [organizationId, scheme.id, scheme.published_version + 1, JSON.stringify(nextCapabilities)]);
      await connection.query('UPDATE authorization_schemes SET published_version=published_version+1,version=version+1 WHERE org_id=? AND id=?', [organizationId, scheme.id]);
      await connection.query(`INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
        VALUES (UUID(),?,'previous-release','scheme_publish',?,?,?)`, [organizationId, scheme.id,
        JSON.stringify({ publishedVersion: scheme.published_version }),
        JSON.stringify({ publishedVersion: scheme.published_version + 1, capabilities: nextCapabilities })]);
    };
    await publishLegacy('org', capabilities.filter(key => key !== 'notifications.items.read'));
    assert.equal((await policies())[0].issue_enabled, 1, '无关旧开关变化不覆盖子应用后来配置');
    const withoutVerify = capabilities.filter(key => key !== 'identity.cards.verify');
    await publishLegacy('org', withoutVerify);
    assert.deepEqual((await policies())[0], { org_id: 'org', issue_enabled: 1, public_verification_enabled: 0, version: 3 });
    const [[marker]] = await connection.query("SELECT source_version,last_mirrored_version FROM authorization_business_policy_transfers WHERE org_id='org'");
    assert.deepEqual(marker, { source_version: 1, last_mirrored_version: 3 });
    await connection.beginTransaction();
    await publishLegacy('org', capabilities);
    assert.equal((await policies())[0].public_verification_enabled, 1);
    await connection.rollback();
    assert.equal((await policies())[0].public_verification_enabled, 0, '旧进程事务回滚同时撤销子应用配置变化');
    await connection.query('DROP TRIGGER authorization_mirror_legacy_identity_card_policy');
    await publishLegacy('org', capabilities);
    assert.equal((await policies())[0].public_verification_enabled, 0);
    await migrate(connection);
    assert.equal((await policies())[0].public_verification_enabled, 1, '兼容触发器建立前已提交的旧写入也被补齐');
    await connection.query("INSERT INTO organizations(id,name) VALUES ('new-org','New organization')");
    await publishLegacy('new-org', version.capabilities_json.filter(key => key !== 'identity.cards.create'));
    const [[newPolicy]] = await connection.query("SELECT issue_enabled,public_verification_enabled FROM identity_card_policies WHERE org_id='new-org'");
    assert.deepEqual(newPolicy, { issue_enabled: 0, public_verification_enabled: 1 });
  } finally {
    if (pool) await pool.end();
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.query("DROP USER IF EXISTS ?@'%'", [username]);
    await connection.end();
  }
});
