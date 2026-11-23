'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const mysql = require('mysql2/promise');
const { isDeepStrictEqual } = require('node:util');

async function postVerification(reference, body = {}) {
  const app = express();
  const { orgStorage } = require('../src/utils/orgContext');
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authAccount = { id: reference.accountId, personId: reference.personId };
    req.authSession = { id: reference.sessionId };
    req.authContext = { role: 'user', personId: reference.personId, organizationId: reference.organizationId,
      contextId: reference.contextId };
    req.logger = { error() {} };
    orgStorage.run(reference.organizationId, next);
  });
  app.use(require('../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use(require('../src/modules/audit/routes/auditSignature'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  try {
    const name = body.submissionNumber ? 'verifySignatureChain' : 'getAuditVerificationAccess';
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(body) });
    return response.json();
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

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
    await connection.query(`INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr-a','验签成员甲','TEST-MIGRATION-A','migration-org');
      INSERT INTO audit_verification_permissions(id,grantee_hr_id,granted_by,org_id)
        VALUES ('historical-verify-a','hr-a','admin-a','migration-org')`);
    await connection.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261111100000_identity_nature_links.sql'), 'utf8'));
    await connection.query("UPDATE admin_permission_overrides SET granted=0 WHERE admin_id='admin-a' AND permission_key='venue.purposes.delete'");
    await assert.rejects(cutover.activate(release, async () => true), error => error.code === 'authorization_migration_stale');
    await cutover.stageAll();
    let checks = 0;
    await assert.rejects(cutover.activate(release, async () => ++checks === 1), error => error.code === 'authorization_deployment_not_ready');
    assert.equal((await connection.query('SELECT phase FROM authorization_runtime_transition WHERE id=1'))[0][0].phase, 'shadow');
    assert.equal((await connection.query('SELECT phase FROM venue_purpose_storage_transition WHERE id=1'))[0][0].phase, 'legacy');
    assert.equal((await connection.query("SELECT id FROM authorization_rules WHERE source_ref='historical-verify-a'"))[0].length, 0);
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
    const [[verifyRule]] = await connection.query("SELECT scheme_id FROM authorization_rules WHERE source_ref='historical-verify-a'");
    assert.match(verifyRule.scheme_id, /^compat-rule-/);
    assert.equal((await cutover.activate(release, async () => true)).changed, false);
    await pool.withTransaction(async transaction => {
      await cutover.inheritOrganization(transaction, 'future-org');
      await transaction.query("INSERT INTO organizations(id,name) VALUES ('future-org','后续组织')");
    });
    assert.equal((await connection.query("SELECT mode FROM authorization_organizations WHERE org_id='future-org'"))[0][0].mode, 'enforced');
    await assert.rejects(migration.stage('migration-org'), error => error.code === 'authorization_migration_already_enforced');
    assert.equal((await connection.query("SELECT id FROM authorization_rules WHERE org_id='other-org'"))[0].length, 0);
    await verifyUnifiedIdentityTransition(connection, pool);
    console.log('旧权限暂存与启用：双次建表、保存回读、委托边界、来源变化、人工规则拒绝、进程验证失败、事务中断整单回滚、全组织与事由同事务启用、重复执行、新组织继承及启用后拒绝旧写通过。');
  } finally {
    if (pool) await pool.end();
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.query("DROP USER IF EXISTS ?@'%'", [username]);
    await connection.end();
  }
}

