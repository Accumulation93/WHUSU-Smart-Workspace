const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过评优历史迁移集成测试');
  process.exit(0);
}

const databaseName = `whusu_merit_history_test_${Date.now()}_${process.pid}`;
const migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-merit-history-'));
process.env.DB_HOST = process.env.DEPLOY_TEST_DB_HOST;
process.env.DB_PORT = process.env.DEPLOY_TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.DEPLOY_TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DEPLOY_TEST_DB_PASSWORD || '';
process.env.DB_NAME = databaseName;

const migrationTools = require('../scripts/runDeploymentMigrations');

function config(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database
  };
}

async function run() {
  const admin = await mysql.createConnection(config(undefined));
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection(config(databaseName));
    try {
      const statements = [
        'CREATE TABLE organizations (id VARCHAR(64) PRIMARY KEY, name VARCHAR(200)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE persons (id VARCHAR(64) PRIMARY KEY, name VARCHAR(100), student_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE departments (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64), name VARCHAR(100)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE identities (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64), name VARCHAR(100)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE work_groups (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64), name VARCHAR(100)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE organization_memberships (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64), person_id VARCHAR(64), legacy_hr_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE membership_assignments (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64), membership_id VARCHAR(64), assignment_kind VARCHAR(20), department_id VARCHAR(64), identity_id VARCHAR(64), work_group_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE result_publications (id VARCHAR(64) PRIMARY KEY, org_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE pub_merit_rules (id VARCHAR(64) PRIMARY KEY, publication_id VARCHAR(64), org_id VARCHAR(64), grantee_department_id VARCHAR(64), grantee_identity_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE pub_merit_rule_clauses (id VARCHAR(64) PRIMARY KEY, rule_id VARCHAR(64), org_id VARCHAR(64), scope_type VARCHAR(64), target_identity_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        'CREATE TABLE merit_list_permissions (id VARCHAR(64) PRIMARY KEY, publication_id VARCHAR(64), org_id VARCHAR(64), grantee_department_id VARCHAR(64), grantee_identity_id VARCHAR(64), scope_type VARCHAR(64), target_identity_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        `CREATE TABLE merit_list_designations (
          id VARCHAR(64) PRIMARY KEY, publication_id VARCHAR(64), permission_id VARCHAR(64), clause_id VARCHAR(64),
          target_hr_id VARCHAR(64), target_assignment_id VARCHAR(64), target_context_snapshot JSON,
          designated_by VARCHAR(128), designated_by_person_id VARCHAR(64), designated_by_assignment_id VARCHAR(64),
          designated_by_context_snapshot JSON, org_id VARCHAR(64)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      ];
      for (const statement of statements) await db.query(statement);
      await db.query("INSERT INTO organizations VALUES ('org-43','第四十三届学生会')");
      await db.query("INSERT INTO persons VALUES ('person-1','成员甲','20260001')");
      await db.query("INSERT INTO departments VALUES ('dept-1','org-43','办公室')");
      await db.query("INSERT INTO identities VALUES ('identity-target','org-43','成员')");
      await db.query("INSERT INTO organization_memberships VALUES ('membership-1','org-43','person-1','hr-1')");
      await db.query("INSERT INTO membership_assignments VALUES ('hr-1','org-43','membership-1','staff','dept-1','identity-target',NULL)");
      await db.query("INSERT INTO result_publications VALUES ('publication-1','org-43')");
      await db.query("INSERT INTO pub_merit_rules VALUES ('rule-1','publication-1','org-43','dept-grantee','identity-grantee')");
      await db.query("INSERT INTO pub_merit_rule_clauses VALUES ('clause-new','rule-1','org-43','same_department_identity','identity-target')");
      await db.query("INSERT INTO merit_list_permissions VALUES ('permission-old','publication-1','org-43','dept-grantee','identity-grantee','same_department_identity','identity-target')");
      await db.query("INSERT INTO merit_list_designations VALUES ('designation-1','publication-1','permission-old','permission-old','hr-1',NULL,NULL,'legacy',NULL,NULL,NULL,'org-43')");
    } finally {
      await db.end();
    }

    fs.copyFileSync(
      path.resolve(__dirname, '../db/deploy/20260902223000_restore_merit_designation_history.sql'),
      path.join(migrationDirectory, '20260902223000_restore_merit_designation_history.sql')
    );
    fs.copyFileSync(
      path.resolve(__dirname, '../db/deploy/20260904122000_preserve_merit_designation_history.sql'),
      path.join(migrationDirectory, '20260904122000_preserve_merit_designation_history.sql')
    );
    await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '4'.repeat(40) });

    const verify = await mysql.createConnection(config(databaseName));
    try {
      const [[row]] = await verify.query(
        'SELECT clause_id, target_assignment_id, target_context_snapshot FROM merit_list_designations WHERE id = ?',
        ['designation-1']
      );
      assert.strictEqual(row.clause_id, 'clause-new', '旧权限条款必须唯一映射到新条款');
      assert.strictEqual(row.target_assignment_id, 'hr-1', '旧人员记录必须唯一映射到初始岗位');
      const snapshot = typeof row.target_context_snapshot === 'string'
        ? JSON.parse(row.target_context_snapshot)
        : row.target_context_snapshot;
      assert.strictEqual(snapshot.name, '成员甲');
      assert.strictEqual(snapshot.identityCategoryId, 'identity-target');
      assert.strictEqual(snapshot.department, '办公室');
      const [[audit]] = await verify.query(
        "SELECT COUNT(*) AS total FROM personnel_migration_audit WHERE migration_key='20260902223000'"
      );
      assert.strictEqual(Number(audit.total), 0, '全部唯一映射时不得产生待人工核对项');
      const [[constraint]] = await verify.query(
        `SELECT constraint_row.DELETE_RULE AS deleteRule
           FROM information_schema.REFERENTIAL_CONSTRAINTS constraint_row
           JOIN information_schema.KEY_COLUMN_USAGE column_row
             ON column_row.CONSTRAINT_SCHEMA = constraint_row.CONSTRAINT_SCHEMA
            AND column_row.TABLE_NAME = constraint_row.TABLE_NAME
            AND column_row.CONSTRAINT_NAME = constraint_row.CONSTRAINT_NAME
          WHERE constraint_row.CONSTRAINT_SCHEMA = DATABASE()
            AND constraint_row.TABLE_NAME = 'merit_list_designations'
            AND column_row.COLUMN_NAME = 'clause_id'
            AND column_row.REFERENCED_TABLE_NAME = 'pub_merit_rule_clauses'
          LIMIT 1`
      );
      assert.strictEqual(constraint.deleteRule, 'RESTRICT', '评优名单外键必须阻止规则条款级联删除');
      await assert.rejects(
        verify.query("DELETE FROM pub_merit_rule_clauses WHERE id = 'clause-new'"),
        /foreign key constraint fails/i,
        '已有评优名单的条款不得被数据库级联删除'
      );
      const [[designationCount]] = await verify.query(
        "SELECT COUNT(*) AS total FROM merit_list_designations WHERE id = 'designation-1'"
      );
      assert.strictEqual(Number(designationCount.total), 1, '受保护规则删除失败后名单必须保留');
    } finally {
      await verify.end();
    }
    console.log('旧评优名单岗位快照与条款映射迁移测试通过');
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
