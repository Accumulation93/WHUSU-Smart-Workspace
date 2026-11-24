'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const roles = require('../src/core/models/authorizationRoleBackfill');

const schema = name => readFileSync(path.join(__dirname, '../db/deploy', name), 'utf8');
const migration = '20261123120000_bind_existing_authorization_rules_to_roles.sql';

test('migration-generated roles preserve existing grants and restrictions across two database migrations', async () => {
  const connection = await mysql.createConnection({ host: process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.DEPLOY_TEST_DB_PORT || 3362), user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  const database = 'authorization_bindings_' + process.pid + '_' + Date.now();
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query('USE ??', [database]);
    await connection.query('CREATE TABLE organizations (id VARCHAR(64) PRIMARY KEY)');
    await connection.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32),
      version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (org_id, domain))`);
    await connection.query(schema('20261031160000_unified_authorization.sql'));
    await connection.query("INSERT INTO authorization_organizations (org_id, mode) VALUES ('active', 'enforced'), ('shadow', 'shadow')");
    const rows = [
      { id: 'allow', organizationId: 'active', effect: 'allow', enabled: true },
      { id: 'deny', organizationId: 'active', effect: 'deny', enabled: true },
      { id: 'disabled', organizationId: 'active', effect: 'allow', enabled: false },
      { id: 'legacy', organizationId: 'shadow', effect: 'allow', enabled: true }
    ];
    for (const row of rows) {
      const policy = { ...row, subjects: [{ kind: 'assignments', ids: ['position'] }],
        capabilities: ['hr.people.read'], scopes: [{ kind: 'people', ids: ['person'] }],
        fields: ['name'], startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' };
      await connection.query(`INSERT INTO authorization_rules (id, org_id, name, policy_json, version, source_kind, source_ref)
        VALUES (?, ?, ?, ?, 7, 'fixture', ?)`, [row.id, row.organizationId, row.id, JSON.stringify(policy), row.id]);
    }
    const selectRules = 'SELECT * FROM authorization_rules ORDER BY id';
    const [before] = await connection.query(selectRules);
    await connection.query(schema(migration));
    const [after] = await connection.query(selectRules);
    await connection.query(schema(migration));
    const [again] = await connection.query(selectRules);
    assert.deepEqual(after, again);
    for (const { scheme_id, ...rule } of after) {
      const { scheme_id: originalScheme, ...original } = before.find(row => row.id === rule.id);
      assert.equal(originalScheme, null);
      assert.deepEqual(rule, original);
      if (rule.org_id === 'shadow') assert.equal(scheme_id, null);
      else assert.equal(scheme_id, roles.idForRule(rule.org_id, rule.id));
    }
    const [versions] = await connection.query('SELECT scheme_id, version, capabilities_json FROM authorization_scheme_versions ORDER BY id');
    assert.equal(versions.length, 3);
    assert.deepEqual(versions.map(row => row.scheme_id).sort(),
      after.filter(row => row.org_id === 'active').map(row => roles.idForRule(row.org_id, row.id)).sort());
    assert.ok(versions.every(row => row.version === 1 && JSON.stringify(row.capabilities_json) === '["hr.people.read"]'));

    await connection.query("CREATE TABLE hr_info (id VARCHAR(64), org_id VARCHAR(64), name VARCHAR(80))");
    await connection.query("CREATE TABLE organization_memberships (id VARCHAR(64), org_id VARCHAR(64), legacy_hr_id VARCHAR(64), status VARCHAR(10))");
    await connection.query("CREATE TABLE membership_assignments (id VARCHAR(64), org_id VARCHAR(64), membership_id VARCHAR(64), status VARCHAR(10))");
    await connection.query(`CREATE TABLE audit_verification_permissions (id VARCHAR(64),
      org_id VARCHAR(64), grantee_hr_id VARCHAR(64), granted_by VARCHAR(64), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query("INSERT INTO hr_info VALUES ('subject','active','Member'), ('subject','shadow','Shadow member')");
    await connection.query("INSERT INTO organization_memberships VALUES ('member','active','subject','active'), ('other','shadow','subject','active')");
    await connection.query(`INSERT INTO membership_assignments VALUES
      ('position-one','active','member','active'), ('position-two','active','member','active'),
      ('inactive','active','member','inactive'), ('position-other-org','shadow','other','active')`);
    await connection.query(`INSERT INTO audit_verification_permissions (id, org_id, grantee_hr_id, granted_by)
      VALUES ('legacy-grant','active','subject','admin'), ('shadow-grant','shadow','subject','admin')`);
    const [[{ count: legacyCount }]] = await connection.query('SELECT COUNT(*) AS count FROM audit_verification_permissions');
    const verifyMigration = schema('20261123090000_unify_audit_verification_grants.sql');
    for (let run = 0; run < 2; run++) {
      await connection.query(verifyMigration);
      await connection.query(schema(migration));
    }
    const [verifiers] = await connection.query("SELECT * FROM authorization_rules WHERE source_kind = 'legacy_verification'");
    assert.equal(verifiers.length, 1);
    const [verifier] = verifiers;
    assert.equal(verifier.source_ref, 'legacy-grant');
    assert.equal(verifier.scheme_id, roles.idForRule('active', verifier.id));
    assert.deepEqual(verifier.policy_json.capabilities, ['audit.verification.verify']);
    assert.deepEqual([...verifier.policy_json.subjects[0].ids].sort(), ['position-one', 'position-two']);
    assert.deepEqual(verifier.policy_json.scopes, [{ kind: 'organization' }]);
    const [[{ count: recorded }]] = await connection.query("SELECT COUNT(*) AS count FROM authorization_changes WHERE action = 'verification_grant_migration'");
    const [[{ count: retained }]] = await connection.query('SELECT COUNT(*) AS count FROM audit_verification_permissions');
    assert.equal(recorded, 1);
    assert.equal(retained, legacyCount);

    const repair = schema('20261124123000_complete_legacy_audit_verification_roles.sql');
    await connection.query("INSERT INTO hr_info VALUES ('without-position','active','No current assignment')");
    await connection.query("INSERT INTO audit_verification_permissions (id, org_id, grantee_hr_id, granted_by) VALUES ('no-position-grant','active','without-position','admin')");
    for (let run = 0; run < 2; run++) await connection.query(repair);
    const [[dormant]] = await connection.query("SELECT * FROM authorization_rules WHERE source_ref='no-position-grant'");
    assert.equal(dormant.scheme_id, roles.idForRule('active', dormant.id));
    assert.match(dormant.policy_json.subjects[0].ids[0], /^compat-verifier-/);
    assert.deepEqual(dormant.policy_json.capabilities, ['audit.verification.verify']);
    assert.equal((await connection.query("SELECT id FROM authorization_rules WHERE source_ref='shadow-grant'"))[0].length, 0);
    await connection.query('DELETE FROM authorization_rules WHERE id=?', [dormant.id]);
    await connection.query(repair);
    assert.equal((await connection.query("SELECT id FROM authorization_rules WHERE source_ref='no-position-grant'"))[0].length, 0);

    await connection.beginTransaction();
    await roles.bindOrganization(connection, 'shadow', 'test-cutover');
    await connection.commit();
    const [[legacy]] = await connection.query("SELECT scheme_id FROM authorization_rules WHERE id = 'legacy'");
    assert.equal(legacy.scheme_id, roles.idForRule('shadow', 'legacy'));
  } finally {
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.end();
  }
});