async function verifyUnifiedIdentityTransition(connection, pool) {
  for (const filename of ['20261111100000_identity_nature_links.sql', '20261122153000_unified_identity_assignment_links.sql',
    '20261122170000_authorization_grant_sources.sql']) {
    const sql = fs.readFileSync(path.join(__dirname, '../db/deploy', filename), 'utf8');
    await connection.query(sql);
    await connection.query(sql);
  }
  process.env.AUTH_IDENTITY_SECRET ||= crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
  const transition = require('../src/core/models/authorizationIdentityTransition');
  const { loadActor, loadEffectiveAssignmentsForAuthorization } = require('../src/core/models/authorizationIdentity');
  const identity = require('../src/core/models/unifiedIdentity');
  const { superAssignmentId } = require('../src/core/services/authorizationIdentityModel');
  const first = await transition.stage(pool);
  assert.equal(first.staged, false);
  assert.deepEqual(first.blockers.map(row => row.adminGrantId), ['grant-a', 'grant-b']);
  assert.equal(await transition.isUnified(connection), false);
  await connection.query(`INSERT INTO accounts(id,person_id) VALUES ('account-a','migration-a'),('account-b','migration-b');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES
      ('membership-a','migration-a','migration-org','hr-a'),('membership-b','migration-b','migration-org','hr-b');
    INSERT INTO departments(id,name,org_id) VALUES ('d-migration','迁移部门','migration-org');
    INSERT INTO identities(id,name,org_id) VALUES ('i-migration','迁移身份','migration-org');
    INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES ('migration-org','i-migration','staff');
    INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES
      ('a-post-1','membership-a','migration-org','staff','d-migration','i-migration'),
      ('a-post-2','membership-a','migration-org','staff','d-migration','i-migration'),
      ('b-post','membership-b','migration-org','staff','d-migration','i-migration')`);
  const staged = await transition.stage(pool);
  assert.equal(staged.staged, true);
  assert.equal(staged.assignmentCount, 3);
  assert.equal((await transition.stage(pool)).changed, false);
  assert.equal(await transition.isUnified(connection), false);
  const [adminBefore] = (await identity.listContexts('account-a')).filter(context => context.role === 'admin');
  assert.equal(identity.selectClientContexts(await identity.listContexts('account-a'), 'unified').identityModel, 'legacy');
  const release = { compatibleSha: 'c'.repeat(40), fallbackSha: 'd'.repeat(40) };
  const verifyDeployment = async request => request.protocol === 3;
  const activate = () => transition.activate(pool, release, verifyDeployment, transition.compareAuthorization);
  await connection.query("DELETE FROM authorization_identity_assignment_links WHERE assignment_id='a-post-2'");
  await assert.rejects(activate(), error => error.code === 'authorization_migration_stale');
  await transition.stage(pool);
  await assert.rejects(transition.activate(pool, release, verifyDeployment, async () => ({ valid: false })),
    error => error.code === 'authorization_migration_unreviewed');
  const special = { id: 'fixture-special-conflict', organizationId: 'migration-org', effect: 'allow', enabled: true,
    subjects: [{ kind: 'adminGrants', ids: ['grant-a'] }], capabilities: ['auth.policy.update'],
    scopes: [{ kind: 'organization' }], fields: null };
  await connection.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,'migration-org','旧全局设置',?)",
    [special.id, JSON.stringify(special)]);
  const specialChange = await transition.compareAuthorization(connection, await transition.inspect(connection));
  assert.equal(specialChange.valid, true);
  assert(specialChange.specialRestrictions.some(row => row.capability === 'auth.policy.update' && row.reason === 'special_permission_required'));
  const deny = { ...special, id: 'fixture-previous-role-deny', effect: 'deny',
    subjects: [{ kind: 'assignments', ids: ['a-post-2'] }], capabilities: ['venue.purposes.read'] };
  await connection.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,'migration-org','岗位禁止',?)",
    [deny.id, JSON.stringify(deny)]);
  const conflict = await transition.compareAuthorization(connection, await transition.inspect(connection));
  assert(conflict.differences.some(row => row.assignmentId === 'a-post-2' && row.capability === 'venue.purposes.read' && row.reason === 'explicit_deny'));
  await assert.rejects(activate(), error => error.code === 'authorization_migration_unreviewed');
  await connection.query('DELETE FROM authorization_rules WHERE id=?', [deny.id]);
  const activated = await activate();
  assert(activated.equivalence.specialRestrictions.some(row => row.policyId === special.id));
  assert.equal(activated.assignmentCount, 3);
  assert.equal(activated.equivalence.valid, true);
  assert(activated.equivalence.comparisons > 0);
  const contexts = await identity.listContexts('account-a');
  assert(contexts.some(context => context.contextId === adminBefore.contextId));
  const modern = identity.selectClientContexts(contexts, 'unified');
  assert.equal(modern.identityModel, 'unified');
  assert.equal(modern.contexts.length, 2);
  assert(modern.contexts.every(context => context.accountType === 'user' && context.role === 'user'));
  await connection.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
    organization_id,role,token_version,expires_at)
    VALUES ('session-legacy','account-a','',?,'admin','grant-a','migration-org','admin',1,UTC_TIMESTAMP() + INTERVAL 1 DAY)`, [adminBefore.contextId]);
  const ref = { accountId: 'account-a', personId: 'migration-a', sessionId: 'session-legacy', contextId: adminBefore.contextId, organizationId: 'migration-org' };
  const legacyActor = await loadActor(connection, ref);
  assert.equal(legacyActor.role, 'admin');
  assert.deepEqual(legacyActor.legacyAdminGrantIds, ['grant-a']);
  assert.equal(legacyActor.assignment.id, 'a-post-1');
  await assert.rejects(identity.activateSelection('session-legacy', 'account-a', { contextId: adminBefore.contextId, identityModel: 'unified' }),
    error => error.code === 'context_forbidden');
  const assigned = modern.contexts.find(context => context.assignmentId === 'a-post-2');
  await identity.activateSelection('session-legacy', 'account-a', { contextId: assigned.contextId, identityModel: 'unified' });
  const ordinary = await loadActor(connection, { ...ref, contextId: assigned.contextId });
  assert.equal(ordinary.role, 'user');
  assert.equal(ordinary.assignment.id, 'a-post-2');
  assert.deepEqual(ordinary.legacyAdminGrantIds, ['grant-a']);
  const { createAuthorizationSession } = require('../src/core/services/authorizationSession');
  async function canVerify(contextId) {
    const session = await createAuthorizationSession(connection, { ...ref, contextId });
    return session.check({ capability: 'audit.verification.verify',
      resource: { type: 'audit.verification', organizationId: 'migration-org', id: 'migration-org' }, businessAllowed: true }).allowed;
  }
  assert.equal(await canVerify(assigned.contextId), true);
  await connection.query(`INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
    VALUES ('a-future-post','membership-a','migration-org','staff','d-migration','i-migration')`);
  const effective = await loadEffectiveAssignmentsForAuthorization(connection, 'migration-org', ['a-post-1', 'a-future-post']);
  assert.deepEqual(effective.map(item => [item.assignment.id, item.legacyAdminGrantIds]), [['a-future-post', []], ['a-post-1', ['grant-a']]]);
  const added = (await identity.listContexts('account-a')).find(context => context.assignmentId === 'a-future-post');
  await identity.activateSelection('session-legacy', 'account-a', { contextId: added.contextId, identityModel: 'unified' });
  assert.equal(await canVerify(added.contextId), true);
  const addedRef = { ...ref, contextId: added.contextId };
  assert.deepEqual(await postVerification(addedRef), { status: 'success', canVerify: true });
  const request = { submissionNumber: 'AUTH-MIGRATED-VERIFY' };
  await connection.query(`INSERT INTO audit_submissions(id,submission_number,submitted_by,title,org_id)
    VALUES ('audit-migrated-verify',?,'hr-a','验签迁移隔离测试','migration-org')`, [request.submissionNumber]);
  assert.equal((await postVerification(addedRef, request)).status, 'success');
  const authorization = require('../src/core/models/authorization');
  const state = await authorization.read(connection, 'migration-org');
  const historical = state.rules.find(rule => rule.sourceKind === 'legacy_verification');
  const superGuard = { authorize: async () => ({ contextId: 'fixture-super', organizationId: 'migration-org' }),
    validateChange: async () => {}, validateReferences: async () => {} };
  const denyVerification = await authorization.saveRule({ expectedRevision: state.revision, name: '拒绝验签测试',
    policy: { ...historical.policy, effect: 'deny', subjects: [{ kind: 'assignments', ids: ['a-future-post'] }] } },
    'migration-org', superGuard);
  assert.deepEqual(await postVerification(addedRef), { status: 'success', canVerify: false });
  assert.equal((await postVerification(addedRef, request)).status, 'forbidden');
  assert.deepEqual(await postVerification({ ...addedRef, organizationId: 'other-org' }), { status: 'success', canVerify: false });
  await authorization.deleteRules({ expectedRevision: (await authorization.read(connection, 'migration-org')).revision,
    rules: [{ id: historical.id, version: historical.version }, { id: denyVerification.id, version: denyVerification.version }] },
  'migration-org', superGuard);
  assert.equal(await canVerify(added.contextId), false);
  assert.equal((await connection.query("SELECT id FROM audit_verification_permissions WHERE id='historical-verify-a'"))[0].length, 0);
  await connection.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261124123000_complete_legacy_audit_verification_roles.sql'), 'utf8'));
  assert.equal(await canVerify(added.contextId), false);
  await connection.query("UPDATE membership_assignments SET status='inactive' WHERE id='a-post-1'");
  assert.deepEqual(await loadEffectiveAssignmentsForAuthorization(connection, 'migration-org', ['a-post-1']), []);
  await connection.query(`INSERT INTO persons(id,name,student_id,normalized_student_id)
      VALUES ('super-person','测试超管','SUPER-MIGRATION','super-migration');
    INSERT INTO accounts(id,person_id) VALUES ('super-account','super-person');
    INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('grant-super','super-person','migration-org','super_admin')`);
  const scopedSuper = (await identity.listContexts('super-account')).find(context => context.organizationId === 'other-org');
  assert.equal(scopedSuper.accountType, 'super_admin');
  assert.equal(scopedSuper.effectiveAssignmentId, superAssignmentId('grant-super', 'other-org'));
  await connection.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
    organization_id,role,token_version,expires_at)
    VALUES ('session-super','super-account','',?,'admin','grant-super','other-org','admin',1,UTC_TIMESTAMP() + INTERVAL 1 DAY)`, [scopedSuper.contextId]);
  const superActor = await loadActor(connection, { accountId: 'super-account', personId: 'super-person',
    sessionId: 'session-super', contextId: scopedSuper.contextId, organizationId: 'other-org' });
  assert.equal(superActor.isSuper, true);
  assert.equal(superActor.assignment.systemRole, 'super_admin');
  assert.equal(superActor.assignment.id, scopedSuper.effectiveAssignmentId);
  console.log('普通身份合并：无岗阻断、固定岗位范围、无差异启用、旧身份切换兼容、增岗不继承、超管跨组织及来源岗位失效检查通过。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
