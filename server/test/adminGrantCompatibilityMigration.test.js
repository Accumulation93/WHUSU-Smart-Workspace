const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const host = process.env.SECURITY_TEST_DB_HOST || '127.0.0.1';
const port = Number(process.env.SECURITY_TEST_DB_PORT || 3362);
const user = process.env.TEST_DB_ADMIN_USER || 'root';
const password = process.env.TEST_DB_ADMIN_PASSWORD || '';
const database = 'whusu_admin_grant_compat_test_' + process.pid + '_' + Date.now();

function readMigration() {
  return fs.readFileSync(
    path.resolve(__dirname, '../db/deploy/20260903212000_restore_admin_grant_compatibility.sql'),
    'utf8'
  );
}

async function run() {
  const connection = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  try {
    await connection.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query('USE ??', [database]);
    await connection.query(`
      CREATE TABLE persons (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        student_id VARCHAR(32) DEFAULT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'active'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      CREATE TABLE admin_info (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        student_id VARCHAR(32) DEFAULT NULL,
        admin_level VARCHAR(32) NOT NULL DEFAULT 'admin',
        bind_status VARCHAR(16) NOT NULL DEFAULT 'invited',
        org_id VARCHAR(64) NOT NULL DEFAULT '',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_ai_student (student_id, org_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      CREATE TABLE admin_grants (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        person_id VARCHAR(64) NOT NULL,
        org_id VARCHAR(64) NOT NULL DEFAULT '',
        admin_level VARCHAR(32) NOT NULL DEFAULT 'admin',
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        legacy_admin_id VARCHAR(64) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX uk_admin_grant_legacy (legacy_admin_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      INSERT INTO persons (id, name, student_id) VALUES
        ('person-orphan', '缺失兼容行', '20260001'),
        ('person-existing', '复用兼容行', '20260002'),
        ('person-null-key', '派生兼容键', '20260003');
      INSERT INTO admin_info (id, name, student_id, admin_level, org_id)
      VALUES ('legacy-existing', '旧名称', '20260002', 'admin', 'org-43');
      INSERT INTO admin_grants
        (id, person_id, org_id, admin_level, status, legacy_admin_id)
      VALUES
        ('grant-orphan', 'person-orphan', 'org-43', 'admin', 'active', 'legacy-orphan'),
        ('grant-existing', 'person-existing', 'org-43', 'admin', 'active', 'missing-but-reusable'),
        ('grant-null-key', 'person-null-key', 'org-43', 'admin', 'active', NULL);
    `);

    const migration = readMigration();
    await connection.query(migration);
    await connection.query(migration);

    const [rows] = await connection.query(`
      SELECT grant_row.id AS grant_id, grant_row.legacy_admin_id,
             admin_row.name, admin_row.student_id, admin_row.org_id, admin_row.admin_level
        FROM admin_grants grant_row
        JOIN admin_info admin_row ON admin_row.id = grant_row.legacy_admin_id
       ORDER BY grant_row.id
    `);
    assert.strictEqual(rows.length, 3);
    const byGrant = new Map(rows.map((item) => [item.grant_id, item]));
    assert.strictEqual(byGrant.get('grant-existing').legacy_admin_id, 'legacy-existing');
    assert.strictEqual(byGrant.get('grant-existing').name, '复用兼容行');
    assert.strictEqual(byGrant.get('grant-orphan').legacy_admin_id, 'legacy-orphan');
    assert.strictEqual(byGrant.get('grant-orphan').org_id, 'org-43');
    assert.strictEqual(byGrant.get('grant-null-key').legacy_admin_id.length, 64);
    assert.strictEqual(byGrant.get('grant-null-key').student_id, '20260003');

    const [duplicateRows] = await connection.query(`
      SELECT student_id, org_id, COUNT(*) AS count
        FROM admin_info
       GROUP BY student_id, org_id
      HAVING COUNT(*) > 1
    `);
    assert.strictEqual(duplicateRows.length, 0);
    console.log('管理员授权兼容索引恢复迁移幂等测试通过');
  } finally {
    await connection.query('DROP DATABASE IF EXISTS ??', [database]);
    await connection.end();
  }
}

run().catch((error) => {
  if (error && error.code === 'ECONNREFUSED' && process.env.REQUIRE_SECURITY_TEST_DB !== '1') {
    console.log('管理员授权兼容索引恢复迁移测试跳过：本地隔离 MySQL 未启动');
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
