const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const host = process.env.SECURITY_TEST_DB_HOST || '127.0.0.1';
const port = Number(process.env.SECURITY_TEST_DB_PORT || 3362);
const user = process.env.TEST_DB_ADMIN_USER || 'root';
const password = process.env.TEST_DB_ADMIN_PASSWORD || '';
const database = 'redsu_admin_permissions_test_' + process.pid + '_' + Date.now();

function readMigration(name) {
  return fs.readFileSync(path.resolve(__dirname, '../db/deploy/' + name), 'utf8');
}

async function run() {
  const connection = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query('USE ??', [database]);
    await connection.query(`
      CREATE TABLE admin_info (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        admin_level VARCHAR(32) NOT NULL DEFAULT 'super_admin',
        org_id VARCHAR(64) NOT NULL DEFAULT ''
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      INSERT INTO admin_info (id, name, admin_level, org_id) VALUES
        ('root-test', 'Legacy Root', 'root_admin', 'org-legacy'),
        ('super-test', 'Legacy Super', 'super_admin', 'org-44'),
        ('admin-test', 'Regular', 'admin', 'org-44');
    `);

    await connection.query(readMigration('20260717183000_admin_permissions.sql'));
    await connection.query(
      `INSERT INTO admin_permission_overrides
        (id, org_id, admin_id, permission_key, granted, configured_by)
       VALUES ('override-1', 'org-44', 'admin-test', 'hr.people', 1, 'root-test')`
    );

    const twoLevelMigration = readMigration('20260721160000_two_level_admins.sql');
    await connection.query(twoLevelMigration);
    await connection.query(twoLevelMigration);

    const [admins] = await connection.query(
      'SELECT id, admin_level, org_id FROM admin_info ORDER BY id'
    );
    const byId = new Map(admins.map((item) => [item.id, item]));
    assert.strictEqual(byId.get('root-test').admin_level, 'super_admin');
    assert.strictEqual(byId.get('root-test').org_id, '');
    assert.strictEqual(byId.get('super-test').admin_level, 'admin');
    assert.strictEqual(byId.get('super-test').org_id, 'org-44');
    assert.strictEqual(byId.get('admin-test').admin_level, 'admin');

    const [overrides] = await connection.query('SELECT id FROM admin_permission_overrides');
    assert.strictEqual(overrides.length, 0);

    const [columnRows] = await connection.query(
      `SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_info' AND COLUMN_NAME = 'admin_level'`,
      [database]
    );
    assert.strictEqual(columnRows[0].COLUMN_DEFAULT, 'admin');

    let legacyRejected = false;
    try {
      await connection.query(
        "INSERT INTO admin_info (id, name, admin_level, org_id) VALUES ('legacy-invalid', 'Invalid', 'root_admin', '')"
      );
    } catch (error) {
      legacyRejected = error.code === 'ER_CHECK_CONSTRAINT_VIOLATED';
    }
    assert.strictEqual(legacyRejected, true);

    await connection.query(
      `INSERT INTO admin_permission_overrides
        (id, org_id, admin_id, permission_key, granted, configured_by)
       VALUES ('override-2', 'org-44', 'admin-test', 'hr.people', 0, 'root-test')`
    );
    await connection.query("DELETE FROM admin_info WHERE id = 'admin-test'");
    const [afterDelete] = await connection.query(
      "SELECT id FROM admin_permission_overrides WHERE admin_id = 'admin-test'"
    );
    assert.strictEqual(afterDelete.length, 0);
    console.log('两级管理员迁移幂等、归零与约束测试通过');
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
