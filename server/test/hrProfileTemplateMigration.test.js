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

const databaseName = `whusu_smart_workspace_hr_template_migration_${Date.now()}_${process.pid}`;
const applicationUser = `hr_template_app_${process.pid}`;
const applicationPassword = `HrTemplateTest_${Date.now()}_${process.pid}`;
const migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-smart-workspace-hr-template-migration-'));
const globalMigrationSource = path.resolve(__dirname, '../db/deploy/20260722113000_global_hr_profile_templates.sql');
const uniqueSnapshotMigrationSource = path.resolve(__dirname, '../db/deploy/20260722203000_unique_hr_profile_snapshot.sql');
const migrationTools = require('../scripts/runDeploymentMigrations');

process.env.DB_HOST = process.env.DEPLOY_TEST_DB_HOST;
process.env.DB_PORT = process.env.DEPLOY_TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.DEPLOY_TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DEPLOY_TEST_DB_PASSWORD || '';
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unique-hr-profile-snapshot-test-secret';

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
      (SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_settings') AS setting_table_count
  `);
  assert.deepStrictEqual(
    [counts.template_count, counts.snapshot_count, counts.snapshot_field_count,
      counts.record_count, counts.value_count, counts.setting_table_count].map(Number),
    [1, 1, 3, 2, 4, 0]
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
  const [[snapshotShape]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields WHERE is_active = 1) AS active_fields,
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields WHERE is_active = 0) AS hidden_fields,
      (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshots'
          AND COLUMN_NAME IN ('version', 'source_template_id', 'source_template_name')) AS legacy_snapshot_columns,
      (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_hr_profile_template_snapshot_fields'
          AND COLUMN_NAME = 'source_template_field_id') AS legacy_field_columns
  `);
  assert.deepStrictEqual(
    [snapshotShape.active_fields, snapshotShape.hidden_fields,
      snapshotShape.legacy_snapshot_columns, snapshotShape.legacy_field_columns].map(Number),
    [2, 1, 0, 0]
  );
  const [[template]] = await connection.query('SELECT name FROM hr_profile_templates');
  const suffix = crypto.createHash('sha256').update('template-a').digest('hex').slice(0, 8);
  assert.strictEqual(template.name, `红树林学生会-${suffix}-人事信息模板`);
}

async function assertTemplateAppliedInPlace(connection) {
  const [[before]] = await connection.query('SELECT id FROM org_hr_profile_template_snapshots WHERE org_id = ?', ['org-a']);
  const [sourceFields] = await connection.query(
    `SELECT field_row.id, field_row.label, field_row.is_active
       FROM org_hr_profile_template_snapshot_fields field_row
       JOIN org_hr_profile_template_snapshots snapshot ON snapshot.id = field_row.snapshot_id
      WHERE snapshot.org_id = ? ORDER BY field_row.is_active DESC, field_row.sort_order`,
    ['org-a']
  );
  const actions = sourceFields.map((field) => ({
    sourceSnapshotFieldId: field.id,
    action: field.is_active ? 'map' : 'hide',
    targetTemplateFieldId: field.is_active ? (field.label === '学院' ? 'field-a' : 'field-b') : ''
  }));
  const library = require('../src/core/services/hrProfileTemplateLibrary');
  const preview = await library.preflightSwitch('org-a', 'template-a', actions);
  assert.strictEqual(preview.status, 'success');
  const applied = await library.applySwitch(
    'org-a', 'template-a', actions, preview.switchToken, false, { id: 'admin-a' }
  );
  assert.strictEqual(applied.status, 'success');
  assert.strictEqual(applied.snapshotId, before.id);
  const [[after]] = await connection.query(`
    SELECT
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshots WHERE org_id = 'org-a') AS snapshots,
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? AND is_active = 1) AS active_fields,
      (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields WHERE snapshot_id = ? AND is_active = 0) AS hidden_fields,
      (SELECT COUNT(*) FROM org_hr_profile_template_switches WHERE snapshot_id = ?) AS switch_count,
      (SELECT COUNT(*) FROM hr_profile_record_values WHERE org_id = 'org-a') AS values_count
  `, [before.id, before.id, before.id]);
  assert.deepStrictEqual(
    [after.snapshots, after.active_fields, after.hidden_fields, after.switch_count, after.values_count].map(Number),
    [1, 2, 3, 1, 4]
  );
}

async function run() {
  const admin = await mysql.createConnection(databaseConfig(undefined));
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const connection = await mysql.createConnection(databaseConfig(databaseName));
    try {
      await createLegacyFixture(connection);
      fs.copyFileSync(globalMigrationSource, path.join(migrationDirectory, '20260722113000_global_hr_profile_templates.sql'));
      await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '3'.repeat(40) });
      const [[activeSnapshot]] = await connection.query('SELECT * FROM org_hr_profile_template_snapshots LIMIT 1');
      await connection.query(
        `INSERT INTO org_hr_profile_template_snapshots
         (id, org_id, version, source_template_id, source_template_name, description, edit_mode)
         VALUES ('snapshot-old', 'org-a', 2, 'template-a', '旧模板名称', '旧说明', 'direct')`
      );
      await connection.query(
        `INSERT INTO org_hr_profile_template_snapshot_fields
         (id, snapshot_id, source_template_field_id, sort_order, label, type, required, number_rule, allow_decimal)
         VALUES ('field-old-hidden', 'snapshot-old', 'field-a', 1, '旧字段', 'text', 0, 'value_range', 1)`
      );
      await connection.query(
        `INSERT INTO hr_profile_record_values
         (id, record_id, is_pending, field_id, field_value, org_id)
         VALUES ('value-old-hidden', 'record-b', 0, 'field-old-hidden', '保留内容', 'org-a')`
      );
      assert(activeSnapshot.id, '首次迁移应生成当前快照');

      fs.copyFileSync(uniqueSnapshotMigrationSource, path.join(migrationDirectory, '20260722203000_unique_hr_profile_snapshot.sql'));
      await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '4'.repeat(40) });
      await assertMigrated(connection);

      fs.rmSync(path.join(migrationDirectory, '20260722203000_unique_hr_profile_snapshot.sql'));
      fs.copyFileSync(uniqueSnapshotMigrationSource, path.join(migrationDirectory, '20260722203001_unique_hr_profile_snapshot_retry.sql'));
      await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '5'.repeat(40) });
      await assertMigrated(connection);
      await admin.query(`CREATE USER '${applicationUser}'@'%' IDENTIFIED BY ?`, [applicationPassword]);
      await admin.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${applicationUser}'@'%'`);
      process.env.DB_USER = applicationUser;
      process.env.DB_PASSWORD = applicationPassword;
      await assertTemplateAppliedInPlace(connection);

      await connection.query('DELETE FROM hr_profile_templates WHERE id = ?', ['template-a']);
      const [[survivors]] = await connection.query(`
        SELECT
          (SELECT COUNT(*) FROM org_hr_profile_template_snapshots) AS snapshots,
          (SELECT COUNT(*) FROM org_hr_profile_template_snapshot_fields) AS fields,
          (SELECT COUNT(*) FROM hr_profile_record_values) AS values_count
      `);
      assert.deepStrictEqual(
        [survivors.snapshots, survivors.fields, survivors.values_count].map(Number),
        [1, 5, 4]
      );
      console.log('共享模板、每组织唯一快照、数据保持和幂等迁移测试通过');
    } finally {
      const applicationPool = require('../src/config/db');
      await applicationPool.end();
      await connection.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.query(`DROP USER IF EXISTS '${applicationUser}'@'%'`);
    await admin.end();
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
