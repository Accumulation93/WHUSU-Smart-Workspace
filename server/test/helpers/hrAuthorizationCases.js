'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function hrAuthorizationCases(db) {
  process.env.JWT_SECRET ||= require('node:crypto').randomBytes(48).toString('hex');
  await db.query(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../db/deploy/20261009220000_hr_import_v2.sql'), 'utf8'));
  await db.query(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../db/deploy/20260913140000_cross_org_hr_profile_migration.sql'), 'utf8'));
  await db.query(`CREATE TABLE IF NOT EXISTS personnel_migration_audit (
    id VARCHAR(64) NOT NULL PRIMARY KEY, migration_key VARCHAR(96) NOT NULL, record_type VARCHAR(48) NOT NULL,
    record_id VARCHAR(64), org_id VARCHAR(64), detail_json JSON, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_personnel_migration_record(migration_key,record_type,record_id), INDEX idx_personnel_migration_org(org_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`INSERT INTO organizations(id,name) VALUES ('hr-auth','人事授权测试');
    INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('hr-actor','操作人','HR-A','HR-A'),('hr-target','被授权成员','HR-T','HR-T');
    INSERT INTO accounts(id,person_id) VALUES ('hr-account','hr-actor');
    INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr-actor-row','操作人','HR-A','hr-auth'),('hr-target-row','被授权成员','HR-T','hr-auth');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('hr-actor-member','hr-actor','hr-auth','hr-actor-row'),('hr-target-member','hr-target','hr-auth','hr-target-row');
    INSERT INTO departments(id,name,org_id) VALUES ('hr-dept-a','部门甲','hr-auth'),('hr-dept-b','部门乙','hr-auth');
    INSERT INTO identities(id,name,org_id) VALUES ('hr-identity','成员','hr-auth');
    INSERT IGNORE INTO assignment_natures(id,org_id,name) VALUES ('staff','hr-auth','本会岗位');
    INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES
      ('hr-job','hr-actor-member','hr-auth','staff','hr-dept-a','hr-identity'),
      ('hr-target-job','hr-target-member','hr-auth','staff','hr-dept-a','hr-identity'),
      ('hr-hidden-job','hr-target-member','hr-auth','staff','hr-dept-b','hr-identity');
    INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES ('hr-session','hr-account','','hr-context','assignment','hr-job','hr-auth','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY);
    INSERT INTO org_hr_profile_template_snapshots(id,org_id) VALUES ('hr-snapshot','hr-auth');
    INSERT INTO org_hr_profile_template_snapshot_fields(id,snapshot_id,label,type) VALUES
      ('hr-phone','hr-snapshot','联系电话','text'),('hr-mail','hr-snapshot','邮箱','text'),('hr-student','hr-snapshot','学号','text');
    INSERT INTO hr_profile_records(id,hr_id,template_snapshot_id,audit_status,org_id) VALUES ('hr-record','hr-target-row','hr-snapshot','approved','hr-auth');
    INSERT INTO hr_profile_record_values(id,record_id,field_id,field_value,org_id) VALUES
      ('hr-value-phone','hr-record','hr-phone','123456','hr-auth'),('hr-value-mail','hr-record','hr-mail','private@example.test','hr-auth'),('hr-value-student','hr-record','hr-student','HR-T','hr-auth');
    UPDATE authorization_organizations SET mode='enforced' WHERE org_id='hr-auth'`);
  const policy = { id: 'hr-policy', organizationId: 'hr-auth', effect: 'allow', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['hr-job'] }], capabilities: ['hr.people.read'],
    scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['hr-dept-a'] } }],
    fields: ['name','studentId','assignments','membershipStatus','reviewStatus','profile:hr-phone','profile:hr-student'] };
  await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-policy','hr-auth','资料读取',?)", [JSON.stringify(policy)]);
  const app = express(); app.use(express.json());
  let sourceContext = false;
  let managementContext = false;
  app.use((req, res, next) => {
    req.authAccount = { id: 'hr-account', personId: 'hr-actor' };
    req.authSession = { id: sourceContext ? 'hr-source-session' : 'hr-session' };
    req.authContext = { personId: 'hr-actor', contextId: sourceContext ? 'hr-source-context' : 'hr-context', organizationId: sourceContext ? 'hr-source' : 'hr-auth', role: managementContext ? 'admin' : 'user', assignmentId: 'hr-job' };
    req.logger = { error: (...args) => console.error(...args) };
    require('../../src/utils/orgContext').orgStorage.run(req.authContext.organizationId, next);
  });
  app.use('/api', require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use('/api', require('../../src/core/routes/hr'));
  app.use('/api', require('../../src/core/routes/hrProfile'));
  app.use('/api', require('../../src/core/routes/hrProfileMigration'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body = {}) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return { code: response.status, data: await response.json() };
  }
  try {
    const directory = await call('listHrProfileAdminData');
    assert.equal(directory.data.status, 'success');
    const member = directory.data.rows.find(row => row.id === 'hr-target-row');
    assert(member);
    assert.equal(member.studentId, undefined);
    assert.deepEqual(member.assignments.map(row => row.assignmentId), ['hr-target-job']);
    assert.deepEqual(member.currentValues, { 'hr-phone': '123456' });
    assert(!JSON.stringify(directory.data).includes('private@example.test'));
    assert.deepEqual(directory.data.template.fields.map(row => row.id), ['hr-phone']);
    const detail = await call('getHrPersonDetail', { hrId: 'hr-target-row' });
    assert.equal(detail.data.status, 'success');
    assert.deepEqual(detail.data.values, { 'hr-phone': '123456' });
    assert.equal(detail.data.profile.studentId, undefined);
    assert.deepEqual(detail.data.profile.assignments.map(row => row.assignmentId), ['hr-target-job']);
    const minimal = await call('listHrInfo');
    assert.equal(minimal.data.status, 'success');
    assert(minimal.data.list.every(row => !row.studentId && !row.boundOpenid && !row.personId));
    const governance = await call('listHrGovernance');
    assert.equal(governance.data.status, 'success', JSON.stringify(governance));
    assert(governance.data.rows.every(row => !row.auth && !row.studentId && !row.accountId && !row.personId));
    assert.equal((await call('listHrGovernance', { organizationId: 'other' })).code, 403);
    const identities = await call('listPersonIdentities', { hrId: 'hr-target-row' });
    assert.equal(identities.data.status, 'success', JSON.stringify(identities));
    assert.equal(identities.data.organizations.length, 1);
    assert.deepEqual(identities.data.organizations[0].assignments.map(item => item.id), ['hr-target-job']);
    assert.equal(identities.data.person.studentId, undefined);
    assert.deepEqual(identities.data.globalAdminIdentities, []);
    const writablePolicy = { ...policy, capabilities: ['hr.people.read', 'hr.people.update'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify(writablePolicy)]);
    const saved = await call('saveHrPersonFull', { hrId: 'hr-target-row', profileValues: { 'hr-phone': '654321' } });
    assert.equal(saved.data.status, 'success', JSON.stringify(saved));
    assert.deepEqual((await call('getHrPersonDetail', { hrId: 'hr-target-row' })).data.values, { 'hr-phone': '654321' });
    await db.query("UPDATE hr_profile_records SET audit_status='pending' WHERE id='hr-record'");
    await db.query("INSERT INTO hr_profile_record_values(id,record_id,field_id,field_value,is_pending,org_id) VALUES ('hr-pending-phone','hr-record','hr-phone','888888',1,'hr-auth'),('hr-pending-mail','hr-record','hr-mail','pending@example.test',1,'hr-auth')");
    const reviewPolicy = { ...policy, capabilities: ['hr.people.read', 'hr.profileReview.approve'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify(reviewPolicy)]);
    assert.equal((await call('reviewHrProfileChange', { hrId: 'hr-target-row', action: 'approve' })).code, 403);
    const [[pendingCount]] = await db.query("SELECT COUNT(*) AS count FROM hr_profile_record_values WHERE record_id='hr-record' AND is_pending=1");
    assert.equal(pendingCount.count, 2);
    await db.query("DELETE FROM hr_profile_record_values WHERE id='hr-pending-mail'");
    const todoPolicy = { ...policy, capabilities: ['hr.people.read', 'hr.profileReview.read', 'hr.profileReview.approve'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify(todoPolicy)]);
    const reference = { accountId: 'hr-account', personId: 'hr-actor', sessionId: 'hr-session', contextId: 'hr-context', organizationId: 'hr-auth' };
    assert.deepEqual((await require('../../src/core/models/hrAuthorization').reviewTodos(reference, 'hr-auth', 'hr-context')).map(row => row.hr_id), ['hr-target-row']);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify({ ...todoPolicy, capabilities: ['hr.people.read','hr.profileReview.read'] })]);
    assert.deepEqual(await require('../../src/core/models/hrAuthorization').reviewTodos(reference, 'hr-auth', 'hr-context'), []);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify(todoPolicy)]);
    const reviewed = await call('reviewHrProfileChange', { hrId: 'hr-target-row', action: 'approve' });
    assert.equal(reviewed.data.status, 'success', JSON.stringify(reviewed));
    assert.deepEqual((await call('getHrPersonDetail', { hrId: 'hr-target-row' })).data.values, { 'hr-phone': '888888' });
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify({ ...policy, capabilities: ['hr.people.read','hr.people.export'] })]);
    const exported = await call('exportHrAssignmentTable', { includeProfile: true });
    assert.equal(exported.data.status, 'success', JSON.stringify(exported));
    assert(!exported.data.headers.includes('学号'));
    assert(!JSON.stringify(exported.data).includes('private@example.test'));
    assert(!JSON.stringify(exported.data).includes('部门乙'));
    assert(exported.data.rows.some(row => row.includes('888888')));
    const [[reviewedRecord]] = await db.query("SELECT audit_status FROM hr_profile_records WHERE id='hr-record'");
    assert.equal(reviewedRecord.audit_status, 'approved');
    const [persisted] = await db.query("SELECT field_id,field_value FROM hr_profile_record_values WHERE record_id='hr-record' AND is_pending=0");
    assert.equal(persisted.find(row => row.field_id === 'hr-mail').field_value, 'private@example.test');
    assert.equal(persisted.find(row => row.field_id === 'hr-phone').field_value, '888888');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify(writablePolicy)]);
    assert.equal((await call('saveHrPersonFull', { hrId: 'hr-target-row', profileValues: { 'hr-phone': 'bad-write', 'hr-mail': 'forbidden' } })).code, 403);
    assert.equal((await call('saveHrPersonFull', { hrId: 'hr-target-row', profileValues: { 'hr-phone': 'bad-write', unknown: 'invalid' } })).data.status, 'invalid_params');
    assert.equal((await call('saveHrPersonFull', { hrId: 'hr-target-row', profileValues: { 'hr-student': 'forbidden' } })).code, 403);
    assert.deepEqual((await call('getHrPersonDetail', { hrId: 'hr-target-row' })).data.values, { 'hr-phone': '888888' });
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-policy'", [JSON.stringify({ ...policy, scopes: [{ kind: 'records', ids: ['hr-actor-row'] }] })]);
    assert.equal((await call('getHrPersonDetail', { hrId: 'hr-target-row' })).code, 403);
    assert.deepEqual((await call('listHrInfo')).data.list.map(row => row.id), ['hr-actor-row']);
    await db.query("DELETE FROM authorization_rules WHERE id='hr-policy'");
    assert.deepEqual((await call('listHrProfileAdminData')).data.rows, []);
    await db.query("INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('hr-import-admin','hr-actor','hr-auth','admin')");
    await db.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='hr-import-admin',role='admin' WHERE id='hr-session'");
    managementContext = true;
    const importer = { id: 'hr-import-policy', organizationId: 'hr-auth', effect: 'allow', enabled: true,
      subjects: [{ kind: 'adminGrants', ids: ['hr-import-admin'] }], capabilities: ['hr.import.read','hr.import.create'], scopes: [{ kind: 'organization' }], fields: null };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-import-policy','hr-auth','导入测试',?)", [JSON.stringify(importer)]);
    assert.equal((await call('getHrImportMetadata')).data.status, 'success');
    const { createPage } = require('../hrImportPage.test');
    const fixture = createPage(async () => ({ status: 'success', fields: [] }), {
      fileName: '新增人员.xlsx', headers: ['姓名','学号'], rows: [['新增测试','HR-NEW']]
    });
    await fixture.page.loadMetadata(); await fixture.page.chooseFile();
    const input = JSON.parse(JSON.stringify(fixture.page.payload()));
    const preview = await call('previewHrTableImport', input);
    assert.equal(preview.data.status, 'success', JSON.stringify(preview));
    assert.equal(preview.data.summary.canExecute, true);
    const imported = await call('importHrTable', { schemaVersion: 2, previewId: preview.data.previewId, requestId: 'hr_import_unified_01' });
    assert.equal(imported.data.status, 'success', JSON.stringify(imported));
    const [[newMember]] = await db.query("SELECT name FROM hr_info WHERE org_id='hr-auth' AND student_id='HR-NEW'");
    assert.equal(newMember.name, '新增测试');
    assert.equal((await call('getHrImportResult', { requestId: 'hr_import_unified_01' })).data.status, 'success');
    await db.query("DELETE FROM authorization_rules WHERE id='hr-import-policy'");
    assert.equal((await call('getHrImportMetadata')).code, 403);
    const memberPolicy = { ...importer, id: 'hr-member-policy', capabilities: ['hr.people.create','hr.people.update','hr.people.read'],
      fields: ['name','studentId','membershipStatus','assignments'] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-member-policy','hr-auth','成员维护测试',?)", [JSON.stringify(memberPolicy)]);
    const created = await call('saveHrInfo', { name: '手动新增', studentId: 'HR-MANUAL' });
    assert.equal(created.data.status, 'success', JSON.stringify(created));
    const newHrId = created.data.id;
    assert.equal((await call('getHrPersonDetail', { hrId: newHrId })).data.profile.name, '手动新增');
    const departed = await call('deleteHrInfo', { id: newHrId });
    assert.equal(departed.data.status, 'success', JSON.stringify(departed));
    const [[left]] = await db.query('SELECT status FROM organization_memberships WHERE legacy_hr_id=?', [newHrId]);
    assert.equal(left.status, 'left');
    const rejoined = await call('reactivateHrMembership', { hrId: newHrId });
    assert.equal(rejoined.data.status, 'success', JSON.stringify(rejoined));
    assert.equal((await call('getHrPersonDetail', { hrId: newHrId })).data.membershipStatus, 'active');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-member-policy'", [JSON.stringify({ ...memberPolicy,
      capabilities: ['hr.people.read','hr.people.delete'], fields: null })]);
    const removalPreview = await call('previewHrMemberDeletion', { hrId: newHrId });
    assert.equal(removalPreview.data.status, 'success', JSON.stringify(removalPreview));
    const removed = await call('deleteHrMembershipPermanently', { hrId: newHrId,
      expectedVersion: removalPreview.data.preview.version, acceptCleanup: true, clientRequestId: 'hr-authorized-delete-01' });
    assert.equal(removed.data.status, 'success', JSON.stringify(removed));
    const [[remaining]] = await db.query('SELECT COUNT(*) AS count FROM hr_info WHERE id=?', [newHrId]);
    assert.equal(remaining.count, 0);
    await db.query("DELETE FROM authorization_rules WHERE id='hr-member-policy'");
    assert.equal((await call('deleteHrInfo', { id: newHrId })).code, 403);
    const templatePolicy = { ...importer, id: 'hr-template-policy', capabilities: ['hr.profileTemplates.read','hr.profileTemplates.create','hr.profileTemplates.update','hr.profileTemplates.delete','hr.profileSelection.read','hr.profileSelection.update'] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-template-policy','hr-auth','资料模板配置',?)", [JSON.stringify(templatePolicy)]);
    const templatePayload = { name: '授权模板', description: '隔离验证', editMode: 'direct', fields: [{ label: '测试字段', type: 'text', required: false }] };
    const templateSaved = await call('saveHrProfileTemplateDefinition', templatePayload);
    assert.equal(templateSaved.data.status, 'success', JSON.stringify(templateSaved));
    const templateId = templateSaved.data.id;
    const templateList = await call('listHrProfileTemplates');
    assert(templateList.data.list.some(item => item.id === templateId));
    assert.equal((await call('saveHrProfileTemplateDefinition', { ...templatePayload, id: templateId, name: '授权模板修改' })).data.status, 'success');
    const [[templateRow]] = await db.query('SELECT name FROM hr_profile_templates WHERE id=?', [templateId]);
    assert.equal(templateRow.name, '授权模板修改');
    const duplicate = await call('duplicateHrProfileTemplateDefinition', { id: templateId });
    assert.equal(duplicate.data.status, 'success', JSON.stringify(duplicate));
    assert.equal((await call('saveOrgHrProfileTemplateSettings', { description: '本组织说明', editMode: 'audit' })).data.status, 'success');
    const [[settings]] = await db.query("SELECT description,edit_mode FROM org_hr_profile_template_snapshots WHERE org_id='hr-auth'");
    assert.deepEqual([settings.description,settings.edit_mode], ['本组织说明','audit']);
    assert.equal((await call('deleteHrProfileTemplateDefinition', { id: duplicate.data.id })).data.status, 'success');
    await db.query("DELETE FROM authorization_rules WHERE id='hr-template-policy'");
    assert.equal((await call('saveHrProfileTemplateDefinition', { ...templatePayload, id: templateId })).code, 403);
    const accountPolicy = { ...importer, id: 'hr-account-policy', capabilities: ['auth.accounts.read','auth.accounts.update'] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-account-policy','hr-auth','账号治理读取',?)", [JSON.stringify(accountPolicy)]);
    const accounts = await call('listHrGovernance');
    assert.equal(accounts.data.status, 'success', JSON.stringify(accounts));
    assert(accounts.data.rows.some(row => row.accountId === 'hr-account' && row.auth.status === 'verified'));
    assert(accounts.data.rows.every(row => row.studentId === undefined));
    assert(accounts.data.rows.some(row => row.canGlobalAccountManage));
    await db.query("DELETE FROM authorization_rules WHERE id='hr-account-policy'");
    assert.deepEqual((await call('listHrGovernance')).data.rows, []);
    const identityPolicy = { ...accountPolicy, capabilities: ['auth.identity.verify'] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-account-policy','hr-auth','身份认证',?)", [JSON.stringify(identityPolicy)]);
    const identityDirectory = await call('listHrGovernance');
    assert.equal(identityDirectory.data.status, 'success', JSON.stringify(identityDirectory));
    assert(identityDirectory.data.rows.length >= 2);
    assert(identityDirectory.data.rows.every(row => row.canVerifyIdentity && !row.canGlobalAccountManage && !row.canRecoverAccount));
    assert(identityDirectory.data.rows.every(row => row.auth.hasPassphrase === undefined && row.auth.pendingRecoveryId === undefined && row.studentId === undefined));
    const recoveryPolicy = { ...accountPolicy, capabilities: ['auth.recovery.update'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='hr-account-policy'", [JSON.stringify(recoveryPolicy)]);
    await db.query(`INSERT INTO account_recovery_requests(id,person_id,account_id,requested_org_id,new_openid_hash,expires_at,created_at)
      VALUES ('hr-recovery-local','hr-actor','hr-account','hr-auth','',UTC_TIMESTAMP()+INTERVAL 1 DAY,UTC_TIMESTAMP()-INTERVAL 1 HOUR),
      ('hr-recovery-other','hr-actor','hr-account','other-organization','',UTC_TIMESTAMP()+INTERVAL 1 DAY,UTC_TIMESTAMP())`);
    const recoveryDirectory = await call('listHrGovernance');
    assert.equal(recoveryDirectory.data.status, 'success', JSON.stringify(recoveryDirectory));
    assert(recoveryDirectory.data.rows.every(row => row.canRecoverAccount && !row.canVerifyIdentity && !row.canGlobalAccountManage));
    assert(recoveryDirectory.data.rows.every(row => row.auth.pendingClaimId === undefined && row.auth.hasPassphrase === undefined));
    assert(recoveryDirectory.data.rows.every(row => typeof row.auth.hasRecoveryCode === 'boolean'));
    assert.equal(recoveryDirectory.data.rows.find(row => row.personId === 'hr-actor').auth.pendingRecoveryId, 'hr-recovery-local');
    assert(!JSON.stringify(recoveryDirectory.data).includes('hr-recovery-other'));
    await db.query("DELETE FROM account_recovery_requests WHERE id IN ('hr-recovery-local','hr-recovery-other')");
    await db.query("DELETE FROM authorization_rules WHERE id='hr-account-policy'");
    await db.query(`INSERT INTO organizations(id,name) VALUES ('hr-source','来源组织');
      UPDATE authorization_organizations SET mode='enforced' WHERE org_id='hr-source';
      INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr-source-row','被授权成员','HR-T','hr-source');
      INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('hr-source-member','hr-target','hr-source','hr-source-row');
      INSERT INTO org_hr_profile_template_snapshots(id,org_id) VALUES ('hr-source-snapshot','hr-source');
      INSERT INTO org_hr_profile_template_snapshot_fields(id,snapshot_id,label,type) VALUES ('hr-source-phone','hr-source-snapshot','联系电话','text');
      INSERT INTO hr_profile_records(id,hr_id,template_snapshot_id,audit_status,org_id) VALUES ('hr-source-record','hr-source-row','hr-source-snapshot','approved','hr-source');
      INSERT INTO hr_profile_record_values(id,record_id,field_id,field_value,org_id) VALUES ('hr-source-value','hr-source-record','hr-source-phone','source-secret-phone','hr-source');
      INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('hr-source-admin','hr-actor','hr-source','admin');
      INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES ('hr-source-session','hr-account','','hr-source-context','admin','hr-source-admin','hr-source','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`);
    const requester = { ...importer, id: 'hr-migration-policy', capabilities: ['hr.profileMigration.read','hr.profileMigration.request'] };
    await db.query("INSERT INTO authorization_organizations(org_id,mode) VALUES ('hr-source','enforced') ON DUPLICATE KEY UPDATE mode='enforced'");
    const approver = { ...requester, id: 'hr-source-policy', organizationId: 'hr-source', subjects: [{ kind: 'adminGrants', ids: ['hr-source-admin'] }], capabilities: ['hr.profileMigration.read','hr.profileMigration.approve'] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-migration-policy','hr-auth','迁移申请',?),('hr-source-policy','hr-source','来源批准',?)", [JSON.stringify(requester), JSON.stringify(approver)]);
    const migrationInput = { sourceOrgId: 'hr-source', personIds: ['hr-target'], fieldActions: [{ sourceFieldId: 'hr-source-phone', action: 'copy', targetTemplateFieldId: 'hr-phone', conflictPolicy: 'overwrite' }] };
    const migrationPreview = await call('previewCrossOrgMigration', migrationInput);
    assert.equal(migrationPreview.data.status, 'success', JSON.stringify(migrationPreview));
    assert(!JSON.stringify(migrationPreview.data).includes('source-secret-phone'));
    const migrationRequest = await call('submitCrossOrgMigrationRequest', { ...migrationInput, switchToken: migrationPreview.data.switchToken });
    assert.equal(migrationRequest.data.status, 'success', JSON.stringify(migrationRequest));
    assert.notEqual((await call('reviewCrossOrgMigrationRequest', { id: migrationRequest.data.id, action: 'approve' })).data.status, 'success');
    sourceContext = false;
    assert.equal((await call('previewHrMemberDeletion', { scope: 'person', hrId: 'hr-target-row' })).code, 403);
    await db.query("UPDATE admin_grants SET admin_level='super_admin',org_id='' WHERE id='hr-import-admin'");
    const globalTarget = await call('saveHrInfo', { name: '全局删除测试', studentId: 'HR-GLOBAL' });
    assert.equal(globalTarget.data.status, 'success', JSON.stringify(globalTarget));
    const globalPreview = await call('previewHrMemberDeletion', { scope: 'person', hrId: globalTarget.data.id });
    assert.equal(globalPreview.data.status, 'success', JSON.stringify(globalPreview));
    const globallyRemoved = await call('deletePersonPermanently', { hrId: globalTarget.data.id,
      expectedVersion: globalPreview.data.preview.version, acceptCleanup: true, confirmStudentId: 'HR-GLOBAL', clientRequestId: 'hr-global-removal-01' });
    assert.equal(globallyRemoved.data.status, 'success', JSON.stringify(globallyRemoved));
    const [[noPerson]] = await db.query("SELECT COUNT(*) AS count FROM persons WHERE normalized_student_id='HR-GLOBAL'");
    assert.equal(noPerson.count, 0);
    await db.query("UPDATE admin_grants SET admin_level='admin',org_id='hr-auth' WHERE id='hr-import-admin'");
    sourceContext = true;
    await db.query("DELETE FROM authorization_rules WHERE id='hr-migration-policy'");
    assert.notEqual((await call('reviewCrossOrgMigrationRequest', { id: migrationRequest.data.id, action: 'approve' })).data.status, 'success');
    const [[stillPending]] = await db.query('SELECT status FROM org_hr_profile_migrations WHERE id=?', [migrationRequest.data.id]);
    assert.equal(stillPending.status, 'pending');
    const [[unchangedValue]] = await db.query("SELECT field_value FROM hr_profile_record_values WHERE record_id='hr-record' AND field_id='hr-phone' AND is_pending=0");
    assert.equal(unchangedValue.field_value, '888888');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-migration-policy','hr-auth','迁移申请',?)", [JSON.stringify(requester)]);
    const migrationApproved = await call('reviewCrossOrgMigrationRequest', { id: migrationRequest.data.id, action: 'approve' });
    assert.equal(migrationApproved.data.status, 'success', JSON.stringify(migrationApproved));
    const [[copied]] = await db.query("SELECT field_value FROM hr_profile_record_values WHERE record_id='hr-record' AND field_id='hr-phone' AND is_pending=0");
    assert.equal(copied.field_value, 'source-secret-phone');
    assert.notEqual((await call('reviewCrossOrgMigrationRequest', { id: migrationRequest.data.id, action: 'approve' })).data.status, 'success');
    sourceContext = false;
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('hr-template-policy','hr-auth','资料模板配置',?)", [JSON.stringify(templatePolicy)]);
    const fieldActions = ['hr-phone','hr-mail','hr-student'].map(id => ({ sourceSnapshotFieldId: id, action: 'hide' }));
    const switchPreview = await call('previewHrProfileTemplateSwitch', { targetTemplateId: templateId, fieldActions });
    assert.equal(switchPreview.data.status, 'success', JSON.stringify(switchPreview));
    const switched = await call('applyHrProfileTemplateSwitch', { targetTemplateId: templateId, fieldActions, switchToken: switchPreview.data.switchToken });
    assert.equal(switched.data.status, 'success', JSON.stringify(switched));
    const reopenedTemplates = await call('listHrProfileTemplates');
    assert.deepEqual(reopenedTemplates.data.activeSnapshot.fields.map(field => field.label), ['测试字段']);
    const [activeFields] = await db.query("SELECT f.label FROM org_hr_profile_template_snapshot_fields f JOIN org_hr_profile_template_snapshots s ON s.id=f.snapshot_id WHERE s.org_id='hr-auth' AND f.is_active=1");
    assert.deepEqual(activeFields.map(field => field.label), ['测试字段']);
    assert.equal((await call('previewPersonIdentityCorrection', { hrId: 'hr-target-row', name: '不应更改', studentId: 'HR-FAIL' })).code, 403);
    await db.query("UPDATE admin_grants SET admin_level='super_admin',org_id='' WHERE id='hr-import-admin'");
    const correctionSource = await call('saveHrInfo', { name: '更正前', studentId: 'HR-CORRECTION' });
    const correctionTarget = await call('saveHrInfo', { name: '合并目标', studentId: 'HR-MERGE-TARGET' });
    const correctionInput = { hrId: correctionSource.data.id, name: '更正后', studentId: 'HR-CORRECTED' };
    const correctionPreview = await call('previewPersonIdentityCorrection', correctionInput);
    assert.equal(correctionPreview.data.status, 'success', JSON.stringify(correctionPreview));
    const corrected = await call('applyPersonIdentityCorrection', { ...correctionInput, version: correctionPreview.data.preview.version });
    assert.equal(corrected.data.status, 'success', JSON.stringify(corrected));
    const [[correctedRow]] = await db.query('SELECT name,student_id FROM hr_info WHERE id=?', [correctionSource.data.id]);
    assert.deepEqual([correctedRow.name,correctedRow.student_id], ['更正后','HR-CORRECTED']);
    const mergePreview = await call('previewPersonIdentityCorrection', { hrId: correctionSource.data.id, name: '合并目标', studentId: 'HR-MERGE-TARGET' });
    assert.equal(mergePreview.data.preview.mergeRequired, true);
    const merge = await call('mergePersons', { confirmed: true, sourcePersonId: mergePreview.data.preview.personId,
      targetPersonId: mergePreview.data.preview.conflictPerson.personId, sourceVersion: mergePreview.data.preview.version,
      targetVersion: mergePreview.data.preview.conflictPerson.version });
    assert.equal(merge.data.status, 'success', JSON.stringify(merge));
    const [[mergedSource]] = await db.query('SELECT status,merged_into_person_id FROM persons WHERE id=?', [mergePreview.data.preview.personId]);
    assert.deepEqual([mergedSource.status,mergedSource.merged_into_person_id], ['merged',mergePreview.data.preview.conflictPerson.personId]);
    assert.equal((await call('getHrPersonDetail', { hrId: correctionTarget.data.id })).data.profile.name, '合并目标');
    await db.query("UPDATE admin_grants SET admin_level='admin',org_id='hr-auth' WHERE id='hr-import-admin'");
    assert.equal((await call('applyPersonIdentityCorrection', { ...correctionInput, version: correctionPreview.data.preview.version })).code, 403);
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }
};
