const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { verifySchemaContract } = require('../src/utils/schemaContract');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过全新数据库场地契约测试');
  process.exit(0);
}

const databaseName = `redsu_fresh_schema_test_${Date.now()}_${process.pid}`;
const config = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || ''
};

(async () => {
  const admin = await mysql.createConnection(config);
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const database = await mysql.createConnection(Object.assign({}, config, {
      database: databaseName,
      multipleStatements: true
    }));
    try {
      await database.query(fs.readFileSync(path.resolve(__dirname, '../db/init.sql'), 'utf8'));
      await verifySchemaContract(database);
      const [tables] = await database.query(
        `SELECT TABLE_NAME
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME IN (
              'venues', 'venue_open_rules', 'venue_activity_rules', 'venue_booking_rules',
              'venue_bookings', 'venue_booking_purposes', 'venue_approval_flows',
              'venue_approval_flow_steps', 'venue_approval_flow_step_rules'
            )`,
        [databaseName]
      );
      assert.strictEqual(tables.length, 9);
      const [columns] = await database.query(
        `SELECT COLUMN_NAME
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'venue_bookings'`,
        [databaseName]
      );
      const columnNames = new Set(columns.map(row => row.COLUMN_NAME));
      ['creator_org_id', 'approval_org_id', 'approval_flow_id', 'approval_current_step'].forEach(column => {
        assert.ok(columnNames.has(column), `缺少 venue_bookings.${column}`);
      });
      const [indexes] = await database.query(
        `SELECT INDEX_NAME
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'venue_bookings'`,
        [databaseName]
      );
      assert.ok(indexes.some(row => row.INDEX_NAME === 'idx_vb_venue_status_time'));
    } finally {
      await database.end();
    }
    console.log('全新数据库完整启动契约与场地索引测试通过');
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
