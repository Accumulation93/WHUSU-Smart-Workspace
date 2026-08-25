const assert = require('assert');
const mysql = require('mysql2/promise');
const Module = require('module');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过人员删除屏障真实并发测试');
  process.exit(0);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-deletion-barrier-test-secret';
const databaseName = `whusu_hr_delete_barrier_${Date.now()}_${process.pid}`;
process.env.DB_HOST = process.env.DEPLOY_TEST_DB_HOST;
process.env.DB_PORT = process.env.DEPLOY_TEST_DB_PORT || '3306';
process.env.DB_USER = process.env.DEPLOY_TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DEPLOY_TEST_DB_PASSWORD || '';
process.env.DB_NAME = databaseName;

function loadUnifiedIdentity() {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === '../../config/db') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('../src/core/models/unifiedIdentity');
  delete require.cache[modulePath];
  const model = require(modulePath);
  Module._load = originalLoad;
  return model;
}

function config(database) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    timezone: 'Z'
  };
}

async function expectLockTimeout(action) {
  await assert.rejects(action, (error) => (
    error && (error.code === 'ER_LOCK_WAIT_TIMEOUT' || error.errno === 1205)
  ));
}

async function run() {
  const admin = await mysql.createConnection(config(undefined));
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
    const first = await mysql.createConnection(config(databaseName));
    const second = await mysql.createConnection(config(databaseName));
    try {
      await first.query(`CREATE TABLE persons (
        id VARCHAR(64) PRIMARY KEY,
        status VARCHAR(24) NOT NULL
      ) ENGINE=InnoDB`);
      await first.query("INSERT INTO persons (id, status) VALUES ('person-a', 'active')");
      await first.query('SET SESSION innodb_lock_wait_timeout = 1');
      await second.query('SET SESSION innodb_lock_wait_timeout = 1');

      const unifiedIdentity = loadUnifiedIdentity();
      const deletionModel = require('../src/core/models/hrMemberDeletion');

      await first.beginTransaction();
      await unifiedIdentity.lockActiveBusinessSubjects(first, [{
        personId: 'person-a', requireMembership: false
      }]);
      await second.beginTransaction();
      await expectLockTimeout(() => deletionModel.lockPersonDeletionBarrier(second, 'person-a'));
      await second.rollback();
      await first.commit();

      await second.beginTransaction();
      assert.strictEqual(await deletionModel.lockPersonDeletionBarrier(second, 'person-a'), true);
      await first.beginTransaction();
      await expectLockTimeout(() => unifiedIdentity.lockActiveBusinessSubjects(first, [{
        personId: 'person-a', requireMembership: false
      }]));
      await first.rollback();
      await second.rollback();
      console.log('人员业务写入与永久删除行锁屏障真实并发测试通过');
    } finally {
      await first.end();
      await second.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
