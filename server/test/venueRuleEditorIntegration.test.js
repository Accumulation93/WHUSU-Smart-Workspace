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
    await root.query(`CREATE TABLE cache_domain_versions(org_id VARCHAR(64),domain VARCHAR(32),version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY(org_id,domain))`);
    await root.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261031160000_unified_authorization.sql'), 'utf8'));
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
    definition = require('../../scripts/lib/loadVenueManagementPage')({
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
    // 未启用副本可反复编辑，但不能覆盖正在使用的审批方式或借用窗口。
    await root.query("INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type,is_active) VALUES ('draft-direct','venue','org','direct',0),('draft-admin','venue','org','admin',0)");
    await root.query("UPDATE venue_booking_policies SET open_advance_mode='days',open_advance_days=7,open_advance_minutes=10080 WHERE venue_id='venue' AND org_id='org'");
    const changedWindow = { open: { mode: 'days', days: 1 }, deadline: { mode: 'none' } };
    const editedDirect = await callFunction({ name: 'saveVenueBookingRule', data: { id: 'draft-direct', venueId: 'venue', ruleType: 'direct', sortOrder: 4, bookingWindow: changedWindow } });
    assert.equal(editedDirect.status, 'success');
    assert.equal((await root.query("SELECT is_active FROM venue_booking_rules WHERE id='draft-direct'"))[0][0].is_active, 0);
    assert.equal((await root.query('SELECT is_active FROM venue_approval_flows WHERE id=?', [saved.result.flowId]))[0][0].is_active, 1);
    await root.query('UPDATE venue_approval_flows SET is_active=0 WHERE id=?', [saved.result.flowId]);
    await root.query("INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type) VALUES ('live-direct','venue','org','direct')");
    const editedAdmin = await callFunction({ name: 'saveVenueBookingRule', data: { id: 'draft-admin', venueId: 'venue', ruleType: 'admin', sortOrder: 5, bookingWindow: changedWindow } });
    assert.equal(editedAdmin.status, 'success');
    const editedFlow = await callFunction({ name: 'saveVenueApprovalWholeFlow', data: { venueId: 'venue', flowId: saved.result.flowId, flowName: '副本修改', steps: [{ name: '副本步骤', approvalMode: 'admin_any', rules: [] }], bookingWindow: changedWindow } });
    assert.equal(editedFlow.status, 'success', JSON.stringify(editedFlow));
    assert.equal((await root.query("SELECT is_active FROM venue_booking_rules WHERE id='live-direct'"))[0][0].is_active, 1);
    const inactiveFlow = (await root.query('SELECT name,is_active FROM venue_approval_flows WHERE id=?', [saved.result.flowId]))[0][0];
    assert.equal(inactiveFlow.name, '副本修改');
    assert.equal(inactiveFlow.is_active, 0);
    const oldDirectory = await callFunction({ name: 'listVenueApprovalFlows', data: { venueId: 'venue' } });
    assert.equal(oldDirectory.flows.length, 0);
    await page.loadApprovalFlow();
    assert.equal(page.data.approvalFlows.length, 1);
    page.openApprovalFlowStepEditor({ currentTarget: { dataset: { id: saved.result.flowId } } });
    assert.equal(page.data.selectedFlowName, '副本修改');
    assert.equal(page.data.ruleForm.isActive, false);
    assert.equal(page.data.ruleForm._flowSteps[0].name, '副本步骤');
    assert.equal((await root.query("SELECT open_advance_days FROM venue_booking_policies WHERE venue_id='venue' AND org_id='org'"))[0][0].open_advance_days, 7);
    const switched = await callFunction({ name: 'saveVenueBookingRule', data: { venueId: 'venue', ruleType: 'direct' } });
    assert.equal(switched.status, 'success');
    assert.equal((await root.query("SELECT COUNT(*) AS count FROM venue_booking_rules WHERE id IN ('draft-direct','draft-admin') AND is_active=0"))[0][0].count, 2);
    assert.equal((await root.query('SELECT is_active FROM venue_approval_flows WHERE id=?', [saved.result.flowId]))[0][0].is_active, 0);
    await root.query("INSERT INTO departments(id,name,org_id) VALUES ('d','审批部门','org')");
    await root.query("INSERT INTO identities(id,name,org_id) VALUES ('i','审批身份','org')");
    await root.query("INSERT INTO work_groups(id,name,department_id,org_id) VALUES ('g','审批职能组','d','org')");
    await root.query("INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('reviewer','审批人员','fixture','fixture')");
    await root.query("INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('reviewer-hr','审批人员','fixture','org')");
    await root.query("INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('membership','reviewer','org','reviewer-hr')");
    await root.query("INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id,work_group_id) VALUES ('assignment','membership','org','staff','d','i','g')");
    await root.query("INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES ('assignment-other','membership','org','liaison','d','i')");
    const candidates = await callFunction({ name: 'getVenueRuleCandidates', data: {} });
    assert.equal(candidates.status, 'success');
    assert.equal(candidates.assignments.length, 2);
    for (const candidate of candidates.assignments) assert.deepEqual(Object.keys(candidate).sort(),
      ['assignmentId', 'assignmentLabel', 'department', 'hrId', 'identity', 'name', 'workGroup'].sort());
    for (const type of ['identity', 'person']) {
      const id = 'draft-' + type;
      await root.query(`INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type,is_active,
        approver_identity_id,approver_hr_id,approver_assignment_id,scope_department_id,scope_work_group_id,sort_order)
        VALUES (?,'venue','org',?,0,?,?,?,'d','g',9)`,
      [id, type, type === 'identity' ? 'i' : null, type === 'person' ? 'reviewer-hr' : null, type === 'person' ? 'assignment' : null]);
      const before = (await root.query('SELECT * FROM venue_booking_rules WHERE id=?', [id]))[0][0];
      await page.loadBookingRules();
      assert(page.data.bookingRules.some(rule => rule.id === id));
      const legacyRules = await callFunction({ name: 'listVenueBookingRules', data: { venueId: 'venue' } });
      assert(!legacyRules.rules.some(rule => rule.id === id));
      page.openRuleEditor(event('booking', id));
      assert.equal(page.data.ruleForm.ruleType, type);
      await page.loadBookingRuleReferences();
      await page.saveRule();
      const lastSave = calls.filter(call => call.name === 'saveVenueBookingRule').at(-1);
      assert.equal(lastSave.result.status, 'success', JSON.stringify(lastSave.result));
      const after = (await root.query('SELECT * FROM venue_booking_rules WHERE id=?', [id]))[0][0];
      for (const field of ['rule_type', 'is_active', 'approver_identity_id', 'approver_hr_id',
        'approver_assignment_id', 'scope_department_id', 'scope_work_group_id', 'sort_order']) {
        assert.equal(after[field], before[field], type + ':' + field);
      }
      page.openRuleEditor(event('booking', id));
      assert.equal(page.data.ruleForm.ruleType, type);
      await page.loadBookingRuleReferences();
      if (type === 'person') {
        const selected = candidates.assignments.find(item => item.assignmentId === 'assignment-other');
        page.openBookingApproverPicker();
        page.confirmBookingApprover({ detail: { items: [selected] } });
        assert.equal(page.data.bookingApproverPickerVisible, false);
        await page.saveRule();
        const changed = (await root.query('SELECT * FROM venue_booking_rules WHERE id=?', [id]))[0][0];
        assert.equal(changed.approver_assignment_id, 'assignment-other');
        assert.equal(changed.approver_hr_id, 'reviewer-hr');
        assert.equal(changed.is_active, 0);
        page.openRuleEditor(event('booking', id));
        await page.loadBookingRuleReferences();
        assert.equal(page.data.bookingApproverValue[0].assignmentId, 'assignment-other');
      }
    }
    const legacyCycles = [
      { type: 'datetime_range', values: { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-04', endTime: '02:00' } },
      { type: 'repeat', values: { startDate: '2026-11-02', startTime: '22:00', endDate: '2026-11-03', endTime: '02:00', intervalUnit: 'week', intervalValue: 2, repeatCount: 3 } }
    ];
    const schedule = require('../src/modules/venue/services/venueActivitySchedule');
    for (const cycle of legacyCycles) {
      const id = 'preserve-' + cycle.type;
      await root.query(`INSERT INTO venue_activity_rules(id,venue_id,activity_name,cycle_type,cycle_values,time_start,time_end)
        VALUES (?,'venue','连续跨日活动',?,?,'09:00','18:00')`, [id, cycle.type, JSON.stringify(cycle.values)]);
      const before = (await root.query('SELECT * FROM venue_activity_rules WHERE id=?', [id]))[0][0];
      await page.loadActivityRules();
      page.openRuleEditor(event('activity', id));
      assert.equal(page.data.ruleForm.cycleType, cycle.type);
      assert.equal(page.data.ruleForm._legacyInterval, true);
      page.onRuleFormField({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '修改活动名称' } });
      await page.saveRule();
      assert.equal(calls.filter(call => call.name === 'saveVenueActivityRule').at(-1).result.status, 'success');
      const after = (await root.query('SELECT * FROM venue_activity_rules WHERE id=?', [id]))[0][0];
      assert.equal(after.cycle_type, cycle.type);
      assert.deepEqual(after.cycle_values, before.cycle_values);
      for (const day of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-16', '2026-11-17', '2026-11-30']) {
        const slots = row => schedule.getActivitySlots(day, [row], 480).map(slot => [slot.timeStart, slot.timeEnd, slot.fullTimeStart, slot.fullTimeEnd]);
        assert.deepEqual(slots(after), slots(before), cycle.type + ':' + day);
      }
      page.openRuleEditor(event('activity', id));
      assert.equal(page.data.ruleForm.cycleType, cycle.type);
      assert.deepEqual(JSON.parse(JSON.stringify(page.data.ruleForm.cycleValues)), cycle.values);
      const invalid = await callFunction({ name: 'saveVenueActivityRule', data: { id, venueId: 'venue', cycleType: cycle.type,
        activityName: '不应保存', cycleValues: { ...cycle.values, endDate: '2026-02-30' } } });
      assert.equal(invalid.status, 'invalid_params');
      assert.equal((await root.query('SELECT activity_name FROM venue_activity_rules WHERE id=?', [id]))[0][0].activity_name, '修改活动名称');
    }
    console.log('两类旧周期规则编辑保存回读通过，14个日期的占用片段未改变；非法日期拒绝且原记录不变。');
    console.log('两类指定审批规则以真实页面参数保存并重新打开，8个审批类型、岗位、范围及状态字段保持一致。');
    console.log('另验证4次HTTP保存：停用直接通过、停用管理员规则、停用流程编辑及生效方式切换；副本、原审批方式及7天窗口均按预期保留。');
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
