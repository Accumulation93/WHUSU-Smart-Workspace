'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const mysql = require('mysql2/promise');
if (!process.env.DEPLOY_TEST_DB_HOST) {
  console.log('未配置隔离数据库，未执行评分粒度退役数据库验收');
  process.exit(0);
}
const database = 'whusu_granularity_' + process.pid + '_' + Date.now();
const user = 'granularity_' + process.pid;
const password = crypto.randomBytes(32).toString('hex');
const options = { host: process.env.DEPLOY_TEST_DB_HOST, port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root', password: process.env.DEPLOY_TEST_DB_PASSWORD || '' };
(async () => {
  const admin = await mysql.createConnection(options);
  let pool;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY ?`, [password]);
    await admin.query(`GRANT ALL ON \`${database}\`.* TO '${user}'@'%'`);
    const fixture = await mysql.createConnection({ ...options, database, multipleStatements: true });
    try { await fixture.query(fs.readFileSync(path.resolve(__dirname, '../db/init.sql'), 'utf8')); }
    finally { await fixture.end(); }
    Object.assign(process.env, { DB_HOST: options.host, DB_PORT: String(options.port), DB_USER: user,
      DB_PASSWORD: password, DB_NAME: database, AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('hex') });
    pool = require('../src/config/db');
    const { orgStorage } = require('../src/utils/orgContext');
    const router = require('../src/modules/scoring/routes/activities');
    await pool.query("INSERT INTO organizations (id,name) VALUES ('retire-a','测试甲'),('retire-b','测试乙')");
    const call = async (name, body, org = 'retire-a') => {
      const handler = router.stack.find(layer => layer.route.path === '/' + name).route.stack[0].handle;
      let result;
      await orgStorage.run(org, () => handler({ admin: { id: 'test-admin' }, body }, { json(value) { result = value; return value; } }));
      return result;
    };
    const source = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/activityBehavior.js');
    let behavior;
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
      module: { exports: {} }, Behavior(value) { behavior = value; return value; },
      wx: { showToast() {} }, require() { return {}; }
    }, { filename: source });
    let saved;
    const page = { data: { activityForm: { id: '', name: '', description: '实际前端参数', startDate: '2026-10-18', endDate: '2026-10-19', participantGranularity: 'person' } },
      setLoading() {}, resetActivityForm() {}, async loadActivityList() {},
      async callCloud(name, body) {
        assert.equal(Object.hasOwn(body, 'participantGranularity'), false);
        saved = await call(name, JSON.parse(JSON.stringify(body))); return saved;
      } };
    for (const schema of ['column-present', 'column-removed']) {
      if (schema === 'column-removed') await pool.query('ALTER TABLE score_activities DROP COLUMN participant_granularity, ALGORITHM=INSTANT');
      page.data.activityForm.id = ''; page.data.activityForm.name = schema;
      await behavior.methods.saveActivity.call(page);
      assert.equal(saved.status, 'success', saved.message);
      let listed = await call('listScoreActivities', {});
      const created = listed.list.find(row => row.name === schema);
      assert(created);
      const variants = [undefined, 'person', 'assignment', 'unknown', null, { arbitrary: true }];
      for (let i = 0; i < variants.length; i++) {
        const body = { id: created.id, name: schema + '-' + i, startDate: '2026-10-18', endDate: '2026-10-19' };
        if (variants[i] !== undefined) body.participantGranularity = variants[i];
        const updated = await call('saveScoreActivity', body);
        assert.equal(updated.status, 'success', updated.message);
        listed = await call('listScoreActivities', {});
        assert.equal(listed.list.find(row => row.id === created.id).name, body.name);
        assert.equal(listed.list.find(row => row.id === created.id).participantGranularity, 'assignment');
      }
      const denied = await call('saveScoreActivity', { id: created.id, name: '越权覆盖', participantGranularity: 'person' }, 'retire-b');
      assert.equal(denied.status, 'not_found');
    }
    const [rows] = await pool.query('SELECT name,is_current FROM score_activities ORDER BY name');
    assert.equal(rows.length, 2); assert(rows.every(row => row.is_current === 0));
    console.log('评分粒度退役真实 MySQL：有列/删列两种结构、实际前端保存、各6类旧参数更新回读与跨组织拒绝通过');
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`DROP USER IF EXISTS '${user}'@'%'`);
    await admin.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
