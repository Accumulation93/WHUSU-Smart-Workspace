'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { CATALOG } = require('../src/core/services/authorizationCatalog');
const { normalizePolicy, evaluate } = require('../src/core/services/authorizationPolicy');
const { allowLegacyAdminFixture } = require('./helpers/legacyAdminSchema');

const schema = name => readFileSync(path.join(__dirname, '../db/deploy', name), 'utf8');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

async function applyRetirement(connection) {
  const sql = schema('20261126163000_retire_regular_admin_identity.sql');
  const [header, rest] = sql.split('DELIMITER $$');
  const [routine, tail] = rest.split('DELIMITER ;');
  await connection.query(header);
  for (const statement of routine.split('$$').map(value => value.trim()).filter(Boolean)) await connection.query(statement);
  await connection.query(tail);
}

function verdict(policies, actor, capability, requestedFields = []) {
  const resourceType = CATALOG.get(capability).resourceType;
  return evaluate({ actor, resource: { organizationId: actor.organizationId, type: resourceType }, capability,
    policies, catalog: CATALOG, now: Date.now(), businessAllowed: true, requestedFields });
}

test('普通管理员改为岗位上的正式权限角色，学号字段、历史和跨组织保持等价', async () => {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const root = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  const database = 'retire_admin_' + process.pid + '_' + Date.now();
  const username = 'retire_' + process.pid;
  const password = randomBytes(24).toString('hex');
  let connection;
  try {
    await root.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await root.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await root.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    connection = await mysql.createConnection({ host, port, user: username, password, database, multipleStatements: true });
    await connection.query(readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await allowLegacyAdminFixture(connection);
    await connection.query(schema('20261031160000_unified_authorization.sql').split('-- 各写入在同一事务')[0]);
    await connection.query('ALTER TABLE authorization_rules ADD COLUMN allocation_policy_json JSON NULL');
    await connection.query(schema('20261122153000_unified_identity_assignment_links.sql'));
    await connection.query(`INSERT INTO organizations(id,name) VALUES ('org','测试组织'),('other','其他组织');
      INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES
        ('p1','甲','TEST-RETIRE-1','TEST-RETIRE-1'),('p2','乙','TEST-RETIRE-2','TEST-RETIRE-2'),
        ('p3','丙','TEST-RETIRE-3','TEST-RETIRE-3'),('p4','丁','TEST-RETIRE-4','TEST-RETIRE-4'),
        ('super','超级管理员','TEST-RETIRE-SUPER','TEST-RETIRE-SUPER');
      INSERT INTO departments(id,org_id,name) VALUES ('dept','org','部门'),('other-dept','other','部门');
      INSERT INTO identities(id,org_id,name) VALUES ('identity','org','成员'),('other-identity','other','成员');
      INSERT INTO assignment_natures(id,org_id,name) VALUES ('staff','org','成员'),('other-staff','other','成员');
      INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id,status) VALUES
        ('m1','p1','org','hr1','active'),('m2','p2','org','hr2','active'),
        ('m3','p3','org','hr3','active'),('m4','p4','other','hr4','active');
      INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id,status) VALUES
        ('a1','m1','org','staff','dept','identity','active'),('a2','m2','org','staff','dept','identity','active'),
        ('a3','m3','org','staff','dept','identity','active'),('a4','m4','other','other-staff','other-dept','other-identity','active');
      INSERT INTO admin_info(id,name,org_id,admin_level) VALUES
        ('old1','甲','org','admin'),('old2','乙','org','admin'),('old3','丙','org','admin'),('old4','丁','other','admin'),
        ('super-record','超级管理员','','super_admin');
      INSERT INTO admin_grants(id,person_id,org_id,admin_level,legacy_admin_id) VALUES
        ('g1','p1','org','admin','old1'),('g2','p2','org','admin','old2'),('g3','p3','org','admin','old3'),
        ('g4','p4','other','admin','old4'),('super-grant','super','','super_admin','super-record');
      INSERT INTO authorization_identity_assignment_links(org_id,admin_grant_id,assignment_id) VALUES
        ('org','g1','a1'),('org','g2','a2'),('org','g3','a3'),('other','g4','a4');
      INSERT INTO accounts(id,person_id) VALUES ('account1','p1');
      INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
        VALUES ('old-session','account1',REPEAT('a',64),'old-context','admin','g1','org','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY);
      INSERT INTO authorization_organizations(org_id,mode) VALUES ('org','enforced'),('other','enforced');`);
    const roles = [
      ['people', ['files.tables.parse', 'hr.people.create', 'hr.people.export', 'hr.people.read', 'hr.people.update']],
      ['review', ['files.tables.build', 'hr.profileReview.approve', 'hr.profileReview.read']],
      ['policy', ['auth.policy.read', 'auth.policy.update']],
      ['score', ['scoring.results.read']]
    ];
    for (const [role, capabilities] of roles) {
      await connection.query(`INSERT INTO authorization_schemes(id,org_id,name,draft_capabilities_json,published_version)
        VALUES (?,'org',?,?,1)`, [role, role, JSON.stringify(capabilities)]);
      await connection.query(`INSERT INTO authorization_scheme_versions(id,org_id,scheme_id,version,capabilities_json,actor_context_id)
        VALUES (?,'org',?,1,?,'fixture')`, [role + '-v1', role, JSON.stringify(capabilities)]);
      for (let i = 1; i <= 3; i += 1) {
        const id = role + '-' + i;
        const policy = { id, organizationId: 'org', effect: 'allow', enabled: true,
          subjects: [{ kind: 'adminGrants', ids: ['g' + i] }], capabilities,
          scopes: [{ kind: 'organization' }], fields: null };
        await connection.query(`INSERT INTO authorization_rules(id,org_id,name,policy_json,scheme_id,source_kind,source_ref)
          VALUES (?,'org',?,?,?,'legacy_permission',?)`, [id, role, JSON.stringify(policy), role, id]);
      }
    }
    const [beforeRows] = await connection.query("SELECT policy_json FROM authorization_rules WHERE org_id='org'");
    const beforePolicies = beforeRows.map(row => normalizePolicy(parse(row.policy_json), CATALOG));
    const beforeActor = { role: 'user', active: true, unifiedAuthorization: true, organizationId: 'org', personId: 'p1',
      legacyAdminGrantIds: ['g1'], assignment: { id: 'a1', active: true, organizationId: 'org', personId: 'p1' } };
    assert.equal(verdict(beforePolicies, beforeActor, 'hr.people.update', ['studentId']).allowed, true);
    assert.equal(verdict(beforePolicies, beforeActor, 'auth.policy.update').allowed, false);
    await connection.query("DELETE FROM authorization_identity_assignment_links WHERE admin_grant_id='g1'");
    await assert.rejects(applyRetirement(connection), error => error.sqlMessage === 'regular_admin_assignment_missing');
    assert.equal((await connection.query("SELECT COUNT(*) n FROM admin_grants WHERE admin_level='admin'"))[0][0].n, 4);
    await connection.query("INSERT INTO authorization_identity_assignment_links(org_id,admin_grant_id,assignment_id) VALUES ('org','g1','a1')");
    await connection.query("UPDATE authorization_rules SET source_kind='manual' WHERE id='people-1'");
    await assert.rejects(applyRetirement(connection), error => error.sqlMessage === 'regular_admin_rule_requires_review');
    assert.equal((await connection.query("SELECT COUNT(*) n FROM authorization_scheme_versions"))[0][0].n, 4);
    await connection.query("UPDATE authorization_rules SET source_kind='legacy_permission' WHERE id='people-1'");
    await applyRetirement(connection);
    const [[counts]] = await connection.query(`SELECT
      (SELECT COUNT(*) FROM admin_grants WHERE admin_level='admin') grants,
      (SELECT COUNT(*) FROM admin_info WHERE admin_level='admin') records,
      (SELECT COUNT(*) FROM authorization_identity_assignment_links) links,
      (SELECT COUNT(*) FROM authorization_rules WHERE org_id='org') rules,
      (SELECT COUNT(*) FROM authorization_schemes WHERE org_id='org') roles`);
    assert.deepEqual({ ...counts }, { grants: 0, records: 0, links: 0, rules: 18, roles: 6 });
    const [[session]] = await connection.query("SELECT status FROM auth_sessions WHERE id='old-session'");
    assert.equal(session.status, 'revoked');
    const [afterRows] = await connection.query("SELECT policy_json,scheme_id,source_kind FROM authorization_rules WHERE org_id='org'");
    const afterPolicies = afterRows.map(row => normalizePolicy(parse(row.policy_json), CATALOG));
    const afterActor = { ...beforeActor, legacyAdminGrantIds: [] };
    for (const [capability, fields] of [
      ['hr.people.read', ['studentId']], ['hr.people.update', ['studentId']],
      ['hr.people.export', ['studentId']], ['hr.profileReview.approve', ['studentId']],
      ['files.tables.parse', []], ['auth.policy.read', []], ['scoring.results.read', []], ['auth.policy.update', []]
    ]) {
      assert.equal(verdict(afterPolicies, afterActor, capability, fields).allowed,
        verdict(beforePolicies, beforeActor, capability, fields).allowed, capability);
    }
    assert(afterRows.every(row => row.source_kind === 'manual'));
    const [[history]] = await connection.query("SELECT COUNT(*) n FROM authorization_scheme_versions WHERE org_id='org'");
    assert.equal(Number(history.n), 9);
    const [[changes]] = await connection.query("SELECT COUNT(*) n FROM authorization_changes WHERE actor_context_id='migration:retire_regular_admin'");
    assert.equal(Number(changes.n), 22);
    await assert.rejects(connection.query("INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('forbidden','p1','org','admin')"),
      error => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
    await assert.rejects(connection.query("INSERT INTO admin_info(id,name,org_id,admin_level) VALUES ('forbidden','旧身份','org','admin')"),
      error => error.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
    await applyRetirement(connection);
    const [[again]] = await connection.query("SELECT COUNT(*) n FROM authorization_rules WHERE org_id='org'");
    assert.equal(Number(again.n), 18);
  } finally {
    if (connection) await connection.end();
    await root.query("DROP DATABASE IF EXISTS ??", [database]);
    await root.query("DROP USER IF EXISTS ?@'%'", [username]);
    await root.end();
  }
});
