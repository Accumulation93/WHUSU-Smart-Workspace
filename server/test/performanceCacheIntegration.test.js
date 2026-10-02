'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, fork } = require('child_process');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置独立数据库，跳过性能缓存数据库集成测试');
  process.exit(0);
}
const databaseName = 'whusu_perf_integration_' + process.pid + '_' + Date.now();
const testUser = 'perf_' + process.pid;
const password = crypto.randomBytes(32).toString('hex');
const adminOptions = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || ''
};

async function run() {
  const admin = await mysql.createConnection(adminOptions);
  let appPool;
  const probes = [];
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`CREATE USER '${testUser}'@'%' IDENTIFIED BY ?`, [password]);
    await admin.query(`GRANT ALL ON \`${databaseName}\`.* TO '${testUser}'@'%'`);
    const fixture = await mysql.createConnection(Object.assign({}, adminOptions, { database: databaseName, multipleStatements: true }));
    try { await fixture.query(fs.readFileSync(path.resolve(__dirname, '../db/init.sql'), 'utf8')); } finally { await fixture.end(); }
    const migration = fs.readFileSync(path.resolve(__dirname, '../db/deploy/20260907120000_performance_cache_versions.sql'));
    for (let index = 0; index < 2; index += 1) {
      const applied = spawnSync(process.env.MYSQL_BIN || 'mysql', ['--protocol=TCP', '--host=' + adminOptions.host,
        '--port=' + adminOptions.port, '--user=' + adminOptions.user, '--default-character-set=utf8mb4', databaseName], {
        input: migration, encoding: 'utf8', env: Object.assign({}, process.env, { MYSQL_PWD: adminOptions.password })
      });
      assert.strictEqual(applied.status, 0, applied.stderr || '迁移未完成');
    }
    Object.assign(process.env, { DB_HOST: adminOptions.host, DB_PORT: String(adminOptions.port), DB_USER: testUser,
      DB_PASSWORD: password, DB_NAME: databaseName, AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('hex') });
    appPool = require('../src/config/db');
    const versions = require('../src/core/models/cacheVersions');
    await versions.ensureReady();
    const { orgStorage } = require('../src/utils/orgContext');
    const notifications = require('../src/modules/audit/models/notification');
    const sharedCache = require('../src/modules/scoring/utils/sharedCache');
    await appPool.query("INSERT INTO organizations (id,name) VALUES ('perf-a','性能甲'),('perf-b','性能乙')");
    for (let index = 0; index < 2; index += 1) probes.push(fork(path.join(__dirname, 'helpers/cacheProcessProbe.js'), [], { silent: true }));
    const probe = child => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.removeListener('message', received); reject(new Error('PROBE_TIMEOUT')); }, 10000);
      function received(result) { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result.version); }
      child.once('message', received); child.send('read');
    });
    const beforeA = await versions.read(['perf-a']);
    assert.deepStrictEqual(await Promise.all(probes.map(probe)), [beforeA, beforeA]);
    const beforeB = await versions.read(['perf-b']);
    const notice = index => ({ id: 'perf-notice-' + index, orgId: 'perf-a', recipientType: 'admin', recipientId: 'perf-admin',
      eventKey: 'perf-event-' + index, type: 'system', title: '性能测试' });
    const rolledBack = await appPool.getConnection();
    try {
      await rolledBack.beginTransaction();
      await orgStorage.run('perf-a', () => notifications.batchCreate([notice('rollback')], rolledBack));
      await rolledBack.rollback();
    } finally { rolledBack.release(); }
    assert.strictEqual(await versions.read(['perf-a']), beforeA, '回滚必须同时回滚版本');
    const batch = Array.from({ length: 201 }, (_, index) => notice(index));
    const created = await orgStorage.run('perf-a', () => notifications.batchCreate(batch));
    assert.strictEqual(created.created, 201);
    const afterInsert = await versions.read(['perf-a']);
    assert.deepStrictEqual(await Promise.all(probes.map(probe)), [afterInsert, afterInsert], '两个独立进程必须立即取得事务提交后的同一版本');
    assert.strictEqual((await orgStorage.run('perf-a', () => notifications.batchCreate(batch))).created, 0);
    assert.strictEqual(await versions.read(['perf-a']), afterInsert, '幂等重投递不应递增消息版本');
    assert.strictEqual((await orgStorage.run('perf-a', () => notifications.batchCreate([notice(0), notice(202)]))).created, 1);
    assert.notStrictEqual(await versions.read(['perf-a']), beforeA);
    assert.strictEqual(await versions.read(['perf-b']), beforeB, '组织甲通知不得使组织乙版本变化');
    const scoringVersion = await versions.read(['perf-a'], ['scoring', 'directory']);
    const counts = await orgStorage.run('perf-a', () => notifications.listForRecipient({ type: 'admin', id: 'perf-admin' }, { countOnly: true }));
    assert.strictEqual(counts.total, 202); assert.deepStrictEqual(counts.items, []);
    await orgStorage.run('perf-a', () => notifications.markRead('perf-notice-0', { type: 'admin', id: 'perf-admin' }));
    assert.strictEqual(await versions.read(['perf-a'], ['scoring', 'directory']), scoringVersion, '通知已读不应失效评分缓存');
    const keyBefore = await sharedCache.versionedKey('overview_perf-a_activity_overview', 'perf-a');
    await appPool.query("INSERT INTO departments (id,name,org_id) VALUES ('perf-dept','性能部门','perf-a')");
    const keyAfter = await sharedCache.versionedKey('overview_perf-a_activity_overview', 'perf-a');
    assert.notStrictEqual(keyBefore, keyAfter);
    await sharedCache.set(keyAfter, { value: 'new' }, 5000);
    await sharedCache.set(keyBefore, { value: 'old' }, 5000);
    assert.deepStrictEqual(await sharedCache.get(keyAfter), { value: 'new' });
    const [[indexRow]] = await appPool.query("SELECT COUNT(DISTINCT INDEX_NAME) count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND INDEX_NAME IN ('idx_sr_task_assignment','idx_ass_current_round')");
    assert.strictEqual(Number(indexRow.count), 2);
    if (process.env.PERF_BENCH === '1') await require('./helpers/performanceBenchmark')(appPool, orgStorage);
    console.log('数据库迁移重放、领域失效、事务回滚、批量幂等和旧版本晚写测试通过');
  } finally {
    await Promise.all(probes.map(child => new Promise(resolve => {
      if (!child.connected) { resolve(); return; }
      child.once('exit', resolve); child.send('close');
    })));
    if (appPool) await appPool.end();
    // 只清理由本测试创建、固定前缀且带本进程随机实例后缀的数据库和账号。
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.query(`DROP USER IF EXISTS '${testUser}'@'%'`);
    await admin.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
