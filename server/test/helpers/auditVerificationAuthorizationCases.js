'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = async function auditVerificationAuthorizationCases(pool, orgStorage, fixture) {
  const { reference, policy, model, guard, read } = fixture;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.authAccount = { id: reference.accountId, personId: reference.personId };
    req.authSession = { id: reference.sessionId };
    req.authContext = { role: 'user', personId: reference.personId, organizationId: reference.organizationId,
      contextId: reference.contextId, assignmentId: 'audit-assignment', membershipId: 'audit-member', legacyHrId: 'audit-hr' };
    req.logger = { error() {} };
    orgStorage.run(reference.organizationId, next);
  });
  app.use(require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use(require('../../src/modules/audit/routes/auditSignature'));
  app.use(require('../../src/modules/audit/routes/auditUser'));
  app.use(require('../../src/modules/audit/routes/notification'));
  app.use(require('../../src/core/routes/authorization'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  async function post(name, body = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response.json();
  }
  async function addRule(name, capabilities, effect = 'allow') {
    return model.saveRule({ name, policy: { ...policy, capabilities, effect }, expectedRevision: (await read()).revision }, 'submit-a', guard);
  }
  async function removeRule(rule) {
    return model.deleteRules({ rules: [{ id: rule.id, version: rule.version }], expectedRevision: (await read()).revision }, 'submit-a', guard);
  }
  try {
    const detail = await post('getSubmissionDetail', { submissionId: 'audit-visible' });
    assert.equal(detail.status, 'success', JSON.stringify(detail));
    assert.equal(detail.submission.title, '获准查看的申请');
    assert.equal(detail.userIsAdmin, false);
    assert.equal(detail.userIsSubmitter, false);
    assert.equal(detail.canApproveCurrentStep, false);
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-hidden' })).status, 'forbidden');
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-foreign' })).status, 'not_found');
    // 只有同一岗位的提交关系可以继续读取，姓名或自然人相同不构成该关系。
    await pool.query("UPDATE audit_submissions SET submitted_assignment_id='audit-assignment' WHERE id='audit-hidden' AND org_id='submit-a'");
    const ownDetail = await post('getSubmissionDetail', { submissionId: 'audit-hidden' });
    assert.equal(ownDetail.status, 'success', JSON.stringify(ownDetail));
    assert.equal(ownDetail.userIsSubmitter, true);
    await pool.query("UPDATE audit_submissions SET status='in_progress', current_step_index=1 WHERE id='audit-hidden' AND org_id='submit-a'");
    await pool.query(`INSERT INTO audit_submission_steps(id,submission_id,sort_order,action_type,step_conditions_json,org_id)
      VALUES ('audit-pending-own','audit-hidden',1,'pass',?,'submit-a')`, [JSON.stringify([{ conditionType: 'submitter' }])]);
    assert.deepEqual((await post('listPendingApprovals')).pending.map(item => item.submissionId), ['audit-hidden']);
    assert.equal((await post('checkPendingCount')).count, 1);
    // 生产旧表与后续游标表采用不同排序规则，必须在真实数据库保留该差异。
    await pool.query("ALTER TABLE audit_read_cursors MODIFY last_read_status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT ''");
    await assert.rejects(pool.query(`SELECT c.last_read_status <=> s.status FROM audit_submissions s
      LEFT JOIN audit_read_cursors c ON c.submission_id=s.id WHERE s.id='audit-hidden'`),
    error => error.code === 'ER_CANT_AGGREGATE_2COLLATIONS');
    const unread = await post('getUnreadCounts');
    assert.equal(unread.status, 'success', JSON.stringify(unread));
    assert.equal(unread.pendingCount, 1);
    assert.equal(unread.mySubmissionsUnread, 1);
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-hidden' })).status, 'success');
    assert.deepEqual((await pool.query("SELECT last_read_status,last_read_step_index FROM audit_read_cursors WHERE submission_id='audit-hidden' AND org_id='submit-a' AND hr_id='audit-hr'"))[0],
      [{ last_read_status: 'in_progress', last_read_step_index: 1 }]);
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    await pool.query("UPDATE audit_read_cursors SET last_read_status=NULL WHERE submission_id='audit-hidden' AND org_id='submit-a' AND hr_id='audit-hr'");
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 1);
    assert.equal((await post('markAllSubmissionsRead')).status, 'success');
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    await pool.query("UPDATE audit_submissions SET status='rejected' WHERE id='audit-hidden' AND org_id='submit-a'");
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 1);
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-hidden' })).status, 'success');
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    await pool.query("UPDATE audit_submissions SET current_step_index=2 WHERE id='audit-hidden' AND org_id='submit-a'");
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 1);
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-visible' })).status, 'forbidden');
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-foreign' })).status, 'forbidden');
    assert.equal((await pool.query("SELECT COUNT(*) AS total FROM audit_read_cursors WHERE submission_id IN ('audit-visible','audit-foreign')"))[0][0].total, 0);
    await pool.query("UPDATE audit_submissions SET status='in_progress',current_step_index=1 WHERE id='audit-hidden' AND org_id='submit-a'");
    await pool.query("DELETE FROM audit_read_cursors WHERE submission_id='audit-hidden' AND org_id='submit-a' AND hr_id='audit-hr'");
    const portalTodos = await post('listTodos');
    assert.equal(portalTodos.status, 'success', JSON.stringify(portalTodos));
    assert.equal(portalTodos.partial, false, JSON.stringify(portalTodos));
    assert.deepEqual(portalTodos.items.map(item => item.targetId), ['audit-hidden']);
    const filterTodo = require('../../src/modules/audit/models/todoAuthorization').filterAuditSteps;
    const todoEntries = [{ submission_id: 'audit-hidden' }];
    assert.equal((await filterTodo(todoEntries, 'submit-a', reference.contextId, reference)).length, 1);
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-hidden' })).canApproveCurrentStep, true);
    const approvalDeny = await addRule('禁止处理当前申请', ['audit.submissions.approve'], 'deny');
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-hidden' })).canApproveCurrentStep, false);
    assert.deepEqual((await post('listPendingApprovals')).pending, []);
    assert.equal((await post('checkPendingCount')).count, 0);
    assert.equal((await post('getUnreadCounts')).pendingCount, 0);
    const forbiddenTodos = await post('listTodos');
    assert.equal(forbiddenTodos.status, 'success', JSON.stringify(forbiddenTodos));
    assert.equal(forbiddenTodos.partial, false, JSON.stringify(forbiddenTodos));
    assert.deepEqual(forbiddenTodos.items, []);
    assert.deepEqual(await filterTodo(todoEntries, 'submit-a', reference.contextId, reference), []);
    await assert.rejects(filterTodo(todoEntries, 'submit-a', 'unknown-context', reference), { code: 'authorization_forbidden' });
    for (const name of ['approveStep', 'rejectStep']) {
      const denied = await post(name, { submissionId: 'audit-hidden', stepId: 'audit-pending-own', rejectionReason: '需要修改' });
      assert.equal(denied.status, 'forbidden', JSON.stringify(denied));
    }
    assert.equal((await pool.query("SELECT status FROM audit_submission_steps WHERE id='audit-pending-own' AND org_id='submit-a'"))[0][0].status, 'pending');
    assert.equal((await pool.query("SELECT COUNT(*) AS count FROM audit_events WHERE submission_id='audit-hidden' AND org_id='submit-a'"))[0][0].count, 0);
    await removeRule(approvalDeny);
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-hidden' })).canApproveCurrentStep, true);
    const ownList = await post('listMySubmissions', { limit: 1, offset: 0 });
    assert.equal(ownList.status, 'success', JSON.stringify(ownList));
    assert.deepEqual(ownList.submissions.map(item => item.id), ['audit-hidden']);
    const detailDeny = await addRule('申请关系不能绕过禁止', ['audit.submissions.read'], 'deny');
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-hidden' })).status, 'forbidden');
    assert.equal((await post('markAllSubmissionsRead')).status, 'success');
    assert.equal((await pool.query("SELECT COUNT(*) AS count FROM audit_read_cursors WHERE org_id='submit-a' AND hr_id='audit-hr'"))[0][0].count, 0);
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-hidden' })).status, 'forbidden');
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-visible' })).status, 'forbidden');
    assert.deepEqual((await post('listMySubmissions', { limit: 1 })).submissions, []);
    assert.deepEqual((await post('listPendingApprovals')).pending, []);
    assert.equal((await post('checkPendingCount')).count, 0);
    await removeRule(detailDeny);
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-visible' })).status, 'forbidden');
    assert.equal((await post('markSubmissionRead', { submissionId: 'audit-hidden' })).status, 'success');
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    await pool.query("DELETE FROM audit_read_cursors WHERE org_id='submit-a' AND hr_id='audit-hr'");
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-hidden' })).status, 'success');
    assert.deepEqual((await post('listMySubmissions', { limit: 1 })).submissions.map(item => item.id), ['audit-hidden']);
    await pool.query(`INSERT INTO audit_submissions(id,submission_number,submitted_by,submitted_assignment_id,title,org_id,created_at)
      VALUES ('audit-own-older','AUTH-OWN-OLDER','audit-hr','audit-assignment','较早的本人申请','submit-a','2020-01-01 00:00:00')`);
    await pool.query(`INSERT INTO audit_events(id,submission_id,event_type,step_index,operator_hr_id,operator_assignment_id,org_id,created_at)
      VALUES ('audit-history-newer','audit-hidden','approve',1,'audit-hr','audit-assignment','submit-a','2020-01-02 00:00:00'),
        ('audit-history-older','audit-own-older','reject',1,'audit-hr','audit-assignment','submit-a','2020-01-01 00:00:00')`);
    assert.deepEqual((await post('listMyApprovalHistory', { limit: 1 })).items.map(item => item.id), ['audit-hidden']);
    const recordDeny = await model.saveRule({ name: '只禁止最新本人申请', policy: { ...policy,
      effect: 'deny', capabilities: ['audit.submissions.read'], scopes: [{ kind: 'records', ids: ['audit-hidden'] }] },
      expectedRevision: (await read()).revision }, 'submit-a', guard);
    assert.deepEqual((await post('listMySubmissions', { limit: 1, submittedBy: 'other', submittedAssignmentId: 'other' })).submissions
      .map(item => item.id), ['audit-own-older']);
    const history = await post('listMyApprovalHistory', { limit: 1 });
    assert.equal(history.status, 'success', JSON.stringify(history));
    assert.deepEqual(history.items.map(item => item.id), ['audit-own-older']);
    assert.equal(history.items[0].mySteps[0].status, 'rejected');
    assert.equal(history.items[0].mySteps[0].operatorAssignmentId, 'audit-assignment');
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 1);
    assert.equal((await post('markAllSubmissionsRead')).status, 'success');
    assert.deepEqual((await pool.query("SELECT submission_id FROM audit_read_cursors WHERE org_id='submit-a' AND hr_id='audit-hr'"))[0].map(row => row.submission_id), ['audit-own-older']);
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    await removeRule(recordDeny);
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 1);
    await pool.query("DELETE FROM audit_read_cursors WHERE org_id='submit-a' AND hr_id='audit-hr'");
    await pool.query("DELETE FROM audit_submissions WHERE id='audit-own-older' AND org_id='submit-a'");
    await pool.query("DELETE FROM audit_events WHERE id='audit-history-newer' AND org_id='submit-a'");
    // 跨过旧计数200条和全部已读500条限制，验证数据库聚合与整批游标写入。
    const manyOwn = Array.from({ length: 501 }, (_, index) => [
      'audit-cursor-' + index, 'AUTH-CURSOR-' + index, 'audit-hr', 'audit-assignment', '批量未读申请', 'submit-a'
    ]);
    await pool.query(`INSERT INTO audit_submissions
      (id,submission_number,submitted_by,submitted_assignment_id,title,org_id) VALUES ?`, [manyOwn]);
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 502);
    assert.equal((await post('markAllSubmissionsRead')).status, 'success');
    assert.equal((await post('getUnreadCounts')).mySubmissionsUnread, 0);
    assert.equal((await pool.query("SELECT COUNT(*) AS count FROM audit_read_cursors WHERE org_id='submit-a' AND hr_id='audit-hr'"))[0][0].count, 502);
    await pool.query("DELETE FROM audit_read_cursors WHERE org_id='submit-a' AND hr_id='audit-hr'");
    await pool.query('DELETE FROM audit_submissions WHERE org_id=? AND id IN (?)', ['submit-a', manyOwn.map(row => row[0])]);
    // 显式处理权不能代替步骤指定岗位；先构造不匹配岗位再恢复真实的本人步骤。
    const approvalAllow = await addRule('处理权仍须符合审批责任', ['audit.submissions.approve']);
    await pool.query("UPDATE audit_submission_steps SET step_conditions_json=? WHERE id='audit-pending-own' AND org_id='submit-a'",
      [JSON.stringify([{ conditionType: 'person', personHrIds: ['audit-hr'], assignmentIds: ['other-assignment'] }])]);
    for (const name of ['approveStep', 'rejectStep']) {
      const wrongJob = await post(name, { submissionId: 'audit-hidden', stepId: 'audit-pending-own', rejectionReason: '需要修改' });
      assert.notEqual(wrongJob.status, 'success', JSON.stringify(wrongJob));
    }
    await pool.query("UPDATE audit_submission_steps SET step_conditions_json=? WHERE id='audit-pending-own' AND org_id='submit-a'",
      [JSON.stringify([{ conditionType: 'submitter' }])]);
    await removeRule(approvalAllow);
    const original = Buffer.from('Authorization approval fixture');
    const originalPath = path.join(process.env.AUDIT_UPLOAD_DIR, 'authorization-original.txt');
    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.writeFileSync(originalPath, original);
    const originalHash = crypto.createHash('sha256').update(original).digest('hex');
    await pool.query(`INSERT INTO audit_submission_files(id,submission_id,file_name,file_path,file_size,file_hash,mime_type,org_id)
      VALUES ('audit-approval-file','audit-hidden','original.txt',?,?,?,'text/plain','submit-a')`, [originalPath, original.length, originalHash]);
    const approved = await post('approveStep', { submissionId: 'audit-hidden', stepId: 'audit-pending-own', comment: '同意' });
    assert.equal(approved.status, 'success', JSON.stringify(approved));
    const approvedDetail = await post('getSubmissionDetail', { submissionId: 'audit-hidden' });
    assert.equal(approvedDetail.submission.status, 'approved');
    const processed = (await pool.query("SELECT status,processed_assignment_id FROM audit_submission_steps WHERE id='audit-pending-own' AND org_id='submit-a'"))[0][0];
    assert.equal(processed.status, 'approved');
    assert.equal(processed.processed_assignment_id, 'audit-assignment');
    assert.equal((await post('approveStep', { submissionId: 'audit-hidden', stepId: 'audit-pending-own' })).idempotent, true);
    const replayDeny = await addRule('已处理后撤销操作权', ['audit.submissions.approve'], 'deny');
    assert.equal((await post('approveStep', { submissionId: 'audit-hidden', stepId: 'audit-pending-own' })).status, 'forbidden');
    await removeRule(replayDeny);
    await pool.query(`INSERT INTO audit_submissions(id,submission_number,submitted_by,submitted_assignment_id,title,status,current_step_index,org_id)
      VALUES ('audit-reject-own','AUTH-REJECT','audit-hr','audit-assignment','驳回回读','in_progress',1,'submit-a')`);
    await pool.query(`INSERT INTO audit_submission_steps(id,submission_id,sort_order,action_type,step_conditions_json,org_id)
      VALUES ('audit-reject-step','audit-reject-own',1,'pass',?,'submit-a')`, [JSON.stringify([{ conditionType: 'submitter' }])]);
    await pool.query(`INSERT INTO audit_submission_files(id,submission_id,file_name,file_path,file_size,file_hash,mime_type,org_id)
      VALUES ('audit-reject-file','audit-reject-own','original.txt',?,?,?,'text/plain','submit-a')`, [originalPath, original.length, originalHash]);
    const rejected = await post('rejectStep', { submissionId: 'audit-reject-own', stepId: 'audit-reject-step', rejectionReason: '请补充附件' });
    assert.equal(rejected.status, 'success', JSON.stringify(rejected));
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-reject-own' })).submission.status, 'rejected');
    const rejectedEvent = (await pool.query("SELECT operator_assignment_id,comment FROM audit_events WHERE submission_id='audit-reject-own' AND org_id='submit-a'"))[0];
    assert.equal(rejectedEvent.length, 1);
    assert.equal(rejectedEvent[0].operator_assignment_id, 'audit-assignment');
    assert.equal(rejectedEvent[0].comment, '请补充附件');
    await pool.query("DELETE FROM audit_signing_evidence WHERE submission_id IN ('audit-reject-own','audit-hidden') AND org_id='submit-a'");
    await pool.query("DELETE FROM audit_submissions WHERE id='audit-reject-own' AND org_id='submit-a'");
    await pool.query("DELETE FROM audit_events WHERE submission_id='audit-hidden' AND org_id='submit-a'");
    await pool.query("DELETE FROM audit_submission_files WHERE id='audit-approval-file' AND org_id='submit-a'");
    await pool.query("DELETE FROM audit_submission_steps WHERE id='audit-pending-own' AND org_id='submit-a'");
    await pool.query("UPDATE audit_submissions SET status='draft', current_step_index=0 WHERE id='audit-hidden' AND org_id='submit-a'");
    await pool.query("UPDATE audit_submissions SET submitted_assignment_id=NULL WHERE id='audit-hidden' AND org_id='submit-a'");
    const document = await require('pdf-lib').PDFDocument.create();
    document.addPage([400, 600]);
    const lifecycleOriginal = Buffer.from(await document.save());
    const upload = () => orgStorage.run('submit-a', () => require('../../src/modules/audit/utils/fileSecurity').createTempUpload({
      buffer: lifecycleOriginal, fileName: 'authorization.pdf', mimeType: 'application/pdf', accountId: reference.accountId
    }));
    const lifecycleBody = { title: '统一授权提交回读', steps: [{ name: '本人确认', actionType: 'pass', conditions: [{ conditionType: 'submitter' }] }], files: [await upload()] };
    const createDeny = await addRule('禁止发起申请', ['audit.submissions.create'], 'deny');
    assert.equal((await post('startAdHocAudit', lifecycleBody)).status, 'forbidden');
    await removeRule(createDeny);
    const created = await post('startAdHocAudit', lifecycleBody);
    assert.equal(created.status, 'success', JSON.stringify(created));
    let reopened = await post('getSubmissionDetail', { submissionId: created.id });
    assert.equal(reopened.submission.title, lifecycleBody.title);
    assert.equal(reopened.canWithdrawSubmission, true);
    assert.equal(reopened.canUpdateSubmission, false);
    const cancelDeny = await addRule('禁止撤回申请', ['audit.submissions.cancel'], 'deny');
    assert.equal((await post('withdrawSubmission', { submissionId: created.id })).status, 'forbidden');
    assert.equal((await post('getSubmissionDetail', { submissionId: created.id })).canWithdrawSubmission, false);
    assert.equal((await post('getSubmissionDetail', { submissionId: created.id })).submission.status, 'in_progress');
    await removeRule(cancelDeny);
    assert.equal((await post('withdrawSubmission', { submissionId: created.id })).status, 'success');
    reopened = await post('getSubmissionDetail', { submissionId: created.id });
    assert.equal(reopened.submission.status, 'withdrawn');
    assert.equal(reopened.canUpdateSubmission, true);
    assert.equal(reopened.canWithdrawSubmission, false);
    const editBody = { submissionId: created.id, title: '修改后的申请', type: 'ad_hoc', steps: lifecycleBody.steps, files: [], retainedFileIds: reopened.files.map(file => file.id) };
    const updateDeny = await addRule('禁止修改和重新提交', ['audit.submissions.update'], 'deny');
    assert.equal((await post('getSubmissionDetail', { submissionId: created.id })).canUpdateSubmission, false);
    assert.equal((await post('updateAuditSubmission', editBody)).status, 'forbidden');
    assert.equal((await post('resubmitAudit', { submissionId: created.id })).status, 'forbidden');
    assert.equal((await post('getSubmissionDetail', { submissionId: created.id })).submission.title, lifecycleBody.title);
    await removeRule(updateDeny);
    const edited = await post('updateAuditSubmission', editBody);
    assert.equal(edited.status, 'success', JSON.stringify(edited));
    assert.equal((await post('getSubmissionDetail', { submissionId: created.id })).submission.title, editBody.title);
    const resubmitted = await post('resubmitAudit', { submissionId: created.id });
    assert.equal(resubmitted.status, 'success', JSON.stringify(resubmitted));
    assert.equal((await post('getSubmissionDetail', { submissionId: created.id })).submission.status, 'in_progress');
    const currentFiles = (await pool.query('SELECT file_path FROM audit_submission_files WHERE org_id=? AND submission_id=? AND is_current=1', ['submit-a', created.id]))[0];
    assert.equal(currentFiles.length, 1);
    assert.deepEqual(fs.readFileSync(currentFiles[0].file_path), lifecycleOriginal);
    await pool.query('DELETE FROM audit_submissions WHERE org_id=? AND id=?', ['submit-a', created.id]);
    await orgStorage.run('submit-a', async () => {
      await require('../../src/modules/audit/models/auditFlowTemplate').create('authorization-start-template', { name: '提交授权模板', starterType: 'self' });
      await require('../../src/modules/audit/models/auditFlowTemplateStep').create('authorization-start-step', { templateId: 'authorization-start-template', sortOrder: 1, actionType: 'pass' });
      await require('../../src/modules/audit/models/auditFlowTemplateStepCondition').create('authorization-start-condition', { templateStepId: 'authorization-start-step', conditionType: 'submitter' });
    });
    const templateBody = { templateId: 'authorization-start-template', title: '模板发起授权', files: [await upload()] };
    const templateCreateDeny = await addRule('模板也禁止发起', ['audit.submissions.create'], 'deny');
    assert.equal((await post('startAuditSubmission', templateBody)).status, 'forbidden');
    await removeRule(templateCreateDeny);
    const templateCreated = await post('startAuditSubmission', templateBody);
    assert.equal(templateCreated.status, 'success', JSON.stringify(templateCreated));
    assert.equal((await post('getSubmissionDetail', { submissionId: templateCreated.id })).submission.title, templateBody.title);
    await pool.query('DELETE FROM audit_submissions WHERE org_id=? AND id=?', ['submit-a', templateCreated.id]);
    await pool.query('DELETE FROM audit_flow_templates WHERE org_id=? AND id=?', ['submit-a', templateBody.templateId]);
    // 配置验签资格不等于本人拥有验签资格。
    assert.equal((await post('getAuditVerificationAccess')).canVerify, false);
    assert.equal((await post('verifySignatureChain', { submissionId: 'audit-visible' })).status, 'forbidden');
    const access = await post('getCurrentAuthorizationAccess', { role: 'admin', subjectId: 'other-grant' });
    assert.equal(access.mode, 'enforced');
    assert.equal(access.contextId, 'audit-context');
    assert.equal(access.role, 'user');
    assert(access.capabilities.includes('audit.templates.create'));
    assert(access.grantedCapabilities.includes('audit.templates.create'));
    assert(access.capabilities.includes('identity.cards.read'));
    assert(!access.grantedCapabilities.includes('identity.cards.read'));
    assert(!access.capabilities.includes('audit.verification.verify'));
    assert(!access.capabilities.includes('auth.accounts.update'));
    assert.equal(access.rules, undefined);
    const verify = await addRule('允许本人验签', ['audit.verification.verify']);
    assert.equal((await post('getAuditVerificationAccess')).canVerify, true);
    assert((await post('getCurrentAuthorizationAccess')).capabilities.includes('audit.verification.verify'));
    assert.equal((await post('verifySignatureChain', { submissionId: 'missing-record' })).status, 'not_found');
    const deny = await addRule('禁止本人验签', ['audit.verification.verify'], 'deny');
    assert.equal((await post('getAuditVerificationAccess')).canVerify, false);
    assert(!(await post('getCurrentAuthorizationAccess')).capabilities.includes('audit.verification.verify'));
    assert(!(await post('getCurrentAuthorizationAccess')).grantedCapabilities.includes('audit.verification.verify'));
    assert.equal((await post('verifySignatureChain', { submissionId: 'audit-visible' })).status, 'forbidden');
    await removeRule(deny);
    await removeRule(verify);
    const permission = require('../../src/modules/audit/models/verificationPermission');
    // 既有显式验签名单仍为唯一配置来源；新禁止规则不能被旧业务名单绕过。
    assert.equal((await orgStorage.run('submit-a', () => permission.create('verify-business', { granteeHrId: 'audit-hr' }, reference))).status, 'success');
    assert.equal((await post('getAuditVerificationAccess')).canVerify, true);
    const businessDeny = await addRule('业务名单也遵守禁止', ['audit.verification.verify'], 'deny');
    assert.equal((await post('getAuditVerificationAccess')).canVerify, false);
    await removeRule(businessDeny);
    await orgStorage.run('submit-a', () => permission.removeByGrantee('audit-hr', reference));
    await pool.query("INSERT INTO audit_submission_files(id,submission_id,file_name,file_path,file_hash,org_id) VALUES ('authorized-file','audit-visible','document.pdf','unused','unused','submit-a'),('hidden-file','audit-hidden','document.pdf','unused','unused','submit-a'),('foreign-file','audit-foreign','document.pdf','unused','unused','submit-b')");
    const authorizeFile = require('../../src/modules/audit/utils/fileSecurity').getAuthorizedAuditFile;
    const request = { unifiedAuthorization: { reference },
      authAccount: { id: reference.accountId, personId: reference.personId },
      authSession: { id: reference.sessionId },
      authContext: { role: 'user', personId: reference.personId, organizationId: reference.organizationId,
        contextId: reference.contextId, assignmentId: 'audit-assignment', membershipId: 'audit-member', legacyHrId: 'audit-hr' } };
    const file = id => orgStorage.run('submit-a', () => authorizeFile(id, request));
    assert.equal((await file('authorized-file')).status, 'success');
    assert.equal((await file('hidden-file')).status, 'forbidden');
    assert.equal((await file('foreign-file')).status, 'not_found');
    const fileVerification = await addRule('核验文件读取', ['audit.verification.verify']);
    assert.equal((await file('hidden-file')).status, 'success');
    const fileDeny = await addRule('禁止申请附件读取', ['audit.submissions.read'], 'deny');
    assert.equal((await file('authorized-file')).status, 'forbidden');
    assert.equal((await file('hidden-file')).status, 'forbidden');
    await removeRule(fileDeny);
    await removeRule(fileVerification);
    assert.equal((await orgStorage.run('submit-a', () => permission.create('verify-file-business', { granteeHrId: 'audit-hr' }, reference))).status, 'success');
    assert.equal((await file('hidden-file')).status, 'success');
    const oldListDeny = await addRule('禁止旧验签名单读取附件', ['audit.verification.verify'], 'deny');
    assert.equal((await file('hidden-file')).status, 'forbidden');
    // 明确的申请读取权与验签权是两个动作，不把验签禁止扩大成全部文件禁止。
    assert.equal((await file('authorized-file')).status, 'success');
    await removeRule(oldListDeny);
    await orgStorage.run('submit-a', () => permission.removeByGrantee('audit-hr', reference));
    await pool.query("UPDATE membership_assignments SET status='inactive' WHERE id='audit-assignment'");
    assert.equal((await post('getSubmissionDetail', { submissionId: 'audit-visible' })).status, 'forbidden');
    assert.equal((await file('authorized-file')).status, 'forbidden');
    assert.equal((await post('getCurrentAuthorizationAccess')).status, 'authorization_forbidden');
    await pool.query("UPDATE membership_assignments SET status='active' WHERE id='audit-assignment'");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};
