'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

async function run() {
  // 隔离测试使用临时身份密钥，不读取生产凭据，也不把密钥写入文件。
  if (!process.env.AUTH_IDENTITY_SECRET) process.env.AUTH_IDENTITY_SECRET = crypto.randomBytes(48).toString('hex');
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'authorization_test_' + process.pid + '_' + Date.now();
  const username = 'authz_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  let httpServer;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [username, password]);
    await admin.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, username]);
    await admin.query('USE ??', [database]);
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await admin.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32), version BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (org_id, domain));
      INSERT INTO organizations (id, name) VALUES ('org', '权限测试组织'), ('other', '隔离组织');`);
    const migration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261031160000_unified_authorization.sql'), 'utf8');
    await admin.query(migration);
    await admin.query(migration);
    const descriptionMigration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261110190000_assignment_nature_description.sql'), 'utf8');
    await admin.query(descriptionMigration);
    await admin.query(descriptionMigration);
    const versionMigration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261031173000_authorization_subject_versions.sql'), 'utf8');
    await admin.query(versionMigration);
    await admin.query(versionMigration);
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    await admin.query("INSERT INTO organizations(id,name) VALUES ('dictionary-shadow','旧权限并发测试')");
    const dictionaryDefinition = require('../src/core/models/dictionaryDefinition');
    const concurrentDefinitions = await Promise.all([
      dictionaryDefinition.save('department', { newId: 'dictionary-concurrent-a', name: '并发同名部门', description: '', organizationId: 'dictionary-shadow' }),
      dictionaryDefinition.save('department', { newId: 'dictionary-concurrent-b', name: '并发同名部门', description: '', organizationId: 'dictionary-shadow' })
    ]);
    assert.deepEqual(concurrentDefinitions.map(item => item.status).sort(), ['duplicate', 'success']);
    const [[concurrentCount]] = await admin.query("SELECT COUNT(*) AS count FROM departments WHERE org_id='dictionary-shadow' AND name='并发同名部门'");
    assert.equal(Number(concurrentCount.count), 1);
    const concurrentExisting = await Promise.all([
      dictionaryDefinition.save('identity', { newId: 'dictionary-identity-a', name: '并发身份甲', description: '', organizationId: 'dictionary-shadow' }),
      dictionaryDefinition.save('identity', { newId: 'dictionary-identity-b', name: '并发身份乙', description: '', organizationId: 'dictionary-shadow' })
    ]);
    assert(concurrentExisting.every(item => item.status === 'success'));
    const model = require('../src/core/models/authorization');
    const actor = { contextId: 'context', organizationId: 'org' };
    const guard = { authorize: async () => actor, validateChange: async () => {}, validateReferences: async () => {} };
    const state = async () => model.read(admin, 'org');
    await pool.withTransaction(connection => model.lockOrganization(connection, 'org'));
    const initialRevision = (await state()).revision;
    const blank = { effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['job'] }],
      capabilities: ['venue.bookings.read'], scopes: [{ kind: 'organization' }], fields: null };
    const saved = await model.saveRule({ name: '读取借用', policy: blank, expectedRevision: (await state()).revision }, 'org', guard);
    assert.equal(saved.version, 1);
    assert.equal((await state()).rules[0].policy.capabilities[0], 'venue.bookings.read');
    assert.equal((await state()).mode, 'shadow');
    assert.equal((await state()).revision, initialRevision + 1);
    const updated = await model.saveRule({ id: saved.id, name: '读取范围', version: 1, policy: blank, expectedRevision: initialRevision + 1 }, 'org', guard);
    assert.equal(updated.version, 2);
    await assert.rejects(model.saveRule({ id: saved.id, name: '过期编辑', version: 1, policy: blank, expectedRevision: initialRevision + 1 }, 'org', guard),
      error => error.code === 'authorization_conflict');
    assert.equal((await state()).rules[0].name, '读取范围');
    await assert.rejects(model.saveRule({ name: '无权创建', policy: blank, expectedRevision: initialRevision + 2 }, 'org', {
      ...guard, authorize: async () => { throw Error('denied'); }
    }), /denied/);
    await assert.rejects(model.saveRule({ name: '失效岗位', policy: blank, expectedRevision: initialRevision + 2 }, 'org', {
      ...guard, validateReferences: async () => { throw Error('stale_reference'); }
    }), /stale_reference/);
    assert.equal((await state()).rules.length, 1);
    assert.equal((await state()).revision, initialRevision + 2);
    const scheme = await model.saveScheme({ name: '借用查看', capabilities: ['venue.bookings.read'] }, 'org', guard);
    const published = await model.publishScheme({ id: scheme.id, version: scheme.version, expectedRevision: (await state()).revision }, 'org', guard);
    assert.equal(published.publishedVersion, 1);
    const frontendEditor = require('../../shared/authorizationEditor');
    const frontendCopy = require('../../shared/locales/zh-CN/authorization');
    const identityDraft = frontendEditor.createDraft();
    identityDraft.policy = JSON.parse(JSON.stringify(blank));
    identityDraft.schemeId = scheme.id;
    const identityInput = frontendEditor.request(frontendEditor.prepareSimpleDraft(identityDraft, await model.listSchemes(admin, 'org'), frontendCopy),
      (await state()).revision, [{ key: 'venue.bookings.read', scopes: ['organization'], fields: [] }]);
    const bound = await model.saveRule(identityInput, 'org', guard);
    assert.equal(bound.schemeId, scheme.id);
    const reopenedIdentity = (await state()).rules.find(rule => rule.id === bound.id);
    assert.equal(reopenedIdentity.name, frontendCopy.identityGrantName(scheme.name));
    assert.deepEqual(reopenedIdentity.policy.subjects, identityInput.policy.subjects);
    assert.deepEqual(reopenedIdentity.policy.scopes, identityInput.policy.scopes);
    assert.equal(frontendEditor.canSimplify(frontendEditor.createDraft(reopenedIdentity)), true);
    const draft = await model.saveScheme({ id: scheme.id, version: published.version, name: '借用操作',
      capabilities: ['venue.bookings.read', 'venue.bookings.create'] }, 'org', guard);
    const schemeDirectory = await model.listSchemes(admin, 'org');
    const listedScheme = schemeDirectory.find(item => item.id === scheme.id);
    assert.deepEqual(listedScheme.publishedCapabilities, ['venue.bookings.read']);
    assert.deepEqual(listedScheme.capabilities, ['venue.bookings.create', 'venue.bookings.read']);
    assert.deepEqual((await state()).rules.find(rule => rule.id === bound.id).policy.capabilities, ['venue.bookings.read']);
    const beforePublishPreview = await state();
    const schemePreview = await model.previewScheme({ id: scheme.id, version: draft.version,
      expectedRevision: beforePublishPreview.revision }, 'org', guard);
    assert.equal(schemePreview.rules.length, 1);
    assert.deepEqual(schemePreview.rules[0].before.capabilities, ['venue.bookings.read']);
    assert.deepEqual(schemePreview.rules[0].after.capabilities, ['venue.bookings.create', 'venue.bookings.read']);
    assert.deepEqual(await state(), beforePublishPreview);
    const nextPublish = await model.publishScheme({ id: scheme.id, version: draft.version, expectedRevision: (await state()).revision }, 'org', guard);
    assert.equal(nextPublish.affectedRules, 1);
    assert.deepEqual((await state()).rules.find(rule => rule.id === bound.id).policy.capabilities, ['venue.bookings.create', 'venue.bookings.read']);
    const restored = await model.publishScheme({ id: scheme.id, version: nextPublish.version, restoreVersion: 1,
      expectedRevision: (await state()).revision }, 'org', guard);
    assert.equal(restored.publishedVersion, 3);
    assert.deepEqual((await state()).rules.find(rule => rule.id === bound.id).policy.capabilities, ['venue.bookings.read']);
    const [versions] = await admin.query('SELECT version FROM authorization_scheme_versions WHERE scheme_id = ? ORDER BY version', [scheme.id]);
    assert.deepEqual(versions.map(row => row.version), [1, 2, 3]);
    const history = await model.schemeVersions({ id: scheme.id }, 'org', guard);
    assert.deepEqual(history.versions.map(row => row.version), [3, 2, 1]);
    assert(history.versions.every(row => /^\d{4}-.+Z$/.test(row.publishedAt)));
    const beforeRejected = await state();
    await assert.rejects(model.deleteRules({ expectedRevision: beforeRejected.revision,
      rules: [{ id: updated.id, version: 2 }, { id: bound.id, version: 999 }] }, 'org', guard),
    error => error.code === 'authorization_conflict');
    assert.deepEqual(await state(), beforeRejected);
    const guarded = { ...guard, validateChange: async (_connection, before) => {
      if (before && before.id === bound.id) throw Error('outside_delegation');
    } };
    await assert.rejects(model.deleteRules({ expectedRevision: beforeRejected.revision,
      rules: beforeRejected.rules.map(rule => ({ id: rule.id, version: rule.version })) }, 'org', guarded), /outside_delegation/);
    assert.deepEqual(await state(), beforeRejected);
    const [auditBefore] = await admin.query('SELECT COUNT(*) AS count FROM authorization_changes');
    await assert.rejects(model.saveRule({ name: '跨组织', policy: blank, expectedRevision: (await model.read(admin, 'other')).revision }, 'other', guard),
      error => error.code === 'authorization_actor_missing');
    assert.equal((await model.read(admin, 'other')).rules.length, 0);
    async function checkAudienceCopies() {
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261018230000_hr_contact_directory.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261019210000_unified_calendar.sql'), 'utf8'));
    await admin.query("INSERT INTO departments(id,name,org_id) VALUES ('target-department','目标部门','other')");
    const audience = JSON.stringify([{ type: 'scope', departmentIds: ['department'] }]);
    const targets = JSON.stringify([{ type: 'self' }]);
    await admin.query(`INSERT INTO hr_contact_directory_rules(id,org_id,name,audience_json,targets_json,field_ids_json)
      VALUES ('directory-copy','org','复制通讯录规则',?,?,'[]')`, [audience, targets]);
    await admin.query(`INSERT INTO calendar_rules(id,org_id,name,audience_json,targets_json,actions_json)
      VALUES ('calendar-copy','org','复制日程规则',?,?,'["assign","update"]')`, [audience, targets]);
    for (const [kind, sourceId, table] of [['hr.directoryRules', 'directory-copy', 'hr_contact_directory_rules'],
      ['calendar.rules', 'calendar-copy', 'calendar_rules']]) {
      const offered = await configCopy.share({ kind, sourceRecordId: sourceId, targetOrganizationId: 'other' }, reference);
      const received = await configCopy.receive({ shareId: offered.id, shareVersion: 1, requestId: sourceId }, copyTarget);
      const detail = await configCopy.detail({ id: received.id }, copyTarget);
      assert.equal(detail.payload.rule.enabled, false);
      assert.equal(detail.payload.references.length, 1);
      assert.equal(detail.payload.references[0].kind, 'departmentIds');
      assert.deepEqual(detail.payload.rule.audience[0].departmentIds, ['ref-1']);
      await assert.rejects(configCopy.apply({ id: received.id, version: 1, references: {} }, copyTarget), error => error.code === 'config_copy_reference');
      await assert.rejects(configCopy.apply({ id: received.id, version: 1, references: { 'ref-1': 'department' } }, copyTarget), error => error.code === 'config_copy_reference');
      const applied = await configCopy.apply({ id: received.id, version: 1, references: { 'ref-1': 'target-department' } }, copyTarget);
      const stored = (await admin.query(`SELECT * FROM ${table} WHERE org_id=? AND id=?`, ['other', applied.resultId]))[0][0];
      assert.equal(stored.enabled, 0);
      const storedAudience = typeof stored.audience_json === 'string' ? JSON.parse(stored.audience_json) : stored.audience_json;
      assert.deepEqual(storedAudience[0].departmentIds, ['target-department']);
      assert.equal((await configCopy.detail({ id: received.id }, copyTarget)).state, 'applied');
    }
    }
    const [auditAfter] = await admin.query('SELECT COUNT(*) AS count FROM authorization_changes');
    assert.equal(auditAfter[0].count, auditBefore[0].count);
    const count = await model.deleteRules({ expectedRevision: beforeRejected.revision,
      rules: beforeRejected.rules.map(rule => ({ id: rule.id, version: rule.version })) }, 'org', guard);
    assert.equal(count.count, 2);
    assert.equal((await state()).rules.length, 0);
    const [cache] = await admin.query("SELECT version FROM cache_domain_versions WHERE org_id = 'org' AND domain = 'directory'");
    assert(cache[0].version > 1);
    const { loadActor } = require('../src/core/models/authorizationIdentity');
    await admin.query("INSERT INTO persons(id, name, student_id, normalized_student_id) VALUES ('person','权限测试人员','fixture','fixture')");
    await admin.query("INSERT INTO accounts(id, person_id) VALUES ('account','person')");
    await admin.query("INSERT INTO hr_info(id, name, student_id, org_id) VALUES ('hr','权限测试人员','fixture','org')");
    await admin.query("INSERT INTO organization_memberships(id, person_id, org_id, legacy_hr_id) VALUES ('membership','person','org','hr')");
    await admin.query("INSERT INTO departments(id,name,org_id) VALUES ('department','测试部门','org')");
    await admin.query("INSERT INTO identities(id,name,org_id) VALUES ('identity','测试类别','org')");
    await admin.query(`INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
      VALUES ('assignment','membership','org','staff','department','identity')`);
    await admin.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
      organization_id,role,token_version,expires_at)
      VALUES ('session','account','','context','assignment','assignment','org','user',1,UTC_TIMESTAMP() + INTERVAL 1 DAY)`);
    const reference = { accountId: 'account', personId: 'person', sessionId: 'session', contextId: 'context', organizationId: 'org' };
    const current = await loadActor(admin, reference);
    assert.equal(current.assignment.id, 'assignment');
    assert.equal(current.assignment.natureId, 'staff');
    assert.equal(current.isSuper, false);
    const beforeDictionaryChange = await state();
    const otherBeforeDictionaryChange = await model.read(admin, 'other');
    await admin.query("UPDATE departments SET name='改名部门' WHERE id='department'");
    assert.equal((await state()).revision, beforeDictionaryChange.revision + 1);
    assert.equal((await model.read(admin, 'other')).revision, otherBeforeDictionaryChange.revision);
    await admin.beginTransaction();
    await admin.query("UPDATE membership_assignments SET status='inactive' WHERE id='assignment'");
    assert.equal((await state()).revision, beforeDictionaryChange.revision + 2);
    await admin.rollback();
    assert.equal((await state()).revision, beforeDictionaryChange.revision + 1);
    await admin.query("UPDATE departments SET name='测试部门' WHERE id='department'");
    await admin.query("UPDATE auth_sessions SET context_type='membership', context_subject_id='membership' WHERE id='session'");
    assert.equal(await loadActor(admin, reference), null);
    await admin.query("UPDATE membership_assignments SET status='inactive' WHERE id='assignment'");
    assert.equal((await loadActor(admin, reference)).assignment, null);
    await admin.query("UPDATE membership_assignments SET status='active' WHERE id='assignment'");
    await admin.query("UPDATE auth_sessions SET context_type='assignment', context_subject_id='assignment' WHERE id='session'");
    assert.equal(await loadActor(admin, { ...reference, organizationId: 'other' }), null);
    assert.equal(await loadActor(admin, { ...reference, contextId: 'old-context' }), null);
    await admin.query("UPDATE accounts SET status='frozen' WHERE id='account'");
    assert.equal(await loadActor(admin, reference), null);
    await admin.query("UPDATE accounts SET status='verified' WHERE id='account'");
    await admin.query("UPDATE membership_assignments SET status='inactive' WHERE id='assignment'");
    assert.equal(await loadActor(admin, reference), null);
    await admin.query("UPDATE membership_assignments SET status='active' WHERE id='assignment'");
    await admin.query("UPDATE organization_memberships SET status='left' WHERE id='membership'");
    assert.equal(await loadActor(admin, reference), null);
    await admin.query("UPDATE organization_memberships SET status='active' WHERE id='membership'");
    await admin.query("INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('grant','person','','super_admin')");
    await admin.query("UPDATE auth_sessions SET context_type='admin', context_subject_id='grant', role='admin' WHERE id='session'");
    assert.equal((await loadActor(admin, reference)).isSuper, true);
    await admin.query("UPDATE admin_grants SET status='inactive' WHERE id='grant'");
    assert.equal(await loadActor(admin, reference), null);
    const { validateReferences } = require('../src/core/models/authorizationReferences');
    const { normalizePolicy } = require('../src/core/services/authorizationPolicy');
    const { CATALOG } = require('../src/core/services/authorizationCatalog');
    const scoped = normalizePolicy({ ...blank, id: 'references', organizationId: 'org',
      subjects: [{ kind: 'assignments', ids: ['assignment'] }],
      scopes: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'], departmentId: ['department'] } }] }, CATALOG);
    await pool.withTransaction(connection => validateReferences(connection, scoped));
    await assert.rejects(pool.withTransaction(connection => validateReferences(connection, {
      ...scoped, subjects: [{ kind: 'assignments', ids: ['nonexistent'] }]
    })), error => error.code === 'authorization_stale_reference');
    await assert.rejects(pool.withTransaction(connection => validateReferences(connection, {
      ...scoped, scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['nonexistent'] } }]
    })), error => error.code === 'authorization_stale_reference');
    await assert.rejects(pool.withTransaction(connection => validateReferences(connection, {
      ...scoped, organizationId: 'other'
    })), error => error.code === 'authorization_stale_reference');
    await assert.rejects(pool.withTransaction(connection => validateReferences(connection, {
      ...scoped, subjects: [{ kind: 'adminGrants', ids: ['grant'] }]
    })), error => error.code === 'authorization_stale_reference');
    const { createGuard, readManagement, readCandidates } = require('../src/core/services/authorizationManagement');
    await admin.query("UPDATE admin_grants SET status='active' WHERE id='grant'");
    const realGuard = createGuard(reference);
    const realRule = await model.saveRule({ name: '真实会话授权', policy: scoped, expectedRevision: (await state()).revision }, 'org', realGuard);
    assert((await readManagement(admin, reference)).rules.some(rule => rule.id === realRule.id));
    await admin.query("INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('regular','person','org','admin')");
    await admin.query(`INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
      VALUES ('second-assignment','membership','org','liaison','department','identity')`);
    const superCandidates = await readCandidates(admin, reference);
    assert.equal(superCandidates.assignments.length, 2);
    assert.equal(superCandidates.adminGrants.length, 1);
    assert.deepEqual(Object.keys(superCandidates.assignments[0]).sort(), ['assignmentId', 'personId', 'name',
      'natureId', 'natureName', 'departmentId', 'departmentName', 'identityCategoryId', 'identityCategoryName',
      'workGroupId', 'workGroupName'].sort());
    assert(!JSON.stringify(superCandidates).includes('fixture'));
    const delegationInput = { name: '借用读取权限分配', enabled: true,
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }], envelope: { ...scoped, scopes: [{ kind: 'organization' }] },
      expectedRevision: (await state()).revision };
    const beforeDelegationPreview = await state();
    const delegationPreview = await model.previewDelegation(delegationInput, 'org', createGuard(reference));
    assert.deepEqual(await state(), beforeDelegationPreview);
    assert.equal(delegationPreview.impact.peopleCount, 1);
    assert.deepEqual(delegationPreview.impact.roles.map(row => row.subjectId), ['regular']);
    const delegation = await model.saveDelegation(delegationInput, 'org', createGuard(reference));
    const storedDelegation = (await model.listDelegations(admin, 'org')).find(row => row.id === delegation.id);
    assert.deepEqual(storedDelegation.envelope.capabilities, delegationPreview.delegation.envelope.capabilities);
    const deletionInput = { id: delegation.id, version: delegation.version, expectedRevision: (await state()).revision };
    const delegationDeletionPreview = await model.previewDelegationDeletion(deletionInput, 'org', createGuard(reference));
    assert.equal(delegationDeletionPreview.impact.roles[0].after, null);
    assert.equal((await model.listDelegations(admin, 'org')).length, 1);
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    await assert.rejects(model.previewDelegationDeletion(deletionInput, 'org', createGuard(reference)),
      error => error.code === 'authorization_forbidden');
    const delegatedCandidates = await readCandidates(admin, reference);
    assert.deepEqual(delegatedCandidates.assignments.map(item => item.assignmentId), ['assignment']);
    assert.deepEqual(delegatedCandidates.adminGrants, []);
    const delegatedRule = await model.saveRule({ name: '委托内授权', policy: scoped, expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    const { countAuthorizationUsage } = require('../src/core/services/dictionaryUsage');
    assert.equal(await countAuthorizationUsage('department', 'department', 'org', admin), 2);
    assert.equal(await countAuthorizationUsage('department', 'department', 'other', admin), 0);
    assert.equal(await countAuthorizationUsage('department', 'depart', 'org', admin), 0);
    const beforeEscalation = await state();
    await assert.rejects(model.saveRule({ name: '超出委托', policy: { ...scoped, capabilities: ['venue.bookings.delete'] },
      expectedRevision: beforeEscalation.revision }, 'org', createGuard(reference)), error => error.code === 'authorization_forbidden');
    await assert.rejects(model.saveDelegation({ name: '转授权', enabled: true,
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }], envelope: scoped,
      expectedRevision: beforeEscalation.revision }, 'org', createGuard(reference)), error => error.code === 'authorization_forbidden');
    assert.deepEqual(await state(), beforeEscalation);
    // 进入事务时看过旧委托，其他连接撤销后，保存草稿也必须复核最新事实。
    const staleDelegationGuard = createGuard(reference);
    const originalAuthorize = staleDelegationGuard.authorize;
    staleDelegationGuard.authorize = async connection => {
      await connection.query('SELECT enabled FROM authorization_delegations WHERE id = ?', [delegation.id]);
      await admin.query('UPDATE authorization_delegations SET enabled = 0 WHERE id = ?', [delegation.id]);
      return originalAuthorize(connection);
    };
    const [schemesBeforeRevocation] = await admin.query('SELECT COUNT(*) AS count FROM authorization_schemes');
    await assert.rejects(model.saveScheme({ name: '旧事务不得继续分配', capabilities: scoped.capabilities },
      'org', staleDelegationGuard), error => error.code === 'authorization_forbidden');
    const [schemesAfterRevocation] = await admin.query('SELECT COUNT(*) AS count FROM authorization_schemes');
    assert.equal(schemesAfterRevocation[0].count, schemesBeforeRevocation[0].count);
    await admin.query('UPDATE authorization_delegations SET enabled = 1 WHERE id = ?', [delegation.id]);
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    await model.deleteDelegation({ id: delegation.id, version: delegation.version, expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    await assert.rejects(readCandidates(admin, reference), error => error.code === 'authorization_forbidden');
    await assert.rejects(model.saveRule({ id: delegatedRule.id, name: '撤权后保存', version: delegatedRule.version,
      policy: scoped, expectedRevision: (await state()).revision }, 'org', createGuard(reference)), error => error.code === 'authorization_forbidden');
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    const natures = require('../src/core/models/assignmentNature');
    const natureGuard = connection => createGuard(reference).authorize(connection);
    const organizations = require('../src/core/models/organization');
    await organizations.create('new-organization', '新建组织字典验证');
    assert.deepEqual((await natures.list(admin, 'new-organization')).map(row => row.id).sort(), ['liaison', 'other', 'staff']);
    const assignmentModel = require('../src/core/models/unifiedIdentity');
    const usedNature = await natures.save({ name: '专项工作岗位' }, 'org', natureGuard);
    const assignmentInput = { id: 'assignment', legacyHrId: 'hr', organizationId: 'org',
      assignmentKind: usedNature.id, departmentId: 'department', identityId: 'identity', workGroupId: '' };
    await assignmentModel.saveMembershipAssignment(assignmentInput, { personId: 'person', contextId: 'context' }, natureGuard);
    const [assignedNature] = await admin.query("SELECT assignment_kind FROM membership_assignments WHERE id='assignment'");
    assert.equal(assignedNature[0].assignment_kind, usedNature.id);
    const summaries = await assignmentModel.listMembershipAssignmentSummaries(['hr'], 'org');
    assert.equal(summaries.get('hr').assignments.find(item => item.assignmentId === 'assignment').assignmentNatureLabel, '专项工作岗位');
    const workRoles = await assignmentModel.listContexts('account', admin);
    const assignmentRole = workRoles.find(item => item.assignmentId === 'assignment');
    assert(assignmentRole, '有效岗位必须保留工作角色入口');
    assert.equal(assignmentRole.assignmentNature, usedNature.id);
    assert.equal(assignmentRole.assignmentNatureLabel, '专项工作岗位');
    const personOverview = require('../src/core/models/personIdentityOverview');
    const identityDetails = await personOverview.listPersonIdentityData('hr', ['org'], ['org']);
    assert.equal(identityDetails.assignments.find(item => item.id === 'assignment').assignment_nature_name, '专项工作岗位');
    assert(identityDetails.dictionaries.assignmentNatures.some(item => item.id === usedNature.id));
    await assert.rejects(assignmentModel.saveMembershipAssignment({ ...assignmentInput, assignmentKind: 'not-in-dictionary' },
      { personId: 'person', contextId: 'context' }, natureGuard), error => error.code === 'assignment_nature_invalid');
    await assignmentModel.saveMembershipAssignment({ ...assignmentInput, assignmentKind: 'staff' },
      { personId: 'person', contextId: 'context' }, natureGuard);
    await assert.rejects(natures.remove(usedNature, 'org', natureGuard), error => error.code === 'assignment_nature_in_use');
    const addedNature = await natures.save({ name: '院会任职' }, 'org', natureGuard);
    assert.equal((await natures.resolve(admin, 'org', addedNature.id)).name, '院会任职');
    assert((await natures.list(admin, 'org')).some(row => row.id === addedNature.id));
    await assert.rejects(natures.resolve(admin, 'other', addedNature.id), error => error.code === 'assignment_nature_invalid');
    await assert.rejects(natures.save({ name: '院会任职' }, 'org', natureGuard), error => error.code === 'assignment_nature_duplicate');
    const renamedNature = await natures.save({ ...addedNature, name: '学院学生会任职' }, 'org', natureGuard);
    assert.equal(renamedNature.version, 2);
    const natureRule = await model.saveRule({ name: '院会岗位授权', policy: { ...scoped,
      scopes: [{ kind: 'assignmentScope', dimensions: { natureId: [addedNature.id] } }] },
      expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await assert.rejects(natures.remove(renamedNature, 'org', natureGuard), error => error.code === 'assignment_nature_in_use');
    await model.deleteRules({ expectedRevision: (await state()).revision, rules: [{ id: natureRule.id, version: natureRule.version }] }, 'org', createGuard(reference));
    await natures.remove(renamedNature, 'org', natureGuard);
    await assert.rejects(natures.resolve(admin, 'org', addedNature.id), error => error.code === 'assignment_nature_invalid');
    await assert.rejects(natures.remove({ id: 'staff', version: 1 }, 'org', natureGuard), error => error.code === 'assignment_nature_legacy_required');
    const express = require('express');
    const app = express();
    app.use(express.json());
    let purposeUserFixture = false;
    // HTTP 测试只注入已建好的隔离会话；路由仍会查询真实账号、会话和岗位，不冒充登录测试。
    app.use((req, _res, next) => {
      if (req.headers['x-fixture-guest'] !== '1') {
        req.authAccount = { id: 'account', personId: 'person' };
        req.authContext = { personId: 'person', contextId: 'context', organizationId: 'org', role: 'admin' };
        req.authSession = { id: 'session' };
        if (purposeUserFixture) req.authContext.role = 'user';
        if (req.headers['x-fixture-target'] === '1') {
          req.authContext = { personId: 'person', contextId: 'target-context', organizationId: 'other', role: 'admin' };
          req.authSession = { id: 'target-session' };
        }
      }
      next();
    });
    app.use('/api', require('../src/core/routes/authorization'));
    app.use('/api', require('../src/middleware/adminPermission').adminPermissionMiddleware);
    app.use('/api', require('../src/modules/venue/routes/venueAdmin'));
    app.use('/api', require('../src/core/routes/departments'));
    app.use('/api', require('../src/core/routes/identities'));
    app.use('/api', require('../src/core/routes/workGroups'));
    app.use('/api', require('../src/modules/scoring/routes/templates'));
    app.use('/api', require('../src/modules/scoring/routes/activities'));
    app.use('/api', async (req, _res, next) => {
      if (['/getSystemConfig', '/saveSystemConfig'].includes(req.path)) {
        const actor = await loadActor(pool, reference);
        req.admin = actor && actor.role === 'admin' ? { admin_level: actor.isSuper ? 'super_admin' : 'admin',
          org_id: actor.isSuper ? '' : actor.organizationId } : null;
      }
      next();
    });
    app.use('/api', require('../src/core/routes/system'));
    httpServer = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    const baseUrl = 'http://127.0.0.1:' + httpServer.address().port + '/api/';
    const post = (route, body, guest = false, target = false) => fetch(baseUrl + route, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-fixture-guest': guest ? '1' : '0',
        'x-fixture-target': target ? '1' : '0' }, body: JSON.stringify(body) });
    assert.equal((await post('getAuthorizationManagement', {}, true)).status, 401);
    assert.equal((await post('getAuthorizationCandidates', {}, true)).status, 401);
    assert.equal((await post('getEffectiveAuthorization', {}, true)).status, 401);
    assert.equal((await post('saveAssignmentNature', { name: '未登录性质' }, true)).status, 401);
    const natureCreated = await (await post('saveAssignmentNature', { name: 'HTTP岗位性质', description: '面向专项工作\n支持多行说明😀' })).json();
    assert.equal(natureCreated.status, 'success');
    const natureUpdated = await (await post('saveAssignmentNature', { ...natureCreated.nature, name: 'HTTP岗位性质改名' })).json();
    assert.equal(natureUpdated.nature.version, 2);
    const natureDirectory = await (await post('listAssignmentNatures', {})).json();
    assert.equal(natureDirectory.list.find(item => item.id === natureCreated.nature.id).name, 'HTTP岗位性质改名');
    assert.equal(natureDirectory.list.find(item => item.id === natureCreated.nature.id).description, '面向专项工作\n支持多行说明😀');
    const legacyNatureUpdate = await (await post('saveAssignmentNature', { id: natureCreated.nature.id, name: 'HTTP岗位性质改名', version: 2 })).json();
    assert.equal(legacyNatureUpdate.nature.description, natureCreated.nature.description);
    assert.equal((await admin.query('SELECT description FROM assignment_natures WHERE org_id=? AND id=?', ['org', natureCreated.nature.id]))[0][0].description, natureCreated.nature.description);
    const clearedNature = await (await post('saveAssignmentNature', { ...legacyNatureUpdate.nature, description: '' })).json();
    assert.equal(clearedNature.status, 'success');
    assert.equal((await admin.query('SELECT description FROM assignment_natures WHERE org_id=? AND id=?', ['org', natureCreated.nature.id]))[0][0].description, '');
    assert.equal((await post('saveAssignmentNature', { name: '超长描述', description: '😀'.repeat(2001) })).status, 400);
    assert.equal((await post('saveAssignmentNature', { name: '非法描述', description: null })).status, 400);
    const maxDescriptionNature = await (await post('saveAssignmentNature', { name: '描述边界', description: '😀'.repeat(2000) })).json();
    assert.equal(maxDescriptionNature.status, 'success');
    assert.equal(natureDirectory.list.find(item => item.id === 'staff').deleteRestrictionCode, 'legacy_required');
    assert.equal((await post('deleteAssignmentNature', { id: 'staff', version: 1 })).status, 409);
    assert.equal((await post('saveAssignmentNature', { ...natureCreated.nature, name: '旧版本' })).status, 409);
    assert.equal((await post('saveAssignmentNature', { name: 'HTTP岗位性质改名' })).status, 409);
    const superExplanation = await (await post('getEffectiveAuthorization', {})).json();
    assert.equal(superExplanation.mode, 'shadow');
    assert.equal(superExplanation.role, 'admin');
    assert(superExplanation.capabilities.every(item => item.status === 'business_check_required'));
    const jobExplanation = await (await post('getEffectiveAuthorization', { role: 'user', subjectId: 'assignment' })).json();
    assert.equal(jobExplanation.subjectId, 'assignment');
    assert.equal(jobExplanation.accountAvailable, true);
    assert(!JSON.stringify(jobExplanation).includes('student'));
    assert.equal((await post('getEffectiveAuthorization', { role: 'user', subjectId: 'missing' })).status, 403);
    const candidateResponse = await (await post('getAuthorizationCandidates', {})).json();
    assert.equal(candidateResponse.assignments.length, 2);
    assert(!JSON.stringify(candidateResponse).includes('student'));
    const inspectionCandidates = await (await post('getAuthorizationCandidates', { purpose: 'inspection' })).json();
    assert.equal(inspectionCandidates.assignments.length, 2);
    assert(inspectionCandidates.adminGrants.some(item => item.adminGrantId === 'grant'));
    assert(!JSON.stringify(inspectionCandidates).includes('personId'));
    assert.equal((await post('getAuthorizationCandidates', { purpose: 'unknown' })).status, 400);
    const page = await (await post('getAuthorizationManagement', {})).json();
    assert.equal(page.status, 'success');
    const beforePreview = await state();
    const previewResponse = await post('previewAuthorizationRule', { name: 'HTTP保存回读', policy: scoped, expectedRevision: page.revision });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.impact.peopleCount, 1);
    assert.equal(preview.impact.roleCount, 1);
    assert.equal(preview.impact.roles[0].subjectId, 'assignment');
    assert.deepEqual(await state(), beforePreview);
    assert.equal((await post('previewAuthorizationRule', { name: 'HTTP保存回读', policy: scoped,
      expectedRevision: page.revision - 1 })).status, 409);
    const response = await post('saveAuthorizationRule', { name: 'HTTP保存回读', policy: scoped, expectedRevision: page.revision });
    assert.equal(response.status, 200);
    const httpRule = (await response.json()).rule;
    const reopened = await (await post('getAuthorizationManagement', {})).json();
    assert.equal(reopened.rules.find(rule => rule.id === httpRule.id).name, 'HTTP保存回读');
    const [persisted] = await admin.query('SELECT name, version FROM authorization_rules WHERE org_id=? AND id=?', ['org', httpRule.id]);
    assert.equal(persisted[0].name, 'HTTP保存回读');
    assert.equal((await post('saveAuthorizationRule', { name: '', policy: scoped, expectedRevision: reopened.revision })).status, 400);
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    assert.equal((await post('saveAssignmentNature', { name: '越权性质' })).status, 403);
    assert.equal((await post('listAssignmentNatures', {})).status, 403);
    assert.equal((await post('deleteAssignmentNature', natureUpdated.nature)).status, 403);
    assert.equal((await post('getEffectiveAuthorization', { role: 'user', subjectId: 'assignment' })).status, 403);
    assert.equal((await post('getEffectiveAuthorization', {})).status, 200);
    const noInspectionCandidates = await (await post('getAuthorizationCandidates', { purpose: 'inspection' })).json();
    assert.deepEqual(noInspectionCandidates.assignments, []);
    assert.deepEqual(noInspectionCandidates.adminGrants, []);
    assert.equal((await post('previewAuthorizationRule', { name: '越权预览', policy: scoped, expectedRevision: reopened.revision })).status, 403);
    assert.equal((await post('saveAuthorizationRule', { name: '越权HTTP', policy: scoped, expectedRevision: reopened.revision })).status, 403);
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    const beforeDeletePreview = await state();
    const deletionPreview = await (await post('previewAuthorizationRuleDeletion', { expectedRevision: reopened.revision,
      rules: [{ id: httpRule.id, version: httpRule.version }] })).json();
    assert.equal(deletionPreview.peopleCount, 1);
    assert.equal(deletionPreview.rules[0].name, 'HTTP保存回读');
    assert.equal(deletionPreview.rules[0].impact.after, null);
    assert.deepEqual(await state(), beforeDeletePreview);
    assert.equal((await post('previewAuthorizationRuleDeletion', { expectedRevision: reopened.revision, rules: [null] })).status, 400);
    const deleteResponse = await post('deleteAuthorizationRules', { expectedRevision: reopened.revision, rules: [{ id: httpRule.id, version: httpRule.version }] });
    assert.equal(deleteResponse.status, 200);
    assert(!(await (await post('getAuthorizationManagement', {})).json()).rules.some(rule => rule.id === httpRule.id));
    assert.equal((await post('deleteAssignmentNature', clearedNature.nature)).status, 200);
    assert(!(await (await post('listAssignmentNatures', {})).json()).list.some(item => item.id === natureCreated.nature.id));
    const inspectionPolicy = { ...scoped, capabilities: ['authorization.effective.read'],
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }], scopes: [{ kind: 'records', ids: ['assignment'] }] };
    const inspectionRule = await model.saveRule({ name: '只查询指定工作角色', policy: inspectionPolicy,
      expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    const scopedCandidates = await (await post('getAuthorizationCandidates', { purpose: 'inspection' })).json();
    const inspectionOnlyPage = await (await post('getAuthorizationManagement', {})).json();
    assert.equal(inspectionOnlyPage.canManage, false);
    assert.deepEqual(inspectionOnlyPage.rules, []);
    assert.deepEqual(inspectionOnlyPage.schemes, []);
    assert.equal((await post('getAuthorizationCandidates', {})).status, 403);
    assert.deepEqual(scopedCandidates.assignments.map(item => item.assignmentId), ['assignment']);
    assert.deepEqual(scopedCandidates.adminGrants, []);
    const excludedAssignment = inspectionCandidates.assignments.find(item => item.assignmentId !== 'assignment');
    assert.equal((await post('getEffectiveAuthorization', { role: 'user', subjectId: excludedAssignment.assignmentId })).status, 403);
    assert.equal((await post('getEffectiveAuthorization', { role: 'user', subjectId: 'assignment' })).status, 200);
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    await model.saveRule({ ...inspectionRule, policy: { ...inspectionRule.policy, enabled: false },
      expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    assert.equal((await post('getEffectiveAuthorization', { role: 'user', subjectId: 'assignment' })).status, 403);
    assert.deepEqual((await (await post('getAuthorizationCandidates', { purpose: 'inspection' })).json()).assignments, []);
    await admin.query("UPDATE auth_sessions SET context_type='assignment', context_subject_id='assignment', role='user' WHERE id='session'");
    const memberExplanation = await (await post('getEffectiveAuthorization', {})).json();
    assert.equal(memberExplanation.role, 'user');
    assert.equal(memberExplanation.subjectId, 'assignment');
    assert.equal((await post('getEffectiveAuthorization', { role: 'admin', subjectId: 'regular' })).status, 403);
    await admin.query("UPDATE auth_sessions SET context_type='admin', context_subject_id='grant', role='admin' WHERE id='session'");
    const scopedNature = await (await post('saveAssignmentNature', { name: '指定范围性质' })).json();
    const naturePolicy = { ...scoped, capabilities: ['hr.assignmentNatures.read', 'hr.assignmentNatures.update'],
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }], scopes: [{ kind: 'records', ids: [scopedNature.nature.id] }] };
    const natureAuthorization = await model.saveRule({ name: '仅维护一个性质', policy: naturePolicy,
      expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
    const systemSaved = await (await post('saveSystemConfig', { timezone: 9, currentOrganization: 'other' })).json();
    assert.equal(systemSaved.status, 'success');
    const systemRead = await (await post('getSystemConfig', {})).json();
    assert.equal(systemRead.config.timezone, 9);
    assert.equal(systemRead.config.currentOrganization, 'other');
    assert.equal((await admin.query("SELECT timezone FROM system_config WHERE id='default'"))[0][0].timezone, 9);
    assert.equal((await post('saveSystemConfig', { timezone: 10, currentOrganization: 'missing' })).status, 403);
    assert.equal((await admin.query("SELECT timezone FROM system_config WHERE id='default'"))[0][0].timezone, 9);
    const systemRule = await model.saveRule({ name: '仅修改显示时区', policy: { ...blank,
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }], capabilities: ['system.settings.read', 'system.settings.update'],
      fields: ['timezone'] }, expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    assert.equal((await (await post('saveSystemConfig', { timezone: 8 })).json()).status, 'success');
    const limitedSystem = await (await post('getSystemConfig', {})).json();
    assert.equal(limitedSystem.config.timezone, 8);
    assert.equal(Object.hasOwn(limitedSystem.config, 'currentOrganization'), false);
    assert.equal((await post('saveSystemConfig', { timezone: 7, currentOrganization: 'org' })).status, 403);
    await admin.query('UPDATE authorization_rules SET policy_json=? WHERE id=?',
      [JSON.stringify({ ...systemRule.policy, enabled: false }), systemRule.id]);
    assert.equal((await post('saveSystemConfig', { timezone: 7 })).status, 403);
    assert.equal((await admin.query("SELECT timezone FROM system_config WHERE id='default'"))[0][0].timezone, 8);
    const scopedNatureList = await (await post('listAssignmentNatures', {})).json();
    assert.deepEqual(scopedNatureList.list.map(item => item.id), [scopedNature.nature.id]);
    assert.equal(scopedNatureList.canCreate, false);
    assert.equal(scopedNatureList.list[0].canUpdate, true);
    assert.equal(scopedNatureList.list[0].canDelete, false);
    assert.equal((await post('saveAssignmentNature', { ...scopedNature.nature, name: '授权后改名' })).status, 200);
    assert.equal((await post('saveAssignmentNature', { id: 'staff', version: 1, name: '越界改名' })).status, 403);
    assert.equal((await post('saveAssignmentNature', { name: '未授予新增' })).status, 403);
    await admin.query('UPDATE authorization_rules SET policy_json=? WHERE id=?',
      [JSON.stringify({ ...natureAuthorization.policy, capabilities: ['hr.assignmentNatures.create'], scopes: [{ kind: 'organization' }] }), natureAuthorization.id]);
    const createOnlyNatures = await (await post('listAssignmentNatures', {})).json();
    assert.equal(createOnlyNatures.canCreate, true);
    assert.deepEqual(createOnlyNatures.list, []);
    const createOnlyNature = await (await post('saveAssignmentNature', { name: '仅新增性质' })).json();
    assert.equal(createOnlyNature.status, 'success');
    assert.equal((await admin.query('SELECT name FROM assignment_natures WHERE id=? AND org_id=?', [createOnlyNature.nature.id, 'org']))[0][0].name, '仅新增性质');
    assert.deepEqual((await (await post('listAssignmentNatures', {})).json()).list, []);
    await admin.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(natureAuthorization.policy), natureAuthorization.id]);
    const permissionConnection = await pool.getConnection();
    try {
      await permissionConnection.beginTransaction();
      await state();
      await model.read(permissionConnection, 'org');
      await admin.query('UPDATE authorization_rules SET policy_json = ? WHERE id = ?',
        [JSON.stringify({ ...natureAuthorization.policy, enabled: false }), natureAuthorization.id]);
      const { createAuthorizationSession } = require('../src/core/services/authorizationSession');
      const lockedSession = await createAuthorizationSession(permissionConnection, reference, { lock: true });
      assert.equal(lockedSession.check({ capability: 'hr.assignmentNatures.update',
        resource: { id: scopedNature.nature.id, type: 'hr.assignmentNatures', organizationId: 'org' },
        businessAllowed: true }).allowed, false);
      await permissionConnection.rollback();
    } finally { permissionConnection.release(); }
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    await model.deleteRules({ expectedRevision: (await state()).revision,
      rules: [{ id: natureAuthorization.id, version: natureAuthorization.version }] }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    assert.equal((await post('saveAssignmentNature', { ...scopedNature.nature, version: 2, name: '撤权后改名' })).status, 403);
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    assert.equal((await post('deleteAssignmentNature', { ...scopedNature.nature, version: 2 })).status, 200);
    await admin.query("UPDATE authorization_organizations SET mode='shadow' WHERE org_id='org'");
    const { createScopeCompiler } = require('../src/core/services/authorizationSqlScope');
    const { evaluate } = require('../src/core/services/authorizationPolicy');
    const compile = createScopeCompiler({ resourceType: 'venue.bookings', organization: 'r.org_id', id: 'r.id',
      ownerPersonId: 'r.owner_person_id', assignmentValid: 'r.assignment_valid',
      dimensions: { departmentId: 'r.department_id', identityCategoryId: 'r.identity_id' } });
    await admin.query(`CREATE TABLE authorization_resource_fixtures (id VARCHAR(64) PRIMARY KEY,
      org_id VARCHAR(64), owner_person_id VARCHAR(64), department_id VARCHAR(64), identity_id VARCHAR(64), assignment_valid TINYINT);
      INSERT INTO authorization_resource_fixtures VALUES
      ('r1','org','person','department','identity',1), ('r2','org','other-person','other-department','identity',1),
      ('r3','org','other-person',NULL,NULL,0), ('r4','other','person','department','identity',1),
      ('r5','org','person','department','identity',0);`);
    const [resources] = await admin.query('SELECT * FROM authorization_resource_fixtures ORDER BY id');
    const scopeActor = { ...current, active: true };
    const orgPolicy = { ...scoped, id: 'sql-allow', scopes: [{ kind: 'organization' }] };
    const examples = [[], [orgPolicy], [orgPolicy, { ...orgPolicy, id: 'sql-deny', effect: 'deny',
      scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['department'] } }] }],
    [{ ...orgPolicy, scopes: [{ kind: 'self' }] }],
    [{ ...orgPolicy, scopes: [{ kind: 'records', ids: ['r2'] }] }],
    [{ ...orgPolicy, scopes: [{ kind: 'records', ids: ['R2'] }] }],
    [{ ...orgPolicy, scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: 'same' } }] }],
    [orgPolicy, { ...orgPolicy, id: 'broken', effect: 'unknown' }]];
    for (const policies of examples) {
      const context = { actor: scopeActor, capability: 'venue.bookings.read', policies, catalog: CATALOG, now: Date.now() };
      const predicate = compile(context);
      const [selected] = await admin.query('SELECT r.id FROM authorization_resource_fixtures r WHERE ' + predicate.sql + ' ORDER BY r.id', predicate.params);
      const expected = resources.filter(row => evaluate({ ...context, businessAllowed: true, resource: {
        type: 'venue.bookings', id: row.id, organizationId: row.org_id, ownerPersonId: row.owner_person_id,
        assignment: row.department_id ? { active: row.assignment_valid === 1, organizationId: row.org_id,
          departmentId: row.department_id, identityCategoryId: row.identity_id } : null
      } }).allowed).map(row => row.id);
      assert.deepEqual(selected.map(row => row.id), expected);
    }
    const incompleteCompiler = createScopeCompiler({ resourceType: 'venue.bookings', organization: 'r.org_id', id: 'r.id' });
    for (const scope of [{ kind: 'self' }, { kind: 'assignmentScope', dimensions: { departmentId: ['department'] } }]) {
      const predicate = incompleteCompiler({ actor: scopeActor, capability: 'venue.bookings.read', catalog: CATALOG,
        now: Date.now(), policies: [orgPolicy, { ...orgPolicy, id: 'deny-unmapped', effect: 'deny', scopes: [scope] }] });
      const [selected] = await admin.query('SELECT r.id FROM authorization_resource_fixtures r WHERE ' + predicate.sql, predicate.params);
      assert.deepEqual(selected, []);
    }
    const { createAuthorizationSession } = require('../src/core/services/authorizationSession');
    const shadow = await createAuthorizationSession(admin, reference);
    const checkInput = { capability: 'venue.bookings.read', businessAllowed: true,
      resource: { id: 'r1', type: 'venue.bookings', organizationId: 'org' } };
    assert.equal(shadow.check({ ...checkInput, legacyAllowed: false }).allowed, false);
    assert.equal(shadow.check({ ...checkInput, legacyAllowed: true }).allowed, true);
    assert.equal(shadow.check({ ...checkInput, legacyAllowed: true, resource: { ...checkInput.resource, type: 'audit.submissions' } }).allowed, false);
    assert.equal(shadow.check({ ...checkInput, legacyAllowed: true, resource: { ...checkInput.resource, organizationId: 'other' } }).allowed, false);
    await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
    const enforced = await createAuthorizationSession(admin, reference);
    assert.equal(enforced.check({ ...checkInput, legacyAllowed: false }).allowed, true);
    assert.equal(enforced.check({ ...checkInput, businessAllowed: false }).allowed, false);
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    const denied = await createAuthorizationSession(admin, reference);
    assert.equal(denied.check({ ...checkInput, legacyAllowed: true }).allowed, false);
    const legacyInventory = require('../src/core/models/authorizationLegacyInventory');
    const unlinked = await legacyInventory.read(admin, 'org');
    assert(unlinked.issues.some(issue => issue.kind === 'missing_legacy_admin' && issue.adminGrantId === 'regular'));
    await admin.query("INSERT INTO admin_info(id,name,org_id) VALUES ('old-admin','迁移测试管理员','org')");
    await admin.query("UPDATE admin_grants SET legacy_admin_id='old-admin' WHERE id='regular'");
    await admin.query(`INSERT INTO admin_permission_overrides(id,org_id,admin_id,permission_key,granted,configured_by)
      VALUES ('old-override','org','old-admin','venue.resources.delete',1,'fixture')`);
    const migrationSource = await pool.withTransaction(connection => legacyInventory.read(connection, 'org'));
    assert.equal(migrationSource.baselines.length, 1);
    assert.equal(migrationSource.issues.length, 0);
    assert.equal(migrationSource.baselines[0].adminGrantId, 'regular');
    assert.equal(migrationSource.baselines[0].routes.find(route => route.path === '/getVenueSchedule').allowed, true);
    assert.equal(migrationSource.baselines[0].routes.find(route => route.path === '/listAllVenueBookings').allowed, false);
    assert.equal((await legacyInventory.read(admin, 'other')).baselines.length, 0);
    await admin.query(`INSERT INTO admin_permission_overrides(id,org_id,admin_id,permission_key,granted,configured_by)
      VALUES ('unknown-override','org','old-admin','unknown.legacy',1,'fixture')`);
    assert((await legacyInventory.read(admin, 'org')).issues.some(issue => issue.kind === 'unknown_permission'));
    const legacyPermissions = require('../src/core/models/adminPermission');
    const oldWrite = { orgId: 'org', adminId: 'old-admin', operatorId: 'fixture',
      items: [{ id: 'old-override', permissionKey: 'venue.resources.delete', granted: false }] };
    await assert.rejects(pool.withTransaction(connection => legacyPermissions.upsertOverrides(connection, oldWrite)),
      error => error.code === 'authorization_legacy_read_only');
    assert.equal((await legacyPermissions.getOverrides('org', 'old-admin')).find(item => item.permission_key === 'venue.resources.delete').granted, 1);
    await admin.query("UPDATE authorization_organizations SET mode='shadow' WHERE org_id='org'");
    await pool.withTransaction(connection => legacyPermissions.upsertOverrides(connection, oldWrite));
    assert.equal((await legacyPermissions.getOverrides('org', 'old-admin')).find(item => item.permission_key === 'venue.resources.delete').granted, 0);
    const staleLegacyConnection = await pool.getConnection();
    try {
      await staleLegacyConnection.beginTransaction();
      await staleLegacyConnection.query("SELECT mode FROM authorization_organizations WHERE org_id='org'");
      await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
      await assert.rejects(legacyPermissions.upsertOverrides(staleLegacyConnection,
        { ...oldWrite, items: [{ ...oldWrite.items[0], granted: true }] }), error => error.code === 'authorization_legacy_read_only');
      await staleLegacyConnection.rollback();
      assert.equal((await legacyPermissions.getOverrides('org', 'old-admin')).find(item => item.permission_key === 'venue.resources.delete').granted, 0);
    } finally { await staleLegacyConnection.rollback(); staleLegacyConnection.release(); }
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261101013000_organization_venue_purposes.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261101100000_venue_purpose_storage_transition.sql'), 'utf8'));
    await require('../src/modules/venue/models/venuePurposeStorage').activate('a'.repeat(40), async () => true);
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261101023000_organization_config_copy.sql'), 'utf8'));
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const purposeRule = await model.saveRule({ name: '普通岗位事由维护', policy: { ...blank,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }],
      capabilities: ['venue.purposes.create', 'venue.purposes.update', 'venue.purposes.delete'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const ordinaryPurpose = await (await post('saveVenueBookingPurpose', { text: '普通岗位维护事由', sortOrder: 8 })).json();
    assert.equal(ordinaryPurpose.status, 'success');
    assert((await (await post('listVenueBookingPurposes')).json()).purposes.some(item => item.id === ordinaryPurpose.id));
    const purposeReadDeny = { ...blank, id: 'purpose-read-deny', organizationId: 'org', effect: 'deny',
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['venue.purposes.read'],
      scopes: [{ kind: 'records', ids: [ordinaryPurpose.id] }], fields: null };
    await admin.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('purpose-read-deny','org','隐藏指定事由',?)", [JSON.stringify(purposeReadDeny)]);
    assert(!(await (await post('listVenueBookingPurposes')).json()).purposes.some(item => item.id === ordinaryPurpose.id));
    await admin.query("UPDATE authorization_rules SET policy_json=? WHERE id='purpose-read-deny'", [JSON.stringify({ ...purposeReadDeny, fields: ['text'] })]);
    assert(!(await (await post('listVenueBookingPurposes')).json()).purposes.some(item => item.id === ordinaryPurpose.id));
    await admin.query("DELETE FROM authorization_rules WHERE id='purpose-read-deny'");
    assert.equal((await (await post('listVenueBookingPurposes')).json()).purposes.find(item => item.id === ordinaryPurpose.id).text, '普通岗位维护事由');
    const purposeModel = require('../src/modules/venue/models/venueBookingPurpose');
    await assert.rejects(purposeModel.create('stale-create', { text: '旧判断不能写入' }, 'org'), error => error.code === 'authorization_forbidden');
    await assert.rejects(purposeModel.update(ordinaryPurpose.id, { text: '旧判断不能修改' }, 'org'), error => error.code === 'authorization_forbidden');
    await assert.rejects(purposeModel.remove(ordinaryPurpose.id, 'org'), error => error.code === 'authorization_forbidden');
    assert.equal((await purposeModel.getById(ordinaryPurpose.id, 'org')).sort_order, 8);
    assert.equal((await (await post('saveVenueBookingPurpose', { id: ordinaryPurpose.id, text: '普通岗位改名', sortOrder: 9 })).json()).status, 'success');
    assert.equal((await purposeModel.getById(ordinaryPurpose.id, 'org')).text, '普通岗位改名');
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    purposeUserFixture = false;
    const fieldDeny = await model.saveRule({ name: '禁止修改事由文字', policy: { ...blank, effect: 'deny',
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['venue.purposes.update'], fields: ['text'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    assert.equal((await post('saveVenueBookingPurpose', { id: ordinaryPurpose.id, text: '越权改名', sortOrder: 10 })).status, 403);
    assert.equal((await purposeModel.getById(ordinaryPurpose.id, 'org')).text, '普通岗位改名');
    assert.equal((await purposeModel.getById(ordinaryPurpose.id, 'org')).sort_order, 9);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    await model.saveRule({ id: purposeRule.id, version: purposeRule.version, name: '仅此条事由', policy: { ...purposeRule.policy,
      capabilities: ['venue.purposes.update', 'venue.purposes.delete'], scopes: [{ kind: 'records', ids: [ordinaryPurpose.id] }] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("INSERT INTO organization_venue_booking_purposes(org_id,id,text) VALUES ('org','outside-purpose','范围外事由')");
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    assert.equal((await post('deleteVenueBookingPurpose', { id: 'outside-purpose' })).status, 403);
    assert.equal((await post('saveVenueBookingPurpose', { text: '指定记录不能新建', sortOrder: 1 })).status, 403);
    assert.equal((await purposeModel.getById('outside-purpose', 'org')).text, '范围外事由');
    assert.equal((await (await post('deleteVenueBookingPurpose', { id: ordinaryPurpose.id })).json()).status, 'success');
    assert.equal(await purposeModel.getById(ordinaryPurpose.id, 'org'), null);
    await admin.query('UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,\'$.enabled\',false) WHERE id IN (?,?)', [purposeRule.id, fieldDeny.id]);
    assert.equal((await post('saveVenueBookingPurpose', { text: '撤权后新建', sortOrder: 1 })).status, 403);
    assert.equal((await purposeModel.getAll('org')).some(row => row.text === '撤权后新建'), false);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='regular',role='admin' WHERE id='session'");
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    const dictionaryRule = await model.saveRule({ name: '普通岗位字典维护', policy: { ...blank,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: [
        'hr.departments.create', 'hr.departments.update', 'hr.departments.delete',
        'hr.identities.create', 'hr.identities.update', 'hr.identities.delete',
        'hr.workGroups.create', 'hr.workGroups.update', 'hr.workGroups.delete'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261018230000_hr_contact_directory.sql'), 'utf8'));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const addedDepartment = await (await post('saveDepartment', { name: '新增部门', description: '首次保存' })).json();
    assert.equal(addedDepartment.status, 'success');
    const addedIdentity = await (await post('saveIdentity', { name: '新增身份', description: '首次保存' })).json();
    assert.equal(addedIdentity.status, 'success');
    const addedGroup = await (await post('saveWorkGroup', { name: '新增职能组', description: '首次保存', departmentId: addedDepartment.id })).json();
    assert.equal(addedGroup.status, 'success');
    assert.deepEqual((await (await post('listAuthorizedDictionary', { kind: 'department' })).json()).list, []);
    await admin.query("INSERT INTO departments(id,name,org_id) VALUES ('dictionary-other-department','其他组织部门','other')");
    assert.equal((await (await post('saveDepartment', { id: 'dictionary-other-department', name: '越界修改', description: '' })).json()).status, 'not_found');
    for (const item of [{ route: 'saveDepartment', table: 'departments', id: addedDepartment.id },
      { route: 'saveIdentity', table: 'identities', id: addedIdentity.id },
      { route: 'saveWorkGroup', table: 'work_groups', id: addedGroup.id }]) {
      assert.equal((await (await post(item.route, { id: item.id, name: '修改后名称', description: '再次保存', departmentId: addedDepartment.id })).json()).status, 'success');
      const [[row]] = await admin.query('SELECT name,description FROM ?? WHERE org_id=? AND id=?', [item.table, 'org', item.id]);
      assert.deepEqual(row, { name: '修改后名称', description: '再次保存' });
    }
    const departmentInUse = await (await post('deleteDepartment', { id: addedDepartment.id })).json();
    assert.equal(departmentInUse.status, 'in_use', JSON.stringify(departmentInUse));
    assert.equal((await (await post('saveWorkGroup', { name: '越界职能组', departmentId: 'dictionary-other-department', description: '' })).json()).status, 'invalid_department');
    const [[foreignDepartment]] = await admin.query("SELECT name FROM departments WHERE id='dictionary-other-department' AND org_id='other'");
    assert.equal(foreignDepartment.name, '其他组织部门');
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const dictionaryFieldDeny = await model.saveRule({ name: '禁止修改部门说明', policy: { ...blank, effect: 'deny',
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['hr.departments.update'], fields: ['description'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    const dictionaryRead = await model.saveRule({ name: '仅查看本条部门名称', policy: { ...blank,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['hr.departments.read'],
      scopes: [{ kind: 'records', ids: [addedDepartment.id] }], fields: ['name'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const scopedDictionary = await (await post('listAuthorizedDictionary', { kind: 'department', organizationId: 'other' })).json();
    assert.deepEqual(scopedDictionary.list, [{ id: addedDepartment.id, name: '修改后名称', canUpdate: false, canDelete: true }]);
    assert.equal((await post('listAuthorizedDictionary', { kind: 'organizations' })).status, 400);
    assert.equal((await post('saveDepartment', { id: addedDepartment.id, name: '不应修改名称', description: '禁止修改说明' })).status, 403);
    const [[unchangedDepartment]] = await admin.query('SELECT name,description FROM departments WHERE org_id=? AND id=?', ['org', addedDepartment.id]);
    assert.deepEqual(unchangedDepartment, { name: '修改后名称', description: '再次保存' });
    await assert.rejects(require('../src/core/models/dictionaryDefinition').save('department', { id: addedDepartment.id,
      name: '旧请求改名', description: '', organizationId: 'org' }), error => error.code === 'authorization_forbidden');
    await assert.rejects(require('../src/core/services/dictionaryUsage').deleteUnused('identity', addedIdentity.id, 'org'),
      error => error.code === 'authorization_forbidden');
    assert.equal((await (await post('deleteWorkGroup', { id: addedGroup.id })).json()).status, 'success');
    assert.equal((await (await post('deleteDepartment', { id: addedDepartment.id })).json()).status, 'success');
    assert.equal((await (await post('deleteIdentity', { id: addedIdentity.id })).json()).status, 'success');
    const [[remainingDictionaries]] = await admin.query(`SELECT
      (SELECT COUNT(*) FROM departments WHERE id=?) + (SELECT COUNT(*) FROM identities WHERE id=?) +
      (SELECT COUNT(*) FROM work_groups WHERE id=?) AS count`, [addedDepartment.id, addedIdentity.id, addedGroup.id]);
    assert.equal(Number(remainingDictionaries.count), 0);
    await admin.query('UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,\'$.enabled\',false) WHERE id IN (?,?)', [dictionaryRule.id, dictionaryFieldDeny.id]);
    assert.equal((await post('saveDepartment', { name: '撤权后新增', description: '' })).status, 403);
    await admin.query('UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,\'$.enabled\',false) WHERE id=?', [dictionaryRead.id]);
    assert.deepEqual((await (await post('listAuthorizedDictionary', { kind: 'department' })).json()).list, []);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const templateRule = await model.saveRule({ name: '普通岗位评分模板维护', policy: { ...blank,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }],
      capabilities: ['scoring.templates.create', 'scoring.templates.update', 'scoring.templates.delete'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const templateBody = { name: '授权评分模板', description: '普通岗位维护', questions: [
      { question: '工作完成情况', minValue: 0, startValue: 60, maxValue: 100, stepValue: 1, scoreLabel: '分' }
    ] };
    const templateSaved = await (await post('saveScoreTemplate', templateBody)).json();
    assert.equal(templateSaved.status, 'success', JSON.stringify(templateSaved));
    assert.deepEqual((await (await post('listScoreTemplates', {})).json()).list, []);
    assert.equal((await post('duplicateScoreTemplate', { id: templateSaved.id })).status, 403);
    const editedTemplate = { ...templateBody, id: templateSaved.id, name: '修改后的评分模板',
      questions: [{ ...templateBody.questions[0], startValue: 30, maxValue: 50 }] };
    assert.equal((await (await post('saveScoreTemplate', editedTemplate)).json()).status, 'success');
    const readTemplate = async id => {
      const [[template]] = await admin.query('SELECT name,description FROM score_question_templates WHERE id=? AND org_id=?', [id, 'org']);
      const [questions] = await admin.query('SELECT question,start_value,max_value FROM score_questions WHERE template_id=? ORDER BY sort_order', [id]);
      return { template, questions };
    };
    const storedTemplate = await readTemplate(templateSaved.id);
    assert.equal(storedTemplate.template.name, editedTemplate.name);
    assert.equal(Number(storedTemplate.questions[0].start_value), 30);
    assert.equal(Number(storedTemplate.questions[0].max_value), 50);
    assert.equal((await (await post('saveScoreTemplate', { ...editedTemplate, questions: [editedTemplate.questions[0], { question: '非法后续题目', minValue: 20, maxValue: 10 }] })).json()).status, 'invalid_params');
    assert.deepEqual(await readTemplate(templateSaved.id), storedTemplate);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const templateReadRule = await model.saveRule({ name: '只看指定评分模板',
      policy: { ...templateRule.policy, capabilities: ['scoring.templates.read'], scopes: [{ kind: 'records', ids: [templateSaved.id] }] },
      expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    const questionDeny = await model.saveRule({ name: '不得改动评分题目', policy: { ...blank, effect: 'deny',
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['scoring.templates.update'], fields: ['questions'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    assert.equal((await post('saveScoreTemplate', { ...editedTemplate, name: '不得部分改名' })).status, 403);
    assert.deepEqual(await readTemplate(templateSaved.id), storedTemplate);
    const duplicateTemplate = await (await post('duplicateScoreTemplate', { id: templateSaved.id })).json();
    assert.equal(duplicateTemplate.status, 'success', JSON.stringify(duplicateTemplate));
    assert.notEqual(duplicateTemplate.id, templateSaved.id);
    assert.deepEqual((await readTemplate(duplicateTemplate.id)).questions, storedTemplate.questions);
    const authorizedTemplates = await (await post('listScoreTemplates', {})).json();
    assert.equal(authorizedTemplates.status, 'success');
    assert.deepEqual(authorizedTemplates.list.map(item => item.id), [templateSaved.id]);
    assert.equal(authorizedTemplates.list[0].questions[0].maxValue, 50);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const hiddenQuestions = await model.saveRule({ name: '不可读取题目', policy: { ...blank, effect: 'deny',
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['scoring.templates.read'], fields: ['questions'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const limitedTemplate = (await (await post('listScoreTemplates', {})).json()).list[0];
    assert.equal(limitedTemplate.name, editedTemplate.name);
    assert.equal(Object.hasOwn(limitedTemplate, 'questions'), false);
    assert.equal(Object.hasOwn(limitedTemplate, 'questionCount'), false);
    assert.equal(Object.hasOwn(limitedTemplate, 'configSignature'), false);
    assert.equal((await post('duplicateScoreTemplate', { id: templateSaved.id })).status, 403);
    assert.equal((await (await post('deleteScoreTemplate', { id: duplicateTemplate.id })).json()).status, 'success');
    assert.equal((await readTemplate(duplicateTemplate.id)).template, undefined);
    assert.equal((await readTemplate(duplicateTemplate.id)).questions.length, 0);
    assert.equal((await (await post('deleteScoreTemplate', { id: templateSaved.id })).json()).status, 'success');
    await admin.query('UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,\'$.enabled\',false) WHERE id IN (?,?,?,?)',
      [templateRule.id, templateReadRule.id, questionDeny.id, hiddenQuestions.id]);
    assert.equal((await post('saveScoreTemplate', templateBody)).status, 403);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const activityRule = await model.saveRule({ name: '普通岗位评分活动维护', policy: { ...blank,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }],
      capabilities: ['scoring.activities.read', 'scoring.activities.create', 'scoring.activities.update', 'scoring.activities.delete'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const activityBody = { name: '授权活动甲', description: '活动说明', startDate: '2026-11-01', endDate: '2026-11-30', isPaused: false };
    assert.equal((await (await post('saveScoreActivity', activityBody)).json()).status, 'success');
    assert.equal((await (await post('saveScoreActivity', { ...activityBody, name: '授权活动乙' })).json()).status, 'success');
    const [newActivities] = await admin.query("SELECT * FROM score_activities WHERE org_id='org' AND name IN ('授权活动甲','授权活动乙') ORDER BY name");
    assert.equal(newActivities.length, 2);
    const activityA = newActivities.find(item => item.name === '授权活动甲').id;
    const activityB = newActivities.find(item => item.name === '授权活动乙').id;
    const activityState = async () => (await admin.query('SELECT id,name,description,start_date,end_date,is_paused,is_current FROM score_activities WHERE org_id=? AND id IN (?,?) ORDER BY id', ['org', activityA, activityB]))[0];
    assert.equal((await (await post('saveScoreActivity', { ...activityBody, id: activityA, description: '已修改说明' })).json()).status, 'success');
    assert.equal((await activityState()).find(item => item.id === activityA).description, '已修改说明');
    const activityDirectory = await (await post('listScoreActivities', {})).json();
    assert.equal(activityDirectory.status, 'success');
    assert.equal(activityDirectory.list.find(item => item.id === activityA).startDate, '2026-11-01');
    const beforeBadDate = await activityState();
    assert.equal((await (await post('saveScoreActivity', { ...activityBody, id: activityA, startDate: '2026-02-30' })).json()).status, 'invalid_params');
    assert.deepEqual(await activityState(), beforeBadDate);
    const toggles = await Promise.all([post('toggleActivityPause', { id: activityA }), post('toggleActivityPause', { id: activityA })]);
    const toggleResults = await Promise.all(toggles.map(response => response.json()));
    assert(toggleResults.every(item => item.status === 'success'));
    assert.deepEqual(toggleResults.map(item => item.isPaused).sort(), [false, true]);
    assert.equal(Number((await activityState()).find(item => item.id === activityA).is_paused), 0);
    assert.equal((await (await post('setCurrentScoreActivity', { id: activityA })).json()).status, 'success');
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    const scopedActivityRule = await model.saveRule({ id: activityRule.id, version: activityRule.version, name: '只可修改活动乙',
      policy: { ...activityRule.policy, capabilities: ['scoring.activities.update'], scopes: [{ kind: 'records', ids: [activityB] }], fields: ['isCurrent'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    const activityReadRule = await model.saveRule({ name: '只看活动甲名称', policy: { ...activityRule.policy,
      capabilities: ['scoring.activities.read'], scopes: [{ kind: 'records', ids: [activityA] }], fields: ['name'] },
    expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    const beforeCurrentChange = await activityState();
    const limitedActivities = await (await post('listScoreActivities', {})).json();
    assert.deepEqual(limitedActivities.list, [{ id: activityA, participantGranularity: 'assignment', name: '授权活动甲' }]);
    assert.equal(limitedActivities.currentActivityId, '');
    assert.equal((await post('setCurrentScoreActivity', { id: activityB })).status, 403);
    assert.deepEqual(await activityState(), beforeCurrentChange);
    assert.equal((await post('toggleActivityPause', { id: activityB })).status, 403);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");
    await model.saveRule({ id: activityRule.id, version: scopedActivityRule.version, name: activityRule.name, policy: activityRule.policy,
      expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_type='assignment',context_subject_id='assignment',role='user' WHERE id='session'");
    purposeUserFixture = true;
    assert.equal((await (await post('setCurrentScoreActivity', { id: activityB })).json()).status, 'success');
    assert.equal(Number((await activityState()).find(item => item.id === activityA).is_current), 0);
    assert.equal(Number((await activityState()).find(item => item.id === activityB).is_current), 1);
    assert.equal((await (await post('deleteScoreActivity', { id: activityA })).json()).status, 'success');
    assert.equal((await (await post('deleteScoreActivity', { id: activityB })).json()).status, 'success');
    assert.deepEqual(await activityState(), []);
    await admin.query('UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,\'$.enabled\',false) WHERE id IN (?,?)', [activityRule.id, activityReadRule.id]);
    assert.equal((await post('saveScoreActivity', activityBody)).status, 403);
    purposeUserFixture = false;
    await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='regular',role='admin' WHERE id='session'");
    await admin.query("INSERT INTO organization_venue_booking_purposes(org_id,id,text) VALUES ('org','copy-purpose','可复制事由')");
    const configCopy = require('../src/core/services/organizationConfigCopy');
    const copyInput = { kind: 'venue.purposes', sourceRecordId: 'copy-purpose', targetOrganizationId: 'other' };
    await assert.rejects(configCopy.share(copyInput, reference), error => error.code === 'authorization_forbidden');
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    const sourceCopyRule = await model.saveRule({ name: '来源事由分享', policy: { ...blank,
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }], capabilities: ['venue.purposes.share', 'venue.purposes.read'],
      scopes: [{ kind: 'records', ids: ['copy-purpose'] }] }, expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    const sourceFieldDeny = await model.saveRule({ name: '不得复制事由文字', policy: { ...blank,
      effect: 'deny', subjects: [{ kind: 'adminGrants', ids: ['regular'] }], capabilities: ['venue.purposes.read'],
      scopes: [{ kind: 'records', ids: ['copy-purpose'] }], fields: ['text'] }, expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    assert.equal((await post('shareOrganizationConfiguration', copyInput, true)).status, 401);
    assert.equal((await post('shareOrganizationConfiguration', copyInput)).status, 403);
    await admin.query("UPDATE authorization_rules SET policy_json=JSON_SET(policy_json,'$.enabled',false) WHERE id=?", [sourceFieldDeny.id]);
    const copyShare = await (await post('shareOrganizationConfiguration', copyInput)).json();
    assert.equal(copyShare.status, 'success');
    await admin.query(`INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('target-grant','person','other','admin');
      INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
        organization_id,role,token_version,expires_at)
      VALUES ('target-session','account','','target-context','admin','target-grant','other','admin',1,UTC_TIMESTAMP() + INTERVAL 1 DAY);
      UPDATE authorization_organizations SET mode='enforced' WHERE org_id='other';`);
    const copyTarget = { ...reference, organizationId: 'other', sessionId: 'target-session', contextId: 'target-context' };
    const receiveCopy = { shareId: copyShare.id, shareVersion: 1, requestId: 'auth-copy' };
    await assert.rejects(configCopy.receive(receiveCopy, reference), error => error.code === 'config_copy_unavailable');
    await assert.rejects(configCopy.receive(receiveCopy, copyTarget), error => error.code === 'authorization_forbidden');
    // 明确建立目标组织授权，不能因同一自然人在来源已有权限而自动接收。
    const targetGuard = { ...guard, authorize: async () => ({ contextId: 'target-context', organizationId: 'other' }) };
    const targetRule = await model.saveRule({ name: '目标接收事由', policy: { ...blank,
      subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }], capabilities: ['venue.purposes.receive'],
      scopes: [{ kind: 'organization' }] }, expectedRevision: (await model.read(admin, 'other')).revision }, 'other', targetGuard);
    const offered = await (await post('listSharedOrganizationConfigurations', { kind: 'venue.purposes' }, false, true)).json();
    assert.equal(offered.status, 'success');
    assert.equal(offered.items.length, 1);
    assert.deepEqual(offered.items[0].payload, { text: '可复制事由', sortOrder: 1 });
    const copyDraft = await (await post('receiveOrganizationConfiguration', receiveCopy, false, true)).json();
    assert.equal(copyDraft.status, 'success');
    assert.equal(copyDraft.state, 'draft');
    await assert.rejects(configCopy.apply({ id: copyDraft.id, version: 1 }, copyTarget), error => error.code === 'authorization_forbidden');
    const targetUpdate = await model.saveRule({ id: targetRule.id, version: 1, name: '目标接收并创建事由', policy: { ...blank,
      subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }], capabilities: ['venue.purposes.receive', 'venue.purposes.create'],
      scopes: [{ kind: 'organization' }] }, expectedRevision: (await model.read(admin, 'other')).revision }, 'other', targetGuard);
    const copyResult = await (await post('applyOrganizationConfigurationDraft', { id: copyDraft.id, version: 1 }, false, true)).json();
    assert.equal(copyResult.status, 'success');
    assert.equal((await admin.query('SELECT text FROM organization_venue_booking_purposes WHERE org_id = ? AND id = ?', ['other', copyResult.resultId]))[0][0].text, '可复制事由');
    const reopenedCopy = await (await post('getOrganizationConfigurationDraft', { id: copyDraft.id }, false, true)).json();
    assert.equal(reopenedCopy.state, 'applied');
    assert.equal(reopenedCopy.resultId, copyResult.resultId);
    assert.equal((await post('getOrganizationConfigurationDraft', { id: copyDraft.id })).status, 404);
    await model.deleteRules({ expectedRevision: (await model.read(admin, 'other')).revision,
      rules: [{ id: targetRule.id, version: targetUpdate.version }] }, 'other', targetGuard);
    await assert.rejects(configCopy.receive({ ...receiveCopy, requestId: 'revoked-copy' }, copyTarget), error => error.code === 'authorization_forbidden');
    await admin.query("UPDATE authorization_organizations SET mode='shadow' WHERE org_id='org'");
    await assert.rejects(configCopy.share(copyInput, reference), error => error.code === 'authorization_forbidden');
    assert(sourceCopyRule.id);
    await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id IN ('org','other')");
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id IN ('session','target-session')");
    const schemeShare = await configCopy.share({ kind: 'authorization.schemes', sourceRecordId: scheme.id,
      targetOrganizationId: 'other' }, reference);
    const schemeCopyDraft = await configCopy.receive({ shareId: schemeShare.id, shareVersion: 1, requestId: 'scheme-copy' }, copyTarget);
    const schemeCopyResult = await configCopy.apply({ id: schemeCopyDraft.id, version: 1 }, copyTarget);
    const copiedSchemes = await model.listSchemes(admin, 'other');
    const copiedScheme = copiedSchemes.find(item => item.id === schemeCopyResult.resultId);
    assert(copiedScheme);
    assert.equal(copiedScheme.publishedVersion, 0);
    assert.deepEqual(copiedScheme.capabilities, ['venue.bookings.read']);
    assert.deepEqual(copiedScheme.publishedCapabilities, []);
    assert.equal((await model.read(admin, 'other')).rules.length, 0);
    await checkAudienceCopies();
    await admin.query(`INSERT INTO org_hr_profile_template_snapshots(id,org_id) VALUES ('source-profile','org'),('target-profile','other');
      INSERT INTO org_hr_profile_template_snapshot_fields(id,snapshot_id,label,type)
      VALUES ('source-field','source-profile','电话','text'),('target-field','target-profile','电话','text'),
        ('wrong-type-field','target-profile','数值','number'),('private-field','target-profile','学号','text');`);
    await admin.query(`INSERT INTO hr_contact_directory_rules(id,org_id,name,audience_json,targets_json,field_ids_json)
      VALUES ('people-copy','org','人员与资料映射','[{"type":"people","personIds":["person"]}]','[{"type":"self"}]','["source-field"]')`);
    const peopleShare = await configCopy.share({ kind: 'hr.directoryRules', sourceRecordId: 'people-copy', targetOrganizationId: 'other' }, reference);
    const peopleDraft = await configCopy.receive({ shareId: peopleShare.id, shareVersion: 1, requestId: 'people-copy' }, copyTarget);
    const peopleDetail = await configCopy.detail({ id: peopleDraft.id }, copyTarget);
    assert.deepEqual(peopleDetail.payload.rule.audience[0].personIds, ['ref-1']);
    assert.deepEqual(peopleDetail.payload.rule.fieldIds, ['ref-2']);
    const mappedPeople = { id: peopleDraft.id, version: 1, references: { 'ref-1': 'person', 'ref-2': 'target-field' } };
    // 同一个人在目标组织只有管理身份，没有成员关系，也不能直接成为通讯录规则指定人员。
    await assert.rejects(configCopy.apply(mappedPeople, copyTarget), error => error.code === 'config_copy_reference');
    await admin.query("INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('target-membership','person','other','target-hr')");
    await assert.rejects(configCopy.apply({ ...mappedPeople, references: { 'ref-1': 'person', 'ref-2': 'wrong-type-field' } }, copyTarget), error => error.code === 'config_copy_reference');
    await assert.rejects(configCopy.apply({ ...mappedPeople, references: { 'ref-1': 'person', 'ref-2': 'private-field' } }, copyTarget), error => error.code === 'config_copy_reference');
    const peopleResult = await configCopy.apply(mappedPeople, copyTarget);
    const savedPeopleRule = (await admin.query('SELECT enabled,field_ids_json FROM hr_contact_directory_rules WHERE id=? AND org_id=?', [peopleResult.resultId, 'other']))[0][0];
    assert.equal(savedPeopleRule.enabled, 0);
    assert.deepEqual(typeof savedPeopleRule.field_ids_json === 'string' ? JSON.parse(savedPeopleRule.field_ids_json) : savedPeopleRule.field_ids_json, ['target-field']);
    await admin.query(`INSERT INTO identities(id,org_id,name) VALUES ('target-identity','other','目标身份');
      INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
      VALUES ('target-assignment','target-membership','other','staff','target-department','target-identity');
      INSERT INTO audit_flow_templates(id,org_id,name,starter_type,starter_conditions_json)
      VALUES ('audit-copy','org','复制审核模板','conditions','[{"conditionType":"identity_scope","departmentScope":"specific","specificDepartmentId":"department","identityScope":"all","workGroupScope":"all"}]');`);
    for (const [index, action] of ['pass', 'sign', 'estamp', 'both', 'either'].entries()) {
      await admin.query(`INSERT INTO audit_flow_template_steps(id,org_id,template_id,sort_order,name,action_type,allow_approver_designation)
        VALUES (?,'org','audit-copy',?,?,?,1)`, ['audit-step-' + index, index + 1, '审批' + index, action]);
      await admin.query(`INSERT INTO audit_flow_template_step_conditions(id,org_id,template_step_id,sort_order,condition_type,person_hr_ids,assignment_ids)
        VALUES (?,'org',?,1,'person','hr','assignment')`, ['audit-condition-' + index, 'audit-step-' + index]);
    }
    const auditOffer = await (await post('shareOrganizationConfiguration', { kind: 'audit.templates', sourceRecordId: 'audit-copy', targetOrganizationId: 'other' })).json();
    assert.equal(auditOffer.status, 'success');
    const auditDraft = await (await post('receiveOrganizationConfiguration', { shareId: auditOffer.id, shareVersion: 1, requestId: 'audit-template-copy' }, false, true)).json();
    assert.equal(auditDraft.status, 'success');
    const auditDetail = await configCopy.detail({ id: auditDraft.id }, copyTarget);
    assert.equal(auditDetail.payload.references.length, 2);
    assert.equal(JSON.stringify(auditDetail.payload).includes('personHrIds'), false);
    const auditMapping = { 'ref-1': 'target-department', 'ref-2': 'target-assignment' };
    const auditCandidates = await (await post('getOrganizationConfigurationCandidates', { id: auditDraft.id }, false, true)).json();
    assert.equal(auditCandidates.status, 'success');
    assert.deepEqual(auditCandidates.assignments.map(item => item.id), ['target-assignment']);
    assert.equal(JSON.stringify(auditCandidates).includes('studentId'), false);
    assert.equal((await post('getOrganizationConfigurationCandidates', { id: auditDraft.id })).status, 404);
    const outgoing = await (await post('getOrganizationConfigurationWorkspace', { kind: 'audit.templates', tab: 'outgoing' })).json();
    assert.equal(outgoing.status, 'success');
    assert(outgoing.items.some(item => item.id === auditOffer.id && item.enabled));
    const copySources = await (await post('getOrganizationConfigurationWorkspace', { kind: 'audit.templates', tab: 'source' })).json();
    assert.equal(copySources.status, 'success');
    assert(copySources.items.some(item => item.id === 'audit-copy'));
    assert(copySources.organizations.every(item => item.id !== 'org'));
    const draftListing = await (await post('getOrganizationConfigurationWorkspace', { kind: 'audit.templates', tab: 'drafts' }, false, true)).json();
    assert.equal(draftListing.status, 'success');
    assert(draftListing.items.some(item => item.id === auditDraft.id && item.state === 'draft'));
    await assert.rejects(configCopy.apply({ id: auditDraft.id, version: 1, references: { ...auditMapping, 'ref-2': 'assignment' } }, copyTarget), error => error.code === 'config_copy_reference');
    const auditApplied = await (await post('applyOrganizationConfigurationDraft', { id: auditDraft.id, version: 1, references: auditMapping }, false, true)).json();
    assert.equal(auditApplied.status, 'success');
    const copiedAuditTemplate = (await admin.query('SELECT * FROM audit_flow_templates WHERE id=? AND org_id=?', [auditApplied.resultId, 'other']))[0][0];
    assert.equal(copiedAuditTemplate.is_active, 0);
    assert.equal(JSON.parse(copiedAuditTemplate.starter_conditions_json)[0].specificDepartmentId, 'target-department');
    const copiedAuditSteps = (await admin.query('SELECT * FROM audit_flow_template_steps WHERE template_id=? AND org_id=? ORDER BY sort_order', [auditApplied.resultId, 'other']))[0];
    assert.deepEqual(copiedAuditSteps.map(step => step.action_type), ['pass', 'sign', 'estamp', 'both', 'either']);
    const copiedConditions = (await admin.query(`SELECT c.* FROM audit_flow_template_step_conditions c JOIN audit_flow_template_steps s ON s.id=c.template_step_id
      WHERE s.template_id=? AND c.org_id=?`, [auditApplied.resultId, 'other']))[0];
    assert.equal(copiedConditions.length, 5);
    assert(copiedConditions.every(item => item.assignment_ids === 'target-assignment' && item.person_hr_ids === 'target-hr'));
    const auditCopyAdapter = require('../src/core/models/auditTemplateCopy');
    assert.throws(() => auditCopyAdapter.normalize({ ...auditDetail.payload, steps: auditDetail.payload.steps.map(step => ({ ...step, actionType: undefined })) }),
      error => error.code === 'config_copy_invalid');
    await admin.query(`INSERT INTO venues(id,name) VALUES ('copy-venue','来源场地'),('copy-target-venue','目标场地');
      INSERT INTO venue_approval_flows(id,org_id,venue_id,name,allow_user_select,allow_designate_first,allow_designate_next)
      VALUES ('copy-flow','org','copy-venue','可复制流程',1,0,1);
      INSERT INTO venue_approval_flow_steps(id,org_id,flow_id,name,sort_order,approval_mode)
      VALUES ('copy-flow-step','org','copy-flow','岗位审批',1,'hr_rule'),('copy-flow-admin','org','copy-flow','管理员审批',2,'admin_any');
      INSERT INTO venue_approval_flow_step_rules(id,org_id,step_id,sort_order,department_scope,specific_department_id,identity_scope,work_group_scope)
      VALUES ('copy-flow-rule','org','copy-flow-step',1,'specific','department','same','all');`);
    const flowShare = await (await post('shareOrganizationConfiguration', { kind: 'venue.approvals', sourceRecordId: 'copy-flow', targetOrganizationId: 'other' })).json();
    assert.equal(flowShare.status, 'success');
    const flowDraft = await (await post('receiveOrganizationConfiguration', { shareId: flowShare.id, shareVersion: 1, requestId: 'venue-flow-copy' }, false, true)).json();
    assert.equal(flowDraft.status, 'success');
    const flowDetail = await configCopy.detail({ id: flowDraft.id }, copyTarget);
    assert.deepEqual(flowDetail.payload.references.map(item => item.kind), ['venue', 'department']);
    const flowMapping = { 'ref-1': 'copy-target-venue', 'ref-2': 'target-department' };
    await assert.rejects(configCopy.apply({ id: flowDraft.id, version: 1, references: { ...flowMapping, 'ref-2': 'department' } }, copyTarget),
      error => error.code === 'config_copy_reference');
    assert.equal((await admin.query("SELECT COUNT(*) AS n FROM venue_approval_flows WHERE org_id='other'"))[0][0].n, 0);
    const flowApplied = await (await post('applyOrganizationConfigurationDraft', { id: flowDraft.id, version: 1, references: flowMapping }, false, true)).json();
    assert.equal(flowApplied.status, 'success');
    const savedFlow = (await admin.query('SELECT * FROM venue_approval_flows WHERE org_id=? AND id=?', ['other', flowApplied.resultId]))[0][0];
    assert.equal(savedFlow.is_active, 0);
    assert.equal(savedFlow.venue_id, 'copy-target-venue');
    assert.deepEqual([savedFlow.allow_user_select, savedFlow.allow_designate_first, savedFlow.allow_designate_next], [1, 0, 1]);
    const savedFlowRules = (await admin.query(`SELECT r.* FROM venue_approval_flow_step_rules r JOIN venue_approval_flow_steps s ON s.id=r.step_id
      WHERE s.flow_id=? AND s.org_id=? AND r.org_id=?`, [savedFlow.id, 'other', 'other']))[0];
    assert.equal(savedFlowRules.length, 1);
    assert.equal(savedFlowRules[0].specific_department_id, 'target-department');
    assert.equal(savedFlowRules[0].identity_scope, 'same');
    assert.equal((await admin.query("SELECT is_active FROM venue_approval_flows WHERE id='copy-flow'"))[0][0].is_active, 1);
    const flowActivation = (await (await post('getOrganizationConfigurationDraft', { id: flowDraft.id }, false, true)).json()).activation;
    assert.equal(flowActivation.venueName, '目标场地');
    assert.equal(flowActivation.enabled, false);
    assert.equal((await post('enableOrganizationConfiguration', { id: flowDraft.id, revision: '0'.repeat(64) }, false, true)).status, 409);
    assert.equal((await post('enableOrganizationConfiguration', { id: flowDraft.id, revision: flowActivation.revision }, false, true)).status, 200);
    assert.equal((await admin.query('SELECT is_active FROM venue_approval_flows WHERE id=?', [savedFlow.id]))[0][0].is_active, 1);
    for (const ruleType of ['direct', 'admin', 'identity', 'person']) {
      const ruleId = 'copy-booking-' + ruleType;
      await admin.query(`INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type,approver_identity_id,approver_hr_id,approver_assignment_id,scope_department_id)
        VALUES (?,'copy-venue','org',?,?,?,?, 'department')`, [ruleId, ruleType, ruleType === 'identity' ? 'identity' : null,
        ruleType === 'person' ? 'hr' : null, ruleType === 'person' ? 'assignment' : null]);
      const offer = await (await post('shareOrganizationConfiguration', { kind: 'venue.bookingRules', sourceRecordId: ruleId, targetOrganizationId: 'other' })).json();
      assert.equal(offer.status, 'success');
      const draft = await (await post('receiveOrganizationConfiguration', { shareId: offer.id, shareVersion: 1, requestId: ruleId }, false, true)).json();
      assert.equal(draft.status, 'success');
      const choices = await (await post('getOrganizationConfigurationCandidates', { id: draft.id }, false, true)).json();
      assert.equal(choices.status, 'success');
      const links = { venue: 'copy-target-venue', department: 'target-department',
        ...(ruleType === 'identity' ? { identity: 'target-identity' } : {}),
        ...(ruleType === 'person' ? { assignment: 'target-assignment' } : {}) };
      assert.equal((await post('applyOrganizationConfigurationDraft', { id: draft.id, version: 1,
        references: { ...links, department: 'department' } }, false, true)).status, 409);
      if (ruleType === 'person') {
        assert(choices.assignments.some(job => job.assignmentId === 'target-assignment'));
        assert.equal((await post('applyOrganizationConfigurationDraft', { id: draft.id, version: 1,
          references: { ...links, assignment: 'assignment' } }, false, true)).status, 409);
      }
      const applied = await (await post('applyOrganizationConfigurationDraft', { id: draft.id, version: 1, references: links }, false, true)).json();
      assert.equal(applied.status, 'success');
      const saved = (await admin.query('SELECT * FROM venue_booking_rules WHERE id=? AND org_id=?', [applied.resultId, 'other']))[0][0];
      assert.equal(saved.is_active, 0);
      assert.equal(saved.venue_id, 'copy-target-venue');
      assert.equal(saved.rule_type, ruleType);
      assert.equal(saved.scope_department_id, 'target-department');
      assert.equal(saved.approver_identity_id, ruleType === 'identity' ? 'target-identity' : null);
      assert.equal(saved.approver_assignment_id, ruleType === 'person' ? 'target-assignment' : null);
      assert.equal(saved.approver_hr_id, ruleType === 'person' ? 'target-hr' : null);
      assert.equal((await admin.query("SELECT COUNT(*) AS n FROM venue_approval_flows WHERE org_id='other'"))[0][0].n, 1);
      const reopened = await (await post('getOrganizationConfigurationDraft', { id: draft.id }, false, true)).json();
      assert.equal(reopened.resultId, applied.resultId);
      assert.equal((await (await post('applyOrganizationConfigurationDraft', { id: draft.id, version: 1, references: links }, false, true)).json()).resultId, applied.resultId);
      assert.equal(reopened.activation.enabled, false);
      const enabling = await post('enableOrganizationConfiguration', { id: draft.id, revision: reopened.activation.revision }, false, true);
      assert.equal(enabling.status, ruleType === 'direct' ? 409 : 200);
      assert.equal((await admin.query('SELECT is_active FROM venue_booking_rules WHERE id=?', [applied.resultId]))[0][0].is_active, ruleType === 'direct' ? 0 : 1);
      const afterEnabling = await (await post('getOrganizationConfigurationDraft', { id: draft.id }, false, true)).json();
      assert.equal(afterEnabling.activation.enabled, ruleType !== 'direct');
      assert.equal((await admin.query('SELECT is_active FROM venue_approval_flows WHERE id=?', [savedFlow.id]))[0][0].is_active, 1);
    }
    await admin.query(`INSERT INTO venue_booking_policies(id,org_id,venue_id,open_advance_mode,open_advance_days,open_advance_minutes,
      deadline_advance_mode,deadline_advance_minutes) VALUES ('copy-window','org','copy-venue','days',7,10080,'duration',90)`);
    const windowOffer = await (await post('shareOrganizationConfiguration', { kind: 'venue.bookingWindows', sourceRecordId: 'copy-window', targetOrganizationId: 'other' })).json();
    assert.equal(windowOffer.status, 'success');
    const windowDraft = await (await post('receiveOrganizationConfiguration', { shareId: windowOffer.id, shareVersion: 1, requestId: 'copy-window' }, false, true)).json();
    assert.equal(windowDraft.status, 'success');
    assert.equal((await admin.query("SELECT COUNT(*) AS n FROM venue_booking_policies WHERE org_id='other'"))[0][0].n, 0);
    const windowInput = { id: windowDraft.id, version: 1, references: { venueId: 'copy-target-venue' } };
    const windowResult = await (await post('applyOrganizationConfigurationDraft', windowInput, false, true)).json();
    assert.equal(windowResult.status, 'success');
    const savedWindow = (await admin.query('SELECT * FROM venue_booking_policies WHERE id=? AND org_id=?', [windowResult.resultId, 'other']))[0][0];
    assert.deepEqual([savedWindow.venue_id, savedWindow.open_advance_mode, savedWindow.open_advance_days, savedWindow.open_advance_minutes,
      savedWindow.deadline_advance_mode, savedWindow.deadline_advance_minutes], ['copy-target-venue', 'days', 7, 10080, 'duration', 90]);
    assert.equal((await (await post('applyOrganizationConfigurationDraft', windowInput, false, true)).json()).resultId, windowResult.resultId);
    const extraWindow = await (await post('receiveOrganizationConfiguration', { shareId: windowOffer.id, shareVersion: 1, requestId: 'another-window' }, false, true)).json();
    assert.equal((await post('applyOrganizationConfigurationDraft', { ...windowInput, id: extraWindow.id }, false, true)).status, 409);
    assert.equal((await admin.query("SELECT COUNT(*) AS n FROM venue_booking_policies WHERE org_id='other'"))[0][0].n, 1);
    assert.equal((await configCopy.detail({ id: extraWindow.id }, copyTarget)).state, 'draft');
    await admin.query(`INSERT INTO venue_open_rules(id,venue_id,name,cycle_type,cycle_values,time_start,time_end)
      VALUES ('copy-open','copy-venue','每周开放','weekly','[1,3,5]','08:00','22:00');
      INSERT INTO venue_activity_rules(id,venue_id,activity_name,cycle_type,cycle_values,time_start,time_end)
      VALUES ('copy-activity','copy-venue','周期会议','monthly','{"values":[4],"periodMode":"count","periodStartDate":"2026-11-01","periodStartTime":"00:00","repeatCount":12}','16:30','18:30')`);
    const globalKinds = [['venue.openRules', 'copy-open', 'venue_open_rules'], ['venue.activityRules', 'copy-activity', 'venue_activity_rules']];
    await model.saveRule({ name: '来源仅有时间规则分享权', policy: { ...blank,
      subjects: [{ kind: 'adminGrants', ids: ['regular'] }],
      capabilities: globalKinds.flatMap(([kind]) => [kind + '.read', kind + '.share']),
      scopes: [{ kind: 'organization' }] }, expectedRevision: (await state()).revision }, 'org', createGuard(reference));
    await admin.query("UPDATE auth_sessions SET context_subject_id='regular' WHERE id='session'");
    for (const [kind, sourceRecordId] of globalKinds) {
      const beforeShares = (await admin.query('SELECT COUNT(*) AS total FROM organization_config_shares'))[0][0].total;
      assert.equal((await post('shareOrganizationConfiguration', { kind, sourceRecordId, targetOrganizationId: 'other' })).status, 403);
      const sourceWorkspace = await (await post('getOrganizationConfigurationWorkspace', { kind, tab: 'source' })).json();
      assert.deepEqual(sourceWorkspace.items, []);
      assert.equal((await admin.query('SELECT COUNT(*) AS total FROM organization_config_shares'))[0][0].total, beforeShares);
    }
    await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='session'");
    const sourceCopies = [];
    for (const [kind, sourceRecordId] of globalKinds) {
      const offered = await (await post('shareOrganizationConfiguration', { kind, sourceRecordId, targetOrganizationId: 'other' })).json();
      assert.equal(offered.status, 'success');
      sourceCopies.push(offered);
    }
    await admin.query("UPDATE auth_sessions SET context_subject_id='target-grant' WHERE id='target-session'");
    await model.saveRule({ name: '仅可接收场地时间', policy: { ...blank, subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }],
      capabilities: globalKinds.flatMap(([kind]) => [kind + '.receive', kind + '.create']), scopes: [{ kind: 'organization' }] },
      expectedRevision: (await model.read(admin, 'other')).revision }, 'other', targetGuard);
    const receivedGlobal = [];
    for (const offered of sourceCopies) {
      const received = await (await post('receiveOrganizationConfiguration', { shareId: offered.id, shareVersion: 1,
        requestId: 'global-' + offered.id }, false, true)).json();
      assert.equal(received.status, 'success');
      receivedGlobal.push(received);
      assert.equal((await post('applyOrganizationConfigurationDraft', { id: received.id, version: 1,
        references: { venueId: 'copy-target-venue' } }, false, true)).status, 403);
      const choices = await (await post('getOrganizationConfigurationCandidates', { id: received.id }, false, true)).json();
      assert.deepEqual(choices.choices.venue, []);
    }
    const globalRule = await model.saveRule({ name: '只配置目标场地的共享时间', policy: { ...blank,
      subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }], capabilities: ['venue.sharedConfiguration.configure'],
      scopes: [{ kind: 'records', ids: ['copy-target-venue'] }] }, expectedRevision: (await model.read(admin, 'other')).revision }, 'other', targetGuard);
    const referenceValidator = require('../src/core/models/authorizationReferences');
    for (const [capability, id] of [['venue.resources.update', 'copy-target-venue'],
      ['venue.openRules.share', 'copy-open'], ['venue.activityRules.share', 'copy-activity']]) {
      const referencePolicy = { ...blank, organizationId: 'other', subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }],
        capabilities: [capability], scopes: [{ kind: 'records', ids: [id] }] };
      await pool.withTransaction(connection => referenceValidator.validateReferences(connection, referencePolicy));
      await assert.rejects(pool.withTransaction(connection => referenceValidator.validateReferences(connection,
        { ...referencePolicy, scopes: [{ kind: 'records', ids: ['missing-global-venue-record'] }] })),
      error => error.code === 'authorization_stale_reference');
    }
    await pool.withTransaction(connection => referenceValidator.validateReferences(connection,
      { ...blank, organizationId: 'other', subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }],
        capabilities: ['venue.sharedConfiguration.configure'], scopes: [{ kind: 'records', ids: ['copy-target-venue'] }] }));
    for (const [index, received] of receivedGlobal.entries()) {
      const [kind, sourceId, table] = globalKinds[index];
      const candidates = await (await post('getOrganizationConfigurationCandidates', { id: received.id }, false, true)).json();
      assert.deepEqual(candidates.choices.venue.map(item => item.id), ['copy-target-venue']);
      assert.equal((await post('applyOrganizationConfigurationDraft', { id: received.id, version: 1,
        references: { venueId: 'copy-venue' } }, false, true)).status, 403);
      const input = { id: received.id, version: 1, references: { venueId: 'copy-target-venue' } };
      const applied = await (await post('applyOrganizationConfigurationDraft', input, false, true)).json();
      assert.equal(applied.status, 'success');
      const saved = (await admin.query(`SELECT * FROM ${table} WHERE id=?`, [applied.resultId]))[0][0];
      const source = (await admin.query(`SELECT * FROM ${table} WHERE id=?`, [sourceId]))[0][0];
      assert.equal(saved.venue_id, 'copy-target-venue');
      assert.equal(saved.is_active, 0);
      assert.equal(source.is_active, 1);
      assert.equal(saved.time_start, source.time_start);
      assert.equal(saved.time_end, source.time_end);
      assert.equal(saved.cycle_type, source.cycle_type);
      assert.equal((await configCopy.detail({ id: received.id }, copyTarget)).state, 'applied');
      assert.equal((await (await post('applyOrganizationConfigurationDraft', input, false, true)).json()).resultId, applied.resultId);
      if (kind === 'venue.activityRules') assert.equal(saved.cycle_values.repeatCount, 12);
      const beforeGrant = await (await post('getOrganizationConfigurationDraft', { id: received.id }, false, true)).json();
      assert.equal(beforeGrant.activation, null);
      assert.equal((await post('enableOrganizationConfiguration', { id: received.id, revision: '0'.repeat(64) }, false, true)).status, 403);
      await model.saveRule({ name: '维护已复制的共享时间', policy: { ...blank,
        subjects: [{ kind: 'adminGrants', ids: ['target-grant'] }], capabilities: [kind + '.read', kind + '.update'],
        scopes: [{ kind: 'records', ids: [applied.resultId] }] }, expectedRevision: (await model.read(admin, 'other')).revision }, 'other', targetGuard);
      const activation = (await (await post('getOrganizationConfigurationDraft', { id: received.id }, false, true)).json()).activation;
      assert.equal(activation.shared, true);
      assert.equal(activation.venueName, '目标场地');
      assert.equal((await post('enableOrganizationConfiguration', { id: received.id, revision: activation.revision }, false, true)).status, 200);
      assert.equal((await admin.query(`SELECT is_active FROM ${table} WHERE id=?`, [applied.resultId]))[0][0].is_active, 1);
      received.enabledRevision = (await (await post('getOrganizationConfigurationDraft', { id: received.id }, false, true)).json()).activation.revision;
    }
    const { getActivitySlots } = require('../src/modules/venue/services/venueActivitySchedule');
    const legacyCycles = [
      { id: 'legacy-period', type: 'weekly', values: { values: [1, 3], periodStartDate: '2026-11-01', periodEndDate: '2026-11-30' } },
      { id: 'legacy-repeat', type: 'repeat', values: { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-03', endTime: '02:00', intervalUnit: 'week', intervalValue: 1, repeatCount: 3 } },
      { id: 'legacy-range', type: 'datetime_range', values: { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-04', endTime: '02:00' } }
    ];
    for (const cycle of legacyCycles) {
      await admin.query(`INSERT INTO venue_activity_rules(id,venue_id,activity_name,cycle_type,cycle_values,time_start,time_end)
        VALUES (?,'copy-venue',?,?,?,'08:00','22:00')`, [cycle.id, cycle.id, cycle.type, JSON.stringify(cycle.values)]);
      const offered = await (await post('shareOrganizationConfiguration', { kind: 'venue.activityRules', sourceRecordId: cycle.id, targetOrganizationId: 'other' })).json();
      assert.equal(offered.status, 'success');
      const received = await (await post('receiveOrganizationConfiguration', { shareId: offered.id, shareVersion: 1,
        requestId: 'copy-' + cycle.id }, false, true)).json();
      assert.equal(received.status, 'success');
      const applied = await (await post('applyOrganizationConfigurationDraft', { id: received.id, version: 1,
        references: { venueId: 'copy-target-venue' } }, false, true)).json();
      assert.equal(applied.status, 'success');
      const [savedRows] = await admin.query('SELECT * FROM venue_activity_rules WHERE id=?', [applied.resultId]);
      const [sourceRows] = await admin.query('SELECT * FROM venue_activity_rules WHERE id=?', [cycle.id]);
      assert.equal(savedRows[0].is_active, 0);
      assert.equal(sourceRows[0].is_active, 1);
      assert.deepEqual(sourceRows[0].cycle_values, cycle.values);
      // 比较实际展开日期，而不只验证复制后的字段存在；停用状态不参与纯周期计算。
      const geometry = (row, day) => getActivitySlots(day, [{ ...row, id: 'comparison', venue_id: 'comparison', is_active: 1 }], 480)
        .map(({ activity: _detail, ...slot }) => slot);
      for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-16', '2026-11-23', '2026-12-02']) {
        assert.deepEqual(geometry(savedRows[0], day), geometry(sourceRows[0], day), cycle.id + ':' + day);
      }
      const reopened = await (await post('getOrganizationConfigurationDraft', { id: received.id }, false, true)).json();
      assert.equal(reopened.status, 'success');
      assert.equal(reopened.state, 'applied');
    }
    await model.deleteRules({ expectedRevision: (await model.read(admin, 'other')).revision,
      rules: [{ id: globalRule.id, version: 1 }] }, 'other', targetGuard);
    assert.equal((await post('enableOrganizationConfiguration', { id: receivedGlobal[0].id, revision: receivedGlobal[0].enabledRevision }, false, true)).status, 403);
    assert.equal((await (await post('getOrganizationConfigurationDraft', { id: receivedGlobal[0].id }, false, true)).json()).activation, null);
    assert.equal((await post('applyOrganizationConfigurationDraft', { id: receivedGlobal[0].id, version: 1,
      references: { venueId: 'copy-target-venue' } }, false, true)).status, 403);
    await require('./helpers/directoryAuthorizationCases')(admin);
    await require('./helpers/hrAuthorizationCases')(admin);
    await require('./helpers/adminAccountAuthorizationCases')(admin);
    await require('./helpers/accountGovernanceAuthorizationCases')(admin);
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261019200000_notification_person_dismissals.sql'), 'utf8').split('DELIMITER $$')[0]);
    await require('./helpers/notificationAuthorizationCases')(admin);
    await require('./helpers/venueApprovalAuthorizationCases')(admin);
    await require('./helpers/assignmentAuthorizationCases')(admin);
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261019120000_identity_cards.sql'), 'utf8'));
    await require('./helpers/identityCardAuthorizationCases')(admin);
    console.log('统一授权隔离数据库与 HTTP：规则保存回读、方案发布/恢复、委托撤销、岗位性质、组织隔离、回滚及版本更新通过；配置复制另验同人双组织不合并授权、独立接收/创建、撤权与shadow拒绝。登录会话为隔离夹具，未覆盖真实登录和前端。');
  } finally {
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.query("DROP USER IF EXISTS ?@'%'", [username]);
    await admin.end();
  }
}

run().catch(error => { console.error(error.stack); process.exitCode = 1; });
