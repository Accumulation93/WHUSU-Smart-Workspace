'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const mysql=require('mysql2/promise');
const vm=require('node:vm');
function calendarEditor(post) {
  const filename=path.resolve(__dirname,'../../miniprogram/subpackages/workspace/components/calendar-editor/calendar-editor.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{
    Component(value){definition=value;},
    require(request){
      if(request.endsWith('/api'))return {callFunction:async input=>(await post(input.name,input.data)).json()};
      if(request.endsWith('/navigationBarMetrics'))return {getNavigationBarMetrics:()=>({totalHeight:64})};
      if(request.endsWith('/orgSession'))return {beginRequest:()=>1,isRequestCurrent:()=>true,getSnapshot:()=>({contextId:'test-context'})};
      return require(path.resolve(path.dirname(filename),request));
    }
  },{filename});
  return Object.assign({},definition.methods,{data:JSON.parse(JSON.stringify(definition.data)),_visible:true,
    triggerEvent(){},setData(patch){for(const [key,value] of Object.entries(patch)){const parts=key.split('.');let target=this.data;while(parts.length>1)target=target[parts.shift()];target[parts[0]]=value;}}});
}
async function main() {
  const host=process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1',port=Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database='calendar_test_'+process.pid+'_'+Date.now(),username='cal_'+process.pid,password=crypto.randomBytes(24).toString('hex');
  process.env.AUTH_IDENTITY_SECRET=crypto.randomBytes(32).toString('hex');
  const root=await mysql.createConnection({host,port,user:process.env.TEST_DB_ADMIN_USER || 'root',password:process.env.TEST_DB_ADMIN_PASSWORD || '',multipleStatements:true});
  let pool,server;
  const realNow=Date.now;
  // 测试活动固定在11月；业务时钟固定在活动前，避免测试随运行日期变为历史记录。
  Date.now=()=>Date.parse('2026-10-31T00:00:00.000Z');
  try {
    await root.query('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4');
    await root.query("CREATE USER '"+username+"'@'%' IDENTIFIED BY ?",[password]);
    await root.query('GRANT ALL PRIVILEGES ON `'+database+"`.* TO '"+username+"'@'%'");
    await root.query('USE `'+database+'`');
    await root.query(fs.readFileSync(path.join(__dirname,'../db/init.sql'),'utf8'));
    const sql=fs.readFileSync(path.join(__dirname,'../db/deploy/20261019210000_unified_calendar.sql'),'utf8');
    await root.query(sql); await root.query(sql);
    await root.query('CREATE TABLE cache_domain_versions(org_id VARCHAR(64),domain VARCHAR(32),version BIGINT UNSIGNED NOT NULL,PRIMARY KEY(org_id,domain))');
    await root.query(fs.readFileSync(path.join(__dirname,'../db/deploy/20261031160000_unified_authorization.sql'),'utf8'));
    await root.query(fs.readFileSync(path.join(__dirname,'../db/deploy/20261111100000_identity_nature_links.sql'),'utf8'));
    Object.assign(process.env,{DB_HOST:host,DB_PORT:String(port),DB_NAME:database,DB_USER:username,DB_PASSWORD:password});
    pool=require('../src/config/db');
    const model=require('../src/core/models/calendar');
    const authorize=async()=>({manage:false,rules:false}),admin=async()=>({manage:true,rules:true});
    await root.query("INSERT INTO organizations(id,name) VALUES ('org','组织甲'),('other','组织乙')");
    await root.query("INSERT INTO departments(id,name,org_id) VALUES ('d','部门甲','org')");
    await root.query("INSERT INTO identities(id,name,org_id) VALUES ('i','成员','org')");
    await root.query("INSERT INTO assignment_natures(id,org_id,name) VALUES ('staff','org','本会岗位')");
    await root.query("INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES ('org','i','staff')");
    for (const person of ['a','b','c']) {
      await root.query('INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?)',[person,person,person,person]);
      await root.query("INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,?,?,'org')",['h'+person,person,person]);
      await root.query("INSERT INTO organization_memberships(id,person_id,legacy_hr_id,org_id) VALUES (?,?,?,'org')",['m'+person,person,'h'+person]);
      await root.query("INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES (?,?,'org','staff','d','i')",['job'+person,'m'+person]);
    }
    const actor=personId=>({personId,organizationId:'org',assignmentId:'job'+personId,role:'user',contextId:'ctx'+personId});
    const window={from:'2026-11-01T00:00:00Z',to:'2026-12-01T00:00:00Z'};
    const input={title:'日程测试',description:'只读说明',location:'会议室',startDate:'2026-11-02',endDate:'2026-11-02',startTime:'09:00',endTime:'10:00',
      recurrence:{frequency:'daily',count:3},visibility:'private',reminders:[15]};
    const personal=await model.save(input,actor('a'),authorize);
    const savedCreator=(await root.query('SELECT creator_context_json FROM calendar_events WHERE id=?',[personal.id]))[0][0].creator_context_json;
    assert.equal(savedCreator.assignmentId,'joba');
    assert.equal(savedCreator.departmentName,'部门甲');
    assert.equal(savedCreator.identityCategoryName,'成员');
    assert.equal(savedCreator.personName,'a');
    const manager=model.actorSnapshot({...actor('a'),role:'admin',adminGrantId:'grant',identityName:'管理身份',adminLevel:'super'}, {people:[]});
    assert.equal(manager.assignmentId,'');assert.equal(manager.adminGrantId,'grant');
    assert.equal(manager.identityName,'管理身份');assert.equal(manager.adminLevel,'super');
    assert.equal(manager.departmentName,undefined);
    const unassigned=model.actorSnapshot({...actor('a'),assignmentId:''},{people:[{personId:'a',name:'a',assignments:[]}]});
    assert.equal(unassigned.assignmentStatus,'unassigned');assert.equal(unassigned.departmentName,undefined);
    assert.equal((await model.list(window,actor('a'),authorize)).items.length,3);
    assert.equal((await model.list({...window,managed:true},actor('b'),admin)).items.length,0);
    await assert.rejects(model.save({...input,visibility:'organization',targets:[{type:'people',personIds:['b']}]},actor('a'),authorize),e=>e.code==='forbidden');
    const rule=await model.saveRule({name:'本部门',enabled:true,audience:[{type:'people',personIds:['a']}],targets:[{type:'scope',sameDepartment:true}],actions:['assign','update','cancel']},actor('a'),admin);
    const event=await model.save({...input,visibility:'organization',targets:[{type:'scope',sameDepartment:true}]},actor('a'),authorize);
    let items=(await model.list({...window,detailId:event.id,occurrenceDate:'2026-11-02'},actor('b'),authorize)).items;
    assert.equal(items.length,3); assert.equal(items[0].participants.length,3);
    assert(!JSON.stringify(items).includes('student')); assert(!JSON.stringify(items[0].participants).includes('personId'));
    await model.mutate({id:event.id,version:event.version,action:'leave',scope:'instance',occurrenceDate:'2026-11-02'},actor('b'),authorize);
    assert.equal((await model.list(window,actor('b'),authorize)).items.length,2);
    await model.mutate({id:event.id,version:2,action:'leave',scope:'following',occurrenceDate:'2026-11-03'},actor('b'),authorize);
    assert.equal((await model.list(window,actor('b'),authorize)).items.length,0);
    await root.query("UPDATE membership_assignments SET status='inactive' WHERE id='jobb'");
    await root.query("UPDATE membership_assignments SET status='active' WHERE id='jobb'");
    assert.equal((await model.list(window,actor('b'),authorize)).items.length,0);
    await assert.rejects(model.mutate({id:event.id,version:3,action:'cancel',scope:'series',occurrenceDate:'2026-11-02'},actor('c'),authorize),e=>e.code==='forbidden');
    await assert.rejects(model.save({...input,...personal,version:99},actor('a'),authorize),e=>e.code==='conflict');
    const changed=await model.save({...input,...personal,title:'改后',scope:'instance',occurrenceDate:'2026-11-03',startDate:'2026-11-03',endDate:'2026-11-03',startTime:'11:00',endTime:'12:00'},actor('a'),authorize);
    items=(await model.list(window,actor('a'),authorize)).items.filter(item=>item.id===personal.id);
    assert.equal(items[1].title,'改后'); assert.equal(items[1].startAt,'2026-11-03T03:00:00.000Z'); assert.equal(items[0].title,input.title);
    await model.mutate({id:personal.id,version:changed.version,action:'cancel',scope:'following',occurrenceDate:'2026-11-03'},actor('a'),authorize);
    assert.equal((await model.list(window,actor('a'),authorize)).items.filter(item=>item.id===personal.id).length,1);
    await model.save({...input,id:personal.id,version:changed.version+1,title:'整体改名',scope:'series'},actor('a'),authorize);
    assert.equal((await model.list(window,actor('a'),authorize)).items.filter(item=>item.id===personal.id).length,1);
    await assert.rejects(model.batchRules({action:'delete',rules:[rule,{id:'missing',version:1}]},actor('a'),admin),e=>e.code==='conflict');
    const ruleConfiguration=await model.configuration(actor('a'),admin,true);
    assert.equal(ruleConfiguration.rules.length,1);
    assert.equal(ruleConfiguration.people.find(person=>person.personId==='a').assignments[0].assignmentNatureName,'本会岗位');
    await model.batchRules({action:'disable',rules:[rule]},actor('a'),admin);
    await assert.rejects(model.save({...input,id:event.id,version:3,visibility:'organization',targets:[{type:'scope',sameDepartment:true}]},actor('a'),authorize),e=>e.code==='forbidden');
    assert.equal((await model.list(window,{...actor('a'),organizationId:'other'},authorize)).items.length,0);
    const moved=await model.save({...input,recurrence:{frequency:'none'},reminders:[]},actor('a'),authorize);
    await model.save({...input,...moved,recurrence:{frequency:'none'},reminders:[],scope:'instance',occurrenceDate:'2026-11-02',startDate:'2026-12-10',endDate:'2026-12-10'},actor('a'),authorize);
    const movedDetail=(await model.list({...window,detailId:moved.id,occurrenceDate:'2026-11-02'},actor('a'),authorize)).items.find(item=>item.id===moved.id);
    assert.equal(movedDetail.startAt,'2026-12-10T01:00:00.000Z');
    await model.mutate({id:moved.id,version:2,action:'cancel',scope:'instance',occurrenceDate:'2026-11-02'},actor('a'),authorize);
    await root.query("INSERT INTO venues(id,name) VALUES ('venue','会议室')");
    await root.query("INSERT INTO venue_bookings(id,venue_id,creator_person_id,creator_org_id,title,time_start,time_end,status) VALUES ('legacy-booking','venue','b','org','历史会议','2026-09-04 14:10:00','2026-09-04 15:59:00','approved')");
    const legacyInput={sourceKind:'venue_booking',sourceId:'legacy-booking',occurrenceDate:'2026-09-04'};
    for (const status of ['approved','cancelled','rejected']) {
      await root.query('UPDATE venue_bookings SET status=? WHERE id=?',[status,'legacy-booking']);
      const emptyLegacy=await model.getParticipants(legacyInput,actor('a'),authorize);
      assert.deepEqual(emptyLegacy,{id:null,version:0,canEdit:false,targets:[],participants:[]});
    }
    const legacyEdit=await model.getParticipants({...legacyInput,edit:true},actor('a'),authorize);
    assert.equal(legacyEdit.people,undefined);assert.deepEqual(legacyEdit.targets,[]);assert.equal(legacyEdit.canEdit,false);
    await assert.rejects(model.getParticipants(legacyInput,{...actor('a'),organizationId:'other'},authorize),e=>e.code==='forbidden');
    await assert.rejects(model.getParticipants({...legacyInput,sourceId:'missing'},actor('a'),authorize),e=>e.code==='forbidden');
    assert.equal((await root.query("SELECT COUNT(*) AS total FROM calendar_events WHERE source_id='legacy-booking'"))[0][0].total,0);
    await root.query("INSERT INTO venue_bookings(id,venue_id,creator_person_id,creator_org_id,title,time_start,time_end,status) VALUES ('booking','venue','a','org','场地会议','2026-11-05 01:00:00','2026-11-05 02:00:00','pending')");
    const booking=await model.saveParticipants({sourceKind:'venue_booking',sourceId:'booking',targets:[{type:'people',personIds:['a','b']}]},actor('a'),authorize);
    const sourceCreator=(await root.query('SELECT creator_context_json FROM calendar_events WHERE id=?',[booking.id]))[0][0].creator_context_json;
    assert.equal(sourceCreator.departmentName,'部门甲');assert.equal(sourceCreator.identityCategoryName,'成员');
    const sourceConfiguration=await model.getParticipants({sourceKind:'venue_booking',sourceId:'booking',edit:true},actor('a'),authorize);
    assert.equal(sourceConfiguration.people.find(person=>person.personId==='a').assignments[0].assignmentNatureName,'本会岗位');
    await root.query("UPDATE departments SET name='部门改名' WHERE id='d'");
    const unchangedCreator=(await root.query('SELECT creator_context_json FROM calendar_events WHERE id=?',[personal.id]))[0][0].creator_context_json;
    assert.equal(unchangedCreator.departmentName,'部门甲');
    await root.query("UPDATE departments SET name='部门甲' WHERE id='d'");
    assert(!(await model.list(window,actor('b'),authorize)).items.some(item=>item.id===booking.id));
    await root.query("UPDATE venue_bookings SET status='approved' WHERE id='booking'");
    await assert.rejects(model.getParticipants({sourceKind:'venue_booking',sourceId:'booking'},actor('c'),authorize),e=>e.code==='forbidden');
    assert((await model.list(window,actor('b'),authorize)).items.some(item=>item.id===booking.id));
    await model.mutate({...booking,action:'leave',scope:'series',occurrenceDate:'2026-11-05'},actor('b'),authorize);
    const roster=await model.getParticipants({sourceKind:'venue_booking',sourceId:'booking',occurrenceDate:'2026-11-05'},actor('a'),authorize);
    assert.deepEqual(roster.participants.map(person=>person.name),['a']);
    await root.query("UPDATE venue_bookings SET status='cancelled' WHERE id='booking'");
    const cancelledRoster=await model.getParticipants({sourceKind:'venue_booking',sourceId:'booking'},actor('a'),authorize);
    assert.equal(cancelledRoster.participants.length,1);assert.equal(cancelledRoster.canEdit,false);
    assert.equal((await model.getParticipants({sourceKind:'venue_booking',sourceId:'booking'},actor('c'),async()=>({venueBookings:true}))).participants.length,1);
    await assert.rejects(model.getParticipants({sourceKind:'venue_booking',sourceId:'booking'},actor('c'),authorize),e=>e.code==='unavailable');
    await assert.rejects(model.getParticipants({sourceKind:'venue_booking',sourceId:'booking'},{...actor('a'),organizationId:'other'},authorize),e=>e.code==='forbidden');
    await assert.rejects(model.saveParticipants({sourceKind:'venue_booking',sourceId:'booking',version:booking.version,targets:[{type:'self'}]},actor('a'),authorize),e=>e.code==='unavailable');
    assert(!(await model.list(window,actor('a'),authorize)).items.some(item=>item.id===booking.id));
    await root.query("INSERT INTO venue_activity_rules(id,venue_id,activity_name,cycle_type,cycle_values,time_start,time_end) VALUES ('activity','venue','例会','daily','[]','14:00:00','15:00:00')");
    const emptyRoster=await model.getParticipants({sourceKind:'venue_activity',sourceId:'activity'},actor('b'),authorize);
    assert.deepEqual(emptyRoster.participants,[]);assert.equal(emptyRoster.canEdit,false);
    const emptyEdit=await model.getParticipants({sourceKind:'venue_activity',sourceId:'activity',edit:true},actor('b'),authorize);
    assert.deepEqual(emptyEdit.participants,[]);assert.deepEqual(emptyEdit.targets,[]);assert.equal(emptyEdit.people,undefined);
    await assert.rejects(model.getParticipants({sourceKind:'venue_activity',sourceId:'missing'},actor('b'),authorize),e=>e.code==='forbidden');
    const venueAdmin=async()=>({manage:true,rules:true,venueResources:true});
    const activity=await model.saveParticipants({sourceKind:'venue_activity',sourceId:'activity',targets:[{type:'people',personIds:['b']}]},actor('a'),venueAdmin);
    assert.equal((await model.getParticipants({sourceKind:'venue_activity',sourceId:'activity',occurrenceDate:'2026-11-05'},actor('b'),authorize)).participants.length,1);
    await assert.rejects(model.getParticipants({sourceKind:'venue_activity',sourceId:'activity',occurrenceDate:'2026-11-05'},actor('c'),authorize),e=>e.code==='forbidden');
    assert.equal((await model.list(window,actor('b'),authorize)).items.filter(item=>item.id===activity.id).length,30);
    await model.mutate({...activity,action:'leave',scope:'following',occurrenceDate:'2026-11-10'},actor('b'),authorize);
    assert.equal((await model.list(window,actor('b'),authorize)).items.filter(item=>item.id===activity.id).length,9);
    await root.query("UPDATE venue_activity_rules SET is_active=0 WHERE id='activity'");
    assert(!(await model.list(window,actor('b'),authorize)).items.some(item=>item.id===activity.id));
    const repeated={...input,clientRequestId:'calendar-repeat-check',recurrence:{frequency:'none'},reminders:[]};
    const once=await model.save(repeated,actor('c'),authorize);
    assert.deepEqual(await model.save(repeated,actor('c'),authorize),once);
    assert.equal((await root.query('SELECT COUNT(*) AS total FROM calendar_events WHERE id=?',[once.id]))[0][0].total,1);
    const reminderEvent=await model.save({...input,recurrence:{frequency:'none'},reminders:[15]},actor('c'),authorize);
    const reminders=require('../src/core/models/calendarReminders');
    const due=Date.parse('2026-11-02T00:45:00Z');
    await reminders.processOrganization('org',due);
    await reminders.processOrganization('org',due);
    assert.equal((await root.query('SELECT COUNT(*) AS total FROM calendar_reminder_receipts WHERE event_id=?',[reminderEvent.id]))[0][0].total,1);
    assert.equal((await root.query('SELECT COUNT(*) AS total FROM notifications WHERE target_id=?',[reminderEvent.id]))[0][0].total,1);
    const subscription=require('../src/core/models/calendarSubscription');
    await root.query("INSERT INTO accounts(id,person_id,status) VALUES ('account-a','a','verified')");
    const feed=await subscription.manage({action:'create'},actor('a'),'account-a',authorize);
    const basic='Basic '+Buffer.from('calendar:'+feed.password).toString('base64');
    assert.equal(subscription.credential(basic),feed.password);
    assert.equal(subscription.credential('Bearer '+feed.password),'');
    assert((await subscription.feed(basic,due)).includes('BEGIN:VCALENDAR'));
    await root.query("UPDATE accounts SET status='frozen' WHERE id='account-a'");
    await assert.rejects(subscription.feed(basic,due),e=>e.code==='forbidden');
    await root.query("UPDATE accounts SET status='verified' WHERE id='account-a'");
    await subscription.manage({action:'revoke'},actor('a'),'account-a',authorize);
    await assert.rejects(subscription.feed(basic,due),e=>e.code==='forbidden');
    const app=require('express')();app.use(require('express').json());
    const currentActor=(await require('../src/core/models/unifiedIdentity').listContexts('account-a',root))[0];
    let calendarActor=currentActor,calendarSession=null;
    app.use((req,res,next)=>{
      if(req.headers['x-test-auth']==='yes'){
        req.authAccount={id:calendarActor.personId==='calendar-super'?'account-calendar-super':'account-a',personId:calendarActor.personId};
        req.authContext=calendarActor;
        if(calendarSession)req.authSession=calendarSession;
      }
      next();
    });
    app.use('/api',require('../src/core/routes/calendar'));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const post=(name,body,authenticated=true)=>fetch('http://127.0.0.1:'+server.address().port+'/api/'+name,{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{'X-Test-Auth':'yes'}:{})},body:JSON.stringify(body)});
    assert.equal((await post('getCalendar',window,false)).status,401);
    const httpRoster=await (await post('getCalendarParticipants',{sourceKind:'venue_booking',sourceId:'booking'})).json();
    assert.equal(httpRoster.status,'success');assert.equal(httpRoster.canEdit,false);assert.equal(httpRoster.participants.length,1);
    const httpEmptyRoster=await (await post('getCalendarParticipants',legacyInput)).json();
    assert.equal(httpEmptyRoster.status,'success');assert.equal(httpEmptyRoster.canEdit,false);
    assert.deepEqual(httpEmptyRoster.participants,[]);assert.equal(httpEmptyRoster.people,undefined);
    assert.equal((await post('getCalendarParticipants',legacyInput,false)).status,401);
    const saved=await (await post('saveCalendarEvent',{...input,title:'浏览器参数保存回读',clientRequestId:'http-frontend-parameters',recurrence:{frequency:'none'}})).json();
    assert.equal(saved.status,'success');
    const readback=await (await post('getCalendar',{...window,detailId:saved.id,occurrenceDate:input.startDate})).json();
    assert.equal(readback.items.find(item=>item.id===saved.id).title,'浏览器参数保存回读');
    for(const scope of ['instance','following']){
      const created=await (await post('saveCalendarEvent',{...input,title:'范围切换保存回读',clientRequestId:'scope-drafts-'+scope})).json();
      assert.equal(created.status,'success');
      const editor=calendarEditor(post);
      editor.initialize({id:created.id,date:'2026-11-03'});
      await editor.load();
      assert.equal(editor.data.failed,false,editor.data.notice);
      assert.equal(editor.data.draft.startDate,'2026-11-03');
      editor.scope({detail:{value:'2'}});
      assert.equal(editor.data.draft.startDate,'2026-11-02');
      editor.frequency({detail:{value:'2'}});
      editor.allDay({detail:{value:true}});
      editor.endMode({detail:{value:'0'}});
      editor.scope({detail:{value:scope==='instance'?'0':'1'}});
      assert.equal(editor.data.draft.startDate,'2026-11-03');
      assert.equal(editor.data.draft.recurrence.frequency,'daily');
      assert.equal(editor.data.draft.allDay,false);
      editor.field({currentTarget:{dataset:{field:'title'}},detail:{value:'当前范围已修改'}});
      await editor.save();
      assert.equal(editor.data.saved,true,editor.data.notice);
      const result=await (await post('getCalendar',{...window,detailId:created.id,occurrenceDate:'2026-11-03'})).json();
      assert.equal(result.status,'success');
      const rows=result.items.filter(item=>item.id===created.id);
      assert.equal(rows.length,3);
      assert.equal(rows.find(item=>item.occurrenceDate==='2026-11-02').title,'范围切换保存回读');
      assert.equal(rows.find(item=>item.occurrenceDate==='2026-11-03').title,'当前范围已修改');
      assert.equal(rows.find(item=>item.occurrenceDate==='2026-11-03').startAt,'2026-11-03T01:00:00.000Z');
      assert.equal(rows.find(item=>item.occurrenceDate==='2026-11-04').title,scope==='following'?'当前范围已修改':'范围切换保存回读');
      const persisted=(await root.query('SELECT spec_json FROM calendar_events WHERE id=?',[created.id]))[0][0].spec_json;
      assert.equal(persisted.recurrence.frequency,'daily');
      assert.equal(persisted.recurrence.count,3);
    }
    const denied=await (await post('saveCalendarEvent',{...input,visibility:'organization',targets:[{type:'people',personIds:['b']}]})).json();
    assert.equal(denied.status,'calendar_forbidden');
    app.use('/venue',(req,res,next)=>require('../src/utils/orgContext').orgStorage.run('org',next));
    app.use('/venue',require('../src/modules/venue/routes/venueUser'));
    app.use('/venue',require('../src/modules/venue/routes/venueApprovalAdmin'));
    const venuePost=async(name,id)=>(await fetch('http://127.0.0.1:'+server.address().port+'/venue/'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Auth':'yes'},body:JSON.stringify({id})})).json();
    await root.query("INSERT INTO venue_bookings(id,venue_id,creator_person_id,creator_org_id,approval_org_id,title,time_start,time_end,status) VALUES ('http-cancel','venue','a','org','org','取消测试',DATE_ADD(NOW(),INTERVAL 1 DAY),DATE_ADD(NOW(),INTERVAL 2 DAY),'approved'),('http-end','venue','a','org','org','结束测试',DATE_SUB(NOW(),INTERVAL 1 HOUR),DATE_ADD(NOW(),INTERVAL 1 HOUR),'approved')");
    assert.equal((await venuePost('cancelVenueBooking','http-cancel')).status,'success');
    await root.query("UPDATE venue_bookings SET time_start=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),time_end=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id='http-end'");
    const endResponse=await venuePost('endVenueBooking','http-end');
    assert.equal(endResponse.status,'success',JSON.stringify(endResponse));
    const flowService=require('../src/modules/venue/services/venueApprovalMultiFlow');
    const assignmentService=require('../src/modules/venue/services/venueAssignmentContext');
    const applicantAssignment=await assignmentService.loadAssignmentById(currentActor.assignmentId,'org',true,root);
    const definition=flowService.buildFlowDefinitionSnapshot([{id:'expired-flow',name:'流程'}],{'expired-flow':[{id:'expired-step',name:'审批',approval_mode:'hr_rule',rules:[{department_scope:'all',work_group_scope:'all',identity_scope:'all'}]}]},'expired-flow','org',assignmentService.toRuleProfile(applicantAssignment));
    await root.query("INSERT INTO venue_bookings(id,venue_id,creator_person_id,creator_org_id,approval_org_id,title,time_start,time_end,status,approval_flow_id,approval_total_steps,approval_current_step,creator_context_snapshot,approval_flow_snapshot_json,approval_snapshots_json) VALUES ('http-expired','venue','a','org','org','已过期',DATE_SUB(NOW(),INTERVAL 2 HOUR),DATE_SUB(NOW(),INTERVAL 1 HOUR),'pending','expired-flow',1,0,?,?,'[]')",[JSON.stringify(assignmentService.toAssignmentSnapshot(applicantAssignment)),JSON.stringify(definition)]);
    await root.query("UPDATE venue_bookings SET time_start=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY),time_end=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id='http-expired'");
    const expiredResponse=await venuePost('approveVenueBookingStep','http-expired');
    assert.equal(expiredResponse.status,'expired',JSON.stringify(expiredResponse));
    assert.equal((await root.query("SELECT status FROM venue_bookings WHERE id='http-expired'"))[0][0].status,'cancelled');
    const httpActions=(await root.query("SELECT detail_json FROM auth_audit_events WHERE event_type IN ('venue_booking_cancelled','venue_booking_ended')"))[0];
    assert.equal(httpActions.length,3);
    httpActions.forEach(row=>{
      const detail=typeof row.detail_json==='string'?JSON.parse(row.detail_json):row.detail_json;
      assert.equal(detail.actorSnapshot.organizationId,'org');
      assert.equal(detail.actorSnapshot.assignmentSnapshot.assignmentId,currentActor.assignmentId);
    });
    await root.query("DELETE FROM auth_audit_events WHERE event_type IN ('venue_booking_cancelled','venue_booking_ended')");
    await root.query("UPDATE accounts SET status='frozen' WHERE id='account-a'");
    assert.equal((await (await post('getCalendar',window)).json()).status,'calendar_forbidden');
    const bookings=require('../src/modules/venue/models/venueBooking');
    const bookingActor={...actor('a'),type:'user',name:'a',assignment:{assignmentId:'joba',personId:'a',organizationId:'org',departmentId:'d',identityCategoryId:'i',departmentName:'部门甲',identityCategoryName:'成员'}};
    await root.query("INSERT INTO venue_bookings(id,venue_id,creator_org_id,title,time_start,time_end,status,approver_person_id,approval_comment) VALUES ('action-test','venue','org','动作保存','2026-11-05 01:00:00','2026-11-05 02:00:00','approved','b','原审批意见')");
    await bookings.updateTimeEnd('action-test','2026-11-05 01:30:00',null,bookingActor);
    await bookings.updateStatus('action-test','cancelled','ha','申请人取消',null,bookingActor);
    const cancelled=(await root.query("SELECT * FROM venue_bookings WHERE id='action-test'"))[0][0];
    assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.approver_person_id,'b');assert.equal(cancelled.approval_comment,'原审批意见');
    const actionRows=(await root.query("SELECT event_type,detail_json FROM auth_audit_events WHERE event_type IN ('venue_booking_cancelled','venue_booking_ended')"))[0];
    assert.equal(actionRows.length,2);
    actionRows.forEach(row=>{
      const detail=typeof row.detail_json==='string' ? JSON.parse(row.detail_json) : row.detail_json;
      assert.equal(detail.actorSnapshot.assignmentSnapshot.departmentName,'部门甲');
    });
    await assert.rejects(pool.withTransaction(async connection=>{
      await bookings.updateTimeEnd('action-test','2026-11-05 01:45:00',connection,bookingActor);
      throw new Error('test rollback');
    }),/test rollback/);
    assert.equal((await root.query("SELECT COUNT(*) AS total FROM auth_audit_events WHERE event_type='venue_booking_ended'"))[0][0].total,1);
    assert.equal((await root.query("SELECT DATE_FORMAT(time_end,'%H:%i:%s') AS ended FROM venue_bookings WHERE id='action-test'"))[0][0].ended,'01:30:00');
    await assert.rejects(bookings.updateStatus('action-test','cancelled','ha','',null,{...bookingActor,organizationId:'other'}),error=>error.message===require('../src/locales/zh-CN/generated/modules/venue/routes/venueUser').copy_d76adefd6d);
    const retiredResult=await require('../src/core/services/currentActor').resolveCurrentActor({authAccount:{id:'account-a',personId:'a'},
      authContext:{...currentActor,role:'admin',adminGrantId:'test-admin-grant',adminLevel:'admin'}});
    assert.equal(retiredResult.ok,false);
    const managerResult=await require('../src/core/services/currentActor').resolveCurrentActor({authAccount:{id:'account-a',personId:'a'},
      authContext:{...currentActor,role:'admin',adminGrantId:'test-admin-grant',adminLevel:'super_admin'}});
    assert.equal(managerResult.ok,true);assert.equal(managerResult.actor.organizationId,'org');
    assert.equal(managerResult.actor.adminGrantId,'test-admin-grant');assert.equal(managerResult.actor.adminLevel,'super_admin');
    await bookings.updateStatus('action-test','cancelled','', '管理取消',null,managerResult.actor);
    const managerAudit=(await root.query("SELECT detail_json FROM auth_audit_events WHERE event_type='venue_booking_cancelled' ORDER BY created_at,id"))[0]
      .map(row=>typeof row.detail_json==='string'?JSON.parse(row.detail_json):row.detail_json).find(detail=>detail.actorSnapshot.role==='admin');
    assert.equal(managerAudit.actorSnapshot.adminGrantId,'test-admin-grant');assert.equal(managerAudit.actorSnapshot.adminLevel,'super_admin');
    assert.equal(managerAudit.actorSnapshot.assignmentSnapshot,null);
    await root.query(fs.readFileSync(path.join(__dirname,'../db/deploy/20261102193000_authorization_runtime_transition.sql'),'utf8'));
    await root.query(fs.readFileSync(path.join(__dirname,'../db/deploy/20261122153000_unified_identity_assignment_links.sql'),'utf8'));
    await root.query(fs.readFileSync(path.join(__dirname,'../db/deploy/20261122170000_authorization_grant_sources.sql'),'utf8'));
    await root.query(`UPDATE authorization_runtime_transition SET phase='enforced',minimum_protocol=3 WHERE id=1;
      INSERT INTO authorization_organizations(org_id,mode) VALUES ('org','enforced') ON DUPLICATE KEY UPDATE mode='enforced';
      INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('calendar-super','超管日程例','CALENDAR-SUPER','calendar-super');
      INSERT INTO accounts(id,person_id) VALUES ('account-calendar-super','calendar-super');
      INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('grant-calendar-super','calendar-super','','super_admin')`);
    calendarActor=(await require('../src/core/models/unifiedIdentity').listContexts('account-calendar-super',root)).find(item=>item.organizationId==='org');
    calendarSession={id:'session-calendar-super'};
    await root.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
      organization_id,role,token_version,expires_at)
      VALUES ('session-calendar-super','account-calendar-super','',?,'admin','grant-calendar-super','org','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`,
    [calendarActor.contextId]);
    const superSaved=await (await post('saveCalendarEvent',{...input,title:'超管个人日程测试',recurrence:{frequency:'none'}})).json();
    assert.equal(superSaved.status,'success',JSON.stringify(superSaved));
    const [[superSavedRow]]=await root.query('SELECT creator_context_json FROM calendar_events WHERE id=?',[superSaved.id]);
    assert.equal(superSavedRow.creator_context_json.personId,'calendar-super');
    assert.equal(superSavedRow.creator_context_json.assignmentId,calendarActor.effectiveAssignmentId);
    assert.equal(superSavedRow.creator_context_json.systemRole,'super_admin');
    const superItems=await (await post('getCalendar',window)).json();
    assert.equal(superItems.status,'success',JSON.stringify(superItems));
    assert(superItems.items.some(event=>event.id===superSaved.id));
    calendarActor=currentActor;calendarSession={id:'session-calendar-ordinary'};
    await root.query("UPDATE accounts SET status='verified' WHERE id='account-a'");
    await root.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
      organization_id,role,token_version,expires_at)
      VALUES ('session-calendar-ordinary','account-a','',?,'assignment',?,'org','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`,
    [currentActor.contextId,currentActor.assignmentId]);
    const ordinaryItems=await (await post('getCalendar',window)).json();
    assert.equal(ordinaryItems.status,'success',JSON.stringify(ordinaryItems));
    assert(!ordinaryItems.items.some(event=>event.id===superSaved.id));
    await root.query("UPDATE venue_bookings SET status='approved' WHERE id='booking'");
    const subscriptionResponse=await post('manageCalendarSubscription',{action:'create'});
    assert.equal(subscriptionResponse.status,200);
    const subscriptionCredentials=await subscriptionResponse.json();
    assert.equal(subscriptionCredentials.status,'success');
    const accessHeader='Basic '+Buffer.from('calendar:'+subscriptionCredentials.password).toString('base64');
    async function readCalendarFeed(){
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/calendarFeed',{headers:{Authorization:accessHeader}});
      assert.equal(response.status,200);
      return response.text();
    }
    let feedBody=await readCalendarFeed();
    assert(feedBody.includes('SUMMARY:整体改名'));
    assert(feedBody.includes('SUMMARY:场地会议'));
    const retiredBusinessDeny={id:'calendar-old-business-deny',organizationId:'org',effect:'deny',enabled:true,
      subjects:[{kind:'assignments',ids:['joba']}],capabilities:['calendar.events.read','venue.bookingParticipants.read'],
      scopes:[{kind:'organization'}],fields:null};
    await root.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,'org','Old business restriction',?)",
      [retiredBusinessDeny.id,JSON.stringify(retiredBusinessDeny)]);
    feedBody=await readCalendarFeed();
    assert(feedBody.includes('SUMMARY:整体改名'));
    assert(feedBody.includes('SUMMARY:场地会议'));
    assert.equal((await (await post('getCalendarParticipants',{sourceKind:'venue_booking',sourceId:'booking'})).json()).status,'success');
    await root.query('DELETE FROM authorization_rules WHERE id=?',[retiredBusinessDeny.id]);
    await root.query("INSERT INTO authorization_basic_role_exclusions VALUES ('org','calendar.events.read')");
    feedBody=await readCalendarFeed();
    assert(feedBody.includes('SUMMARY:整体改名'));
    assert(feedBody.includes('SUMMARY:场地会议'));
    await root.query("DELETE FROM authorization_basic_role_exclusions WHERE org_id='org' AND capability_key='calendar.events.read'");
    await root.query("INSERT INTO authorization_basic_role_exclusions VALUES ('org','venue.bookingParticipants.read')");
    feedBody=await readCalendarFeed();
    assert(feedBody.includes('SUMMARY:整体改名'));
    assert(feedBody.includes('SUMMARY:场地会议'));

    const sourceGrant={id:'calendar-delegated-booking',organizationId:'org',effect:'allow',enabled:true,
      capabilities:['venue.bookingParticipants.read'],subjects:[{kind:'assignments',ids:['joba']}],
      scopes:[{kind:'records',ids:['booking']}],fields:null,startsAt:null,endsAt:null};
    await root.query("INSERT INTO accounts(id,person_id,status) VALUES ('account-calendar-delegator','b','verified')");
    await root.query(`INSERT INTO authorization_delegations (id,org_id,name,enabled,subjects_json,envelope_json)
      VALUES ('calendar-delegation','org','Calendar feed test',1,?,?)`,
    [JSON.stringify([{kind:'assignments',ids:['jobb']}]),JSON.stringify({...sourceGrant,id:'calendar-delegation'})]);
    await root.query(`INSERT INTO authorization_rules(id,org_id,name,policy_json)
      VALUES ('calendar-delegated-booking','org','Calendar source grant',?)`,[JSON.stringify(sourceGrant)]);
    await root.query(`INSERT INTO authorization_grant_sources(org_id,object_kind,object_id,parent_delegation_id,issuer_assignment_id)
      VALUES ('org','rule','calendar-delegated-booking','calendar-delegation','jobb')`);
    assert((await readCalendarFeed()).includes('SUMMARY:场地会议'));
    await root.query("UPDATE authorization_delegations SET enabled=0 WHERE org_id='org' AND id='calendar-delegation'");
    feedBody=await readCalendarFeed();
    assert(feedBody.includes('SUMMARY:整体改名'));
    assert(feedBody.includes('SUMMARY:场地会议'), '中心来源撤销不影响子应用确认的本人参与关系');
    await root.query(`INSERT INTO calendar_exits(id,org_id,event_id,person_id,occurrence_date,scope)
      VALUES ('feed-exit','org',?,'a','2026-11-05','series')`,[booking.id]);
    assert(!(await readCalendarFeed()).includes('SUMMARY:场地会议'), '退出业务活动后，不再读取该日程');
    const settingsRevoked=await post('manageCalendarSubscription',{action:'revoke'});
    assert.equal((await settingsRevoked.json()).revoked,true);
    const revokedFeed=await fetch('http://127.0.0.1:'+server.address().port+'/api/calendarFeed',{headers:{Authorization:accessHeader}});
    assert.equal(revokedFeed.status,401);
    console.log('PASS 日程及场地动作隔离数据库：创建岗位保存回读、真实小程序范围切换后本次及以后保存回读、管理员无岗位、取消保留审批人、提前结束及审计同事务回滚');
  } finally {
    Date.now=realNow;
    if(server)await new Promise(resolve=>server.close(resolve));
    if (pool) await pool.end();
    await root.query('DROP DATABASE IF EXISTS `'+database+'`');
    await root.query("DROP USER IF EXISTS '"+username+"'@'%'"); await root.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
