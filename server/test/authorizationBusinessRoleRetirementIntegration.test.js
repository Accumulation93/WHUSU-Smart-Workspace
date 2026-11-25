'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const mysql = require('mysql2/promise');
const apply = require('./helpers/applyAllocationPermissionsMigration');
const migration = file => readFileSync(path.join(__dirname, '../db/deploy', file), 'utf8');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

test('business retirement appends role versions, preserves basic history and keeps legal empty drafts editable', async () => {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'business_roles_' + process.pid + '_' + Date.now();
  const username = 'business_roles_' + process.pid;
  const password = randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await admin.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await admin.query('USE ??', [database]);
    await admin.query(readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await admin.query(`CREATE TABLE cache_domain_versions(org_id VARCHAR(64),domain VARCHAR(32),version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY(org_id,domain)); INSERT INTO organizations(id,name) VALUES('org','Org'),('other','Other')`);
    for (const file of ['20261031160000_unified_authorization.sql', '20261101023000_organization_config_copy.sql',
      '20261124130000_merge_duplicate_authorization_roles.sql', '20261122170000_authorization_grant_sources.sql']) await admin.query(migration(file));
    await admin.query(`CREATE TABLE authorization_relationship_role_assignments(org_id VARCHAR(64) PRIMARY KEY,
      scheme_id VARCHAR(64) NOT NULL,enabled TINYINT NOT NULL DEFAULT 1); UPDATE authorization_organizations SET mode='enforced'`);
    await apply(admin);
    const subjects = [{ kind: 'assignments', ids: ['job'] }];
    const policy = (id, capabilities) => ({ id, organizationId: 'org', effect: 'allow', enabled: true,
      subjects, capabilities, scopes: [{ kind: 'organization' }], fields: null, startsAt: null, endsAt: null });
    const role = async (id, live, draft = live, orgId = 'org') => {
      await admin.query('INSERT INTO authorization_schemes(id,org_id,name,draft_capabilities_json,published_version) VALUES(?,?,?,?,1)',
        [id, orgId, id, JSON.stringify(draft)]);
      await admin.query(`INSERT INTO authorization_scheme_versions(id,org_id,scheme_id,version,capabilities_json,actor_context_id)
        VALUES(?,?,?,1,?,'fixture')`, [id + '-v1', orgId, id, JSON.stringify(live)]);
    };
    const basic = require('../src/core/models/authorizationRelationshipRole').CAPABILITIES;
    await role('basic', basic);
    await admin.query("INSERT INTO authorization_relationship_role_assignments(org_id,scheme_id) VALUES('org','basic')");
    await role('mixed', ['hr.people.read', 'identity.cards.read'], ['hr.people.read', 'identity.cards.read', 'contacts.entries.read']);
    await role('pure', ['contacts.entries.read']);
    await role('allocation-mixed', ['assign:hr.people.read', 'assign:identity.cards.read']);
    await role('allocation-pure', ['assign:identity.cards.read']);
    await role('other-mixed', ['hr.people.read', 'contacts.entries.read'], undefined, 'other');
    await admin.query("INSERT INTO authorization_schemes(id,org_id,name,draft_capabilities_json) VALUES('blank','org','Blank','[]')");
    for (const [id, capabilities, allocation] of [
      ['mixed', ['hr.people.read', 'identity.cards.read'], false], ['pure', ['contacts.entries.read'], false],
      ['allocation-mixed', ['assign:hr.people.read', 'assign:identity.cards.read'], true],
      ['allocation-pure', ['assign:identity.cards.read'], true]
    ]) {
      const full = { ...policy(id, capabilities), ...(allocation ? { allocationSubjects: [{ kind: 'assignments', ids: ['recipient'] }] } : {}) };
      const legacy = { ...policy(id, capabilities.map(key => key.replace('assign:', ''))), enabled: !allocation };
      await admin.query('INSERT INTO authorization_rules(id,org_id,name,scheme_id,policy_json,allocation_policy_json) VALUES(?,?,?,?,?,?)',
        [id, 'org', id, id, JSON.stringify(legacy), allocation ? JSON.stringify(full) : null]);
    }
    const legacyEnvelope = { ...policy('business-source', ['identity.cards.read']), subjects: [{ kind: 'assignments', ids: ['recipient'] }] };
    await admin.query(`INSERT INTO authorization_delegations(id,org_id,name,subjects_json,envelope_json)
      VALUES('business-source','org','Business source',?,?)`, [JSON.stringify(subjects), JSON.stringify(legacyEnvelope)]);
    assert.equal((await admin.query("SELECT COUNT(*) n FROM authorization_rules WHERE source_ref='business-source'"))[0][0].n, 0);
    await apply(admin);
    assert.equal((await admin.query("SELECT COUNT(*) n FROM authorization_changes WHERE action='allocation_business_retire'"))[0][0].n, 1);
    const originalHistory = (await admin.query('SELECT * FROM authorization_scheme_versions ORDER BY id'))[0];
    const basicBefore = (await admin.query("SELECT * FROM authorization_schemes WHERE id='basic'"))[0][0];
    const cleanup = '20261125101000_retire_business_authorization_capabilities.sql';
    await apply(admin, cleanup);
    const snapshots = async () => (await admin.query(`SELECT * FROM authorization_schemes ORDER BY id;
      SELECT * FROM authorization_scheme_versions ORDER BY id; SELECT * FROM authorization_rules ORDER BY id;
      SELECT * FROM authorization_changes ORDER BY id`))[0];
    const first = await snapshots();
    await apply(admin, cleanup);
    assert.deepEqual(await snapshots(), first);
    for (const row of originalHistory) {
      const [[preserved]] = await admin.query('SELECT * FROM authorization_scheme_versions WHERE id=?', [row.id]);
      assert.deepEqual(preserved, row);
    }
    assert.deepEqual((await admin.query("SELECT * FROM authorization_schemes WHERE id='basic'"))[0][0], basicBefore);
    const [[mixed]] = await admin.query("SELECT * FROM authorization_schemes WHERE id='mixed'");
    assert.equal(mixed.published_version, 2);
    assert.deepEqual(mixed.draft_capabilities_json, ['hr.people.read']);
    assert.deepEqual((await admin.query("SELECT capabilities_json FROM authorization_scheme_versions WHERE scheme_id='mixed' AND version=2"))[0][0].capabilities_json, ['hr.people.read']);
    const [[pure]] = await admin.query("SELECT * FROM authorization_rules WHERE id='allocation-pure'");
    assert.equal(pure.allocation_policy_json, null);
    assert.equal(pure.policy_json.enabled, false);
    assert.deepEqual(pure.policy_json.capabilities, ['identity.cards.read']);
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const model = require('../src/core/models/authorization');
    const actor = { organizationId: 'org', contextId: 'super', isSuper: true, unifiedAuthorization: true };
    const guard = { authorize: async () => actor, validateChange: async () => {}, validateReferences: async () => {} };
    const revision = async () => (await model.read(admin, 'org')).revision;
    const listed = await model.listSchemes(admin, 'org');
    assert(listed.some(row => row.id === 'mixed'));
    assert(listed.some(row => row.id === 'blank'));
    assert(!listed.some(row => ['pure', 'allocation-pure', 'basic'].includes(row.id)));
    const empty = await model.saveScheme({ name: 'Legal empty', capabilities: [] }, 'org', guard);
    assert((await model.listSchemes(admin, 'org')).some(row => row.id === empty.id));
    for (const work of [
      () => model.saveScheme({ id: 'basic', version: basicBefore.version, name: 'Basic', capabilities: ['hr.people.read'] }, 'org', guard),
      async () => model.publishScheme({ id: 'basic', version: basicBefore.version, expectedRevision: await revision() }, 'org', guard),
      async () => model.saveRule({ name: 'No basic binding', schemeId: 'basic', policy: policy('new', ['hr.people.read']), expectedRevision: await revision() }, 'org', guard),
      () => require('../src/core/models/authorizationSchemeCopy').source(admin, 'org', 'basic')
    ]) await assert.rejects(work(), error => error.code === 'authorization_forbidden');
    await assert.rejects(model.setBasicCapability({ capability: 'identity.cards.read', enabled: true }, 'org', guard),
      error => error.code === 'authorization_upgrade_required');
    assert.equal((await model.schemeVersions({ id: 'basic' }, 'org', guard)).versions.length, 1);
    const oldVersions = await model.schemeVersions({ id: 'mixed' }, 'org', guard);
    assert.deepEqual(oldVersions.versions.find(row => row.version === 1).capabilities, ['hr.people.read', 'identity.cards.read']);
    const { CATALOG } = require('../src/core/services/authorizationCatalog');
    const { normalizePolicy } = require('../src/core/services/authorizationPolicy');
    for (const row of (await model.read(admin, 'org')).rules) assert.doesNotThrow(() => normalizePolicy(row.policy, CATALOG));
    const currentPureRole = (await admin.query("SELECT * FROM authorization_schemes WHERE id='pure'"))[0][0];
    await model.saveScheme({ id: 'pure', version: currentPureRole.version, name: 'New management use', capabilities: ['hr.people.read'] }, 'org', guard);
    assert((await model.listSchemes(admin, 'org')).some(row => row.id === 'pure'));
    const [[other]] = await admin.query("SELECT * FROM authorization_schemes WHERE id='other-mixed'");
    assert.deepEqual(parse(other.draft_capabilities_json), ['hr.people.read']);
  } finally {
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.query("DROP USER IF EXISTS ?@'%'", [username]);
    await admin.end();
  }
});
