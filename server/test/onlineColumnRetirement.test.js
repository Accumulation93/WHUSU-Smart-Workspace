const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { parseRetirement, verifyRelease, retireColumns } = require('../scripts/onlineColumnRetirement');
const { discoverMigrations, buildPlan, planMigrations, applyMigrations } = require('../scripts/runDeploymentMigrations');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-retirement-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git('init'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.invalid');
    fs.mkdirSync(path.join(root, 'server/src'), { recursive: true });
    const source = path.join(root, 'server/src/index.js');
    fs.writeFileSync(source, 'const field = "retired_value";'); git('add', '.'); git('commit', '-m', 'old');
    const oldSha = git('rev-parse', 'HEAD');
    fs.writeFileSync(source, 'const field = "active_value";'); git('add', '.'); git('commit', '-m', 'compatible');
    const compatibleSince = git('rev-parse', 'HEAD');
    const declaration = { table: 'retirement_test', columns: ['retired_value'], compatibleSince };
    const text = '-- @online-drop-columns ' + JSON.stringify(declaration);
    assert.deepEqual(parseRetirement(text), declaration);
    assert.throws(() => parseRetirement(text + '\nDROP TABLE users;'));
    assert.throws(() => parseRetirement(text.replace('retired_value', 'invalid`name')));
    const migrationDir = path.join(root, 'migrations'); fs.mkdirSync(migrationDir);
    fs.writeFileSync(path.join(migrationDir, '20261018020000_test.sql'), text);
    git('add', '.'); git('commit', '-m', 'retire'); const targetSha = git('rev-parse', 'HEAD');
    const context = { repo: root, currentSha: compatibleSince, targetSha };
    verifyRelease(declaration, context);
    assert.throws(() => verifyRelease(declaration, { ...context, currentSha: oldSha }));
    assert.throws(() => verifyRelease(declaration, { ...context, rollbackSha: oldSha }));
    assert.throws(() => verifyRelease(declaration, { ...context, currentSha: targetSha }));
    const migrations = discoverMigrations(migrationDir);
    assert.equal(buildPlan(migrations, new Map()).destructive, false);
    assert.throws(() => buildPlan(migrations, new Map([[migrations[0].name, 'changed']])));
    // 执行真实 Shell 的维护批准分支；未批准和错误 SHA 均不能触碰维护标志。
    const shell = fs.readFileSync(path.join(__dirname, '../scripts/deployProduction.sh'), 'utf8');
    const start = shell.indexOf('    if [[ "${WHUSU_APPROVED_MAINTENANCE_SHA:-}');
    const end = shell.indexOf('\n    log "检测到', start);
    const guard = shell.slice(start, end);
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
    for (const approved of ['', oldSha, targetSha]) {
      let success = true;
      try { execFileSync(bash, ['-c', 'log() { :; }\n' + guard + '\necho allowed'], {
        env: { ...process.env, TARGET_SHA: targetSha, WHUSU_APPROVED_MAINTENANCE_SHA: approved }, stdio: 'pipe'
      }); } catch (_) { success = false; }
      assert.equal(success, approved === targetSha);
    }
    assert(shell.indexOf('发布准备失败') < shell.indexOf('if [[ "$FRONTEND_ONLY" -eq 1 ]]'));
    console.log('在线删列格式、兼容版本、回退版本、迁移校验和及维护拒绝检查通过');
    if (!process.env.DEPLOY_TEST_DB_HOST) throw new Error('必须配置隔离 MySQL 进行实际 DDL 和锁等待测试');
    const mysql = require('mysql2/promise');
    const config = { host: process.env.DEPLOY_TEST_DB_HOST, port: Number(process.env.DEPLOY_TEST_DB_PORT || 3362),
      user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '' };
    const dbName = 'whusu_retirement_' + process.pid + '_' + Date.now();
    const db = await mysql.createConnection(config); let blocker;
    try {
      await db.query('CREATE DATABASE `' + dbName + '`'); await db.changeUser({ database: dbName });
      await db.query('CREATE TABLE retirement_test (id INT PRIMARY KEY, active_value VARCHAR(20), retired_value INT) ENGINE=InnoDB');
      await db.query("INSERT INTO retirement_test VALUES (1,'preserved',2)");
      blocker = await mysql.createConnection({ ...config, database: dbName });
      await blocker.beginTransaction(); await blocker.query('SELECT * FROM retirement_test');
      const began = Date.now();
      await assert.rejects(retireColumns(db, declaration), error => error.code === 'ER_LOCK_WAIT_TIMEOUT');
      assert(Date.now() - began < 5000);
      await blocker.query("UPDATE retirement_test SET active_value='available' WHERE id=1");
      await blocker.commit();
      Object.assign(process.env, { DB_HOST: config.host, DB_PORT: String(config.port), DB_USER: config.user,
        DB_PASSWORD: config.password, DB_NAME: dbName, WHUSU_RETIRE_REPO: root,
        WHUSU_RETIRE_CURRENT_SHA: compatibleSince, WHUSU_RETIRE_TARGET_SHA: targetSha,
        WHUSU_RETIRE_ROLLBACK_SHA: compatibleSince });
      assert.equal((await planMigrations(migrationDir)).pendingCount, 1);
      await applyMigrations({ directory: migrationDir, deployedSha: targetSha });
      assert.equal((await applyMigrations({ directory: migrationDir, deployedSha: targetSha })).pendingCount, 0);
      await retireColumns(db, declaration);
      const [rows] = await db.query('SELECT * FROM retirement_test');
      assert.deepEqual(rows, [{ id: 1, active_value: 'available' }]);
      const [ledger] = await db.query('SELECT deployed_sha FROM schema_migrations');
      assert.deepEqual(ledger, [{ deployed_sha: targetSha }]);
      console.log('真实 MySQL：锁等待快速失败后业务可写、INSTANT 删列、重复执行和原数据保留通过');
    } finally {
      if (blocker) { await blocker.rollback(); await blocker.end(); }
      await db.query('DROP DATABASE IF EXISTS `' + dbName + '`'); await db.end();
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
