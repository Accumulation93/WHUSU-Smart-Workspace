const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过场地流程迁移集成测试');
  process.exit(0);
}

const databaseName = `whusu_smart_workspace_venue_flow_test_${Date.now()}_${process.pid}`;
const baseConfig = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || ''
};
const migrationSql = fs.readFileSync(
  path.resolve(__dirname, '../db/deploy/20260723180000_restore_44th_venue_approval_flow.sql'),
  'utf8'
);
const queryIndexMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '../db/deploy/20260723173000_venue_booking_query_index.sql'),
  'utf8'
);

async function run() {
  const admin = await mysql.createConnection(baseConfig);
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const connection = await mysql.createConnection(Object.assign({}, baseConfig, {
      database: databaseName,
      multipleStatements: true
    }));
    try {
      await connection.query(`
        CREATE TABLE organizations (
          id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
          name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL UNIQUE
        );
        CREATE TABLE venues (
          id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY,
          name VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL
        );
        CREATE TABLE departments (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          org_id VARCHAR(64) NOT NULL
        );
        CREATE TABLE identities (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          org_id VARCHAR(64) NOT NULL
        );
        CREATE TABLE work_groups (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          department_id VARCHAR(64) NOT NULL,
          org_id VARCHAR(64) NOT NULL
        );
        CREATE TABLE venue_approval_flows (
          id VARCHAR(64) PRIMARY KEY,
          venue_id VARCHAR(64) NOT NULL,
          name VARCHAR(200) NOT NULL DEFAULT '',
          org_id VARCHAR(64) NOT NULL,
          is_active TINYINT NOT NULL DEFAULT 1,
          UNIQUE KEY uk_flow_venue_org (venue_id, org_id)
        );
        CREATE TABLE venue_approval_flow_steps (
          id VARCHAR(64) PRIMARY KEY,
          flow_id VARCHAR(64) NOT NULL,
          sort_order INT NOT NULL,
          name VARCHAR(200) NOT NULL,
          approval_mode VARCHAR(16) NOT NULL DEFAULT 'hr_rule',
          org_id VARCHAR(64) NOT NULL,
          CONSTRAINT fk_test_step_flow FOREIGN KEY (flow_id) REFERENCES venue_approval_flows(id)
        );
        CREATE TABLE venue_approval_flow_step_rules (
          id VARCHAR(64) PRIMARY KEY,
          step_id VARCHAR(64) NOT NULL,
          sort_order INT NOT NULL,
          department_scope VARCHAR(16) NOT NULL,
          specific_department_id VARCHAR(1000),
          work_group_scope VARCHAR(16) NOT NULL,
          specific_work_group_id VARCHAR(1000),
          identity_scope VARCHAR(16) NOT NULL,
          specific_identity_id VARCHAR(1000),
          org_id VARCHAR(64) NOT NULL,
          CONSTRAINT fk_test_rule_step FOREIGN KEY (step_id) REFERENCES venue_approval_flow_steps(id)
        );
        CREATE TABLE venue_bookings (
          id VARCHAR(64) PRIMARY KEY,
          venue_id VARCHAR(64) NOT NULL,
          status VARCHAR(16) NOT NULL,
          time_start DATETIME NOT NULL
        );
      `);
      await connection.query(`
        INSERT INTO organizations VALUES
          ('org-43', '武汉大学第四十三届学生会'),
          ('org-44', '武汉大学第四十四届学生会');
        INSERT INTO venues VALUES ('venue-yingding', '樱顶大会议室');
        INSERT INTO departments VALUES
          ('dept-43-secretariat', '综合事务部（秘书工作）', 'org-43'),
          ('dept-44-secretariat', '综合事务部（秘书工作）', 'org-44');
        INSERT INTO identities VALUES
          ('identity-43-primary', '部门主要负责人', 'org-43'),
          ('identity-43-head', '部门负责人', 'org-43'),
          ('identity-44-head', '部门负责人', 'org-44');
        INSERT INTO venue_approval_flows VALUES
          ('flow-43', 'venue-yingding', '场地审批流程', 'org-43', 1);
        INSERT INTO venue_approval_flow_steps VALUES
          ('step-43-department', 'flow-43', 1, '部门负责人审批', 'hr_rule', 'org-43'),
          ('step-43-secretariat', 'flow-43', 2, '秘书确认', 'hr_rule', 'org-43');
        INSERT INTO venue_approval_flow_step_rules VALUES
          ('rule-43-department', 'step-43-department', 1, 'same', NULL, 'all', NULL, 'specific', 'identity-43-primary,identity-43-head', 'org-43'),
          ('rule-43-secretariat', 'step-43-secretariat', 1, 'specific', 'dept-43-secretariat', 'all', NULL, 'all', NULL, 'org-43');
      `);

      await connection.query(migrationSql);
      await connection.query(migrationSql);
      await connection.query(queryIndexMigrationSql);
      await connection.query(queryIndexMigrationSql);

      const [flows] = await connection.query(
        'SELECT id, name FROM venue_approval_flows WHERE venue_id = ? AND org_id = ?',
        ['venue-yingding', 'org-44']
      );
      assert.strictEqual(flows.length, 1);
      const [steps] = await connection.query(
        'SELECT id, sort_order FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
        [flows[0].id, 'org-44']
      );
      assert.strictEqual(steps.length, 2);
      const [rules] = await connection.query(
        `SELECT rule_row.*
           FROM venue_approval_flow_step_rules rule_row
           JOIN venue_approval_flow_steps step_row ON step_row.id = rule_row.step_id
          WHERE step_row.flow_id = ? AND rule_row.org_id = ?
          ORDER BY step_row.sort_order`,
        [flows[0].id, 'org-44']
      );
      assert.strictEqual(rules.length, 2);
      assert.strictEqual(rules[0].specific_identity_id, 'identity-44-head');
      assert.strictEqual(rules[1].specific_department_id, 'dept-44-secretariat');
      assert.ok(!JSON.stringify(rules).includes('identity-43-'));
      assert.ok(!JSON.stringify(rules).includes('dept-43-'));
      const [indexes] = await connection.query(
        `SELECT INDEX_NAME
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'venue_bookings'
            AND INDEX_NAME = 'idx_vb_venue_status_time'`
      );
      assert.strictEqual(indexes.length, 3, '复合索引应包含三个列定义且迁移可重试');
    } finally {
      await connection.end();
    }
    console.log('43届到44届场地审批流程幂等迁移测试通过');
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
