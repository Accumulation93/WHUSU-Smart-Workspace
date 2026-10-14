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
    for (const migration of ['20260906180000_audit_signing_evidence.sql', '20260906123000_stamp_person_assignment_grants.sql', '20261014143000_audit_signature_geometry_v3.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../db/deploy', migration), 'utf8'); await admin.query(sql); await admin.query(sql);
    }
    // 生产绝对时间字段已由 UTC 迁移升级为毫秒；隔离初始库补齐同一事实。
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
      }
      orgStorage.run(org, next);
    });
    app.use('/api', require('../src/modules/audit/routes/auditUser'));
    app.use('/api', require('../src/modules/audit/routes/auditFile'));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const post = async (name, body, headers = {}) => (await fetch('http://127.0.0.1:' + server.address().port + '/api/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {})
    })).json();
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
    const invalid = JSON.parse(JSON.stringify(payload)); invalid.signatures[0].widthRatio = 2;
    assert.equal((await post('approveStep', invalid)).status, 'approval_material_invalid');
    assert.equal((await admin.query("SELECT status FROM audit_submission_steps WHERE id='step-2'"))[0][0].status, 'pending');
    assert.equal((await admin.query('SELECT COUNT(*) AS n FROM audit_submission_signatures'))[0][0].n, 0);
    await admin.query("DELETE FROM stamp_assignment_grants WHERE id='grant-a'");
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a' })).status, 'forbidden', '图片读取重新复核授权');
    assert.equal((await post('getMyStampImage', { stampId: 'stamp-a', preview: true })).status, 'forbidden', '预览命中也必须重新复核授权');
    assert.equal((await post('approveStep', payload)).status, 'approval_stamp_not_authorized', '正式审批再次复核授权');
    await admin.query("INSERT INTO stamp_assignment_grants (id,org_id,stamp_id,assignment_id,person_id) VALUES ('grant-a','org-a','stamp-a','assignment-a','person-a')");
    const saved = await post('approveStep', payload); assert.equal(saved.status, 'success', JSON.stringify(saved));
    const reread = await post('getSubmissionDetail', { submissionId: 'submission-1' });
    assert.equal(reread.status, 'success'); assert.equal(reread.submission.status, 'approved');
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
    console.log('签署真实 HTTP/MySQL 验收通过：两遍迁移、轻量目录、岗位授权重核、非法材料不写、审批回读、最终 PDF 验签、v3 几何及重复请求');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve)); if (pool) await pool.end();
    await admin.changeUser({ database: 'mysql' }); await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + testUser + "'@'%'"); await admin.end();
    const resolved = path.resolve(root); assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('whusu-signing-http-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
