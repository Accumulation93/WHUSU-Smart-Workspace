'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3306);
  const database = 'venue_rule_editor_' + process.pid + '_' + Date.now();
  const username = 'vre_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const root = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root', password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  let listener;
  try {
    await root.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
    await root.query("CREATE USER '" + username + "'@'%' IDENTIFIED BY ?", [password]);
    await root.query('GRANT ALL PRIVILEGES ON `' + database + "`.* TO '" + username + "'@'%'");
    await root.query('USE `' + database + '`');
    await root.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await root.query("INSERT INTO organizations(id,name) VALUES ('org','规则测试组织')");
    await root.query("INSERT INTO venues(id,name) VALUES ('venue','规则测试场地')");
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password, AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('hex') });
    pool = require('../src/config/db');
    const express = require('express');
    const app = express();
    app.use(express.json());
    // 在隔离进程中模拟已认证会话，业务路由、校验、事务和SQL均使用真实实现。
    app.use((req, res, next) => {
      req.authAccount = { id: 'account', personId: 'person' };
      req.authContext = { contextId: 'context', personId: 'person', organizationId: 'org', role: 'admin', adminGrantId: 'grant', adminLevel: 'super_admin', name: '测试管理员' };
      require('../src/utils/orgContext').orgStorage.run('org', next);
    });
    app.use('/api', require('../src/modules/venue/routes/venueAdmin'));
    app.use('/api', require('../src/modules/venue/routes/venueApprovalAdmin'));
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    const calls = [];
    async function callFunction(options) {
      const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + options.name, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.data || {})
      });
      const result = await response.json();
      calls.push({ name: options.name, data: options.data, result });
      return result;
    }
    const base = path.resolve(__dirname, '../../miniprogram/subpackages/venue/pages/venueManage');
    let definition;
    vm.runInNewContext(fs.readFileSync(path.join(base, 'venueManage.js'), 'utf8'), {
      Page(value) { definition = value; }, console, setTimeout, clearTimeout,
      require(name) {
        if (name.includes('locales/')) return require(path.resolve(base, name));
        if (name.endsWith('/api')) return { callFunction, showShortToast() {}, getErrorText: error => error.message };
        if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
        if (name.endsWith('/venueRuleDisplay')) return require(path.resolve(base, name));
        return {};
      },
      wx: { nextTick: callback => callback() }
    });
    const page = Object.assign({}, definition, {
      data: JSON.parse(JSON.stringify(definition.data)),
      loadFlowReferenceData() {},
      setData(patch, callback) {
        for (const key of Object.keys(patch)) {
          const parts = key.split('.');
          let target = this.data;
          for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
          target[parts[parts.length - 1]] = patch[key];
        }
        if (callback) callback();
      }
    });
    page.data.rulesVenueId = 'venue';
    page.data.allDepartments = [{ id: 'd', name: '部门' }];
    page.data.allWorkGroups = [{ id: 'g', name: '职能组' }];
    const event = (type, id) => ({ currentTarget: { dataset: { type, id } } });
    for (const type of ['open', 'activity']) {
      page.openRuleEditor(event(type, ''));
      page.onRuleFormField({ currentTarget: { dataset: { field: 'name' } }, detail: { value: type + '新增' } });
      page.onCycleTypeChange({ detail: { value: '0' } });
      await page.saveRule();
      const endpoint = type === 'open' ? 'saveVenueOpenRule' : 'saveVenueActivityRule';
      const first = calls.find(call => call.name === endpoint);
      assert.equal(first.result.status, 'success', JSON.stringify(first.result));
      const records = type === 'open' ? page.data.openRules : page.data.activityRules;
      assert.equal(records.length, 1);
      page.openRuleEditor(event(type, first.result.id));
      assert.equal(page.data.ruleForm.name, type + '新增');
      page.onRuleFormField({ currentTarget: { dataset: { field: 'name' } }, detail: { value: type + '编辑' } });
      page.onRuleFormField({ currentTarget: { dataset: { field: 'timeStart' } }, detail: { value: '10:15' } });
      await page.saveRule();
      page.openRuleEditor(event(type, first.result.id));
      assert.equal(page.data.ruleForm.name, type + '编辑');
      assert.equal(page.data.ruleForm.timeStart, '10:15');
      const table = type === 'open' ? 'venue_open_rules' : 'venue_activity_rules';
      const row = (await root.query('SELECT * FROM ' + table + ' WHERE id=?', [first.result.id]))[0][0];
      assert.equal(row[type === 'open' ? 'name' : 'activity_name'], type + '编辑');
      assert.equal(row.time_start, '10:15:00');
    }
    page.addApprovalFlow();
    page.data.selectedFlowName = '新增流程';
    page.data.ruleForm._flowSteps = [{ name: '第一步', rules: [] }];
    await page.saveRule();
    const saved = calls.find(call => call.name === 'saveVenueApprovalWholeFlow');
    assert.equal(saved.result.status, 'success', JSON.stringify(saved.result));
    page.openApprovalFlowStepEditor({ currentTarget: { dataset: { id: saved.result.flowId } } });
    assert.equal(page.data.ruleForm._flowSteps[0].name, '第一步');
    page.data.selectedFlowName = '编辑流程';
    page.data.ruleForm._flowSteps = [{ name: '修订第一步', rules: [] }, { name: '第二步', rules: [] }];
    await page.saveRule();
    page.openApprovalFlowStepEditor({ currentTarget: { dataset: { id: saved.result.flowId } } });
    assert.equal(page.data.selectedFlowName, '编辑流程');
    assert.equal(page.data.ruleForm._flowSteps.length, 2);
    assert.equal(page.data.ruleForm._flowSteps[0].name, '修订第一步');
    const steps = (await root.query('SELECT name FROM venue_approval_flow_steps WHERE flow_id=? ORDER BY sort_order', [saved.result.flowId]))[0];
    assert.deepEqual(steps.map(row => row.name), ['修订第一步', '第二步']);
    assert.equal(calls.filter(call => call.name.startsWith('saveVenue')).length, 6);
    console.log('场地规则真实页面参数经HTTP及隔离MySQL保存回读通过：开放、活动、审批流程各新增和编辑，共6次保存，重新打开值一致。认证会话为测试注入，不代替登录和微信渲染验证。');
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (pool) await pool.end();
    await root.query('DROP DATABASE IF EXISTS `' + database + '`');
    await root.query("DROP USER IF EXISTS '" + username + "'@'%'");
    await root.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
