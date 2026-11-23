'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const express = require('express');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

if (!process.env.DEPLOY_TEST_DB_HOST) { console.log('未配置隔离数据库，签署 HTTP 保存回读测试未执行'); process.exit(0); }
const database = 'whusu_signing_' + process.pid + '_' + Date.now();
const testUser = 'signing_' + process.pid, testPassword = crypto.randomBytes(32).toString('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-signing-http-'));
const options = { host: process.env.DEPLOY_TEST_DB_HOST, port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '', multipleStatements: true };
async function run() {
  const admin = await mysql.createConnection(options); let pool, server;
  try {
    await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await admin.query("CREATE USER '" + testUser + "'@'%' IDENTIFIED BY ?", [testPassword]);
    await admin.query("GRANT ALL ON `" + database + "`.* TO '" + testUser + "'@'%'");
    await admin.changeUser({ database });
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await admin.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32),
      version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (org_id, domain))`);
    // 先模拟升级前结构，再验证新增字段迁移的执行与重复执行。
    await admin.query('ALTER TABLE audit_submission_files DROP COLUMN original_file_path, DROP COLUMN original_file_hash, DROP COLUMN original_file_size');
    await admin.query('ALTER TABLE audit_submissions DROP COLUMN description');
    for (const migration of ['20260906180000_audit_signing_evidence.sql', '20260906123000_stamp_person_assignment_grants.sql', '20261014143000_audit_signature_geometry_v3.sql', '20261017233000_audit_fresh_round_originals.sql', '20261018010000_audit_drop_resubmit_mode.sql', '20261031160000_unified_authorization.sql', '20261111100000_identity_nature_links.sql', '20261111101000_business_rule_natures.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../db/deploy', migration), 'utf8'); await admin.query(sql); await admin.query(sql);
    }
    // 生产绝对时间字段已由 UTC 迁移升级为毫秒；隔离初始库补齐同一事实。
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261110190000_assignment_nature_description.sql'), 'utf8'));
    await admin.query('ALTER TABLE audit_submission_signatures MODIFY signed_at DATETIME(3) NOT NULL');
    Object.assign(process.env, { DB_HOST: options.host, DB_PORT: String(options.port), DB_USER: testUser,
      DB_PASSWORD: testPassword, DB_NAME: database, JWT_SECRET: crypto.randomBytes(32).toString('base64'),
      AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('base64'), AUDIT_UPLOAD_DIR: path.join(root, 'uploads') });
    require('../scripts/provisionSigningEvidence').provision(path.join(root, 'keys/keyring.json'), path.join(root, 'backup/keyring.json'));
    pool = require('../src/config/db');
    const { orgStorage } = require('../src/utils/orgContext');
    const { hashFile, verifySignatureChain } = require('../src/modules/audit/utils/hashChain');
    const { verifySubmissionFiles } = require('../src/modules/audit/services/signingVerification');
    await admin.query("INSERT INTO organizations (id,name) VALUES ('org-a','测试组织'),('org-b','其他组织')");
    await admin.query("INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES ('person-a','测试签署人','TEST-PRIVATE-SIGNER','test-private-signer')");
    await admin.query("INSERT INTO hr_info (id,name,student_id,org_id) VALUES ('hr-a','测试签署人','TEST-PRIVATE-SIGNER','org-a')");
    await admin.query("INSERT INTO departments (id,name,org_id) VALUES ('dept-a','部门甲','org-a')");
    await admin.query("INSERT INTO identities (id,name,org_id) VALUES ('identity-a','成员','org-a')");
    await admin.query("INSERT INTO organization_memberships (id,person_id,org_id,legacy_hr_id) VALUES ('member-a','person-a','org-a','hr-a')");
    await admin.query("INSERT INTO membership_assignments (id,membership_id,org_id,department_id,identity_id) VALUES ('assignment-a','member-a','org-a','dept-a','identity-a'),('assignment-b','member-a','org-a','dept-a','identity-a')");
    const context = { role: 'user', personId: 'person-a', legacyHrId: 'hr-a', membershipId: 'member-a', assignmentId: 'assignment-a',
      contextId: 'context-a', organizationId: 'org-a', organizationName: '测试组织', departmentId: 'dept-a', identityId: 'identity-a', name: '测试签署人' };
    const snapshot = { ...context, assignmentNature: 'staff', assignmentLabel: '成员 · 部门甲', identityCategoryId: 'identity-a' };
    await admin.query("INSERT INTO audit_submissions (id,submission_number,submitted_by,submitted_person_id,submitted_assignment_id,submitted_context_snapshot,status,current_step_index,org_id) VALUES ('submission-1','SIGN-TEST','hr-a','person-a','assignment-a',?,'in_progress',1,'org-a')", [JSON.stringify(snapshot)]);
    await admin.query("INSERT INTO audit_submission_steps (id,submission_id,sort_order,action_type,step_conditions_json,org_id) VALUES ('step-2','submission-1',1,'both',?,'org-a')", [JSON.stringify([{ conditionType: 'identity_scope', departmentScope: 'all', workGroupScope: 'all', identityScope: 'all' }])]);
    const contentFixture = require('./helpers/pdfContentFixture');
    const bytes = await contentFixture.createDocument(), filePath = path.join(root, 'uploads/document.pdf');
    fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, bytes);
    await admin.query("INSERT INTO audit_submission_files (id,submission_id,file_name,file_path,file_size,file_hash,mime_type,org_id) VALUES ('file-1','submission-1','document.pdf',?,?,?,'application/pdf','org-a')", [filePath, bytes.length, hashFile(bytes)]);
    const mark = await sharp({ create: { width: 100, height: 24, channels: 4, background: '#000000' } }).png().toBuffer();
    const imageData = 'data:image/png;base64,' + mark.toString('base64');
    await admin.query("INSERT INTO stamps (id,name,image_data,org_id) VALUES ('stamp-a','测试章',?,'org-a')", [imageData]);
    await admin.query("INSERT INTO stamp_assignment_grants (id,org_id,stamp_id,assignment_id,person_id) VALUES ('grant-a','org-a','stamp-a','assignment-a','person-a')");
    await admin.query("INSERT INTO audit_verification_permissions (id,grantee_hr_id,granted_by,org_id) VALUES ('verify-a','hr-a','test-admin','org-a')");
    const app = express(); app.use(express.json({ limit: '10mb' }));
    app.use((req, res, next) => {
      const org = req.get('X-Test-Org') || 'org-a';
      if (req.get('X-Test-Anonymous') !== '1') {
        req.authAccount = { id: 'account-a', personId: 'person-a' };
        req.authContext = { ...context, organizationId: org, assignmentId: req.get('X-Test-Assignment') || 'assignment-a' };
        if (req.get('X-Test-Super') === '1') {
          req.authSession = { id: 'session-super-' + org };
          req.authContext = { role: 'admin', adminLevel: 'super_admin', adminGrantId: 'grant-super',
            personId: 'person-a', contextId: 'context-super-' + org, organizationId: org, organizationName: org };
        }
      }
      orgStorage.run(org, next);
    });
    app.use('/api', require('../src/modules/audit/routes/auditUser'));
    app.use('/api', require('../src/modules/audit/routes/auditFile'));
    app.use('/api', require('../src/modules/audit/routes/auditSignature'));
    app.use('/api', require('../src/modules/venue/routes/venueApprovalAdmin'));
    app.use('/api', require('../src/modules/venue/routes/venueUser'));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const post = async (name, body, headers = {}) => (await fetch('http://127.0.0.1:' + server.address().port + '/api/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {})
    })).json();
    await orgStorage.run('org-a', async () => {
      await require('../src/modules/audit/models/auditFlowTemplate').create('self-template', { name: '本人审批', starterType: 'self' });
      await require('../src/modules/audit/models/auditFlowTemplateStep').create('self-template-step', { templateId: 'self-template', sortOrder: 1, actionType: 'pass', allowApproverDesignation: true });
      await require('../src/modules/audit/models/auditFlowTemplateStepCondition').create('self-condition', { templateStepId: 'self-template-step', conditionType: 'submitter' });
    });
    const candidates = await post('listEligibleApprovers', { templateId: 'self-template', stepIndex: 1 });
    assert.equal(candidates.status, 'success', JSON.stringify(candidates));
    assert.deepEqual(candidates.approvers.flatMap(item => item.eligibleAssignmentIds), ['assignment-a']);
    const documentPreview = await post('getAuditFilePreview', { fileId: 'file-1', page: 1, previewMaxEdge: 4096 });
    assert.equal(documentPreview.status, 'success');
    assert.equal(documentPreview.previewMime, 'image/png');
    const previewDimensions = await sharp(Buffer.from(documentPreview.data, 'base64')).metadata();
    assert.equal(previewDimensions.width, 4096);
    assert.equal(previewDimensions.height, 2048);
    assert.equal(documentPreview.pageWidth, 800, '高清像素不得改变原 PDF 坐标尺寸');
    assert.equal((await post('listMyStamps', { includeImageData: false })).stamps[0].imageData, undefined);
    assert.equal((await post('listMyStamps', {})).stamps[0].imageData, imageData, '旧调用仍返回图片');
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a' })).imageData, imageData);
    const preview = await post('getMyStampImage', { stampId: 'stamp-a', preview: true });
    assert.equal(preview.status, 'success');
    const previewMeta = await sharp(Buffer.from(preview.imageData.split(',')[1], 'base64')).metadata();
    assert(previewMeta.width <= 512 && previewMeta.height <= 512);
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a' }, { 'X-Test-Assignment': 'assignment-b' })).status, 'forbidden');
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a' }, { 'X-Test-Anonymous': '1' })).status, 'forbidden');
    const fallback = { submissionId: 'submission-1', stepId: 'step-2', comment: '同意 2026-10-14', signatures: [{
      fileId: 'file-1', signatureType: 'signature', imageData, positionX: 0.50123456, positionY: 0.4421234,
      size: 1, rotation: 0, page: 2, widthRatio: 0.61234567 }], designatedNextPersonIds: [], designatedNextAssignmentIds: [] };
    const payload = process.env.SIGNING_FRONTEND_PARAMETERS ? JSON.parse(fs.readFileSync(process.env.SIGNING_FRONTEND_PARAMETERS, 'utf8')) : fallback;
    payload.signatures.push({ fileId: 'file-1', signatureType: 'stamp', stampId: 'stamp-a', positionX: 0.7, positionY: 0.8, size: 1, rotation: 0, page: 2, widthRatio: 0.18 });
    await admin.query("UPDATE audit_submission_steps SET step_conditions_json=? WHERE id='step-2'", [JSON.stringify([{ conditionType: 'submitter' }])]);
    assert.notEqual((await post('approveStep', payload, { 'X-Test-Assignment': 'assignment-b' })).status, 'success', '同一发起人的其他岗位不得处理本人步骤');
    assert.equal((await admin.query("SELECT status FROM audit_submission_steps WHERE id='step-2'"))[0][0].status, 'pending');
    const invalid = JSON.parse(JSON.stringify(payload)); invalid.signatures[0].widthRatio = 2;
    const invalidResponse = await post('approveStep', invalid);
    assert.equal(invalidResponse.status, 'approval_material_invalid', JSON.stringify(invalidResponse));
    assert.equal((await admin.query("SELECT status FROM audit_submission_steps WHERE id='step-2'"))[0][0].status, 'pending');
    assert.equal((await admin.query('SELECT COUNT(*) AS n FROM audit_submission_signatures'))[0][0].n, 0);
    await admin.query("DELETE FROM stamp_assignment_grants WHERE id='grant-a'");
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a' })).status, 'forbidden', '图片读取重新复核授权');
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a', preview: true })).status, 'forbidden', '预览命中也必须重新复核授权');
    assert.equal((await post('approveStep', payload)).status, 'approval_stamp_not_authorized', '正式审批再次复核授权');
    await admin.query("INSERT INTO stamp_assignment_grants (id,org_id,stamp_id,assignment_id,person_id) VALUES ('grant-a','org-a','stamp-a','assignment-a','person-a')");
    const saved = await post('approveStep', payload); assert.equal(saved.status, 'success', JSON.stringify(saved));
    const reread = await post('getSubmissionDetail', { submissionId: 'submission-1' });
    assert.equal(reread.status, 'success', JSON.stringify(reread)); assert.equal(reread.submission.status, 'approved');
    assert.equal(reread.signatures.length, 3);
    const handwritten = reread.signatures.find(item => item.signatureType === 'signature' && item.widthRatio != null);
    assert(Math.abs(handwritten.widthRatio - payload.signatures[0].widthRatio) <= 0.00000001);
    const storedFile = (await admin.query("SELECT * FROM audit_submission_files WHERE id='file-1'"))[0][0], finalBytes = fs.readFileSync(storedFile.file_path);
    assert.notDeepEqual(finalBytes, bytes); assert.deepEqual(fs.readFileSync(filePath), bytes, '旧原件保持原字节');
    await contentFixture.assertPreserved(bytes, finalBytes);
    await orgStorage.run('org-a', async () => {
      const verified = await verifySubmissionFiles({ id: 'submission-1' }, { uploadedBytes: finalBytes });
      assert.equal(verified.valid, true, JSON.stringify(verified)); assert.equal(verified.files[0].steps.length, 1);
      assert(!JSON.stringify(verified).includes('TEST-PRIVATE-SIGNER'));
      const records = (await pool.query("SELECT * FROM audit_submission_signatures WHERE submission_id='submission-1' ORDER BY signed_at,id"))[0];
      assert.equal(records.filter(item => item.hash_version === 3).length, 2);
      assert.equal(verifySignatureChain(records, { 'file-1': hashFile(finalBytes) }, { requiredFileIds: ['file-1'] }).valid, true);
      const forged = records.map(item => ({ ...item })); forged.find(item => item.hash_version === 3).width_ratio = 0.9;
      assert.equal(verifySignatureChain(forged, { 'file-1': hashFile(finalBytes) }, { requiredFileIds: ['file-1'] }).valid, false, '宽度篡改不能通过材料验证');
    });
    const again = await post('approveStep', payload); assert.equal(again.idempotent, true);
    assert.equal((await admin.query('SELECT COUNT(*) AS n FROM audit_submission_signatures'))[0][0].n, 3, '重复请求不重复签署');
    assert.notEqual((await post('getSubmissionDetail', { submissionId: 'submission-1' }, { 'X-Test-Org': 'org-b' })).status, 'success');
    // 构造已完成首步、等待第二步的旧模式申请，再通过真实接口驳回与重新提交。
    await admin.query("UPDATE audit_submissions SET status='in_progress',current_step_index=2 WHERE id='submission-1'");
    await admin.query("INSERT INTO audit_submission_steps (id,submission_id,sort_order,action_type,step_conditions_json,org_id) VALUES ('reject-step','submission-1',2,'either',?,'org-a')", [JSON.stringify([{conditionType:'submitter'}])]);
    const rejected = await post('rejectStep', {submissionId:'submission-1',stepId:'reject-step',rejectionReason:'请修改'});
    assert.equal(rejected.status, 'success', JSON.stringify(rejected));
    assert.notEqual((await post('resubmitAudit', {submissionId:'submission-1'}, {'X-Test-Org':'org-b'})).status,'success');
    const otherAssignmentHeaders = { 'X-Test-Assignment': 'assignment-b' };
    const otherAssignmentEdit = await post('updateAuditSubmission', { submissionId: 'submission-1', title: 'Must not be written' }, otherAssignmentHeaders);
    assert.equal(otherAssignmentEdit.status, 'forbidden');
    const otherAssignment = await post('resubmitAudit', { submissionId: 'submission-1', title: 'Must not be written' }, otherAssignmentHeaders);
    assert.equal(otherAssignment.status, 'forbidden');
    const beforeRestart = (await admin.query("SELECT submitted_person_id,submitted_assignment_id,status,title FROM audit_submissions WHERE id='submission-1'"))[0][0];
    assert.equal(beforeRestart.status, 'rejected');
    assert.notEqual(beforeRestart.title, 'Must not be written');
    const restarted = await post('resubmitAudit', {submissionId:'submission-1',resubmitMode:'from_rejector'});
    assert.equal(restarted.status,'success',JSON.stringify(restarted));
    assert.equal(restarted.resubmitMode,'fresh');
    const afterRestart = (await admin.query("SELECT submitted_person_id,submitted_assignment_id FROM audit_submissions WHERE id='submission-1'"))[0][0];
    assert.equal(afterRestart.submitted_person_id, beforeRestart.submitted_person_id);
    assert.equal(afterRestart.submitted_assignment_id, beforeRestart.submitted_assignment_id);
    const current = (await admin.query("SELECT * FROM audit_submission_files WHERE submission_id='submission-1' AND is_current=1"))[0];
    assert.equal(current.length,1); assert.notEqual(current[0].id,'file-1');
    assert.equal(current[0].revision_round,2);
    assert.deepEqual(fs.readFileSync(current[0].file_path),bytes,'新轮次必须使用原件');
    assert.deepEqual(fs.readFileSync(storedFile.file_path),finalBytes,'旧轮次成品字节不变');
    const roundSteps = (await admin.query("SELECT * FROM audit_submission_steps WHERE submission_id='submission-1' AND round=2 ORDER BY sort_order"))[0];
    assert.equal(roundSteps.length,2); assert(roundSteps.every(step=>step.status==='pending'));
    assert.equal((await admin.query("SELECT current_step_index FROM audit_submissions WHERE id='submission-1'"))[0][0].current_step_index,1);
    const secondPayload = {...payload,stepId:roundSteps[0].id,signatures:payload.signatures.map(item=>({...item,fileId:current[0].id}))};
    assert.equal((await post('approveStep',secondPayload)).status,'success');
    const lastPayload = {...secondPayload,stepId:roundSteps[1].id,signatures:[secondPayload.signatures[0]]};
    assert.equal((await post('approveStep',{...lastPayload,signatures:[]})).status,'approval_either_required');
    const secondResult = await post('approveStep',lastPayload);
    assert.equal(secondResult.status,'success',JSON.stringify(secondResult));
    const secondFile = (await admin.query('SELECT * FROM audit_submission_files WHERE id=?',[current[0].id]))[0][0];
    await contentFixture.assertPreserved(bytes,fs.readFileSync(secondFile.file_path));
    await orgStorage.run('org-a',async()=>{
      const verified = await verifySubmissionFiles({id:'submission-1'},{uploadedBytes:fs.readFileSync(secondFile.file_path)});
      assert.equal(verified.valid,true,JSON.stringify(verified));
    });
    // 原件缺失必须整体失败，不能留下新轮次或把旧步骤改成被替代。
    await admin.query("UPDATE audit_submissions SET status='withdrawn' WHERE id='submission-1'");
    fs.renameSync(filePath,filePath+'.held');
    const missing = await post('resubmitAudit',{submissionId:'submission-1'});
    assert.equal(missing.status,'original_required',JSON.stringify(missing));
    assert.equal((await admin.query("SELECT MAX(round) AS n FROM audit_submission_steps WHERE submission_id='submission-1'"))[0][0].n,2);
    fs.renameSync(filePath+'.held',filePath);
    const upload = await orgStorage.run('org-a',()=>require('../src/modules/audit/utils/fileSecurity').createTempUpload({
      buffer:bytes,fileName:'replacement.pdf',mimeType:'application/pdf',accountId:'account-a'}));
    const editBody={submissionId:'submission-1',title:'重新审核',type:'ad_hoc',resubmitMode:'from_rejector',
      steps:[{name:'签章',actionType:'both',conditions:[{conditionType:'submitter'}]},
        {name:'二选一',actionType:'either',conditions:[{conditionType:'submitter'}]}],
      retainedFileIds:[current[0].id],files:[upload]};
    const editedFiles=await post('updateAuditSubmission',editBody);
    assert.equal(editedFiles.status,'success',JSON.stringify(editedFiles));
    assert.equal((await admin.query('SELECT revision_round FROM audit_submission_files WHERE id=?',[current[0].id]))[0][0].revision_round,2,'编辑不改写历史文件轮次');
    const third = await post('resubmitAudit',{submissionId:'submission-1'});
    assert.equal(third.status,'success',JSON.stringify(third));
    const thirdFiles=(await admin.query("SELECT * FROM audit_submission_files WHERE submission_id='submission-1' AND is_current=1 ORDER BY sort_order"))[0];
    assert.equal(thirdFiles.length,2);assert(thirdFiles.every(file=>file.revision_round===3));
    thirdFiles.forEach(file=>assert.deepEqual(fs.readFileSync(file.file_path),bytes));
    assert.equal((await post('withdrawSubmission',{submissionId:'submission-1'})).status,'success');
    assert.equal((await post('updateAuditSubmission',{...editBody,retainedFileIds:[thirdFiles[1].id],files:[]})).status,'success');
    const fourth = await post('resubmitAudit',{submissionId:'submission-1'});
    assert.equal(fourth.status,'success',JSON.stringify(fourth));
    const fourthFiles=(await admin.query("SELECT * FROM audit_submission_files WHERE submission_id='submission-1' AND is_current=1"))[0];
    assert.equal(fourthFiles.length,1);assert.equal(fourthFiles[0].revision_round,4);
    assert.equal(fourthFiles[0].file_name,'replacement.pdf');
    assert.deepEqual(fs.readFileSync(storedFile.file_path),finalBytes);

    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261102193000_authorization_runtime_transition.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261122153000_unified_identity_assignment_links.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261122170000_authorization_grant_sources.sql'), 'utf8'));
    await admin.query("INSERT INTO accounts(id,person_id) VALUES ('account-a','person-a')");
    await admin.query("INSERT INTO admin_grants(id,person_id,admin_level) VALUES ('grant-super','person-a','super_admin')");
    await admin.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
       VALUES ('session-super-org-a','account-a',?,'context-super-org-a','admin','grant-super','org-a','admin',1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)),
       ('session-super-org-b','account-a',?,'context-super-org-b','admin','grant-super','org-b','admin',1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))`,
    ['a'.repeat(64), 'b'.repeat(64)]);
    await admin.query(`INSERT INTO audit_submissions
      (id,submission_number,submitted_by,submitted_person_id,submitted_assignment_id,submitted_context_snapshot,status,current_step_index,org_id)
      VALUES ('direct-submission','DIRECT-TEST','hr-a','person-a','assignment-a',?,'in_progress',1,'org-a')`,
    [JSON.stringify(snapshot)]);
    await admin.query(`INSERT INTO audit_submission_steps
      (id,submission_id,sort_order,action_type,step_conditions_json,org_id) VALUES
      ('direct-step-1','direct-submission',1,'both',?,'org-a'),
      ('direct-step-2','direct-submission',2,'sign',?,'org-a')`,
    [JSON.stringify([{ conditionType: 'submitter' }]), JSON.stringify([{ conditionType: 'submitter' }])]);
    const directPath = path.join(root, 'uploads/direct-document.pdf');
    fs.writeFileSync(directPath, bytes);
    await admin.query(`INSERT INTO audit_submission_files
      (id,submission_id,file_name,file_path,file_size,file_hash,mime_type,org_id)
      VALUES ('direct-file','direct-submission','direct-document.pdf',?,?,?,'application/pdf','org-a')`,
    [directPath, bytes.length, hashFile(bytes)]);
    const superHeader = { 'X-Test-Super': '1' };
    const directPayload = { submissionId: 'direct-submission', stepId: 'direct-step-1', stampAssignmentId: 'assignment-a',
      stepMaterials: [
        { stepId: 'direct-step-1', signatures: payload.signatures.map(item => ({ ...item, fileId: 'direct-file' })) },
        { stepId: 'direct-step-2', signatures: [{ ...payload.signatures[0], fileId: 'direct-file', positionY: 0.26 }] }
      ] };
    assert.equal((await post('directApproveSubmission', directPayload, superHeader)).status, 'forbidden');
    await admin.query("UPDATE authorization_runtime_transition SET phase='enforced',minimum_protocol=3 WHERE id=1");
    const superSignature = await post('saveSignature', { name: '本人签名', imageData }, superHeader);
    assert.equal(superSignature.status, 'success', JSON.stringify(superSignature));
    const superLibrary = await post('listMySignatures', {}, superHeader);
    assert(superLibrary.signatures.some(item => item.id === superSignature.id && item.imageData === imageData));
    assert(!(await post('listMySignatures', {})).signatures.some(item => item.id === superSignature.id));
    assert.equal((await post('directApproveSubmission', directPayload)).status, 'forbidden');
    assert.equal((await post('directApproveSubmission', directPayload, { ...superHeader, 'X-Test-Org': 'org-b' })).status, 'not_found');
    assert.equal((await post('directApproveSubmission', { ...directPayload, stampAssignmentId: 'assignment-b' }, superHeader)).status,
      'approval_stamp_not_authorized');
    const missingSignature = await post('directApproveSubmission', { ...directPayload, stepMaterials: directPayload.stepMaterials.slice(0, 1) }, superHeader);
    assert.equal(missingSignature.status, 'approval_signature_required');
    assert.equal(missingSignature.stepId, 'direct-step-2');
    assert.equal((await admin.query("SELECT COUNT(*) AS n FROM audit_events WHERE submission_id='direct-submission'"))[0][0].n, 0);
    assert.equal((await admin.query("SELECT file_path FROM audit_submission_files WHERE id='direct-file'"))[0][0].file_path, directPath);
    const directStamps = await post('listDirectApprovalStamps', {}, superHeader);
    assert.deepEqual(directStamps.sources.map(source => source.assignmentId), ['assignment-a']);
    assert.equal(directStamps.sources[0].stamps[0].image_data, undefined);
    const directResults = await Promise.all([
      post('directApproveSubmission', directPayload, superHeader),
      post('directApproveSubmission', directPayload, superHeader)
    ]);
    const direct = directResults.find(result => result.status === 'success');
    assert.equal(directResults.filter(result => result.status === 'success').length, 1, JSON.stringify(directResults));
    assert.equal(directResults.filter(result => result.status === 'invalid_state').length, 1, JSON.stringify(directResults));
    assert.equal(direct.status, 'success', JSON.stringify(direct));
    assert.equal(direct.processedStepCount, 2);
    assert.equal((await post('directApproveSubmission', directPayload, superHeader)).status, 'invalid_state');
    const directEvents = (await admin.query(`SELECT operator_person_id,operator_assignment_id,operator_hr_id,operator_context_snapshot
       FROM audit_events WHERE submission_id='direct-submission' ORDER BY step_index`))[0];
    assert.equal(directEvents.length, 2);
    const { superAssignmentId } = require('../src/core/services/authorizationIdentityModel');
    const directAssignment = superAssignmentId('grant-super', 'org-a');
    assert(directEvents.every(event => event.operator_person_id === 'person-a' && event.operator_assignment_id === directAssignment
      && event.operator_hr_id === null && JSON.parse(event.operator_context_snapshot).directApproval === true));
    const confirmedDirectFile = (await admin.query("SELECT * FROM audit_submission_files WHERE id='direct-file'"))[0][0];
    await contentFixture.assertPreserved(bytes, fs.readFileSync(confirmedDirectFile.file_path));
    await orgStorage.run('org-a', async () => {
      const verification = await verifySubmissionFiles({ id: 'direct-submission' }, { uploadedBytes: fs.readFileSync(confirmedDirectFile.file_path) });
      assert.equal(verification.valid, true, JSON.stringify(verification));
    });

    await admin.query("INSERT INTO venues(id,name) VALUES ('direct-venue','Direct test venue')");
    await admin.query("INSERT INTO venue_open_rules(id,venue_id,cycle_type,time_start,time_end) VALUES ('direct-open','direct-venue','daily','00:00:00','23:59:00')");
    const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await admin.query(`INSERT INTO venue_bookings(id,venue_id,user_hr_id,creator_person_id,creator_assignment_id,creator_org_id,approval_org_id,time_start,time_end,status)
      VALUES ('direct-booking','direct-venue','hr-a','person-a','assignment-a','org-a','org-a',?,?,'pending')`,
    [day + ' 01:00:00', day + ' 03:00:00']);
    await admin.query(`INSERT INTO venue_bookings(id,venue_id,creator_org_id,approval_org_id,time_start,time_end,status)
      VALUES ('direct-conflict','direct-venue','org-b','org-b',?,?,'approved')`, [day + ' 01:30:00', day + ' 02:00:00']);
    assert.equal((await post('directApproveVenueBooking', { id: 'direct-booking' })).status, 'forbidden');
    assert.equal((await post('directApproveVenueBooking', { id: 'direct-booking' }, { ...superHeader, 'X-Test-Org': 'org-b' })).status, 'not_found');
    assert.equal((await post('directApproveVenueBooking', { id: 'direct-booking' }, superHeader)).status, 'conflict');
    assert.equal((await admin.query("SELECT status FROM venue_bookings WHERE id='direct-booking'"))[0][0].status, 'pending');
    await admin.query("UPDATE venue_bookings SET status='cancelled' WHERE id='direct-conflict'");
    const savedBooking = await post('directApproveVenueBooking', { id: 'direct-booking' }, superHeader);
    assert.equal(savedBooking.status, 'success', JSON.stringify(savedBooking));
    assert.equal(savedBooking.directApproval, true);
    const booking = (await admin.query("SELECT * FROM venue_bookings WHERE id='direct-booking'"))[0][0];
    assert.equal(booking.status, 'approved');
    assert.equal(booking.approver_person_id, 'person-a');
    assert.equal(booking.approver_assignment_id, directAssignment);
    assert.equal(booking.approver_admin_grant_id, 'grant-super');
    assert.equal(booking.approver_hr_id, null);
    assert.equal(JSON.parse(booking.approver_context_snapshot).directApproval, true);

    const superUpload = await orgStorage.run('org-a', () => require('../src/modules/audit/utils/fileSecurity').createTempUpload({
      buffer: bytes, fileName: 'super-self.pdf', mimeType: 'application/pdf', accountId: 'account-a'
    }));
    const ownSubmission = await post('startAdHocAudit', { title: '本组织自行提交', files: [superUpload],
      clientRequestId: 'test-super-submission', steps: [{ name: '自行办理', actionType: 'pass', conditions: [{ conditionType: 'submitter' }] }] }, superHeader);
    assert.equal(ownSubmission.status, 'success', JSON.stringify(ownSubmission));
    const ownSubmissionRow = (await admin.query('SELECT submitted_assignment_id, submitted_context_snapshot FROM audit_submissions WHERE id=?', [ownSubmission.id]))[0][0];
    assert.equal(ownSubmissionRow.submitted_assignment_id, directAssignment);
    const ownSubmissionSnapshot = typeof ownSubmissionRow.submitted_context_snapshot === 'string'
      ? JSON.parse(ownSubmissionRow.submitted_context_snapshot) : ownSubmissionRow.submitted_context_snapshot;
    assert.equal(ownSubmissionSnapshot.systemRole, 'super_admin');
    const mySubmissions = await post('listMySubmissions', {}, superHeader);
    assert.equal(mySubmissions.status, 'success', JSON.stringify(mySubmissions));
    assert(mySubmissions.submissions.some(item => item.id === ownSubmission.id));

    await admin.query(`INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type)
      VALUES ('direct-booking-test-rule','direct-venue','org-a','direct')`);
    const ownBooking = await post('createVenueBooking', { venueId: 'direct-venue', title: '本组织自行借用',
      timeStart: day + ' 16:00', timeEnd: day + ' 17:00', clientRequestId: 'test-super-venue-booking' }, superHeader);
    assert.equal(ownBooking.status, 'success', JSON.stringify(ownBooking));
    const myBookings = await post('listMyVenueBookings', {}, superHeader);
    assert.equal(myBookings.status, 'success', JSON.stringify(myBookings));
    assert(myBookings.bookings.some(item => item.id === ownBooking.id));
    const ownBookingRow = (await admin.query('SELECT user_hr_id,creator_person_id,creator_assignment_id,creator_admin_grant_id FROM venue_bookings WHERE id=?', [ownBooking.id]))[0][0];
    assert.equal(ownBookingRow.creator_person_id, 'person-a');
    assert.equal(ownBookingRow.creator_assignment_id, directAssignment);
    assert.equal(ownBookingRow.creator_admin_grant_id, 'grant-super');
    assert.equal(ownBookingRow.user_hr_id, null);
    const cancelledOwn = await post('cancelVenueBooking', { id: ownBooking.id }, superHeader);
    assert.equal(cancelledOwn.status, 'success', JSON.stringify(cancelledOwn));
    assert.equal((await admin.query('SELECT status FROM venue_bookings WHERE id=?', [ownBooking.id]))[0][0].status, 'cancelled');

    console.log('签署真实 HTTP/MySQL 验收通过：两遍迁移、轻量目录、岗位授权重核、非法材料不写、审批回读、最终 PDF 验签、v3 几何及重复请求');
    console.log('超管直批真实 HTTP/MySQL 验收通过：身份切换、组织隔离、签章要求、并发去重、PDF 验签、借用冲突及审批回读');
    console.log('超管普通业务 HTTP/MySQL 验收通过：本人发起和回读审核、本人申请和取消借用');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve)); if (pool) await pool.end();
    await admin.changeUser({ database: 'mysql' }); await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + testUser + "'@'%'"); await admin.end();
    const resolved = path.resolve(root); assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('whusu-signing-http-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
