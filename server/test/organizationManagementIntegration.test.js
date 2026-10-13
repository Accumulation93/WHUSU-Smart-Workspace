'use strict';

const assert = require('assert');
const mysql = require('mysql2/promise');

if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置 DEPLOY_TEST_DB_HOST，跳过组织管理事务集成测试');
  process.exit(0);
}

const adminConfig = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || ''
};
const database = `whusu_smart_workspace_org_management_${Date.now()}_${process.pid}`;
const testUser = `org_management_${process.pid}`;
const testPassword = `OrgManagement_${Date.now()}_${process.pid}`;
const requestedTestUserHost = process.env.TEST_DB_USER_HOST || '127.0.0.1';
const testUserHost = ['%', '127.0.0.1', 'localhost'].includes(requestedTestUserHost)
  ? requestedTestUserHost
  : '127.0.0.1';

function findHandler(router, routePath) {
  const layer = router.stack.find((item) => item.route && item.route.path === routePath);
  assert(layer, `找不到路由 ${routePath}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function invoke(handler, body) {
  return new Promise((resolve, reject) => {
    const req = {
      authAccount: { id: 'account-super', personId: 'person-super' },
      authContext: { role: 'admin', contextId: 'context-super', personId: 'person-super',
        organizationId: 'org-a', adminGrantId: 'grant-super', legacyAdminId: 'super', adminLevel: 'super_admin' },
      body,
      get() { return ''; }
    };
    const res = { json: resolve, status() { return this; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

(async () => {
  const admin = await mysql.createConnection(adminConfig);
  let pool;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    await admin.query(`CREATE USER '${testUser}'@'${testUserHost}' IDENTIFIED BY ?`, [testPassword]);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${testUser}'@'${testUserHost}'`);
    await admin.query(
      `CREATE TABLE \`${database}\`.system_config (
        id VARCHAR(64) PRIMARY KEY,
        current_organization VARCHAR(64) NULL,
        timezone INT DEFAULT 8,
        timezone_config_version INT NOT NULL DEFAULT 1,
        updated_at DATETIME NULL
      )`
    );
    await admin.query(
      `CREATE TABLE \`${database}\`.organizations (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await admin.query(
      `CREATE TABLE \`${database}\`.admin_info (
        id VARCHAR(64) PRIMARY KEY,
        openid VARCHAR(128) NOT NULL,
        bind_status VARCHAR(32) NOT NULL,
        admin_level VARCHAR(32) NOT NULL,
        org_id VARCHAR(64) NOT NULL
      )`
    );
    await admin.query(
      `CREATE TABLE \`${database}\`.sample_org_data (
        id INT PRIMARY KEY AUTO_INCREMENT,
        org_id VARCHAR(64) NOT NULL
      )`
    );
    await admin.query(
      `INSERT INTO \`${database}\`.system_config
        (id, current_organization) VALUES ('default', 'org-a')`
    );
    await admin.query(
      `INSERT INTO \`${database}\`.organizations (id, name)
       VALUES ('org-a', 'A'), ('org-b', 'B'), ('org-c', 'C')`
    );
    await admin.query(
      `INSERT INTO \`${database}\`.admin_info
        (id, openid, bind_status, admin_level, org_id)
       VALUES ('super', 'super-openid', 'active', 'super_admin', '')`
    );
    await admin.query(
      `INSERT INTO \`${database}\`.sample_org_data (org_id) VALUES ('org-a')`
    );

    process.env.DB_HOST = adminConfig.host;
    process.env.DB_PORT = String(adminConfig.port);
    process.env.DB_USER = testUser;
    process.env.DB_PASSWORD = testPassword;
    process.env.DB_NAME = database;

    const router = require('../src/core/routes/org');
    const systemRouter = require('../src/core/routes/system');
    pool = require('../src/config/db');
    const saveOrganization = findHandler(router, '/saveOrganization');
    const listOrganizations = findHandler(router, '/listOrganizations');
    const saveSystemConfig = findHandler(systemRouter, '/saveSystemConfig');
    const getSystemConfig = findHandler(systemRouter, '/getSystemConfig');
    const switchOrganization = findHandler(router, '/switchOrganization');
    const deleteOrganization = findHandler(router, '/deleteOrganization');

    // 网页和小程序的实际参数在隔离数据库保存，再通过原目录接口回读。
    const created = await invoke(saveOrganization, { id: '', name: '组织 D' });
    assert.strictEqual(created.status, 'success');
    assert(created.organization.id);
    const edited = await invoke(saveOrganization, { id: created.organization.id, name: '组织 D 修改' });
    assert.strictEqual(edited.status, 'success');
    const directory = await invoke(listOrganizations, {});
    assert.strictEqual(directory.status, 'success');
    assert.strictEqual(directory.list.find((item) => item.id === created.organization.id).name, '组织 D 修改');
    assert.strictEqual((await invoke(saveOrganization, { name: '组织 D 修改' })).status, 'duplicate');
    const [createdRows] = await pool.query('SELECT id FROM organizations WHERE name = ?', ['组织 D 修改']);
    assert.strictEqual(createdRows.length, 1);

    for (const timezone of [-12, 0, 8, 12]) {
      const saved = await invoke(saveSystemConfig, { timezone });
      assert.strictEqual(saved.status, 'success');
      const read = await invoke(getSystemConfig, {});
      assert.strictEqual(read.config.timezone, timezone);
      assert.strictEqual(read.config.currentOrganization, 'org-a');
      assert.strictEqual(read.systemTimezoneOffset, timezone);
    }
    for (const timezone of [-13, 15, 2.5]) {
      assert.strictEqual((await invoke(saveSystemConfig, { timezone })).status, 'invalid_timezone');
      assert.strictEqual((await invoke(getSystemConfig, {})).config.timezone, 12);
    }

    const switched = await invoke(switchOrganization, {
      organizationId: 'org-b',
      organizationName: 'B updated'
    });
    assert.strictEqual(switched.status, 'success');
    const [configRows] = await pool.query(
      "SELECT current_organization FROM system_config WHERE id = 'default'"
    );
    assert.strictEqual(configRows[0].current_organization, 'org-b');

    const currentDelete = await invoke(deleteOrganization, { organizationId: 'org-b' });
    assert.strictEqual(currentDelete.status, 'forbidden');

    const populatedDelete = await invoke(deleteOrganization, { organizationId: 'org-a' });
    assert.strictEqual(populatedDelete.status, 'organization_not_empty');

    const emptyDelete = await invoke(deleteOrganization, { organizationId: 'org-c' });
    assert.strictEqual(emptyDelete.status, 'success');
    const [remaining] = await pool.query(
      "SELECT id FROM organizations WHERE id IN ('org-a', 'org-b', 'org-c') ORDER BY id"
    );
    assert.deepStrictEqual(remaining.map((row) => row.id), ['org-a', 'org-b']);

    console.log('组织切换与安全删除事务集成测试通过');
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`DROP USER IF EXISTS '${testUser}'@'${testUserHost}'`);
    await admin.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
