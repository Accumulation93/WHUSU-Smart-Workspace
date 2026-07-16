const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const host = process.env.SECURITY_TEST_DB_HOST || '127.0.0.1';
const port = Number(process.env.SECURITY_TEST_DB_PORT || 3362);
const adminUser = process.env.TEST_DB_ADMIN_USER || 'root';
const adminPassword = process.env.TEST_DB_ADMIN_PASSWORD || '';
const database = 'redsu_integrity_test_' + process.pid + '_' + Date.now();

async function run() {
  const admin = await mysql.createConnection({ host, port, user: adminUser, password: adminPassword, multipleStatements: true });
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query('USE ??', [database]);
    await admin.query(`
      CREATE TABLE system_config (id VARCHAR(64) PRIMARY KEY, current_organization VARCHAR(64));
      INSERT INTO system_config VALUES ('default', 'org-test');
      CREATE TABLE hr_info (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64) NOT NULL);
      CREATE TABLE admin_info (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64) NOT NULL);
      CREATE TABLE audit_submissions (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64) NOT NULL);
      CREATE TABLE venue_bookings (
        id VARCHAR(64) PRIMARY KEY,
        user_hr_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
        creator_admin_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
        status VARCHAR(20), time_start DATETIME, time_end DATETIME
      );
      CREATE TABLE score_records (
        id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64) NOT NULL, activity_id VARCHAR(64) NOT NULL,
        scorer_id VARCHAR(64) NOT NULL, target_id VARCHAR(64) NOT NULL
      );
      CREATE TABLE score_answers (
        id VARCHAR(64) PRIMARY KEY, record_id VARCHAR(64) NOT NULL, question_index INT NOT NULL
      );
      INSERT INTO hr_info VALUES ('hr-test', 'org-test');
      INSERT INTO venue_bookings VALUES ('booking-test', 'hr-test', NULL, 'pending', NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR));
      INSERT INTO score_records VALUES ('record-test', 'org-test', 'activity-test', 'scorer-test', 'target-test');
      INSERT INTO score_answers VALUES ('answer-test', 'record-test', 1);
    `);

    const migration = fs.readFileSync(path.resolve(__dirname, '../db/migrate_data_integrity.sql'), 'utf8');
    await admin.query(migration);
    await admin.query(migration);

    const [[booking]] = await admin.query(
      "SELECT creator_org_id, approval_org_id FROM venue_bookings WHERE id = 'booking-test'"
    );
    assert.strictEqual(booking.creator_org_id, 'org-test');
    assert.strictEqual(booking.approval_org_id, 'org-test');

    const [tables] = await admin.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN
       ('audit_number_sequences', 'request_deduplication', 'notifications', 'audit_read_cursors', '_shared_cache')`,
      [database]
    );
    assert.strictEqual(tables.length, 5);

    const [indexes] = await admin.query(
      `SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND INDEX_NAME IN ('uk_sr_business', 'uk_sa_record_question')`,
      [database]
    );
    assert.strictEqual(indexes.length, 2);
    console.log('数据一致性迁移幂等测试通过');
  } finally {
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.end();
  }
}

run().catch((error) => {
  if (error && error.code === 'ECONNREFUSED' && process.env.REQUIRE_SECURITY_TEST_DB !== '1') {
    console.log('数据一致性迁移测试跳过：本地隔离 MySQL 未启动');
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
