'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const express = require('express');

const readMigration = file => readFileSync(path.join(__dirname, '../db/deploy', file), 'utf8');
const subjects = (...ids) => [{ kind: 'assignments', ids: ids.sort() }];
const base = { effect: 'allow', enabled: true, subjects: subjects('target'), capabilities: ['hr.people.read'],
  scopes: [{ kind: 'organization' }], fields: ['name'], startsAt: null, endsAt: null };

test('allocation migration and ordinary role HTTP chain preserve scopes, history, legacy writes and cascading revocation', async () => {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'allocation_' + process.pid + '_' + Date.now();
  const username = 'allocation_' + process.pid;
  const password = randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  let listener;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await admin.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await admin.query('USE ??', [database]);
    await admin.query(readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await admin.query(`CREATE TABLE cache_domain_versions(org_id VARCHAR(64),domain VARCHAR(32),version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY(org_id,domain)); INSERT INTO organizations(id,name) VALUES ('org','Org'),('other','Other')`);
    for (const file of ['20261031160000_unified_authorization.sql', '20261101023000_organization_config_copy.sql',
      '20261124130000_merge_duplicate_authorization_roles.sql', '20261111100000_identity_nature_links.sql',
      '20261102193000_authorization_runtime_transition.sql', '20261122153000_unified_identity_assignment_links.sql',
      '20261122170000_authorization_grant_sources.sql']) await admin.query(readMigration(file));
    await admin.query(`UPDATE authorization_organizations SET mode='enforced';
      UPDATE authorization_runtime_transition SET phase='enforced', minimum_protocol=3;
      INSERT INTO departments(id,name,org_id) VALUES ('department','Department','org');
      INSERT INTO identities(id,name,org_id) VALUES ('identity','Identity','org');
      INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES ('org','identity','staff')`);
    for (const id of ['issuer', 'middle', 'target', 'recipient', 'outside', 'super']) {
      await admin.query(`INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,? ,?,?);
        INSERT INTO accounts(id,person_id) VALUES (?,?);
        INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,? ,?,'org');
        INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES (?,?,'org',?);
        INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
          VALUES (?,?,'org','staff','department','identity');
        INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
          VALUES (?,?,'',?,'assignment',?,'org','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`,
      [id, id, id, id, 'account-' + id, id, 'hr-' + id, id, id,
        'membership-' + id, id, 'hr-' + id, id, 'membership-' + id,
        'session-' + id, 'account-' + id, 'context-' + id, id]);
    }
    await admin.query(`INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('super-grant','super','','super_admin');
      UPDATE auth_sessions SET role='admin',context_type='admin',context_subject_id='super-grant' WHERE id='session-super';
      INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
        VALUES ('issuer-alternate','membership-issuer','org','staff','department','identity')`);
    const envelope = { ...base, id: 'legacy-source', organizationId: 'org', subjects: subjects('issuer-alternate', 'middle', 'target', 'recipient'),
      startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z' };
    await admin.query(`INSERT INTO authorization_delegations(id,org_id,name,subjects_json,envelope_json)
      VALUES ('legacy-source','org','People',?,?);
      INSERT INTO authorization_grant_sources(org_id,object_kind,object_id,allow_redelegation)
      VALUES ('org','delegation','legacy-source',0);
      INSERT INTO authorization_schemes(id,org_id,name,draft_capabilities_json) VALUES ('existing-role','org','People','["hr.people.read"]')`,
    [JSON.stringify(subjects('issuer')), JSON.stringify(envelope)]);
    const apply = require('./helpers/applyAllocationPermissionsMigration');
    await apply(admin);
    const snapshots = async () => (await admin.query(`SELECT id,scheme_id,version,policy_json,allocation_policy_json FROM authorization_rules ORDER BY id;
      SELECT id,name,published_version,version FROM authorization_schemes ORDER BY id;
      SELECT id,scheme_id,version,capabilities_json FROM authorization_scheme_versions ORDER BY id`))[0];
    const migrated = await snapshots();
    await apply(admin);
    assert.deepEqual(await snapshots(), migrated, 'migration repeated without changing assignments or published history');
    const [[legacyRule]] = await admin.query("SELECT * FROM authorization_rules WHERE source_kind='legacy_allocation' AND source_ref='legacy-source'");
    assert(legacyRule);
    const oldPolicy = require('../src/core/services/authorizationPolicy');
    const oldCatalog = new Map([...require('../src/core/services/authorizationCatalog').CATALOG].filter(([, value]) => !value.allocationCapability));
    assert.doesNotThrow(() => oldPolicy.normalizePolicy(legacyRule.policy_json, oldCatalog));
    assert.equal(legacyRule.policy_json.enabled, false);
    assert.equal(legacyRule.policy_json.allocationSubjects, undefined);
    const [[originalDelegation]] = await admin.query("SELECT * FROM authorization_delegations WHERE id='legacy-source'");
    assert.deepEqual(originalDelegation.envelope_json, envelope);
    assert.deepEqual(originalDelegation.subjects_json, subjects('issuer'));
    assert.equal(originalDelegation.version, 1);
    legacyRule.policy_json = legacyRule.allocation_policy_json;
    assert.deepEqual(legacyRule.policy_json.subjects, subjects('issuer'));
    assert.deepEqual(legacyRule.policy_json.allocationSubjects, envelope.subjects);
    assert.deepEqual(legacyRule.policy_json.capabilities, ['assign:hr.people.read']);
    const [[legacyRole]] = await admin.query('SELECT * FROM authorization_schemes WHERE id=?', [legacyRule.scheme_id]);
    assert.equal(legacyRole.name, 'People（权限分配）');

    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const model = require('../src/core/models/authorization');
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      const id = req.headers['x-test-actor'] || 'issuer';
      req.authAccount = { id: 'account-' + id, personId: id };
      req.authSession = { id: 'session-' + id };
      req.authContext = { personId: id, contextId: 'context-' + id, organizationId: 'org', role: id === 'super' ? 'admin' : 'user',
        ...(id === 'super' ? { adminGrantId: 'super-grant' } : { assignmentId: id }) };
      require('../src/utils/orgContext').orgStorage.run('org', next);
    });
    app.use('/api', require('../src/core/routes/authorization'));
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    async function call(action, body = {}, actor = 'issuer') {
      const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + action, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-actor': actor }, body: JSON.stringify({ identityModel: 'unified', ...body }) });
      return { code: response.status, data: await response.json() };
    }
    async function success(action, body = {}, actor) {
      const result = await call(action, body, actor);
      assert.equal(result.code, 200, action + ': ' + JSON.stringify(result));
      assert.equal(result.data.status, 'success');
      return result.data;
    }
    const revision = async () => (await model.read(admin, 'org')).revision;
    async function saveRule(policy, actor = 'issuer', schemeId, prior) {
      return (await success('saveAuthorizationRule', { name: 'People allocation', policy, ...(schemeId ? { bindingModel: 'role', schemeId } : {}),
        ...(prior ? { id: prior.id, version: prior.version } : {}), expectedRevision: await revision() }, actor)).rule;
    }
    async function reject(policy, actor = 'issuer', schemeId, extra = {}) {
      const before = await snapshots();
      const result = await call('saveAuthorizationRule', { name: 'Rejected', policy, bindingModel: 'role', schemeId,
        expectedRevision: await revision(), ...extra }, actor);
      assert.equal(result.code, 403, JSON.stringify(result));
      assert.deepEqual(await snapshots(), before, 'rejected write has no partial rules, role versions or history');
    }
    const management = await success('getAuthorizationManagement');
    assert.equal(management.canManage, true);
    for (const key of ['basicRoleId','relationshipRoleAssignment','basicCapabilities']) assert.equal(Object.hasOwn(management,key), false);
    const { CATALOG } = require('../src/core/services/authorizationCatalog');
    assert(management.catalog.every(item => !CATALOG.get(item.key).businessOnly));
    assert(management.capabilityKeys.every(key => !CATALOG.get(key).businessOnly));
    assert.deepEqual(management.delegationOptions[0].envelope.capabilities, ['assign:hr.people.read', 'hr.people.read']);
    assert(management.capabilityKeys.includes('assign:hr.people.read'));
    const emptyRole = (await success('saveAuthorizationScheme', { name: 'Empty draft', capabilities: [] })).scheme;
    assert((await success('getAuthorizationManagement')).schemes.some(row => row.id === emptyRole.id));
    const legacyClient = (await success('saveAuthorizationDelegation', { name: 'Legacy allocation client', enabled: true,
      subjects: subjects('target'), envelope: { ...envelope, subjects: subjects('recipient') },
      allowRedelegation: false, allocationSourceId: 'legacy-source', expectedRevision: await revision() })).delegation;
    assert.equal(legacyClient.allowRedelegation, true);
    const legacyClientRule = (await success('getAuthorizationManagement', {}, 'super')).rules.find(row => row.sourceRef === legacyClient.id);
    assert(legacyClientRule);
    assert.deepEqual(legacyClientRule.policy.capabilities, ['assign:hr.people.read']);
    await success('deleteAuthorizationDelegation', { id: legacyClient.id, version: legacyClient.version,
      expectedRevision: await revision() });
    assert.equal((await success('getAuthorizationManagement', {}, 'super')).rules.find(row => row.id === legacyClientRule.id).policy.enabled, false);
    const scheme = (await success('saveAuthorizationScheme', { name: 'People allocation role', capabilities: ['assign:hr.people.read'] })).scheme;
    const published = await success('publishAuthorizationScheme', { id: scheme.id, version: scheme.version, expectedRevision: await revision() });
    const allocation = { ...base, capabilities: ['assign:hr.people.read'], subjects: subjects('middle'), allocationSubjects: subjects('target', 'recipient'),
      startsAt: envelope.startsAt, endsAt: envelope.endsAt };
    const middle = await saveRule(allocation, 'issuer', scheme.id);
    assert.deepEqual((await success('getAuthorizationManagement', {}, 'super')).rules.find(row => row.id === middle.id).policy.allocationSubjects,
      allocation.allocationSubjects);
    await reject({ ...allocation, allocationSubjects: subjects('outside') }, 'issuer', scheme.id);
    await reject({ ...allocation, subjects: subjects('issuer') }, 'issuer', scheme.id);
    await reject({ ...allocation, subjects: subjects('issuer-alternate') }, 'issuer', scheme.id);
    await reject({ ...allocation, allocationSubjects: subjects('issuer-alternate') }, 'issuer', scheme.id);
    await reject({ ...allocation, fields: ['studentId'] }, 'issuer', scheme.id);
    await reject({ ...allocation, endsAt: null }, 'issuer', scheme.id);
    const alternateSource = await saveRule({ ...allocation, subjects: subjects('issuer'), fields: ['membershipStatus'] }, 'super', scheme.id);
    await reject({ ...allocation, fields: ['name', 'membershipStatus'] }, 'issuer', scheme.id);
    await reject(allocation, 'issuer', scheme.id, { allocationSourceId: 'rule:' + alternateSource.id });
    await success('deleteAuthorizationRules', { rules: [{ id: alternateSource.id, version: alternateSource.version }], expectedRevision: await revision() }, 'super');
    const target = await saveRule({ ...allocation, subjects: subjects('target'), allocationSubjects: subjects('recipient') }, 'middle', scheme.id);
    const operationRole = (await success('saveAuthorizationScheme', { name: 'People reader', capabilities: ['hr.people.read'] }, 'target')).scheme;
    await success('publishAuthorizationScheme', { id: operationRole.id, version: operationRole.version, expectedRevision: await revision() }, 'target');
    const final = await saveRule({ ...base, subjects: subjects('recipient'), startsAt: envelope.startsAt, endsAt: envelope.endsAt }, 'target', operationRole.id);
    assert((await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    const [[provenance]] = await admin.query('SELECT * FROM authorization_grant_sources WHERE object_kind=\'rule\' AND object_id=?', [target.id]);
    assert.equal(provenance.parent_delegation_id, 'rule:' + middle.id);

    const deny = await saveRule({ ...base, subjects: subjects('middle'), effect: 'deny', capabilities: ['assign:hr.people.read'] }, 'super');
    assert.equal((await success('getCurrentAuthorizationAccess', {}, 'middle')).canManageAuthorization, false);
    assert(!(await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    await success('deleteAuthorizationRules', { rules: [{ id: deny.id, version: deny.version }], expectedRevision: await revision() }, 'super');
    assert((await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));

    // 正式角色发布仍校验全部绑定，缩小范围后依赖来源的后代立即失效。
    const sourcePolicy = { ...legacyRule.policy_json, allocationSubjects: subjects('middle') };
    const changedSource = await saveRule(sourcePolicy, 'super', legacyRule.scheme_id, { id: legacyRule.id, version: legacyRule.version });
    assert(!(await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    const persisted = (await success('getAuthorizationManagement', {}, 'super')).rules.find(row => row.id === final.id);
    assert(persisted);
    assert.equal(persisted.sourceActive, false);
    const [[mirror]] = await admin.query("SELECT * FROM authorization_delegations WHERE id='legacy-source'");
    assert.deepEqual(mirror.envelope_json.subjects, subjects('middle'));
    const restored = await saveRule(legacyRule.policy_json, 'super', legacyRule.scheme_id, changedSource);
    assert((await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    const sharedSource = await saveRule({ ...allocation, subjects: subjects('outside'), allocationSubjects: subjects('recipient') },
      'super', legacyRule.scheme_id);
    const rootDraft = (await success('saveAuthorizationScheme', { id: legacyRole.id, version: legacyRole.version,
      name: legacyRole.name, capabilities: ['hr.people.read'] }, 'super')).scheme;
    const rootPublished = await success('publishAuthorizationScheme', { id: rootDraft.id, version: rootDraft.version,
      expectedRevision: await revision() }, 'super');
    assert.equal((await success('getCurrentAuthorizationAccess')).canManageAuthorization, false);
    assert(!(await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    await success('publishAuthorizationScheme', { id: rootDraft.id, version: rootPublished.version, restoreVersion: 1,
      expectedRevision: await revision() }, 'super');
    assert((await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    // 旧二进制保存、事务回滚、删除都同步正式分配；原角色版本保留。
    await admin.beginTransaction();
    await admin.query("UPDATE authorization_delegations SET enabled=0,version=version+1 WHERE id='legacy-source'");
    assert.equal((await admin.query('SELECT allocation_policy_json FROM authorization_rules WHERE id=?', [legacyRule.id]))[0][0].allocation_policy_json.enabled, false);
    await admin.rollback();
    assert.equal((await admin.query('SELECT allocation_policy_json FROM authorization_rules WHERE id=?', [legacyRule.id]))[0][0].allocation_policy_json.enabled, true);
    await admin.query("UPDATE authorization_delegations SET envelope_json=?,version=version+1 WHERE id='legacy-source'", [JSON.stringify({ ...envelope, fields: ['name', 'membershipStatus'] })]);
    assert.deepEqual((await admin.query('SELECT allocation_policy_json FROM authorization_rules WHERE id=?', [legacyRule.id]))[0][0].allocation_policy_json.fields, ['name', 'membershipStatus']);
    assert((await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    assert((await admin.query('SELECT version FROM authorization_scheme_versions WHERE scheme_id=?', [legacyRule.scheme_id]))[0].length >= 1);
    const sharedRoleBefore = (await admin.query('SELECT * FROM authorization_schemes WHERE id=?', [legacyRule.scheme_id]))[0][0];
    await admin.query("UPDATE authorization_delegations SET envelope_json=?,version=version+1 WHERE id='legacy-source'", [JSON.stringify({ ...envelope, capabilities: ['hr.people.update'] })]);
    assert.deepEqual((await admin.query('SELECT * FROM authorization_schemes WHERE id=?', [legacyRule.scheme_id]))[0][0], sharedRoleBefore);
    const [[sharedAfter]] = await admin.query('SELECT scheme_id,allocation_policy_json FROM authorization_rules WHERE id=?', [sharedSource.id]);
    assert.equal(sharedAfter.scheme_id, legacyRule.scheme_id);
    assert.deepEqual(sharedAfter.allocation_policy_json.capabilities, ['assign:hr.people.read']);
    assert.notEqual((await admin.query('SELECT scheme_id FROM authorization_rules WHERE id=?', [legacyRule.id]))[0][0].scheme_id, legacyRule.scheme_id);
    await admin.query("DELETE FROM authorization_delegations WHERE id='legacy-source'");
    assert.equal((await admin.query('SELECT allocation_policy_json FROM authorization_rules WHERE id=?', [legacyRule.id]))[0][0].allocation_policy_json.enabled, false);
    assert(!(await model.read(admin, 'org', false, true)).rules.some(row => row.id === final.id));
    assert.equal((await admin.query("SELECT id FROM authorization_rules WHERE org_id='other'"))[0].length, 0);
    assert.equal(published.publishedVersion, 1);
    assert(restored.version > changedSource.version);
    const [oldRows] = await admin.query("SELECT policy_json FROM authorization_rules WHERE org_id='org'");
    for (const row of oldRows) assert.doesNotThrow(() => oldPolicy.normalizePolicy(row.policy_json, oldCatalog));
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.query("DROP USER IF EXISTS ?@'%'", [username]);
    await admin.end();
  }
});
