const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const host = process.env.SECURITY_TEST_DB_HOST || '127.0.0.1';
const port = Number(process.env.SECURITY_TEST_DB_PORT || 3362);
const user = process.env.TEST_DB_ADMIN_USER || 'root';
const password = process.env.TEST_DB_ADMIN_PASSWORD || '';
const database = 'redsu_admin_permissions_test_' + process.pid + '_' + Date.now();

async function run() {
  const connection = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query('USE ??', [database]);
    await connection.query(`
      CREATE TABLE admin_info (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        admin_level VARCHAR(32) NOT NULL,
        org_id VARCHAR(64) NOT NULL DEFAULT ''
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      INSERT INTO admin_info (id, name, admin_level, org_id) VALUES
        ('root-test', 'Root', 'root_admin', ''),
        ('admin-test', 'Admin', 'admin', 'org-44');
    `);
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../db/deploy/20260717183000_admin_permissions.sql'),
      'utf8'
    );
    await connection.query(migration);
    await connection.query(migration);

    await connection.query(
      `INSERT INTO admin_permission_overrides
        (id, org_id, admin_id, permission_key, granted, configured_by)
       VALUES ('override-1', 'org-44', 'admin-test', 'hr.people', 0, 'root-test')`
    );
    const [rows] = await connection.query(
      "SELECT granted FROM admin_permission_overrides WHERE admin_id = 'admin-test' AND permission_key = 'hr.people'"
    );
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].granted, 0);

    let duplicateRejected = false;
    try {
      await connection.query(
        `INSERT INTO admin_permission_overrides
          (id, org_id, admin_id, permission_key, granted, configured_by)
         VALUES ('override-2', 'org-44', 'admin-test', 'hr.people', 1, 'root-test')`
      );
    } catch (error) {
      duplicateRejected = error.code === 'ER_DUP_ENTRY';
    }
    assert.strictEqual(duplicateRejected, true);

    await connection.query("DELETE FROM admin_info WHERE id = 'admin-test'");
    const [afterDelete] = await connection.query("SELECT id FROM admin_permission_overrides WHERE admin_id = 'admin-test'");
    assert.strictEqual(afterDelete.length, 0);
    console.log('管理员权限迁移幂等与约束测试通过');
  } finally {
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.end();
  }
}

run().catch((error) => {
  if (error && error.code === 'ECONNREFUSED' && process.env.REQUIRE_SECURITY_TEST_DB !== '1') {
    console.log('管理员权限迁移测试跳过：本地隔离 MySQL 未启动');
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
