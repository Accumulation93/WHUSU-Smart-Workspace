const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过部署数据库集成测试');
  process.exit(0);
}

const databaseName = `whusu_smart_workspace_deploy_test_${Date.now()}_${process.pid}`;
const migrationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-smart-workspace-deploy-migrations-'));
const snapshot = path.join(os.tmpdir(), `${databaseName}.sql.gz`);

process.env.DB_HOST = process.env.DEPLOY_TEST_DB_HOST;
process.env.DB_PORT = process.env.DEPLOY_TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.DEPLOY_TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DEPLOY_TEST_DB_PASSWORD || '';
process.env.DB_NAME = databaseName;

const migrationTools = require('../scripts/runDeploymentMigrations');
const databaseTools = require('../scripts/deploymentDatabase');

function adminConfig(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database
  };
}

async function run() {
  const admin = await mysql.createConnection(adminConfig(undefined));
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
    await admin.query(`CREATE TABLE \`${databaseName}\`.sample (id INT PRIMARY KEY, value_text VARCHAR(20))`);
    await admin.query(`INSERT INTO \`${databaseName}\`.sample VALUES (1, 'before')`);

    fs.writeFileSync(
      path.join(migrationDirectory, '20260717010101_add_marker.sql'),
      'CREATE TABLE IF NOT EXISTS migrated_marker (id INT PRIMARY KEY);\n'
    );
    const initialPlan = await migrationTools.planMigrations(migrationDirectory);
    if (initialPlan.pendingCount !== 1 || initialPlan.destructive) throw new Error('初始迁移计划不正确');
    await databaseTools.backup(snapshot);
    await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '1'.repeat(40) });
    const appliedPlan = await migrationTools.planMigrations(migrationDirectory);
    if (appliedPlan.pendingCount !== 0) throw new Error('迁移账本未记录成功迁移');

    const firstMigration = path.join(migrationDirectory, '20260717010101_add_marker.sql');
    const originalMigration = fs.readFileSync(firstMigration, 'utf8');
    fs.appendFileSync(firstMigration, '-- changed\n');
    let checksumRejected = false;
    try {
      await migrationTools.planMigrations(migrationDirectory);
    } catch (error) {
      checksumRejected = /校验和发生变化/.test(error.message);
    }
    if (!checksumRejected) throw new Error('已执行迁移变更未被拒绝');
    fs.writeFileSync(firstMigration, originalMigration);

    fs.writeFileSync(
      path.join(migrationDirectory, '20260717010202_drop_sample.sql'),
      'DROP TABLE IF EXISTS sample;\n'
    );
    const destructivePlan = await migrationTools.planMigrations(migrationDirectory);
    if (destructivePlan.pendingCount !== 1 || !destructivePlan.destructive) throw new Error('破坏性迁移识别失败');
    await migrationTools.applyMigrations({ directory: migrationDirectory, deployedSha: '2'.repeat(40) });
    await databaseTools.restore(snapshot);

    const restored = await mysql.createConnection(adminConfig(databaseName));
    const [rows] = await restored.query('SELECT value_text FROM sample WHERE id = 1');
    await restored.end();
    if (!rows[0] || rows[0].value_text !== 'before') throw new Error('数据库快照恢复结果不正确');

    console.log('隔离 MySQL 的迁移账本、破坏性迁移和快照恢复测试通过');
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
    [snapshot, `${snapshot}.sha256`].forEach((file) => {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
