const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过人事模板迁移集成测试');
  process.exit(0);
}

const databaseName = `redsu_hr_template_migration_${Date.now()}_${process.pid}`;
const migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'redsu-hr-template-migration-'));
const migrationSource = path.resolve(__dirname, '../db/deploy/20260722113000_global_hr_profile_templates.sql');
const migrationTools = require('../scripts/runDeploymentMigrations');

process.env.DB_HOST = process.env.DEPLOY_TEST_DB_HOST;
process.env.DB_PORT = process.env.DEPLOY_TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.DEPLOY_TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DEPLOY_TEST_DB_PASSWORD || '';
process.env.DB_NAME = databaseName;

function databaseConfig(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true
  };
}

async function createLegacyFixture(connection) {
  await connection.query(`
    CREATE TABLE organizations (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(200) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    CREATE TABLE hr_profile_templates (
      id VARCHAR(64) PRIMARY KEY,
      template_key VARCHAR(64) NOT NULL DEFAULT 'default_hr_profile_template',
      description TEXT,
      edit_mode VARCHAR(32) NOT NULL DEFAULT 'direct',
      fields TEXT,
      updated_by VARCHAR(64),
      org_id VARCHAR(64) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_hpt_org (org_id),
      UNIQUE INDEX idx_hpt_key (template_key, org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    CREATE TABLE hr_profile_template_fields (
      id VARCHAR(64) PRIMARY KEY,
      template_id VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL,
      label VARCHAR(200) NOT NULL,
      type VARCHAR(32) NOT NULL,
      required TINYINT(1) NOT NULL DEFAULT 0,
      min_length INT, max_length INT, number_rule VARCHAR(32), allow_decimal TINYINT(1),
      min_digits INT, max_digits INT, min_value DECIMAL(20,4), max_value DECIMAL(20,4),
      options_json TEXT,
      org_id VARCHAR(64) NOT NULL,
      INDEX idx_hptf_template (template_id),
      INDEX idx_hptf_org (org_id),
      CONSTRAINT fk_hptf_template FOREIGN KEY (template_id) REFERENCES hr_profile_templates(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    CREATE TABLE hr_profile_records (
      id VARCHAR(64) PRIMARY KEY,
      hr_id VARCHAR(64) NOT NULL,
      name VARCHAR(100), openid VARCHAR(128),
      template_key VARCHAR(64), template_updated_at DATETIME,
      audit_status VARCHAR(16) NOT NULL DEFAULT 'none', rejection_reason TEXT,
      requested_at DATETIME, reviewed_at DATETIME,
      org_id VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_hpr_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    CREATE TABLE hr_profile_record_values (
      id VARCHAR(64) PRIMARY KEY,
      record_id VARCHAR(64) NOT NULL,
      is_pending TINYINT(1) NOT NULL DEFAULT 0,
      field_id VARCHAR(64) NOT NULL,
      field_value TEXT,
      org_id VARCHAR(64) NOT NULL,
      INDEX idx_hprv_record (record_id), INDEX idx_hprv_field (field_id), INDEX idx_hprv_org (org_id),
      CONSTRAINT fk_hprv_record FOREIGN KEY (record_id) REFERENCES hr_profile_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  await connection.query(
    `INSERT INTO organizations (id, name) VALUES ('org-a', '红树林学生会'), ('org-b', '红树林学生会')`
  );
  await connection.query(
    `INSERT INTO hr_profile_templates
       (id, template_key, description, edit_mode, updated_by, org_id, created_at, updated_at)
     VALUES ('template-a', 'default_hr_profile_template', '迁移说明', 'audit', 'admin-a', 'org-a', NOW(), NOW())`
  );
  await connection.query(
    `INSERT INTO hr_profile_template_fields
       (id, template_id, sort_order, label, type, required, number_rule, allow_decimal, options_json, org_id)
     VALUES
       ('field-a', 'template-a', 1, '学院', 'text', 1, 'value_range', 1, NULL, 'org-a'),
       ('field-b', 'template-a', 2, '学历', 'sequence', 0, 'value_range', 1, '["本科","硕士"]', 'org-a')`
  );
  await connection.query(
    `INSERT INTO hr_profile_records
       (id, hr_id, name, template_key, template_updated_at, audit_status, org_id)
     VALUES
       ('record-a', 'hr-a', '甲', 'default_hr_profile_template', NOW(), 'approved', 'org-a'),
       ('record-b', 'hr-b', '乙', 'default_hr_profile_template', NOW(), 'pending', 'org-a')`
  );
  await connection.query(
    `INSERT INTO hr_profile_record_values
       (id, record_id, is_pending, field_id, field_value, org_id)
     VALUES
       ('value-a', 'record-a', 0, 'field-a', '计算机学院', 'org-a'),
       ('value-b', 'record-a', 0, 'field-b', '本科', 'org-a'),
       ('value-c', 'record-b', 1, 'field-a', '法学院', 'org-a')`
  );
}

async function assertMigrated(connection) {
  const [[counts]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM hr_profile_templates) AS template_count,
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshots) AS snapshot_count,
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields) AS snapshot_field_count,
      (SELECT COUNT(*) FROM hr_profile_records) AS record_count,
      (SELECT COUNT(*) FROM hr_profile_record_values) AS value_count,
      (SELECT COUNT(*) FROM org_hr_profile_template_settings) AS setting_count
  `);
  assert.deepStrictEqual(
    [counts.template_count, counts.snapshot_count, counts.snapshot_field_count,
      counts.record_count, counts.value_count, counts.setting_count].map(Number),
    [1, 1, 2, 2, 3, 1]
  );
  const [[integrity]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM hr_profile_record_values value_row
        LEFT JOIN org_hr_profile_template_snapshot_fields field ON field.id = value_row.field_id
       WHERE field.id IS NULL) AS orphan_values,
      (SELECT COUNT(*) FROM hr_profile_records record_row
        LEFT JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = record_row.template_snapshot_id
       WHERE snapshot.id IS NULL OR snapshot.org_id <> record_row.org_id) AS invalid_records,
      (SELECT COUNT(*) FROM (
         SELECT record_id, field_id, is_pending, COUNT(*) AS total
           FROM hr_profile_record_values GROUP BY record_id, field_id, is_pending HAVING total > 1
       ) duplicate_values) AS duplicate_groups
  `);
  assert.deepStrictEqual(
    [integrity.orphan_values, integrity.invalid_records, integrity.duplicate_groups].map(Number),
    [0, 0, 0]
  );
  const [[template]] = await connection.query('SELECT name FROM hr_profile_templates');
  const suffix = crypto.createHash('sha256').update('template-a').digest('hex').slice(0, 8);
  assert.strictEqual(template.name, `红树林学生会-${suffix}-人事信息模板`);
}

async function run() {
  const admin = await mysql.createConnection(databaseConfig(undefined));
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const connection = await mysql.createConnection(databaseConfig(databaseName));
    try {
      await createLegacyFixture(connection);
      fs.copyFileSync(migrationSource, path.join(migrationDirectory, '20260722113000_global_hr_profile_templates.sql'));
      await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '3'.repeat(40) });
      await assertMigrated(connection);

      fs.rmSync(path.join(migrationDirectory, '20260722113000_global_hr_profile_templates.sql'));
      fs.copyFileSync(migrationSource, path.join(migrationDirectory, '20260722113001_global_hr_profile_templates_retry.sql'));
      await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '4'.repeat(40) });
      await assertMigrated(connection);

      await connection.query('DELETE FROM hr_profile_templates WHERE id = ?', ['template-a']);
      const [[survivors]] = await connection.query(`
        SELECT
          (SELECT COUNT(*) FROM org_hr_profile_template_snapshots WHERE source_template_id IS NULL) AS detached_snapshots,
          (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields) AS fields,
          (SELECT COUNT(*) FROM hr_profile_record_values) AS values_count
      `);
      assert.deepStrictEqual(
        [survivors.detached_snapshots, survivors.fields, survivors.values_count].map(Number),
        [1, 2, 3]
      );
      console.log('人事模板全局库、组织快照、数据保持和幂等迁移测试通过');
    } finally {
      await connection.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
