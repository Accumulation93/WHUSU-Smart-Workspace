const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const host = process.env.SECURITY_TEST_DB_HOST || '127.0.0.1';
const port = Number(process.env.SECURITY_TEST_DB_PORT || 3362);
const adminUser = process.env.TEST_DB_ADMIN_USER || 'root';
const adminPassword = process.env.TEST_DB_ADMIN_PASSWORD || '';
const database = 'redsu_security_test_' + process.pid + '_' + Date.now();

async function run() {
  const admin = await mysql.createConnection({ host, port, user: adminUser, password: adminPassword, multipleStatements: true });
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query('USE ??', [database]);
    await admin.query(`
      CREATE TABLE admin_info (
        id VARCHAR(64) PRIMARY KEY,
        invite_code VARCHAR(32),
        invited_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
      INSERT INTO admin_info (id, invite_code, invited_at) VALUES ('root-test', 'OLD123', NOW());
    `);
    const migration = fs.readFileSync(path.resolve(__dirname, '../db/migrate_security_hardening.sql'), 'utf8');
    await admin.query(migration);
    await admin.query(migration);

    const [columns] = await admin.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_info'`,
      [database]
    );
    const names = new Set(columns.map((item) => item.COLUMN_NAME));
    assert(names.has('invite_code_hash'));
    assert(names.has('invite_expires_at'));
    assert(names.has('invite_consumed_at'));

    const [challenges] = await admin.query("SHOW TABLES LIKE 'auth_challenges'");
    assert.strictEqual(challenges.length, 1);
    const [legacy] = await admin.query("SELECT invite_code FROM admin_info WHERE id = 'root-test'");
    assert.strictEqual(legacy[0].invite_code, null);
    console.log('安全迁移幂等测试通过');
  } finally {
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.end();
  }
}

run().catch((error) => {
  if (error && error.code === 'ECONNREFUSED' && process.env.REQUIRE_SECURITY_TEST_DB !== '1') {
    console.log('安全迁移测试跳过：本地隔离 MySQL 未启动');
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
