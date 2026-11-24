'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { idForRule, activeRole } = require('../src/core/models/authorizationRoleBackfill');

const schema = name => readFileSync(path.join(__dirname, '../db/deploy', name), 'utf8');
const migration = '20261124130000_merge_duplicate_authorization_roles.sql';

test('same-name role migration preserves independent assignments, original history and live verifier selection', async () => {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const connection = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  const database = 'authorization_role_merge_' + process.pid + '_' + Date.now();
  const username = 'role_merge_' + process.pid;
  const password = randomBytes(24).toString('hex');
  let pool;
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await connection.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await connection.query('USE ??', [database]);
    await connection.query(readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await connection.query(`INSERT INTO organizations (id, name) VALUES ('org', 'Test'), ('other', 'Other');
      CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32),
        version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (org_id, domain));`);
    await connection.query(schema('20261031160000_unified_authorization.sql'));
    await connection.query(schema('20261101023000_organization_config_copy.sql'));
    await connection.query(schema('20261111100000_identity_nature_links.sql'));
    await connection.query("UPDATE authorization_organizations SET mode = 'enforced' WHERE org_id IN ('org', 'other')");
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const model = require('../src/core/models/authorization');
    const legacyVerification = require('../src/core/models/authorizationLegacyVerification');

    const personRead = ['hr.people.read'];
    const scoreRead = ['scoring.results.read'];
    const scoreExport = ['scoring.results.export'];
    const verifierCaps = ['audit.verification.verify'];
    const verifierId = idForRule('org', 'verifier');
    const seedRole = async (id, name, histories, orgId = 'org', draft = histories.at(-1)) => {
      await connection.query(`INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json, published_version)
        VALUES (?, ?, ?, ?, ?)`, [id, orgId, name, JSON.stringify(draft), histories.length]);
      for (let index = 0; index < histories.length; index += 1) {
        await connection.query(`INSERT INTO authorization_scheme_versions
          (id, org_id, scheme_id, version, capabilities_json, actor_context_id) VALUES (?, ?, ?, ?, ?, 'fixture')`,
        [id + '-' + index, orgId, id, index + 1, JSON.stringify(histories[index])]);
      }
    };
    await seedRole('canonical', '历史人事', [personRead]);
    await seedRole('duplicate-b', '历史人事', [personRead]);
    await seedRole('duplicate-c', '历史人事', [personRead]);
    await seedRole('cross-org', '历史人事', [personRead], 'other');
    await seedRole('score-read', '考核', [scoreRead]);
    await seedRole('score-export', '考核', [scoreExport]);
    await seedRole('score-export-name', '考核（导出评分结果）', [personRead]);
    await seedRole('historic-a', '有历史', [scoreRead, personRead]);
    await seedRole('historic-b', '有历史', [scoreExport, personRead]);
    await seedRole(verifierId, '验签', [verifierCaps]);
    await seedRole('separate-verifier-role', '验签', [verifierCaps]);
    await seedRole('share-protected', '共享中', [scoreRead]);
    await seedRole('share-twin', '共享中', [scoreRead]);
    await connection.query(`INSERT INTO organization_config_shares (id, source_org_id, target_org_id, kind,
      source_record_id, payload_json, payload_hash, created_by_context_id)
      VALUES ('sharing', 'org', 'other', 'authorization.schemes', 'share-protected', '{}', REPEAT('a', 64), 'fixture')`);

    const seedRule = async (id, schemeId, capabilities, options = {}) => {
      const { effect = 'allow', enabled = true, orgId = 'org', source = 'fixture' } = options;
      const policy = { id, organizationId: orgId, subjects: [{ kind: 'assignments', ids: ['previous-job'] }],
        scopes: [{ kind: 'people', ids: ['person-' + id] }], fields: ['name'], capabilities, effect, enabled,
        startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' };
      await connection.query(`INSERT INTO authorization_rules
        (id, org_id, name, policy_json, scheme_id, version, source_kind, source_ref)
        VALUES (?, ?, ?, ?, ?, 7, ?, ?)`, [id, orgId, id, JSON.stringify(policy), schemeId, source, id]);
    };
    await seedRule('rule-a', 'canonical', personRead);
    await seedRule('rule-b', 'duplicate-b', personRead, { effect: 'deny' });
    await seedRule('rule-c', 'duplicate-c', personRead, { enabled: false });
    await seedRule('org-boundary', 'cross-org', personRead, { orgId: 'other' });
    await seedRule('verifier', verifierId, verifierCaps, { source: 'legacy_verification' });
    await connection.query(`INSERT INTO audit_verification_permissions (id, org_id, grantee_hr_id, granted_by)
        VALUES ('verifier', 'org', 'person', 'admin');
      INSERT INTO hr_info (id, org_id, name, student_id) VALUES ('person', 'org', 'Test person', 'TEST-PERSON');
      INSERT INTO departments (id, org_id, name) VALUES ('department', 'org', 'Test department');
      INSERT INTO identities (id, org_id, name) VALUES ('identity', 'org', 'Test role');
      INSERT INTO persons (id, name, student_id, normalized_student_id) VALUES ('person', 'Test person', 'TEST-PERSON', 'TEST-PERSON');
      INSERT INTO organization_memberships (id, org_id, person_id, legacy_hr_id) VALUES ('membership', 'org', 'person', 'person');
      INSERT INTO membership_assignments (id, org_id, membership_id, department_id, identity_id, status)
        VALUES ('new-job', 'org', 'membership', 'department', 'identity', 'active'),
          ('inactive-job', 'org', 'membership', 'department', 'identity', 'inactive');`);
    const query = async sql => (await connection.query(sql))[0];
    const ruleRows = () => query('SELECT * FROM authorization_rules ORDER BY id');
    const roleRows = () => query('SELECT * FROM authorization_schemes ORDER BY id');
    const versionRows = () => query('SELECT * FROM authorization_scheme_versions ORDER BY id');
    const mergeRows = () => query('SELECT org_id, old_role_id, retained_role_id FROM authorization_role_merges ORDER BY old_role_id');
    const changes = () => query('SELECT * FROM authorization_changes ORDER BY target_id');
    const [originalRules, originalVersions] = [await ruleRows(), await versionRows()];
    await connection.query(schema(migration));

    const rulesAfter = await ruleRows();
    for (const { scheme_id, ...rule } of rulesAfter) {
      const { scheme_id: oldSchemeId, ...original } = originalRules.find(row => row.id === rule.id);
      assert.deepEqual(rule, original);
      assert.equal(scheme_id, ['rule-b', 'rule-c'].includes(rule.id) ? 'canonical' : oldSchemeId);
    }
    assert.deepEqual(await mergeRows(), [
      { org_id: 'org', old_role_id: 'duplicate-b', retained_role_id: 'canonical' },
      { org_id: 'org', old_role_id: 'duplicate-c', retained_role_id: 'canonical' }
    ]);
    assert.deepEqual(await versionRows(), originalVersions);
    const retained = await query(`SELECT s.id, s.name FROM authorization_schemes s
      WHERE s.org_id = 'org' AND ${activeRole('s')} ORDER BY s.id`);
    assert.equal(retained.length, 10);
    assert.equal(new Set(retained.map(role => role.name)).size, retained.length);
    assert.equal(retained.find(role => role.id === 'score-read').name, '考核（查看评分结果）');
    assert.match(retained.find(role => role.id === 'score-export').name, /^考核（导出评分结果）（\d+）$/);

    const rows = rulesAfter.filter(row => row.id === 'verifier');
    const projected = await legacyVerification.project(connection, 'org', rows,
      rows.map(row => ({ id: row.id, policy: row.policy_json })));
    assert.deepEqual(projected[0].policy.subjects, [{ kind: 'assignments', ids: ['new-job'] }]);

    const [rolesAfter, changesAfter] = [await roleRows(), await changes()];
    await connection.query(schema(migration));
    assert.deepEqual(await ruleRows(), rulesAfter);
    assert.deepEqual(await roleRows(), rolesAfter);
    assert.deepEqual(await changes(), changesAfter);
    assert.deepEqual(await versionRows(), originalVersions);

    const guard = { authorize: async () => ({ organizationId: 'org', contextId: 'fixture' }),
      validateChange: async () => {}, validateReferences: async () => {} };
    const names = (await model.listSchemes(connection, 'org')).map(role => role.name);
    assert.deepEqual(names.sort(), retained.map(role => role.name).sort());
    const archive = await model.schemeVersions({ id: 'duplicate-b' }, 'org', guard);
    assert.deepEqual(archive.versions[0].capabilities, personRead);
    const conflict = error => error.code === 'authorization_conflict';
    const duplicateName = error => error.code === 'authorization_duplicate_scheme_name';
    await assert.rejects(model.saveScheme({ id: 'duplicate-b', version: 1, name: 'Old archive', capabilities: personRead }, 'org', guard), conflict);
    const [{ revision }] = await query("SELECT revision FROM authorization_organizations WHERE org_id='org'");
    const policy = {
      effect: 'allow', enabled: true, capabilities: personRead,
      subjects: [{ kind: 'assignments', ids: ['new-job'] }],
      scopes: [{ kind: 'organization' }], fields: null
    };
    await assert.rejects(model.previewRule({ name: 'Old archive assignment', bindingModel: 'role', schemeId: 'duplicate-b',
      expectedRevision: revision, policy }, 'org', guard), error => error.code === 'authorization_scheme_unpublished');
    await assert.rejects(model.publishScheme({ id: 'duplicate-b', version: 1, expectedRevision: revision }, 'org', guard), conflict);
    await assert.rejects(model.saveScheme({ name: '历史人事', capabilities: personRead }, 'org', guard), duplicateName);
    const outcomes = await Promise.allSettled([
      model.saveScheme({ name: 'Concurrent', capabilities: personRead }, 'org', guard),
      model.saveScheme({ name: 'CONCURRENT', capabilities: scoreRead }, 'org', guard)
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(result => result.status === 'rejected' && duplicateName(result.reason)).length, 1);
  } finally {
    if (pool) await pool.end();
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.query("DROP USER IF EXISTS ?@'%'", [username]);
    await connection.end();
  }
});
