'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

async function run() {
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'venue_authz_' + process.pid + '_' + Date.now();
  const user = 'va_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const db = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root',
    password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  let listener;
  try {
    await db.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await db.query("CREATE USER ?@'%' IDENTIFIED BY ?", [user, password]);
    await db.query("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [database, user]);
    await db.query('USE ??', [database]);
    await db.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await db.query(`CREATE TABLE cache_domain_versions(org_id VARCHAR(64),domain VARCHAR(32),version BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY(org_id,domain)); INSERT INTO organizations(id,name) VALUES ('org','场地授权测试'),('other','其他组织')`);
    await db.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261031160000_unified_authorization.sql'), 'utf8'));
    await db.query(`INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('person','测试人员','fixture','fixture');
      INSERT INTO accounts(id,person_id) VALUES ('account','person');
      INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr','测试人员','fixture','org');
      INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('membership','person','org','hr');
      INSERT INTO departments(id,name,org_id) VALUES ('department','测试部门','org');
      INSERT INTO identities(id,name,org_id) VALUES ('identity','测试身份','org');
      INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
        VALUES ('assignment','membership','org','staff','department','identity');
      INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
        VALUES ('session','account','','context','assignment','assignment','org','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY);
      INSERT INTO venues(id,name) VALUES ('venue','共享场地');`);
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: user,
      DB_PASSWORD: password, AUTH_IDENTITY_SECRET: crypto.randomBytes(48).toString('hex') });
    pool = require('../src/config/db');
    const model = require('../src/modules/venue/models/venueConfigurationAuthorization');
    const reference = { accountId: 'account', personId: 'person', sessionId: 'session', contextId: 'context', organizationId: 'org' };
    let activeReference = reference;
    const express = require('express');
    const app = express();
    app.use(express.json());
    // 仅注入认证边界；业务路由、会话复核、授权、事务与保存均使用真实实现。
    app.use((req, res, next) => {
      req.authAccount = { id: activeReference.accountId, personId: activeReference.personId };
      req.authContext = { ...activeReference, role: activeReference === reference ? 'user' : 'admin',
        ...(activeReference === reference ? { legacyHrId: 'hr', assignmentId: 'assignment', membershipId: 'membership' } : {}) };
      req.unifiedAuthorization = { reference: activeReference };
      require('../src/utils/orgContext').orgStorage.run(activeReference.organizationId, next);
    });
    app.use('/api', require('../src/modules/venue/routes/venueAdmin'));
    app.use('/api', require('../src/modules/venue/routes/venueApprovalAdmin'));
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    async function call(name, body) {
      const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
      });
      return response.json();
    }
    const input = { open: { enabled: true, mode: 'days', days: 7 }, deadline: { enabled: true, mode: 'duration', hours: 2, minutes: 30 } };
    const saved = await model.saveBookingWindow(null, 'org', 'venue', input);
    let [[row]] = await db.query('SELECT * FROM venue_booking_policies WHERE id=?', [saved.id]);
    assert.equal(row.open_advance_days, 7);
    assert.equal(row.deadline_advance_minutes, 150);
    await db.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
    await assert.rejects(model.saveBookingWindow(null, 'org', 'venue', input), error => error.code === 'authorization_forbidden');
    await assert.rejects(model.saveBookingWindow(reference, 'org', 'venue', input), error => error.code === 'authorization_forbidden');
    const policy = { id: 'rule', organizationId: 'org', effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['assignment'] }],
      capabilities: ['venue.bookingWindows.create', 'venue.approvalCandidates.read'], scopes: [{ kind: 'organization' }], fields: null };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('rule','org','授权',?)", [JSON.stringify(policy)]);
    let directory = await call('listVenues');
    assert.deepEqual(directory.venues, [], '配置权限不能自动读取完整场地资料');
    assert.deepEqual(directory.configurationVenues, [{ id: 'venue', name: '共享场地' }]);
    assert.deepEqual((await call('listVenues', { purpose: 'configuration' })).venues, directory.configurationVenues);
    await db.query("INSERT INTO venues(id,name,location,description) VALUES ('candidate-other','其他配置场地','不能泄露地点','不能泄露说明')");
    await db.query("INSERT INTO venue_approval_flows(id,venue_id,name,org_id) VALUES ('candidate-own-flow','venue','本组织流程','org'),('candidate-foreign-flow','candidate-other','其他组织流程','other')");
    const oneFlow = { ...policy, capabilities: ['venue.approvals.read'], scopes: [{ kind: 'records', ids: ['candidate-own-flow', 'candidate-foreign-flow'] }] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify(oneFlow)]);
    directory = await call('listVenues');
    assert.deepEqual(directory.venues, []);
    assert.deepEqual(directory.configurationVenues, [{ id: 'venue', name: '共享场地' }], '只能通过本组织获授权配置反查所属场地');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('candidate-deny','org','禁止流程读取',?)", [JSON.stringify({ ...oneFlow, effect: 'deny' })]);
    assert.deepEqual((await call('listVenues')).configurationVenues, []);
    await db.query("DELETE FROM authorization_rules WHERE id='candidate-deny'");
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify({ ...oneFlow, capabilities: ['venue.bookingRules.create'], scopes: [{ kind: 'organization' }] })]);
    assert.equal((await call('listVenues')).configurationVenues.length, 2, '新增组织规则可以选择没有规则的活动场地');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify(policy)]);
    await db.query("DELETE FROM venue_approval_flows WHERE id IN ('candidate-own-flow','candidate-foreign-flow')");
    await db.query("DELETE FROM venues WHERE id='candidate-other'");
    const updated = await model.saveBookingWindow(reference, 'org', 'venue', { open: { mode: 'days', days: 9 }, deadline: { mode: 'none' } });
    assert.equal(updated.id, saved.id);
    [[row]] = await db.query('SELECT * FROM venue_booking_policies WHERE id=?', [saved.id]);
    assert.equal(row.open_advance_days, 9);
    assert.equal(row.deadline_advance_mode, null);
    const candidates = await model.readCandidates(reference, 'org');
    assert.equal(candidates.assignments.length, 1);
    assert.equal(candidates.assignments[0].assignmentId, 'assignment');
    assert.equal(Object.hasOwn(candidates.assignments[0], 'student_id'), false);
    assert.equal((await call('getVenueRuleCandidates')).assignments[0].assignmentId, 'assignment');
    assert.equal((await call('saveVenueBookingWindow', { venueId: 'venue', bookingWindow: {
      open: { mode: 'days', days: 9 }, deadline: { mode: 'none' }
    } })).status, 'success');
    [[row]] = await db.query('SELECT * FROM venue_booking_policies WHERE id=?', [saved.id]);
    assert.equal(row.open_advance_days, 9);
    await assert.rejects(model.readCandidates(reference, 'other'), error => error.code === 'authorization_forbidden');
    await assert.rejects(model.saveBookingWindow(reference, 'other', 'venue', input), error => error.code === 'authorization_forbidden');
    const limited = { ...policy, capabilities: ['venue.bookingWindows.create'], fields: ['openAdvanceDays'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify(limited)]);
    await assert.rejects(model.saveBookingWindow(reference, 'org', 'venue', input), error => error.code === 'authorization_forbidden');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify(policy)]);
    await db.query("INSERT INTO admin_grants(id,person_id,org_id) VALUES ('grant','person','org')");
    await db.query(`INSERT INTO venue_open_rules(id,venue_id,name,cycle_type,cycle_values,time_start,time_end,is_active)
      VALUES ('approved-open','venue','免审借用开放','weekly','[0,1,2,3,4,5,6]','08:00','22:00',1)`);
    const approvedInput = { venueId: 'venue', title: '获授岗位免审新增', description: '实际保存回读', clientRequestId: 'approved-fixture',
      timeStart: '2099-01-05 09:00:00', timeEnd: '2099-01-05 10:00:00' };
    assert.equal((await call('createAdminVenueBooking', approvedInput)).status, 'forbidden');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify({ ...policy, capabilities: ['venue.bookings.create'] })]);
    assert.equal((await call('createAdminVenueBooking', approvedInput)).status, 'forbidden', '普通新增资格不能用于免审');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify({ ...policy, capabilities: ['venue.bookings.createApproved'] })]);
    const approved = await call('createAdminVenueBooking', approvedInput);
    assert.equal(approved.status, 'success', JSON.stringify(approved));
    const repeatedApproved = await call('createAdminVenueBooking', approvedInput);
    assert.equal(repeatedApproved.status, 'success', JSON.stringify(repeatedApproved));
    assert.equal(repeatedApproved.id, approved.id);
    assert.equal((await call('createAdminVenueBooking', { ...approvedInput, title: '重复请求不应变更标题' })).status, 'conflict');
    const approvedRow = (await db.query('SELECT * FROM venue_bookings WHERE id=?', [approved.id]))[0][0];
    assert.equal(approvedRow.status, 'approved');
    assert.equal(approvedRow.creator_type, 'user');
    assert.equal(approvedRow.creator_assignment_id, 'assignment');
    assert.equal(approvedRow.creator_person_id, 'person');
    assert.equal(JSON.parse(approvedRow.creator_context_snapshot).departmentId, 'department');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='rule'", [JSON.stringify(policy)]);
    assert.equal((await call('createAdminVenueBooking', { ...approvedInput, timeStart: '2099-01-05 11:00:00', timeEnd: '2099-01-05 12:00:00' })).status, 'forbidden');
    assert.equal((await db.query("SELECT id FROM venue_bookings WHERE title='获授岗位免审新增'"))[0].length, 1);
    await db.query('DELETE FROM venue_bookings WHERE id=?', [approved.id]);
    await db.query("DELETE FROM venue_open_rules WHERE id='approved-open'");
    await db.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES ('admin-session','account','','admin-context','admin','grant','org','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`);
    const adminReference = { ...reference, sessionId: 'admin-session', contextId: 'admin-context' };
    activeReference = adminReference;
    for (const kind of ['openRules', 'activityRules']) {
      const title = kind === 'openRules' ? 'name' : 'activityName';
      const titleColumn = kind === 'openRules' ? 'name' : 'activity_name';
      const ruleInput = { venueId: 'venue', [title]: '规则测试', cycleType: 'weekly', cycleValues: [1], timeStart: '09:00', timeEnd: '10:00' };
      const rulePolicy = { ...policy, id: kind, subjects: [{ kind: 'adminGrants', ids: ['grant'] }],
        capabilities: ['venue.' + kind + '.create', 'venue.' + kind + '.update', 'venue.' + kind + '.delete', 'venue.' + kind + '.read'] };
      await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,'org','规则权限',?)", [kind, JSON.stringify(rulePolicy)]);
      const createOnlyPolicy = { ...rulePolicy, capabilities: ['venue.' + kind + '.create'] };
      await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(createOnlyPolicy), kind]);
      assert.deepEqual((await call('listVenues')).configurationVenues, [], '共享规则新增权不附带全局场地配置资格');
      await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(rulePolicy), kind]);
      await assert.rejects(model.writeSharedRule(adminReference, 'org', kind, kind, ruleInput), error => error.code === 'authorization_forbidden');
      const globalPolicy = { ...rulePolicy, id: kind + '-global', capabilities: ['venue.sharedConfiguration.configure'], scopes: [{ kind: 'records', ids: ['venue'] }] };
      await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,'org','共享场地授权',?)", [kind + '-global', JSON.stringify(globalPolicy)]);
      await model.writeSharedRule(adminReference, 'org', kind, kind, ruleInput);
      await model.writeSharedRule(adminReference, 'org', kind, kind, { ...ruleInput, [title]: '更新规则' });
      let rules = await model.listSharedRules(adminReference, 'org', kind, 'venue');
      assert.equal(rules.length, 1);
      assert.equal(rules[0][titleColumn], '更新规则');
      await assert.rejects(model.writeSharedRule(adminReference, 'org', kind, kind, { ...ruleInput, venueId: 'different' }), error => error.code === 'venue_rule_invalid');
      const limitedRead = { ...rulePolicy, capabilities: ['venue.' + kind + '.read'], fields: [title] };
      await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(limitedRead), kind]);
      rules = await model.listSharedRules(adminReference, 'org', kind, 'venue');
      assert.equal(rules[0][titleColumn], '更新规则');
      assert.equal(Object.hasOwn(rules[0], 'cycle_values'), false);
      await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(rulePolicy), kind]);
      await model.writeSharedRule(adminReference, 'org', kind, kind, null, true);
      assert.deepEqual(await model.listSharedRules(adminReference, 'org', kind, 'venue'), []);
      const routeKind = kind === 'openRules' ? 'Open' : 'Activity';
      assert.equal((await call('saveVenue' + routeKind + 'Rule', { ...ruleInput, id: kind + '-http' })).status, 'success');
      assert.equal((await call('saveVenue' + routeKind + 'Rule', { ...ruleInput, id: kind + '-http', [title]: '接口更新' })).status, 'success');
      const reloaded = await call('listVenue' + routeKind + 'Rules', { venueId: 'venue' });
      assert.equal(reloaded.status, 'success');
      assert.equal(reloaded.rules[0][titleColumn], '接口更新');
      assert.equal((await call('deleteVenue' + routeKind + 'Rule', { id: kind + '-http' })).status, 'success');
      assert.equal((await call('listVenue' + routeKind + 'Rules', { venueId: 'venue' })).rules.length, 0);
      await db.query('DELETE FROM authorization_rules WHERE id IN (?,?)', [kind, kind + '-global']);
    }
    activeReference = reference;
    const configurationPolicy = { ...policy, id: 'configuration', capabilities: [
      'venue.bookingRules.read', 'venue.bookingRules.create', 'venue.bookingRules.update', 'venue.bookingRules.delete',
      'venue.approvals.read', 'venue.approvals.create', 'venue.approvals.update', 'venue.approvals.delete', 'venue.bookingWindows.read'
    ] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('configuration','org','组织配置权限',?)", [JSON.stringify(configurationPolicy)]);
    let response = await call('saveVenueBookingRule', { id: 'direct-rule', venueId: 'venue', ruleType: 'direct', sortOrder: 1 });
    assert.equal(response.status, 'success', JSON.stringify(response));
    response = await call('listVenueBookingRules', { venueId: 'venue' });
    assert.equal(response.rules[0].rule_type, 'direct');
    assert.equal(response.bookingWindow.openAdvanceDays, 9);
    const flowInput = { venueId: 'venue', flowName: '普通岗位配置流程', allowUserSelect: true,
      allowDesignateFirst: false, allowDesignateNext: true,
      steps: [{ name: '指定范围审批', approvalMode: 'hr_rule', rules: [{ departmentScope: 'all', workGroupScope: 'all', identityScope: 'all' }] }] };
    const withoutReplacement = { ...configurationPolicy, capabilities: configurationPolicy.capabilities.filter(key => key !== 'venue.bookingRules.update') };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='configuration'", [JSON.stringify(withoutReplacement)]);
    assert.equal((await call('saveVenueApprovalWholeFlow', flowInput)).status, 'forbidden');
    assert.equal((await call('listVenueBookingRules', { venueId: 'venue' })).rules[0].id, 'direct-rule');
    assert.equal((await call('listVenueApprovalFlows', { venueId: 'venue' })).flows.length, 0);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='configuration'", [JSON.stringify(configurationPolicy)]);
    response = await call('saveVenueApprovalWholeFlow', flowInput);
    assert.equal(response.status, 'success', JSON.stringify(response));
    const flowId = response.flowId;
    assert.equal((await call('listVenueBookingRules', { venueId: 'venue' })).rules.length, 0);
    response = await call('listVenueApprovalFlows', { venueId: 'venue' });
    assert.equal(response.flows[0].steps[0].rules.length, 1);
    assert.equal(response.flows[0].allow_designate_first, 0);
    assert.equal(response.flows[0].allow_designate_next, 1);
    assert.equal((await call('saveVenueApprovalFlowMeta', { venueId: 'venue', flowId, name: '编辑元信息',
      allowUserSelect: false, allowDesignateFirst: true, allowDesignateNext: false })).status, 'success');
    response = await call('listVenueApprovalFlows', { venueId: 'venue' });
    assert.equal(response.flows[0].name, '编辑元信息');
    assert.equal(response.flows[0].allow_designate_first, 1);
    assert.equal(response.flows[0].allow_designate_next, 0);
    assert.equal((await call('saveVenueApprovalWholeFlow', { ...flowInput, flowId, flowName: '完整编辑' })).status, 'success');
    assert.equal((await call('listVenueApprovalFlows', { venueId: 'venue' })).flows[0].name, '完整编辑');
    const noFlowReplacement = { ...configurationPolicy, capabilities: configurationPolicy.capabilities.filter(key => key !== 'venue.approvals.update') };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='configuration'", [JSON.stringify(noFlowReplacement)]);
    assert.equal((await call('saveVenueBookingRule', { id: 'next-direct', venueId: 'venue', ruleType: 'direct' })).status, 'forbidden');
    assert.equal((await call('listVenueApprovalFlows', { venueId: 'venue' })).flows.length, 1);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='configuration'", [JSON.stringify(configurationPolicy)]);
    assert.equal((await call('deleteVenueApprovalFlow', { venueId: 'venue', flowId })).status, 'success');
    assert.equal((await call('listVenueApprovalFlows', { venueId: 'venue' })).flows.length, 0);
    assert.equal((await call('saveVenueBookingRule', { id: 'person-rule', venueId: 'venue', ruleType: 'person',
      approverHrId: 'hr', approverAssignmentId: 'assignment' })).status, 'success');
    assert.equal((await call('saveVenueBookingRule', { id: 'person-rule', venueId: 'venue', ruleType: 'identity',
      approverIdentityId: 'identity', scopeDepartmentId: 'department' })).status, 'success');
    response = await call('listVenueBookingRules', { venueId: 'venue' });
    assert.equal(response.rules[0].rule_type, 'identity');
    assert.equal(response.rules[0].scope_department_id, 'department');
    assert.equal((await call('deleteVenueBookingRule', { id: 'person-rule' })).status, 'success');
    assert.equal((await call('listVenueBookingRules', { venueId: 'venue' })).rules.length, 0);
    const venuePolicy = { ...policy, id: 'venue-resource', capabilities: ['venue.resources.read', 'venue.resources.create', 'venue.resources.update', 'venue.resources.delete'] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-resource','org','场地资源授权',?)", [JSON.stringify(venuePolicy)]);
    const venueInput = { name: '新场地', location: '楼内', description: '测试说明', imageUrl: '' };
    const createdVenue = await call('saveVenue', venueInput);
    assert.equal(createdVenue.status, 'success', JSON.stringify(createdVenue));
    assert.equal((await call('saveVenue', { ...venueInput, id: createdVenue.id, name: '编辑场地' })).status, 'success');
    assert.equal((await call('listVenues')).venues.find(item => item.id === createdVenue.id).name, '编辑场地');
    const restrictedVenue = { ...venuePolicy, capabilities: ['venue.resources.read', 'venue.resources.update'],
      scopes: [{ kind: 'records', ids: [createdVenue.id] }], fields: ['name'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='venue-resource'", [JSON.stringify(restrictedVenue)]);
    assert.deepEqual((await call('listVenues')).venues, [{ id: createdVenue.id, name: '编辑场地' }]);
    assert.equal((await call('saveVenue', { ...venueInput, id: createdVenue.id, name: '不允许写入' })).status, 'forbidden');
    assert.equal((await call('deleteVenue', { id: 'venue' })).status, 'forbidden');
    assert.equal((await db.query('SELECT name FROM venues WHERE id=?', [createdVenue.id]))[0][0].name, '编辑场地');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='venue-resource'", [JSON.stringify(venuePolicy)]);
    assert.equal((await call('deleteVenue', { id: createdVenue.id })).status, 'success');
    assert.equal((await call('listVenues')).venues.some(item => item.id === createdVenue.id), false);
    assert.equal((await db.query('SELECT is_active FROM venues WHERE id=?', [createdVenue.id]))[0][0].is_active, 0);
    await db.query("DELETE FROM authorization_rules WHERE id='venue-resource'");
    assert.equal((await call('saveVenue', venueInput)).status, 'forbidden');
    await db.query(`INSERT INTO venue_bookings(id,venue_id,title,time_start,time_end,status,creator_org_id,approval_org_id)
      VALUES ('visible-booking','venue','可见借用','2026-10-01 08:00:00','2026-10-01 09:00:00','approved','org','org'),
        ('hidden-booking','venue','未授权借用','2026-10-02 08:00:00','2026-10-02 09:00:00','approved','org','org'),
        ('foreign-booking','venue','其他组织借用','2026-10-03 08:00:00','2026-10-03 09:00:00','approved','other','other')`);
    assert.deepEqual((await call('listAllVenueBookings')).bookings, []);
    const bookingPolicy = { ...policy, id: 'booking-read', capabilities: ['venue.bookings.read', 'venue.bookings.delete'],
      scopes: [{ kind: 'records', ids: ['visible-booking', 'foreign-booking'] }] };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('booking-read','org','单条借用读取',?)", [JSON.stringify(bookingPolicy)]);
    const scopedBookings = await call('listAllVenueBookings');
    assert.equal(scopedBookings.status, 'success', JSON.stringify(scopedBookings));
    assert.deepEqual(scopedBookings.bookings.map(item => item.id), ['visible-booking']);
    assert.equal(scopedBookings.bookings[0].adminCanDelete, true);
    assert.equal((await call('listAllVenueBookings', { status: 'pending' })).bookings.length, 0);
    const historicalJob = { assignmentId: 'record-job', personId: 'record-person', organizationId: 'org',
      assignmentKind: 'staff', departmentId: 'department', identityCategoryId: 'identity', workGroupId: '' };
    await db.query("UPDATE venue_bookings SET creator_person_id='record-person',creator_assignment_id='record-job',creator_context_snapshot=? WHERE id='visible-booking'", [JSON.stringify(historicalJob)]);
    const dynamicPolicy = { ...bookingPolicy, scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['department'], natureId: ['staff'] } }] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='booking-read'", [JSON.stringify(dynamicPolicy)]);
    assert.deepEqual((await call('listAllVenueBookings')).bookings.map(item => item.id), ['visible-booking']);
    assert.equal((await call('listAllVenueBookings')).bookings[0].adminCanDelete, true);
    await db.query("UPDATE venue_bookings SET creator_context_snapshot=? WHERE id='visible-booking'", [JSON.stringify({ ...historicalJob, organizationId: 'other' })]);
    assert.deepEqual((await call('listAllVenueBookings')).bookings, []);
    await db.query("UPDATE venue_bookings SET creator_context_snapshot=? WHERE id='visible-booking'", [JSON.stringify(historicalJob)]);
    const deniedJob = { ...dynamicPolicy, id: 'booking-deny', effect: 'deny' };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('booking-deny','org','禁止岗位范围',?)", [JSON.stringify(deniedJob)]);
    assert.deepEqual((await call('listAllVenueBookings')).bookings, []);
    await db.query("DELETE FROM authorization_rules WHERE id='booking-deny'");
    for (let index = 0; index < 201; index++) {
      await db.query(`INSERT INTO venue_bookings(id,venue_id,title,time_start,time_end,status,creator_org_id,approval_org_id)
        VALUES (?,'venue','较新的无权记录','2026-10-10 08:00:00','2026-10-10 09:00:00','approved','org','org')`, ['paging-' + index]);
    }
    assert.deepEqual((await call('listAllVenueBookings')).bookings.map(item => item.id), ['visible-booking']);
    await db.query("DELETE FROM venue_bookings WHERE id LIKE 'paging-%'");
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='booking-read'", [JSON.stringify({ ...bookingPolicy,
      capabilities: ['venue.bookings.read'], scopes: [{ kind: 'organization' }] })]);
    assert.deepEqual((await call('listAllVenueBookings')).bookings.map(item => item.id), ['hidden-booking', 'visible-booking']);
    assert.equal((await call('listAllVenueBookings')).bookings[0].adminCanDelete, false);
    await db.query("UPDATE venue_bookings SET status='pending',approval_flow_id='missing-flow',approval_total_steps=1 WHERE id='visible-booking'");
    const pendingBooking = (await call('listAllVenueBookings')).bookings.find(item => item.id === 'visible-booking');
    assert.equal(pendingBooking.userCanApprove, false);
    assert.equal(pendingBooking.approvalProgress.flowSnapshotAvailable, false);
    await db.query("DELETE FROM authorization_rules WHERE id='booking-read'");
    assert.deepEqual((await call('listAllVenueBookings')).bookings, []);
    await db.query("UPDATE membership_assignments SET status='inactive' WHERE id='assignment'");
    for (const [name, body] of [
      ['listVenueOpenRules', { venueId: 'venue' }], ['listVenueActivityRules', { venueId: 'venue' }],
      ['listVenueBookingRules', { venueId: 'venue' }], ['listVenueApprovalFlows', { venueId: 'venue' }],
      ['getVenueRuleCandidates', {}], ['saveVenueBookingWindow', { venueId: 'venue', bookingWindow: input }]
    ]) {
      const rejected = await call(name, body);
      assert.equal(rejected.status, 'forbidden', name + ':' + JSON.stringify(rejected));
      assert(!rejected.message.includes('authorization_'));
    }
    await assert.rejects(model.saveBookingWindow(reference, 'org', 'venue', input), error => error.code === 'authorization_forbidden');
    await assert.rejects(model.readCandidates(reference, 'org'), error => error.code === 'authorization_forbidden');
    [[row]] = await db.query('SELECT * FROM venue_booking_policies WHERE id=?', [saved.id]);
    assert.equal(row.open_advance_days, 9);
    const [[other]] = await db.query("SELECT COUNT(*) count FROM venue_booking_policies WHERE org_id='other'");
    assert.equal(other.count, 0);
    console.log('venue configuration authorization: persistence, fields, role revocation, organization and mode boundaries passed');
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (pool) await pool.end();
    await db.query('DROP DATABASE IF EXISTS ??', [database]);
    await db.query("DROP USER IF EXISTS ?@'%'", [user]);
    await db.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
