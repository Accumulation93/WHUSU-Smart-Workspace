const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过 UTC 真实迁移集成测试');
  process.exit(0);
}

const databaseName = `whusu_utc_migration_test_${Date.now()}_${process.pid}`;
const migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-utc-migration-'));
process.env.DB_HOST = process.env.DEPLOY_TEST_DB_HOST;
process.env.DB_PORT = process.env.DEPLOY_TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.DEPLOY_TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DEPLOY_TEST_DB_PASSWORD || '';
process.env.DB_NAME = databaseName;

const migrationTools = require('../scripts/runDeploymentMigrations');
const materializer = require('../scripts/materializeUtcTimeReviews');

function config(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    timezone: 'Z',
    multipleStatements: true
  };
}

async function createLegacySchema(connection) {
  await connection.query(`
    CREATE TABLE system_config (
      id VARCHAR(64) PRIMARY KEY,
      timezone INT NOT NULL DEFAULT 8,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    );
    CREATE TABLE organization_memberships (
      id VARCHAR(64) PRIMARY KEY,
      person_id VARCHAR(64) NOT NULL,
      org_id VARCHAR(64) NOT NULL,
      legacy_hr_id VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    );
    CREATE TABLE membership_assignments (
      id VARCHAR(64) PRIMARY KEY,
      membership_id VARCHAR(64) NOT NULL,
      org_id VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    );
    CREATE TABLE auth_audit_events (
      id VARCHAR(64) PRIMARY KEY,
      event_type VARCHAR(64) NOT NULL,
      organization_id VARCHAR(64),
      detail_json JSON,
      created_at DATETIME(3) NOT NULL
    );
    CREATE TABLE composite_time_sample (
      tenant_id VARCHAR(64) NOT NULL,
      sequence_no INT NOT NULL,
      processed_at DATETIME(3) NOT NULL,
      PRIMARY KEY (tenant_id, sequence_no)
    );
  `);
  await connection.query(
    `INSERT INTO system_config (id, timezone, updated_at) VALUES ('global', 8, '2026-08-20 09:00:00.000')`
  );
  await connection.query(
    `INSERT INTO organization_memberships
      (id, person_id, org_id, legacy_hr_id, status, created_at, updated_at)
     VALUES ('membership-left', 'person-left', 'org-a', 'hr-left', 'left',
             '2026-08-01 08:00:00.000', '2026-08-20 10:11:12.345')`
  );
  await connection.query(
    `INSERT INTO membership_assignments
      (id, membership_id, org_id, status, created_at, updated_at)
     VALUES ('assignment-left', 'membership-left', 'org-a', 'revoked',
             '2026-08-01 08:00:00.000', '2026-08-20 10:11:12.345')`
  );
  await connection.query(
    `INSERT INTO composite_time_sample (tenant_id, sequence_no, processed_at) VALUES
      ('org-a', 1, '2026-08-20 01:02:03.004'),
      ('org-a', 2, '2026-08-20 09:02:03.004'),
      ('org-b', 1, '2026-08-21 23:59:59.999')`
  );
}

