'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function directoryAuthorizationCases(db) {
  await db.query(`INSERT INTO organizations(id,name) VALUES ('dir-auth','通讯录授权测试');
    INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('dir-person','测试人员','DIR-AUTH','DIR-AUTH');
    INSERT INTO accounts(id,person_id) VALUES ('dir-account','dir-person');
    INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('dir-hr','测试人员','DIR-AUTH','dir-auth');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('dir-membership','dir-person','dir-auth','dir-hr');
    INSERT INTO departments(id,name,org_id) VALUES ('dir-department','部门','dir-auth');
    INSERT INTO identities(id,name,org_id) VALUES ('dir-identity','身份','dir-auth');
    INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
      VALUES ('dir-assignment','dir-membership','dir-auth','staff','dir-department','dir-identity');
    INSERT IGNORE INTO assignment_natures(id,org_id,name) VALUES ('staff','dir-auth','本会岗位');
    INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES ('dir-session','dir-account','','dir-context','assignment','dir-assignment','dir-auth','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY);
    UPDATE authorization_organizations SET mode='enforced' WHERE org_id='dir-auth'`);
  const policy = { id: 'dir-policy', organizationId: 'dir-auth', effect: 'allow', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['dir-assignment'] }], capabilities: ['hr.directoryRules.read', 'hr.directoryRules.create', 'hr.directoryRules.update', 'hr.directoryRules.delete'],
    scopes: [{ kind: 'organization' }], fields: null };
  await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('dir-policy','dir-auth','规则维护',?)", [JSON.stringify(policy)]);
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    req.authAccount = { id: 'dir-account', personId: 'dir-person' };
    req.authSession = { id: 'dir-session' };
    req.authContext = { personId: 'dir-person', contextId: 'dir-context', organizationId: 'dir-auth', role: 'user', assignmentId: 'dir-assignment' };
    require('../../src/utils/orgContext').orgStorage.run('dir-auth', next);
  });
  app.use('/api', require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use('/api', require('../../src/core/routes/contactDirectory'));
  app.use('/api', require('../../src/core/routes/calendar'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body = {}) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return { code: response.status, data: await response.json() };
  }
  try {
    const view = require('../../../shared/contactDirectoryView');
    const input = view.blankRule(); input.name = '前端通讯录规则'; input.audience[0].personIds = ['dir-person'];
    input.targets = [{ type: 'self' }]; input.fieldIds = [];
    const saved = await call('saveContactDirectoryRule', view.payload(input));
    assert.equal(saved.data.status, 'success', JSON.stringify(saved));
    const first = saved.data.rule;
    const entryList = (await call('getContactDirectory', { summaryOnly: true })).data;
    assert.equal(entryList.status, 'success', JSON.stringify(entryList));
    assert.equal(entryList.groups.flatMap(group => group.items).length, 1);
    const contactKey = entryList.groups[0].items[0].key;
    assert.equal((await call('getContactDirectory', { key: contactKey })).data.contact.name, '测试人员');
    assert.equal((await call('resolvePersonLinks', { references: [{ kind: 'assignment', id: 'dir-assignment' }] })).data.links[0].target.kind, 'contact');
    const denyEntry = { ...policy, id: 'dir-entry-deny', capabilities: ['contacts.entries.read'], effect: 'deny',
      scopes: [{ kind: 'records', ids: ['dir-hr'] }] };
    await require('../../src/core/models/authorizationReferences').validateReferences(db, denyEntry);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('dir-entry-deny','dir-auth','拒绝人员读取',?)", [JSON.stringify(denyEntry)]);
    assert.deepEqual((await call('getContactDirectory', { summaryOnly: true })).data.groups, []);
    assert.equal((await call('getContactDirectory', { key: contactKey })).data.status, 'directory_contactUnavailable');
    assert.equal((await call('resolvePersonLinks', { references: [{ kind: 'assignment', id: 'dir-assignment' }] })).data.links[0].target, null);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='dir-entry-deny'", [JSON.stringify({ ...denyEntry,
      scopes: [{ kind: 'assignmentScope', dimensions: { departmentId: ['dir-department'] } }] })]);
    assert.deepEqual((await call('getContactDirectory', { summaryOnly: true })).data.groups, []);
    await db.query("DELETE FROM authorization_rules WHERE id='dir-entry-deny'");
    assert.equal((await call('getContactDirectory', { key: contactKey })).data.contact.name, '测试人员');
    const second = (await call('saveContactDirectoryRule', view.payload({ ...input, name: '第二条规则' }))).data.rule;
    assert(second);
    const edited = (await call('saveContactDirectoryRule', { ...first, name: '已编辑' })).data.rule;
    assert.equal(edited.name, '已编辑');
    assert.equal((await db.query('SELECT name FROM hr_contact_directory_rules WHERE id=?', [first.id]))[0][0].name, '已编辑');
    const narrowed = { ...policy, capabilities: ['hr.directoryRules.read', 'hr.directoryRules.update'], scopes: [{ kind: 'records', ids: [first.id] }] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='dir-policy'", [JSON.stringify(narrowed)]);
    const list = (await call('getContactDirectoryConfiguration')).data;
    assert.deepEqual(list.rules.map(rule => rule.id), [first.id]); assert.equal(list.canCreate, false);
    assert.equal(list.rules[0].canUpdate, true); assert.equal(list.rules[0].canDelete, false);
    const rejected = await call('batchContactDirectoryRules', { action: 'disable', rules: [edited, second] });
    assert.equal(rejected.code, 403);
    const [unchanged] = await db.query('SELECT enabled FROM hr_contact_directory_rules WHERE id IN (?,?)', [first.id, second.id]);
    assert(unchanged.every(row => row.enabled === 1));
    assert.equal((await call('saveContactDirectoryRule', { ...second, name: '越权修改' })).code, 403);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='dir-policy'", [JSON.stringify(policy)]);
    assert.equal((await call('batchContactDirectoryRules', { action: 'delete', rules: [edited, second] })).data.count, 2);
    assert.equal((await call('getContactDirectoryConfiguration')).data.rules.length, 0);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('dir-entry-allow','dir-auth','不能代替原规则',?)", [JSON.stringify({ ...policy,
      id: 'dir-entry-allow', capabilities: ['contacts.entries.read'] })]);
    assert.deepEqual((await call('getContactDirectory', { summaryOnly: true })).data.groups, [], '通讯录通用读取权不能代替具体人员与资料列规则');
    await db.query("DELETE FROM authorization_rules WHERE id='dir-entry-allow'");
    await db.query("UPDATE membership_assignments SET status='inactive' WHERE id='dir-assignment'");
    assert.equal((await call('saveContactDirectoryRule', view.payload(input))).code, 403);
    await db.query("UPDATE membership_assignments SET status='active' WHERE id='dir-assignment'");
    const calendarPolicy = { ...policy, capabilities: ['calendar.rules.read','calendar.rules.create','calendar.rules.update','calendar.rules.delete'] };
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='dir-policy'", [JSON.stringify(calendarPolicy)]);
    const calendarEntry=(await call('getCalendarConfiguration')).data;
    assert.equal(calendarEntry.permissions.rules,true,'普通岗位获授权后提供规则入口');
    assert.equal(calendarEntry.permissions.manage,false,'规则配置权不附带日程管理权');
    const calendarInput = { name:'日程安排规则', enabled:true, audience:[{type:'people',personIds:['dir-person']}],
      targets:[{type:'scope',sameDepartment:true}], actions:['assign','update','cancel'] };
    const calendarSaved = await call('saveCalendarRule', calendarInput);
    assert.equal(calendarSaved.data.status, 'success', JSON.stringify(calendarSaved));
    const calendarRule = calendarSaved.data.rule;
    const calendarSecond = (await call('saveCalendarRule', { ...calendarInput, name:'另一条日程规则' })).data.rule;
    const calendarEdited = (await call('saveCalendarRule', { ...calendarRule, name:'已更新日程规则' })).data.rule;
    assert.equal(calendarEdited.name, '已更新日程规则');
    assert.equal((await db.query('SELECT name FROM calendar_rules WHERE id=?',[calendarRule.id]))[0][0].name,'已更新日程规则');
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='dir-policy'", [JSON.stringify({ ...calendarPolicy,
      capabilities:['calendar.rules.read','calendar.rules.update'], scopes:[{kind:'records',ids:[calendarRule.id]}] })]);
    const calendarList = (await call('getCalendarRules')).data;
    assert.deepEqual(calendarList.rules.map(rule=>rule.id),[calendarRule.id]);
    assert.equal(calendarList.canCreate,false); assert.equal(calendarList.rules[0].canDelete,false);
    assert(!JSON.stringify(calendarList).includes('ruleAuthorization'));
    assert.equal((await call('batchCalendarRules',{action:'disable',rules:[calendarEdited,calendarSecond]})).code,403);
    assert((await db.query('SELECT enabled FROM calendar_rules WHERE id IN (?,?)',[calendarRule.id,calendarSecond.id]))[0].every(row=>row.enabled===1));
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='dir-policy'", [JSON.stringify(calendarPolicy)]);
    assert.equal((await call('batchCalendarRules',{action:'delete',rules:[calendarEdited,calendarSecond]})).data.count,2);
    assert.equal((await call('getCalendarRules')).data.rules.length,0);
    const eventInput={title:'权限验证日程',description:'保留说明',location:'会议室',startDate:'2030-11-02',endDate:'2030-11-02',
      startTime:'09:00',endTime:'10:00',recurrence:{frequency:'none'},visibility:'private',reminders:[15]};
    const window={from:'2030-11-01T00:00:00Z',to:'2030-11-04T00:00:00Z'};
    const createdEvent=(await call('saveCalendarEvent',eventInput)).data;
    assert.equal(createdEvent.status,'success',JSON.stringify(createdEvent));
    const eventId=createdEvent.id;
    const reminderActor={type:'user',id:'dir-hr',personId:'dir-person',contextId:'dir-context'};
    const reminderReference={accountId:'dir-account',personId:'dir-person',sessionId:'dir-session',contextId:'dir-context',organizationId:'dir-auth'};
    const reminderNow=Date.parse('2030-11-02T00:50:00Z');
    const reminders=async()=>{
      const access=await require('../../src/modules/audit/models/notificationAuthorization').prepare(db,reminderActor,'dir-auth',reminderReference);
      return require('../../src/modules/audit/models/notificationLifecycle').calendarKeys('dir-auth','dir-person',reminderNow,access.calendarPermissions,db);
    };
    assert.equal((await reminders()).keys.length,1,'有读取资格的日程产生当前提醒');
    const eventManager={...policy,id:'calendar-event-manager',capabilities:['calendar.events.read','calendar.events.update'],scopes:[{kind:'records',ids:[eventId]}]};
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('calendar-event-manager','dir-auth','指定日程管理',?)",[JSON.stringify(eventManager)]);
    assert.equal((await call('getCalendarConfiguration')).data.permissions.manage,true,'指定记录授权也能进入管理视图，但不授予全组织权');
    await db.query("DELETE FROM authorization_rules WHERE id='calendar-event-manager'");
    const reopened=(await call('getCalendar',{...window,detailId:eventId,occurrenceDate:'2030-11-02'})).data;
    assert.equal(reopened.items[0].title,eventInput.title);
    assert.equal(reopened.items[0].canUpdate,true);
    const subscriptionResult=(await call('manageCalendarSubscription',{action:'create'})).data;
    assert.equal(subscriptionResult.status,'success',JSON.stringify(subscriptionResult));
    const subscriptionModel=require('../../src/core/models/calendarSubscription');
    const feedCredential='Basic '+Buffer.from('calendar:'+subscriptionResult.password).toString('base64');
    const feedDate=Date.parse('2030-11-01T00:00:00Z');
    assert((await subscriptionModel.feed(feedCredential,feedDate)).includes(eventInput.title));
    const eventDeny={...policy,id:'calendar-event-deny',effect:'deny',capabilities:['calendar.events.read','calendar.events.update','calendar.events.cancel'],
      scopes:[{kind:'records',ids:[eventId]}]};
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('calendar-event-deny','dir-auth','日程禁止',?)",[JSON.stringify(eventDeny)]);
    assert.deepEqual((await call('getCalendar',window)).data.items,[]);
    assert.deepEqual((await reminders()).keys,[],'日程明确禁止同步隐藏通知提醒');
    assert(!(await subscriptionModel.feed(feedCredential,feedDate)).includes(eventInput.title),'手机日历订阅不能绕过日程读取禁止');
    assert.equal((await call('saveCalendarEvent',{...eventInput,id:eventId,version:1,title:'不得保存'})).data.status,'calendar_forbidden');
    assert.equal((await call('changeCalendarParticipation',{id:eventId,version:1,action:'cancel',scope:'series',occurrenceDate:'2030-11-02'})).data.status,'calendar_unavailable');
    assert.equal((await db.query('SELECT version FROM calendar_events WHERE id=?',[eventId]))[0][0].version,1);
    await db.query("UPDATE authorization_rules SET policy_json=? WHERE id='calendar-event-deny'",[JSON.stringify({...eventDeny,capabilities:['calendar.events.create'],scopes:[{kind:'organization'}]})]);
    assert.equal((await call('saveCalendarEvent',{...eventInput,title:'禁止新建'})).data.status,'calendar_forbidden');
    assert.equal((await db.query("SELECT COUNT(*) AS count FROM calendar_events WHERE org_id='dir-auth'"))[0][0].count,1);
    await db.query("DELETE FROM authorization_rules WHERE id='calendar-event-deny'");
    const updatedEvent=(await call('saveCalendarEvent',{...eventInput,id:eventId,version:1,title:'已修改日程'})).data;
    assert.equal(updatedEvent.status,'success',JSON.stringify(updatedEvent));
    assert.equal((await call('getCalendar',{...window,detailId:eventId,occurrenceDate:'2030-11-02'})).data.items[0].title,'已修改日程');
    assert.equal((await call('changeCalendarParticipation',{id:eventId,version:updatedEvent.version,action:'cancel',scope:'series',occurrenceDate:'2030-11-02'})).data.status,'success');
    assert.deepEqual((await call('getCalendar',window)).data.items,[]);
    assert.equal((await db.query('SELECT status FROM calendar_events WHERE id=?',[eventId]))[0][0].status,'cancelled');
    await db.query("INSERT INTO venues(id,name) VALUES ('dir-venue','隔离会议室'); INSERT INTO venue_bookings(id,venue_id,creator_person_id,creator_org_id,title,time_start,time_end,status) VALUES ('dir-booking','dir-venue','dir-person','dir-auth','借用会议','2030-11-02 01:00:00','2030-11-02 02:00:00','approved')");
    const rosterInput={sourceKind:'venue_booking',sourceId:'dir-booking',targets:[{type:'self'}]};
    const roster=(await call('saveCalendarParticipants',rosterInput)).data;
    assert.equal(roster.status,'success',JSON.stringify(roster));
    assert.equal((await call('getCalendarParticipants',rosterInput)).data.participants[0].name,'测试人员');
    const rosterDeny={...eventDeny,id:'calendar-roster-deny',capabilities:['venue.bookingParticipants.read','venue.bookingParticipants.update'],scopes:[{kind:'records',ids:['dir-booking']}]};
    await require('../../src/core/models/authorizationReferences').validateReferences(db,rosterDeny);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('calendar-roster-deny','dir-auth','名单禁止',?)",[JSON.stringify(rosterDeny)]);
    assert.equal((await call('getCalendarParticipants',rosterInput)).data.status,'calendar_forbidden');
    assert(!(await call('getCalendar',{...window,detailId:roster.id,occurrenceDate:'2030-11-02'})).data.items.some(item=>item.id===roster.id));
    assert(!(await subscriptionModel.feed(feedCredential,feedDate)).includes('借用会议'));
    assert.equal((await call('saveCalendarParticipants',{...rosterInput,version:roster.version})).data.status,'calendar_forbidden');
    assert.equal((await db.query('SELECT version FROM calendar_events WHERE id=?',[roster.id]))[0][0].version,1);
    await db.query("DELETE FROM authorization_rules WHERE id='calendar-roster-deny'");
    assert.equal((await call('saveCalendarParticipants',{...rosterInput,version:roster.version})).data.version,2);
    await db.query("INSERT INTO venue_activity_rules(id,venue_id,activity_name,cycle_type,cycle_values,time_start,time_end) VALUES ('dir-activity','dir-venue','周期会议','daily','[]','14:00:00','15:00:00')");
    const activityInput={sourceKind:'venue_activity',sourceId:'dir-activity',targets:[{type:'self'}]};
    assert.equal((await call('saveCalendarParticipants',activityInput)).data.status,'calendar_forbidden');
    const activityGrant={...policy,id:'calendar-activity-grant',capabilities:['venue.activityParticipants.read','venue.activityParticipants.update'],scopes:[{kind:'records',ids:['dir-activity']}]};
    await require('../../src/core/models/authorizationReferences').validateReferences(db,activityGrant);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('calendar-activity-grant','dir-auth','名单授权',?)",[JSON.stringify(activityGrant)]);
    const activityRoster=(await call('saveCalendarParticipants',activityInput)).data;
    assert.equal(activityRoster.status,'success',JSON.stringify(activityRoster));
    assert.equal((await call('getCalendarParticipants',activityInput)).data.participants[0].name,'测试人员');
    await db.query("DELETE FROM authorization_rules WHERE id='calendar-activity-grant'");
    assert.equal((await call('saveCalendarParticipants',{...activityInput,version:activityRoster.version})).data.status,'calendar_forbidden');
    assert.equal((await db.query('SELECT version FROM calendar_events WHERE id=?',[activityRoster.id]))[0][0].version,1);
  } finally { await new Promise(resolve => listener.close(resolve)); }
};
