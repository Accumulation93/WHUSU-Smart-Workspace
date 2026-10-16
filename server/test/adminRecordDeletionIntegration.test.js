'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const express = require('express');
if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置隔离数据库，未执行管理员永久删除数据库验证');
  process.exit(0);
}
const configuration = { host: process.env.DEPLOY_TEST_DB_HOST, port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '' };
const databaseName = 'whusu_admin_delete_' + process.pid + '_' + Date.now();
const user = 'admin_delete_' + process.pid;
const password = crypto.randomBytes(32).toString('hex');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-delete-integration-'));
  const admin = await mysql.createConnection(configuration);
  let pool, server;
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY ?`, [password]);
    await admin.query(`GRANT ALL ON \`${databaseName}\`.* TO '${user}'@'%'`);
    const fixture = await mysql.createConnection({ ...configuration, database: databaseName, multipleStatements: true });
    try {
      await fixture.query(await fs.readFile(path.resolve(__dirname, '../db/init.sql'), 'utf8'));
      const migration = await fs.readFile(path.resolve(__dirname, '../db/deploy/20261016210000_admin_record_deletion.sql'), 'utf8');
      await fixture.query(migration); await fixture.query(migration);
    } finally { await fixture.end(); }
    Object.assign(process.env, { DB_HOST: configuration.host, DB_PORT: String(configuration.port), DB_USER: user,
      DB_PASSWORD: password, DB_NAME: databaseName, AUDIT_UPLOAD_DIR: root });
    pool = require('../src/config/db');
    await pool.query("INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES ('person','隔离管理员','TEST-DELETE','TEST-DELETE')");
    await pool.query("INSERT INTO accounts (id,person_id) VALUES ('account','person')");
    await pool.query("INSERT INTO admin_info (id,name,org_id) VALUES ('legacy','隔离管理员','org')");
    await pool.query("INSERT INTO admin_grants (id,person_id,org_id,admin_level,legacy_admin_id) VALUES ('grant','person','org','admin','legacy'),('other-super','person','','super_admin',NULL)");
    await pool.query("INSERT INTO admin_permission_overrides (id,org_id,admin_id,permission_key,granted,configured_by) VALUES ('base','org','legacy','audit.submissions',1,'fixture')");
    await pool.query("INSERT INTO auth_sessions (id,account_id,openid_hash,context_id,organization_id,role,token_version,expires_at) VALUES ('session','account','fixture','context','org','admin',1,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))");
    await pool.query("INSERT INTO audit_submissions (id,submission_number,submitted_by,title,status,org_id) VALUES ('record','DELETE-001','author','隔离多轮申请','approved','org'),('other','DELETE-002','author','其他组织申请','approved','other-org')");
    const originals = [];
    for (let round = 1; round <= 2; round++) {
      const original = path.join(root, 'original-' + round + '.pdf');
      const signed = path.join(root, 'signed-' + round + '.pdf');
      const { PDFDocument } = require('pdf-lib');
      const pdf = await PDFDocument.create(); pdf.addPage().drawText('Round ' + round);
      const bytes = Buffer.from(await pdf.save());
      await fs.writeFile(original, bytes); await fs.writeFile(signed, bytes);
      originals.push(original, signed);
      await pool.query('INSERT INTO audit_submission_files (id,submission_id,file_name,file_path,file_hash,org_id,revision_round,is_current) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['file-' + round, 'record', 'document.pdf', signed, crypto.createHash('sha256').update(bytes).digest('hex'), 'org', round, round === 2 ? 1 : 0]);
      await pool.query('INSERT INTO audit_submission_steps (id,submission_id,status,round,org_id) VALUES (?, ?, ?, ?, ?)', ['step-' + round, 'record', 'approved', round, 'org']);
      await pool.query(`INSERT INTO audit_signing_evidence (id,org_id,submission_id,step_id,step_index,round,event_id,file_id,person_id,assignment_id,action_type,key_version,certificate_fingerprint,identity_ciphertext,payload_json,cms_base64,receipt_digest,input_digest,output_digest,output_digest_type,final_file_digest,input_file_path,output_file_path,signed_at)
        VALUES (?, 'org','record',?,0,?, ?,?,'person','assignment','sign','fixture','fixture','fixture','{}','fixture','fixture','fixture','fixture','fixture','fixture',?,?,UTC_TIMESTAMP(3))`,
        ['evidence-' + round, 'step-' + round, round, 'event-' + round, 'file-' + round, original, signed]);
    }
    await pool.query("INSERT INTO audit_read_cursors (hr_id,submission_id,org_id) VALUES ('reader','record','org')");
    await pool.query("INSERT INTO notifications (id,org_id,type,title,target_type,target_id) VALUES ('notice','org','submission_approved','隔离通知','submission','record')");
    await pool.query("INSERT INTO notification_outbox (id,org_id,event_type,event_key,payload_json) VALUES ('outbox','org','audit','event',?)", [JSON.stringify({ targetType: 'submission', targetId: 'record' })]);
    const app = express(); app.use(express.json());
    app.use((req, res, next) => {
      req.logger = { error() {} };
      req.authAccount = { id: 'account', personId: 'person' }; req.authSession = { id: 'session' };
      req.authContext = { role: 'admin', personId: 'person', adminGrantId: 'grant', adminLevel: 'admin', legacyAdminId: 'legacy', organizationId: 'org', contextId: 'context' };
      next();
    });
    app.use(require('../src/core/routes/adminRecordDeletion'));
    app.use(require('../src/core/routes/adminPermissions'));
    app.use((req, res, next) => require('../src/utils/orgContext').orgStorage.run('org', next));
    app.use(require('../src/modules/scoring/routes/results'));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    async function post(route, body) {
      const response = await fetch('http://127.0.0.1:' + server.address().port + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { code: response.status, body: await response.json() };
    }
    // 当前普通管理角色不能借用同一自然人的另一个超级管理员角色。
    assert.equal((await post('/previewAuditSubmissionDeletion', { id: 'record' })).code, 403);
    await pool.query("INSERT INTO admin_permission_overrides (id,org_id,admin_id,permission_key,granted,configured_by) VALUES ('delete','org','legacy','audit.submissions_delete',1,'fixture')");
    assert.equal((await post('/previewAuditSubmissionDeletion', { id: 'other' })).code, 404);
    const preview = await post('/previewAuditSubmissionDeletion', { id: 'record' });
    assert.equal(preview.code, 200); assert.equal(preview.body.record.attachmentCount, 2);
    const parameters = { id: 'record', revision: preview.body.record.revision };
    await pool.query("UPDATE admin_permission_overrides SET granted = 0 WHERE id = 'delete'");
    assert.equal((await post('/deleteAuditSubmission', parameters)).code, 403);
    await pool.query("UPDATE admin_permission_overrides SET granted = 1 WHERE id = 'delete'");
    await pool.query("UPDATE admin_grants SET status = 'revoked' WHERE id = 'grant'");
    assert.equal((await post('/deleteAuditSubmission', parameters)).code, 403);
    await pool.query("UPDATE admin_grants SET status = 'active' WHERE id = 'grant'");
    await pool.query("UPDATE persons SET status = 'merged' WHERE id = 'person'");
    assert.equal((await post('/deleteAuditSubmission', parameters)).code, 403);
    await pool.query("UPDATE persons SET status = 'active' WHERE id = 'person'");
    // 审批事务先持有记录锁时，删除等待其提交并拒绝过期的确认版本。
    const approvalConnection = await pool.getConnection();
    let competingDeletion;
    try {
      await approvalConnection.beginTransaction();
      await approvalConnection.query("SELECT id FROM audit_submissions WHERE id = 'record' FOR UPDATE");
      await approvalConnection.query("UPDATE audit_submission_steps SET comment = '并发审批更新' WHERE id = 'step-2'");
      competingDeletion = post('/deleteAuditSubmission', parameters);
      await approvalConnection.commit();
    } finally { approvalConnection.release(); }
    assert.equal((await competingDeletion).code, 409);
    const refreshed = await post('/previewAuditSubmissionDeletion', { id: 'record' });
    parameters.revision = refreshed.body.record.revision;
    const result = await post('/deleteAuditSubmission', parameters);
    assert.equal(result.code, 200, JSON.stringify(result.body)); assert.equal(result.body.cleanupPending, false);
    for (const table of ['audit_submission_files', 'audit_submission_steps', 'audit_signing_evidence', 'audit_read_cursors', 'notifications', 'notification_outbox', 'admin_record_file_cleanup']) {
      const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
      assert.equal(Number(row.total), 0, table);
    }
    for (const file of originals) await assert.rejects(fs.stat(file), { code: 'ENOENT' });
    assert.equal((await post('/deleteAuditSubmission', parameters)).body.deleted, true);
    const [[audit]] = await pool.query('SELECT COUNT(*) AS total FROM admin_record_deletions'); assert.equal(Number(audit.total), 1);
    const [[retained]] = await pool.query("SELECT COUNT(*) AS total FROM audit_submissions WHERE id = 'other'"); assert.equal(Number(retained.total), 1);
    const { orgStorage } = require('../src/utils/orgContext');
    const notifications = require('../src/modules/audit/models/notification');
    const late = await orgStorage.run('org', () => notifications.batchCreate([{ id: 'late', recipientType: 'admin', recipientId: 'grant', type: 'submission_approved', title: '迟到通知', targetType: 'submission', targetId: 'record' }]));
    assert.equal(late.created, 0);
    await pool.query("INSERT INTO venues (id,name) VALUES ('venue','隔离场地')");
    await pool.query("INSERT INTO venue_bookings (id,venue_id,title,creator_org_id,approval_org_id,time_start,time_end) VALUES ('booking','venue','隔离借用','creator','org',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR)),('foreign-booking','venue','其他组织借用','foreign','foreign',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))");
    await pool.query("INSERT INTO admin_permission_overrides (id,org_id,admin_id,permission_key,granted,configured_by) VALUES ('booking-delete','org','legacy','venue.bookings_delete',1,'fixture')");
    assert.equal((await post('/previewVenueBookingDeletion', { id: 'foreign-booking' })).code, 404);
    const bookingPreview = await post('/previewVenueBookingDeletion', { id: 'booking' });
    assert.equal(bookingPreview.code, 200);
    await pool.query("INSERT INTO notifications (id,org_id,type,title,target_type,target_id) VALUES ('booking-notice','creator','booking_approved','通知','booking','booking'),('booking-notice-2','org','booking_approved','通知','booking','booking')");
    assert.equal((await post('/deleteVenueBooking', { id: 'booking', revision: bookingPreview.body.record.revision })).code, 200);
    const [[bookingRows]] = await pool.query("SELECT COUNT(*) AS total FROM venue_bookings WHERE id = 'booking'");
    const [[bookingNotices]] = await pool.query("SELECT COUNT(*) AS total FROM notifications WHERE target_id = 'booking'");
    assert.equal(Number(bookingRows.total), 0); assert.equal(Number(bookingNotices.total), 0);

    await pool.query("INSERT INTO departments (id,name,org_id) VALUES ('department','隔离部门','org')");
    await pool.query("INSERT INTO identities (id,name,org_id) VALUES ('identity','隔离身份','org')");
    await pool.query("INSERT INTO score_activities (id,name,org_id) VALUES ('activity','隔离活动','org')");
    await pool.query("INSERT INTO rate_target_rules (id,activity_id,scorer_department_id,scorer_identity_id,org_id) VALUES ('rule','activity','department','identity','org')");
    await pool.query("INSERT INTO score_records (id,activity_id,rule_id,scorer_id,scorer_subject_key,target_id,target_subject_key,updated_at,org_id) VALUES ('score','activity','rule','scorer','scorer','target','target',UTC_TIMESTAMP(3),'org')");
    await pool.query("INSERT INTO score_answers (id,record_id,score,org_id) VALUES ('answer','score',4,'org')");
    assert.equal((await post('/revokeScoreRecord', { recordId: 'score' })).body.status, 'forbidden');
    await pool.query("INSERT INTO admin_permission_overrides (id,org_id,admin_id,permission_key,granted,configured_by) VALUES ('score-delete','org','legacy','scoring.results_revoke',1,'fixture')");
    assert.equal((await post('/revokeScoreRecord', { recordId: 'score' })).body.status, 'success');
    const [[scoreRows]] = await pool.query("SELECT COUNT(*) AS total FROM score_records WHERE id = 'score'");
    const [[answerRows]] = await pool.query("SELECT COUNT(*) AS total FROM score_answers WHERE record_id = 'score'");
    const [[scoreAudit]] = await pool.query("SELECT COUNT(*) AS total FROM admin_record_deletions WHERE record_type = 'score' AND record_id = 'score'");
    assert.equal(Number(scoreRows.total), 0); assert.equal(Number(answerRows.total), 0); assert.equal(Number(scoreAudit.total), 1);

    await pool.query("INSERT INTO admin_info (id,name,org_id) VALUES ('target-admin','隔离被授权人','org')");
    const grantBody = { adminId: 'target-admin', permissions: { 'audit.submissions_delete': true } };
    assert.equal((await post('/saveAdminPermissions', grantBody)).code, 403);
    await pool.query("INSERT INTO admin_permission_overrides (id,org_id,admin_id,permission_key,granted,configured_by) VALUES ('permission-manager','org','legacy','permissions.manage_regular_admins',1,'fixture')");
    assert.equal((await post('/saveAdminPermissions', grantBody)).code, 200);
    const [[savedPermission]] = await pool.query("SELECT granted FROM admin_permission_overrides WHERE org_id = 'org' AND admin_id = 'target-admin' AND permission_key = 'audit.submissions_delete'");
    assert.equal(Number(savedPermission.granted), 1);
    assert.equal((await post('/saveAdminPermissions', { adminId: 'legacy', permissions: { 'audit.submissions_delete': true } })).code, 403);
    assert.equal((await post('/saveAdminPermissions', { adminId: 'target-admin', permissions: { 'venue.resources.delete': true } })).code, 403);
    await pool.query("UPDATE admin_grants SET status = 'revoked' WHERE id = 'grant'");
    assert.equal((await post('/saveAdminPermissions', grantBody)).code, 403);
    console.log('隔离 MySQL/HTTP：两轮 PDF 与凭证永久删除、附件实际清理、其他组织保留、重复提交、迟到通知拒绝、场地双组织清理、真实权限保存回读及迁移重复运行通过');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    assert.match(databaseName, /^whusu_admin_delete_\d+_\d+$/);
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.query(`DROP USER IF EXISTS '${user}'@'%'`); await admin.end();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('admin-delete-integration-'));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
