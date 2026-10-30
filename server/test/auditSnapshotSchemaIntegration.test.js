'use strict';

const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
if (!process.env.DEPLOY_TEST_DB_HOST) throw new Error('必须显式配置隔离数据库');
const configuration = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || ''
};
process.env.DB_USER = 'unused-test-pool';
process.env.DB_PASSWORD = 'unused-test-pool';
process.env.DB_HOST = configuration.host;
process.env.DB_PORT = String(configuration.port);
process.env.DB_NAME = 'audit_snapshot_unused_pool';
const submission = require('../src/modules/audit/models/auditSubmission');
const step = require('../src/modules/audit/models/auditSubmissionStep');
const schema = require('../src/modules/audit/services/auditSchemaCapabilities');
const { orgStorage } = require('../src/utils/orgContext');
const pool = require('../src/config/db');
const database = 'audit_snapshot_test_' + process.pid + '_' + Date.now();
const snapshot = { contextId: 'context-a', organizationId: 'org-a', personId: 'person-a',
  assignmentId: 'assignment-a', assignmentNature: 'staff', identityCategory: 'Member',
  department: 'Office', workGroup: '', assignmentLabel: 'Member · Office' };
const values = { submissionNumber: 'A001', submittedBy: 'hr-a', title: 'Snapshot test',
  submittedPersonId: 'person-a', submittedAssignmentId: 'assignment-a', submittedContextSnapshot: snapshot };

async function main() {
  const db = await mysql.createConnection(configuration);
  try {
    await db.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [database]);
    await db.query('USE ??', [database]);
    schema.clearCache();
    await db.query(`CREATE TABLE audit_submissions (
      id VARCHAR(64) PRIMARY KEY, submission_number VARCHAR(64), submitted_by VARCHAR(64),
      type VARCHAR(20), template_id VARCHAR(64), title VARCHAR(255), description TEXT,
      status VARCHAR(20), current_step_index INT, org_id VARCHAR(64))`);
    await db.query(`CREATE TABLE audit_submission_steps (
      id VARCHAR(64) PRIMARY KEY, status VARCHAR(20), comment TEXT, rejection_reason TEXT,
      processed_at DATETIME, org_id VARCHAR(64))`);
    await db.query('CREATE TABLE transaction_probe (id VARCHAR(64) PRIMARY KEY)');
    await db.query("INSERT INTO audit_submissions (id,status,title,org_id) VALUES ('existing','rejected','Original','org-a')");
    await db.query("INSERT INTO audit_submission_steps (id,status,org_id) VALUES ('step-a','pending','org-a')");
    let checked = 0;
    await orgStorage.run('org-a', async () => {
      for (const [name, operation] of [
        ['create', () => submission.create('new-a', values, db)],
        ['resubmit', () => submission.update('existing', { ...values, status: 'in_progress' }, db)],
        ['approve', () => step.updateStatus('step-a', { status: 'approved', processedPersonId: 'person-a',
          processedAssignmentId: 'assignment-a', processedContextSnapshot: snapshot }, db)],
        ['reject', () => step.updateStatus('step-a', { status: 'rejected', processedPersonId: 'person-a',
          processedAssignmentId: 'assignment-a', processedContextSnapshot: snapshot }, db)]
      ]) {
        schema.clearCache();
        await db.beginTransaction();
        await db.query('INSERT INTO transaction_probe (id) VALUES (?)', [name]);
        try { await assert.rejects(operation(), { code: 'AUDIT_SNAPSHOT_SCHEMA_UNAVAILABLE' }); }
        finally { await db.rollback(); }
        const [[probe]] = await db.query('SELECT COUNT(*) AS total FROM transaction_probe');
        const [[count]] = await db.query('SELECT COUNT(*) AS total FROM audit_submissions');
        const [[oldSubmission]] = await db.query("SELECT status,title FROM audit_submissions WHERE id='existing'");
        const [[oldStep]] = await db.query("SELECT status FROM audit_submission_steps WHERE id='step-a'");
        assert.equal(probe.total, 0);
        assert.equal(count.total, 1);
        assert.deepEqual(oldSubmission, { status: 'rejected', title: 'Original' });
        assert.equal(oldStep.status, 'pending');
        checked++;
      }
      await db.query(`ALTER TABLE audit_submissions ADD submitted_person_id VARCHAR(64),
        ADD submitted_assignment_id VARCHAR(64), ADD submitted_context_snapshot JSON`);
      await db.query(`ALTER TABLE audit_submission_steps ADD processed_person_id VARCHAR(64),
        ADD processed_assignment_id VARCHAR(64), ADD processed_context_snapshot JSON`);
      schema.clearCache();
      await db.beginTransaction();
      try {
        await submission.create('new-a', values, db);
        await submission.update('existing', { ...values, status: 'in_progress' }, db);
        await step.updateStatus('step-a', { status: 'approved', processedPersonId: 'person-a',
          processedAssignmentId: 'assignment-a', processedContextSnapshot: snapshot }, db);
        await db.commit();
      } catch (error) { await db.rollback(); throw error; }
      const [rows] = await db.query('SELECT submitted_person_id,submitted_assignment_id,submitted_context_snapshot FROM audit_submissions ORDER BY id');
      for (const row of rows) {
        assert.equal(row.submitted_person_id, 'person-a');
        assert.equal(row.submitted_assignment_id, 'assignment-a');
        assert.deepEqual(typeof row.submitted_context_snapshot === 'string' ? JSON.parse(row.submitted_context_snapshot) : row.submitted_context_snapshot, snapshot);
        checked++;
      }
      const [[processed]] = await db.query("SELECT status,processed_person_id,processed_assignment_id,processed_context_snapshot FROM audit_submission_steps WHERE id='step-a'");
      assert.equal(processed.status, 'approved');
      assert.equal(processed.processed_person_id, 'person-a');
      assert.equal(processed.processed_assignment_id, 'assignment-a');
      assert.deepEqual(typeof processed.processed_context_snapshot === 'string' ? JSON.parse(processed.processed_context_snapshot) : processed.processed_context_snapshot, snapshot);
      checked++;
    });
    console.log('审核岗位快照隔离数据库验证通过：' + checked + '项（4项缺列回滚、3项真实保存回读）');
  } finally {
    schema.clearCache();
    await db.query('DROP DATABASE IF EXISTS ??', [database]);
    await db.end();
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