async function run() {
  const admin = await mysql.createConnection(config(undefined));
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
    const database = await mysql.createConnection(config(databaseName));
    try {
      await createLegacySchema(database);
      const migrationSource = path.resolve(__dirname, '../db/deploy/20260823190000_utc_time_normalization.sql');
      fs.copyFileSync(migrationSource, path.join(migrationDirectory, path.basename(migrationSource)));

      await migrationTools.applyMigrations({
        directory: migrationDirectory,
        deployedSha: 'a'.repeat(40)
      });

      const [departureRows] = await database.query(
        `SELECT om.departure_batch_id, om.updated_at AS membership_updated_at,
                ma.revoked_by_departure_id, ma.updated_at AS assignment_updated_at
           FROM organization_memberships om
           JOIN membership_assignments ma ON ma.membership_id = om.id
          WHERE om.id = 'membership-left'`
      );
      assert.strictEqual(departureRows[0].departure_batch_id, departureRows[0].revoked_by_departure_id);
      assert.strictEqual(new Date(departureRows[0].membership_updated_at).toISOString(), '2026-08-20T02:11:12.345Z');
      assert.strictEqual(new Date(departureRows[0].assignment_updated_at).toISOString(), '2026-08-20T02:11:12.345Z');

      // 模拟 SQL 已提交但迁移账本写入丢失：重跑不得再次平移已校正字段。
      await database.query('DELETE FROM schema_migrations WHERE name = ?', [path.basename(migrationSource)]);
      await migrationTools.applyMigrations({
        directory: migrationDirectory,
        deployedSha: 'b'.repeat(40)
      });
      const [rerunDepartureRows] = await database.query(
        `SELECT om.updated_at AS membership_updated_at, ma.updated_at AS assignment_updated_at
           FROM organization_memberships om
           JOIN membership_assignments ma ON ma.membership_id = om.id
          WHERE om.id = 'membership-left'`
      );
      assert.strictEqual(new Date(rerunDepartureRows[0].membership_updated_at).toISOString(), '2026-08-20T02:11:12.345Z');
      assert.strictEqual(new Date(rerunDepartureRows[0].assignment_updated_at).toISOString(), '2026-08-20T02:11:12.345Z');

      const first = await materializer.materialize(database);
      const verified = await materializer.verify(database, true);
      assert(first.records > 0);
      assert.strictEqual(verified.records, first.records);
      assert.strictEqual(await materializer.readCutoverStatus(database), 'review_pending');
      const [mappingRows] = await database.query(
        `SELECT COUNT(*) AS unresolved_count,
                SUM(primary_record_id IS NOT NULL AND primary_record_id != '') AS mapped_count
           FROM absolute_time_record_reviews
          WHERE migration_key = ? AND review_status = 'review_required'`,
        [materializer.MIGRATION_KEY]
      );
      assert.strictEqual(Number(mappingRows[0].mapped_count), Number(mappingRows[0].unresolved_count));

      const [beforeRows] = await database.query(
        'SELECT tenant_id, sequence_no, processed_at FROM composite_time_sample ORDER BY tenant_id, sequence_no'
      );
      assert.deepStrictEqual(beforeRows.map((row) => new Date(row.processed_at).toISOString()), [
        '2026-08-20T01:02:03.004Z',
        '2026-08-20T09:02:03.004Z',
        '2026-08-21T23:59:59.999Z'
      ]);

      await database.query(
        `UPDATE absolute_time_cutovers SET status = 'materialized'
          WHERE migration_key = ?`,
        [materializer.MIGRATION_KEY]
      );
      await database.query(
        `DELETE FROM absolute_time_record_reviews
          WHERE migration_key = ? AND table_name = 'composite_time_sample' LIMIT 1`,
        [materializer.MIGRATION_KEY]
      );
      const recovered = await materializer.materialize(database);
      const reverified = await materializer.verify(database, true);
      assert.strictEqual(recovered.records, first.records);
      assert.strictEqual(reverified.records, first.records);
      assert.strictEqual(await materializer.readCutoverStatus(database), 'review_pending');

      // 业务源记录被物理删除后，下一轮物化必须清除陈旧待核对项，避免保留可关联时间或阻断校验。
      await database.query(
        "DELETE FROM composite_time_sample WHERE tenant_id = 'tenant-a' AND sequence_no = 2"
      );
      const pruned = await materializer.materialize(database);
      const prunedVerified = await materializer.verify(database, true);
      assert.strictEqual(pruned.records, first.records - 1);
      assert.strictEqual(prunedVerified.records, first.records - 1);
      const [staleRows] = await database.query(
        `SELECT COUNT(*) AS count FROM absolute_time_record_reviews
          WHERE migration_key = ? AND table_name = 'composite_time_sample'
            AND record_key LIKE '%sequence_no=2%'`,
        [materializer.MIGRATION_KEY]
      );
      assert.strictEqual(Number(staleRows[0].count), 0);
    } finally {
      await database.end();
    }
    console.log('UTC 真实迁移、离任时间保持、复合主键物化与中断恢复测试通过');
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
