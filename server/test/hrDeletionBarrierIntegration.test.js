const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const Module = require('module');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过人员删除屏障真实并发测试');
  process.exit(0);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-deletion-barrier-test-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'hr-deletion-barrier-identity-test-secret';
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
        normalized_student_id VARCHAR(64) NOT NULL,
        status VARCHAR(24) NOT NULL
      ) ENGINE=InnoDB`);
      await first.query(`CREATE TABLE organization_memberships (
        id VARCHAR(64) PRIMARY KEY,
        person_id VARCHAR(64) NOT NULL,
        org_id VARCHAR(64) NOT NULL,
        legacy_hr_id VARCHAR(64) NOT NULL,
        status VARCHAR(24) NOT NULL
      ) ENGINE=InnoDB`);
      await first.query(`CREATE TABLE hr_info (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) NOT NULL,
        org_id VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB`);
      await first.query("INSERT INTO persons (id, normalized_student_id, status) VALUES ('person-a', '20260001', 'active')");
      await first.query("INSERT INTO organization_memberships VALUES ('membership-a', 'person-a', 'org-a', 'hr-a', 'active')");
      await first.query("INSERT INTO hr_info VALUES ('hr-a', '20260001', 'org-a')");
      await first.query('SET SESSION innodb_lock_wait_timeout = 1');
      await second.query('SET SESSION innodb_lock_wait_timeout = 1');

      const unifiedIdentity = loadUnifiedIdentity();
      const deletionModel = require('../src/core/models/hrMemberDeletion');
      const hrTableImport = require('../src/core/models/hrTableImport');

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

      await second.beginTransaction();
      assert.strictEqual(await deletionModel.lockPersonDeletionBarrier(second, 'person-a'), true);
      await first.beginTransaction();
      await expectLockTimeout(() => unifiedIdentity.lockActiveBusinessSubjects(first, [{
        legacyHrId: 'hr-a', organizationId: 'org-a'
      }]));
      await first.rollback();
      await second.query("DELETE FROM organization_memberships WHERE person_id = 'person-a'");
      await second.query("DELETE FROM hr_info WHERE id = 'hr-a'");
      await second.query("DELETE FROM persons WHERE id = 'person-a'");
      await second.commit();

      await first.beginTransaction();
      await assert.rejects(
        unifiedIdentity.lockActiveBusinessSubjects(first, [{
          personId: 'person-a', organizationId: 'org-a', legacyHrId: 'hr-a'
        }]),
        (error) => error && error.code === 'work_context_required'
      );
      await first.rollback();

      await first.query("INSERT INTO persons (id, normalized_student_id, status) VALUES ('person-a', '20260001', 'active')");
      await first.query("INSERT INTO organization_memberships VALUES ('membership-a', 'person-a', 'org-a', 'hr-a', 'active')");
      await first.query("INSERT INTO hr_info VALUES ('hr-a', '20260001', 'org-a')");
      await first.beginTransaction();
      await first.query("SELECT id FROM hr_info WHERE id = 'hr-a'");
      await second.beginTransaction();
      assert.strictEqual(await deletionModel.lockPersonDeletionBarrier(second, 'person-a'), true);
      await second.query("DELETE FROM organization_memberships WHERE person_id = 'person-a'");
      await second.query("DELETE FROM hr_info WHERE id = 'hr-a'");
      await second.query("DELETE FROM persons WHERE id = 'person-a'");
      await second.commit();
      await assert.rejects(
        hrTableImport.lockExistingImportSubjects(
          first,
          [{ studentId: '20260001' }],
          'org-a',
          [{ id: 'hr-a', student_id: '20260001' }]
        ),
        (error) => error && error.code === 'work_context_required'
      );
      await first.rollback();
      const [remainingPeople] = await first.query("SELECT id FROM persons WHERE id = 'person-a'");
      assert.strictEqual(remainingPeople.length, 0);

      const profileRouteSource = fs.readFileSync(
        path.join(__dirname, '../src/core/routes/hrProfile.js'), 'utf8'
      );
      ['submitUserHrProfile', 'reviewHrProfileChange', 'saveHrPersonFull'].forEach((routeName) => {
        const routeStart = profileRouteSource.indexOf(`/${routeName}`);
        const transactionStart = profileRouteSource.indexOf('withTransaction', routeStart);
        const barrier = profileRouteSource.indexOf('lockActiveBusinessSubjects', transactionStart);
        const firstProfileWrite = profileRouteSource.indexOf('profileRecordModel.', transactionStart);
        assert(routeStart >= 0 && transactionStart >= 0 && barrier > transactionStart);
        assert(firstProfileWrite < 0 || barrier < firstProfileWrite, `${routeName} 必须先锁人员再写资料`);
      });
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
