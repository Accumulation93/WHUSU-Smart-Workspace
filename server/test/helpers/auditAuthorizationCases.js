'use strict';

const assert = require('node:assert/strict');

module.exports = async function auditAuthorizationCases(pool, orgStorage, router) {
  await pool.query("INSERT INTO assignment_natures(id,org_id,name) VALUES ('staff','submit-a','任职')");
  await pool.query("INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('audit-person','授权测试成员','audit-fixture','audit-fixture')");
  await pool.query("INSERT INTO accounts(id,person_id) VALUES ('audit-account','audit-person')");
  await pool.query("INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('audit-hr','授权测试成员','audit-fixture','submit-a')");
  await pool.query("INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('audit-member','audit-person','submit-a','audit-hr')");
  await pool.query("INSERT INTO departments(id,name,org_id) VALUES ('audit-department','测试部门','submit-a')");
  await pool.query("INSERT INTO identities(id,name,org_id) VALUES ('audit-identity','测试身份','submit-a')");
  await pool.query("INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES ('audit-assignment','audit-member','submit-a','staff','audit-department','audit-identity')");
  await pool.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
    VALUES ('audit-session','audit-account','','audit-context','assignment','audit-assignment','submit-a','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`);
  const reference = { accountId: 'audit-account', personId: 'audit-person', sessionId: 'audit-session', contextId: 'audit-context', organizationId: 'submit-a' };
  const model = require('../../src/core/models/authorization');
  const guard = { authorize: async () => ({ contextId: 'audit-context', organizationId: 'submit-a' }), validateChange: async () => {}, validateReferences: async () => {} };
  const read = () => model.read(pool, 'submit-a');
  const policy = { effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['audit-assignment'] }],
    capabilities: ['audit.templates.read', 'audit.templates.create', 'audit.templates.update', 'audit.templates.delete',
      'audit.templateCandidates.read', 'audit.stamps.read', 'audit.stamps.create', 'audit.stamps.update', 'audit.stamps.delete', 'audit.stampCandidates.read',
      'audit.verification.read', 'audit.verification.configure'],
    scopes: [{ kind: 'organization' }], fields: null };
  await model.saveRule({ name: '普通岗位审核模板', policy, expectedRevision: (await read()).revision }, 'submit-a', guard);
  await pool.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='submit-a'");
  const call = async (name, body, options = {}) => {
    const handler = router.stack.find(layer => layer.route.path === '/' + name).route.stack[0].handle;
    let result;
    const response = { status() { return this; }, json(value) { result = value; return value; } };
    const request = options.legacy ? { admin: { id: 'test-admin' }, body } : { unifiedAuthorization: { reference }, body };
    await orgStorage.run(options.org || 'submit-a', () => handler(request, response));
    return result;
  };
  const form = { name: '普通岗位新增模板', description: '', starterType: 'conditions', starterConditions: [],
    steps: ['pass','sign','estamp','both','either'].map(actionType => ({ name: actionType, actionType,
      conditions: [{ conditionType: 'submitter' }], allowApproverDesignation: true })) };
  const saved = await call('saveAuditFlowTemplate', form);
  assert.equal(saved.status, 'success', JSON.stringify(saved));
  let listed = await call('listAuditFlowTemplates', {});
  assert.equal(listed.status, 'success', JSON.stringify(listed));
  const item = listed.templates.find(value => value.id === saved.id);
  assert.deepEqual(item.steps.map(value => value.actionType), ['pass','sign','estamp','both','either']);
  assert.equal(item.createdBy, undefined);
  assert.equal((await call('saveAuditFlowTemplate', { ...form, id: saved.id, name: '改名后回读' })).status, 'success');
  assert.equal((await call('listAuditFlowTemplates', {})).templates.find(value => value.id === saved.id).name, '改名后回读');
  assert.equal((await call('saveAuditFlowTemplate', { ...form, id: saved.id }, { legacy: true })).status, 'forbidden');
  assert.equal((await call('saveAuditFlowTemplate', { ...form, id: saved.id }, { org: 'submit-b' })).status, 'forbidden');
  const malformed = { ...form, id: saved.id, steps: [...form.steps, { actionType: 'invalid' }] };
  assert.equal((await call('saveAuditFlowTemplate', malformed)).status, 'invalid_params');
  assert.equal((await call('listAuditFlowTemplates', {})).templates.find(value => value.id === saved.id).steps.length, 5);
  const deny = await model.saveRule({ name: '禁止修改说明', policy: { ...policy, effect: 'deny',
    capabilities: ['audit.templates.update'], fields: ['description'] }, expectedRevision: (await read()).revision }, 'submit-a', guard);
  assert.equal((await call('saveAuditFlowTemplate', { ...form, id: saved.id, name: '不应保存' })).status, 'forbidden');
  assert.equal((await call('listAuditFlowTemplates', {})).templates.find(value => value.id === saved.id).name, '改名后回读');
  await model.deleteRules({ rules: [{ id: deny.id, version: deny.version }], expectedRevision: (await read()).revision }, 'submit-a', guard);
  await pool.query("UPDATE membership_assignments SET status='inactive' WHERE id='audit-assignment'");
  assert.equal((await call('deleteAuditFlowTemplate', { id: saved.id })).status, 'forbidden');
  await pool.query("UPDATE membership_assignments SET status='active' WHERE id='audit-assignment'");
  assert.equal((await call('deleteAuditFlowTemplate', { id: saved.id })).status, 'success');
  assert.equal((await call('listAuditFlowTemplates', {})).templates.length, 0);
  const directory = await call('getAuditTemplateEditorData', {});
  assert.equal(directory.status, 'success');
  assert.equal(directory.data.people[0].name, '授权测试成员');
  assert.equal(directory.data.people[0].studentId, undefined);
  const imageData = 'data:image/png;base64,' + Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).toString('base64');
  const stamp = await call('saveStamp', { name: '岗位印章管理', imageData });
  assert.equal(stamp.status, 'success', JSON.stringify(stamp));
  assert.equal((await call('saveStamp', { id: stamp.id, name: '更新印章', imageData })).status, 'success');
  assert.equal((await call('listStampCandidates', {})).candidates[0].assignmentId, 'audit-assignment');
  assert.equal((await call('saveStampGrants', { stampId: stamp.id, assignmentIds: ['audit-assignment'] })).status, 'success');
  const stamps = (await call('listStamps', {})).stamps;
  assert.equal(stamps[0].name, '更新印章');
  assert.equal(stamps[0].imageData, imageData);
  assert.equal(stamps[0].assignedPeople[0].assignmentId, 'audit-assignment');
  assert.equal((await call('saveStampGrants', { stampId: stamp.id, assignmentIds: ['missing'] })).status, 'assignment_unavailable');
  assert.equal((await call('listStamps', {})).stamps[0].assignedPeople.length, 1);
  assert.equal((await call('saveStamp', { id: stamp.id, name: '迟到请求', imageData }, { legacy: true })).status, 'forbidden');
  assert.equal((await call('deleteStamp', { id: stamp.id })).status, 'success');
  assert.equal((await call('listStamps', {})).stamps.length, 0);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM stamp_assignment_grants WHERE stamp_id=?', [stamp.id]))[0][0].count), 0);
  assert.equal((await call('listAuditVerificationCandidates', {})).candidates[0].id, 'audit-hr');
  assert.equal((await call('saveVerificationPermission', { granteeHrId: 'audit-hr', action: 'grant' })).status, 'success');
  assert.equal((await call('listVerificationPermissions', {})).permissions[0].granteeName, '授权测试成员');
  assert.equal((await call('saveVerificationPermission', { granteeHrId: 'audit-hr', action: 'unknown' })).status, 'invalid_params');
  assert.equal((await call('saveVerificationPermission', { granteeHrId: 'audit-hr', action: 'revoke' }, { legacy: true })).status, 'forbidden');
  assert.equal((await call('listVerificationPermissions', {})).permissions.length, 1);
  assert.equal((await call('saveVerificationPermission', { granteeHrId: 'audit-hr', action: 'revoke' })).status, 'success');
  assert.equal((await call('listVerificationPermissions', {})).permissions.length, 0);
  await pool.query(`INSERT INTO audit_submissions(id,submission_number,submitted_by,title,org_id)
    VALUES ('audit-visible','AUTH-A','audit-hr','获准查看的申请','submit-a'),
      ('audit-hidden','AUTH-B','audit-hr','未获授权的申请','submit-a'),
      ('audit-foreign','AUTH-C','audit-hr','其他组织申请','submit-b')`);
  await model.saveRule({ name: '仅查看一个申请', policy: { ...policy, capabilities: ['audit.submissions.read'],
    scopes: [{ kind: 'records', ids: ['audit-visible'] }] }, expectedRevision: (await read()).revision }, 'submit-a', guard);
  const submissions = await call('listAllAuditSubmissions', { limit: 50, offset: 0 });
  assert.equal(submissions.status, 'success', JSON.stringify(submissions));
  assert.deepEqual(submissions.submissions.map(item => item.id), ['audit-visible']);
  const progress = await call('getAuditProgress', { submissionId: 'audit-visible' });
  assert.equal(progress.status, 'success', JSON.stringify(progress));
  assert.equal(progress.submission.submitterName, '授权测试成员');
  assert.deepEqual(progress.steps, []);
  assert.equal((await call('getAuditProgress', { submissionId: 'audit-hidden' })).status, 'forbidden');
  assert.equal((await call('getAuditProgress', { submissionId: 'audit-foreign' })).status, 'forbidden');
  await require('./auditVerificationAuthorizationCases')(pool, orgStorage, { reference, policy, model, guard, read });
  await require('./scoringRuleAuthorizationCases')(pool, orgStorage, { reference, policy, model, guard, read });
  console.log('审核统一授权真实数据库：普通岗位新增/编辑/保存回读/删除、五种动作、字段禁止、跨组织、切换后旧写拒绝、岗位失效通过');
};
