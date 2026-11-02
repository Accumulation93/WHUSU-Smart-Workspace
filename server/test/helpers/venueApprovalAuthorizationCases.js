'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function venueApprovalAuthorizationCases(db) {
  const identity = require('../../src/core/models/unifiedIdentity');
  const context = (await identity.listContexts('dir-account', db)).find(item => item.assignmentId === 'dir-assignment');
  assert(context);
  await db.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
    VALUES ('venue-review-session','dir-account',?,?,'assignment','dir-assignment','dir-auth','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`, ['', context.contextId]);
  const reference = { accountId: 'dir-account', personId: 'dir-person', sessionId: 'venue-review-session',
    contextId: context.contextId, organizationId: 'dir-auth' };
  await db.query("INSERT INTO admin_info(id,name,org_id) VALUES ('venue-limited-admin','测试管理员','dir-auth')");
  await db.query("INSERT INTO admin_grants(id,person_id,org_id,admin_level,legacy_admin_id) VALUES ('venue-limited-grant','dir-person','dir-auth','admin','venue-limited-admin')");
  const adminContext = (await identity.listContexts('dir-account', db)).find(item => item.adminGrantId === 'venue-limited-grant');
  assert(adminContext);
  await db.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
    VALUES ('venue-admin-session','dir-account','',?,'admin','venue-limited-grant','dir-auth','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`, [adminContext.contextId]);
  let activeContext = context;
  const assignmentService = require('../../src/modules/venue/services/venueAssignmentContext');
  const flowService = require('../../src/modules/venue/services/venueApprovalMultiFlow');
  const assignment = await assignmentService.loadAssignmentById('dir-assignment', 'dir-auth', true, db);
  const definition = flowService.buildFlowDefinitionSnapshot([{ id: 'permission-flow', name: '审批流程' }], {
    'permission-flow': [{ id: 'permission-step', name: '确认', approval_mode: 'hr_rule',
      rules: [{ department_scope: 'all', work_group_scope: 'all', identity_scope: 'all' }] }]
  }, 'permission-flow', 'dir-auth', assignmentService.toRuleProfile(assignment));
  await db.query("INSERT INTO venues(id,name) VALUES ('permission-venue','审批权限测试场地')");
  for (const id of ['permission-approve', 'permission-reject']) {
    await db.query(`INSERT INTO venue_bookings(id,venue_id,user_hr_id,creator_person_id,creator_org_id,approval_org_id,
      creator_assignment_id,title,time_start,time_end,status,approval_flow_id,approval_total_steps,approval_current_step,
      creator_context_snapshot,approval_flow_snapshot_json,approval_snapshots_json)
      VALUES (?,'permission-venue','dir-hr','dir-person','dir-auth','dir-auth','dir-assignment',?,
        UTC_TIMESTAMP()+INTERVAL 10 DAY,UTC_TIMESTAMP()+INTERVAL 11 DAY,'pending','permission-flow',1,0,?,?,'[]')`,
    [id, id, JSON.stringify(assignmentService.toAssignmentSnapshot(assignment)), JSON.stringify(definition)]);
  }
  await db.query("UPDATE venue_bookings SET time_start=UTC_TIMESTAMP()+INTERVAL 12 DAY,time_end=UTC_TIMESTAMP()+INTERVAL 13 DAY WHERE id='permission-reject'");
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    req.authAccount = { id: 'dir-account', personId: 'dir-person' };
    req.authSession = { id: activeContext === context ? reference.sessionId : 'venue-admin-session' };
    req.authContext = activeContext;
    require('../../src/utils/orgContext').orgStorage.run('dir-auth', next);
  });
  app.use('/api', require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use('/api', require('../../src/modules/venue/routes/venueAdmin'));
  app.use('/api', require('../../src/modules/venue/routes/venueApprovalAdmin'));
  app.use('/api', require('../../src/modules/venue/routes/venueUser'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body = {}) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return response.json();
  }
  const policy = { id: 'venue-review-deny', organizationId: 'dir-auth', effect: 'deny', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['dir-assignment'] }], capabilities: ['venue.bookings.approve'],
    scopes: [{ kind: 'records', ids: ['permission-approve', 'permission-reject'] }], fields: null };
  try {
    let pending = await call('listPendingVenueApprovals');
    assert.equal(pending.status, 'success', JSON.stringify(pending));
    assert.equal(pending.pending.filter(item => item.id.startsWith('permission-')).length, 2);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-review-deny','dir-auth','禁止处理',?)", [JSON.stringify(policy)]);
    assert.equal((await call('listPendingVenueApprovals')).pending.filter(item => item.id.startsWith('permission-')).length, 0);
    for (const endpoint of ['approveVenueBooking', 'rejectVenueBooking', 'approveVenueBookingStep', 'rejectVenueBookingStep']) {
      assert.equal((await call(endpoint, { id: 'permission-approve', flowId: 'permission-flow', comment: '确认' })).status, 'forbidden', endpoint);
    }
    const todo = require('../../src/modules/audit/models/todoAuthorization');
    const resource = require('../../src/modules/venue/models/venueBookingResource').resource;
    const [[before]] = await db.query("SELECT * FROM venue_bookings WHERE id='permission-approve'");
    assert.equal(before.status, 'pending');
    assert.equal((await todo.prepareRelated('dir-auth', context.contextId, reference))(resource(before, 'dir-auth')), false);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='venue-review-deny'", [JSON.stringify({ ...policy, capabilities: ['venue.bookings.read'] })]);
    assert.equal((await call('listPendingVenueApprovals')).pending.filter(item => item.id.startsWith('permission-')).length, 0);
    assert.equal((await call('approveVenueBookingStep', { id: 'permission-approve', flowId: 'permission-flow' })).status, 'forbidden');
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-deny'");
    const adminDefinition = flowService.buildFlowDefinitionSnapshot([{ id: 'permission-flow', name: '管理身份处理' }], {
      'permission-flow': [{ id: 'permission-step', name: '确认', approval_mode: 'admin_any', rules: [] }]
    }, 'permission-flow', 'dir-auth', assignmentService.toRuleProfile(assignment));
    await db.query("UPDATE venue_bookings SET approval_flow_snapshot_json=? WHERE id='permission-approve'", [JSON.stringify(adminDefinition)]);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-review-explicit','dir-auth','允许处理指定记录',?)", [JSON.stringify({
      ...policy, id: 'venue-review-explicit', effect: 'allow', capabilities: ['venue.bookings.read', 'venue.bookings.approve']
    })]);
    assert.equal((await call('approveVenueBookingStep', { id: 'permission-approve', flowId: 'permission-flow' })).status, 'forbidden', '显式能力不能代替原流程处理身份');
    assert.equal((await db.query("SELECT status FROM venue_bookings WHERE id='permission-approve'"))[0][0].status, 'pending');
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-explicit'");
    activeContext = adminContext;
    const adminPending = await call('listPendingVenueApprovals');
    assert.equal(adminPending.status, 'success', JSON.stringify(adminPending));
    assert.equal(adminPending.pending.filter(item => item.id === 'permission-approve').length, 0,
      '管理身份没有审批授权时不能取得待办');
    assert.equal((await call('approveVenueBookingStep', { id: 'permission-approve', flowId: 'permission-flow' })).status, 'forbidden',
      '管理身份不能隐含取得审批能力');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-admin-allow','dir-auth','允许指定管理身份审批',?)", [JSON.stringify({
      ...policy, id: 'venue-admin-allow', effect: 'allow', subjects: [{ kind: 'adminGrants', ids: ['venue-limited-grant'] }],
      capabilities: ['venue.bookings.read', 'venue.bookings.approve']
    })]);
    assert.equal((await call('listPendingVenueApprovals')).pending.filter(item => item.id === 'permission-approve').length, 1,
      '管理身份取得明确授权后仍须匹配管理员流程');
    await db.query("DELETE FROM authorization_rules WHERE id='venue-admin-allow'");
    activeContext = context;
    await db.query("UPDATE venue_bookings SET approval_flow_snapshot_json=? WHERE id='permission-approve'", [JSON.stringify(definition)]);
    const approved = await call('approveVenueBookingStep', { id: 'permission-approve', flowId: 'permission-flow', comment: '同意使用' });
    assert.equal(approved.status, 'success', JSON.stringify(approved));
    const rejected = await call('rejectVenueBookingStep', { id: 'permission-reject', flowId: 'permission-flow', comment: '时间需调整' });
    assert.equal(rejected.status, 'success', JSON.stringify(rejected));
    const [saved] = await db.query("SELECT id,status,approval_snapshots_json,approval_flow_state_json FROM venue_bookings WHERE id IN ('permission-approve','permission-reject') ORDER BY id");
    assert.deepEqual(saved.map(item => item.status), ['approved', 'rejected']);
    const snapshots = typeof saved[0].approval_snapshots_json === 'string' ? JSON.parse(saved[0].approval_snapshots_json) : saved[0].approval_snapshots_json;
    assert.equal(snapshots[0].approverAssignmentId, 'dir-assignment');
    assert.equal(snapshots[0].comment, '同意使用');
    const state = typeof saved[1].approval_flow_state_json === 'string' ? JSON.parse(saved[1].approval_flow_state_json) : saved[1].approval_flow_state_json;
    assert.equal(state.rejection.approverAssignmentId, 'dir-assignment');
    assert.equal(state.rejection.comment, '时间需调整');
    assert.equal((await call('listPendingVenueApprovals')).pending.filter(item => item.id.startsWith('permission-')).length, 0);
    const history = await call('listVenueApprovalHistory');
    assert.equal(history.status, 'success', JSON.stringify(history));
    assert.equal(history.history.filter(item => item.id.startsWith('permission-')).length, 2);
    assert.equal((await call('getVenueApprovalHistoryDetail', { id: 'permission-approve' })).detail.myAction, 'approved');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-review-deny','dir-auth','禁止处理',?)", [JSON.stringify(policy)]);
    assert.equal((await call('approveVenueBookingStep', { id: 'permission-approve' })).status, 'forbidden');
    assert.equal((await call('listVenueApprovalHistory')).history.filter(item => item.id.startsWith('permission-')).length, 2, '禁止以后处理不抹去仍可读取的历史');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='venue-review-deny'", [JSON.stringify({ ...policy, capabilities: ['venue.bookings.read'] })]);
    assert.equal((await call('listVenueApprovalHistory')).history.filter(item => item.id.startsWith('permission-')).length, 0);
    assert.equal((await call('getVenueApprovalHistoryDetail', { id: 'permission-approve' })).status, 'forbidden');
    assert.equal((await call('listMyVenueBookings')).bookings.filter(item => item.id.startsWith('permission-')).length, 0);
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-deny'");
    await db.query(`INSERT INTO venue_bookings(id,venue_id,user_hr_id,creator_person_id,creator_org_id,approval_org_id,
      creator_assignment_id,title,time_start,time_end,status,creator_context_snapshot)
      VALUES ('permission-end','permission-venue','dir-hr','dir-person','dir-auth','dir-auth','dir-assignment','提前结束',
        UTC_TIMESTAMP()-INTERVAL 1 HOUR,UTC_TIMESTAMP()+INTERVAL 1 HOUR,'approved',?)`,
    [JSON.stringify(assignmentService.toAssignmentSnapshot(assignment))]);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-review-deny','dir-auth','禁止取消与结束',?)", [JSON.stringify({
      ...policy, capabilities: ['venue.bookings.cancel', 'venue.bookings.update'], scopes: [{ kind: 'organization' }]
    })]);
    assert.equal((await call('cancelVenueBooking', { id: 'permission-approve' })).status, 'forbidden');
    assert.equal((await call('endVenueBooking', { id: 'permission-end' })).status, 'forbidden');
    const restrictedList = await call('listMyVenueBookings');
    assert.equal(restrictedList.bookings.find(item => item.id === 'permission-approve').canCancel, false);
    assert.equal(restrictedList.bookings.find(item => item.id === 'permission-end').canEnd, false);
    assert.equal((await db.query("SELECT status FROM venue_bookings WHERE id='permission-approve'"))[0][0].status, 'approved');
    assert.equal((await db.query("SELECT time_end > UTC_TIMESTAMP() AS future FROM venue_bookings WHERE id='permission-end'"))[0][0].future, 1);
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-deny'");
    assert.equal((await call('cancelVenueBooking', { id: 'permission-approve' })).status, 'success');
    const beforeEnd = new Date().getTime();
    assert.equal((await call('endVenueBooking', { id: 'permission-end' })).status, 'success');
    const afterEnd = new Date().getTime();
    assert.equal((await db.query("SELECT status FROM venue_bookings WHERE id='permission-approve'"))[0][0].status, 'cancelled');
    const [[endedRow]] = await db.query("SELECT DATE_FORMAT(time_end,'%Y-%m-%dT%H:%i:%s.%fZ') AS ended FROM venue_bookings WHERE id='permission-end'");
    const savedEnd = Date.parse(endedRow.ended);
    assert(savedEnd >= beforeEnd - 1000 && savedEnd <= afterEnd + 1000, endedRow.ended);
    await db.query("INSERT INTO venue_open_rules(id,venue_id,name,cycle_type,cycle_values,time_start,time_end) VALUES ('permission-open','permission-venue','全天开放','weekly','[1,2,3,4,5,6,7]','00:00:00','23:59:00')");
    await db.query("INSERT INTO venue_booking_rules(id,venue_id,org_id,rule_type) VALUES ('permission-direct','permission-venue','dir-auth','direct')");
    const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const createInput = { venueId: 'permission-venue', title: '授权创建回读', description: '测试',
      timeStart: date + 'T09:00', timeEnd: date + 'T10:00', clientRequestId: 'permission-create-01' };
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-review-deny','dir-auth','禁止创建',?)", [JSON.stringify({
      ...policy, capabilities: ['venue.bookings.create'], scopes: [{ kind: 'organization' }]
    })]);
    const deniedCreate = await call('createVenueBooking', createInput);
    assert.equal(deniedCreate.status, 'forbidden', JSON.stringify(deniedCreate));
    assert.equal((await db.query("SELECT COUNT(*) AS total FROM venue_bookings WHERE title='授权创建回读'"))[0][0].total, 0);
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-deny'");
    const created = await call('createVenueBooking', createInput);
    assert.equal(created.status, 'success', JSON.stringify(created));
    const repeated = await call('createVenueBooking', createInput);
    assert.equal(repeated.status, 'success', JSON.stringify(repeated));
    assert.equal(repeated.id, created.id);
    assert.equal((await call('createVenueBooking', { ...createInput, title: '同请求编号不应改写事由' })).status, 'conflict');
    assert.equal((await db.query("SELECT COUNT(*) AS total FROM venue_bookings WHERE title='授权创建回读'"))[0][0].total, 1);
    const [[createdRow]] = await db.query('SELECT title,status,creator_assignment_id FROM venue_bookings WHERE id=?', [created.id]);
    assert.equal(createdRow.title, createInput.title);
    assert.equal(createdRow.status, 'approved');
    assert.equal(createdRow.creator_assignment_id, 'dir-assignment');
    assert((await call('listMyVenueBookings')).bookings.some(item => item.id === created.id && item.title === createInput.title));
    const scheduleInput = { venueId: 'permission-venue', dateFrom: date, dateTo: date };
    const visibleSchedule = await call('getVenueSchedule', scheduleInput);
    assert.equal(visibleSchedule.status, 'success', JSON.stringify(visibleSchedule));
    assert.equal(visibleSchedule.dailySchedules[0].bookedSlots.find(item => item.id === created.id).visibility, 'details');
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('venue-review-deny','dir-auth','隐藏借用内容',?)", [JSON.stringify({
      ...policy, capabilities: ['venue.bookings.read'], scopes: [{ kind: 'records', ids: [created.id] }]
    })]);
    const hiddenSchedule = await call('getVenueSchedule', scheduleInput);
    const occupancy = hiddenSchedule.dailySchedules[0].bookedSlots.find(item => item.id === created.id);
    assert.equal(occupancy.visibility, 'occupancy_only');
    assert.notEqual(occupancy.title, createInput.title);
    assert.equal(occupancy.userHrId, undefined);
    assert.equal(occupancy.timeStart, '09:00');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='venue-review-deny'", [JSON.stringify({
      ...policy, capabilities: ['venue.schedule.read'], scopes: [{ kind: 'records', ids: ['permission-venue'] }]
    })]);
    assert.equal((await call('getVenueSchedule', scheduleInput)).status, 'forbidden');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='venue-review-deny'", [JSON.stringify({
      ...policy, capabilities: ['venue.resources.read'], scopes: [{ kind: 'records', ids: ['permission-venue'] }]
    })]);
    assert(!(await call('listVenuesForBooking')).venues.some(item => item.id === 'permission-venue'));
    assert.equal((await call('getVenueApprovalFlowOptions', { venueId: 'permission-venue' })).status, 'forbidden');
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-deny'");
    assert((await call('listVenuesForBooking')).venues.some(item => item.id === 'permission-venue'));
    const flowOptions = await call('getVenueApprovalFlowOptions', { venueId: 'permission-venue' });
    assert.equal(flowOptions.status, 'success', JSON.stringify(flowOptions));
    assert(Array.isArray(flowOptions.flows));
  } finally {
    await new Promise(resolve => listener.close(resolve));
    await db.query("DELETE FROM authorization_rules WHERE id='venue-review-deny'");
  }
};
