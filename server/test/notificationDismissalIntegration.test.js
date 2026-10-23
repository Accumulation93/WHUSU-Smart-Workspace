'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const crypto = require('node:crypto');

async function main() {
  const database = 'notification_dismissal_test_' + process.pid + '_' + Date.now();
  const username = 'notice_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({host:'127.0.0.1',port:3362,user:process.env.TEST_DB_ADMIN_USER || 'root',password:process.env.TEST_DB_ADMIN_PASSWORD || '',multipleStatements:true});
  let pool, server;
  try {
    await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await admin.query("CREATE USER '" + username + "'@'%' IDENTIFIED BY ?", [password]);
    await admin.query('GRANT ALL PRIVILEGES ON `' + database + "`.* TO '" + username + "'@'%'");
    await admin.query('USE `' + database + '`');
    await admin.query(fs.readFileSync(path.join(__dirname,'../db/init.sql'),'utf8'));
    // 重现生产历史表与新增表的排序规则差异，不让测试库的统一默认值掩盖故障。
    await admin.query('ALTER TABLE notifications CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    const versionsMigration = fs.readFileSync(path.join(__dirname,'../db/deploy/20260907120000_performance_cache_versions.sql'),'utf8');
    const [versionTable, versionTriggers] = versionsMigration.split('DELIMITER $$');
    await admin.query(versionTable);
    for (const sql of versionTriggers.split('DELIMITER ;')[0].split('$$').map(value=>value.trim()).filter(Boolean)) await admin.query(sql);
    const migration = fs.readFileSync(path.join(__dirname,'../db/deploy/20261019200000_notification_person_dismissals.sql'),'utf8');
    await admin.query(fs.readFileSync(path.join(__dirname,'../db/deploy/20261019210000_unified_calendar.sql'),'utf8'));
    // 按迁移的客户端分隔符逐段执行，触发器正文保持完整。
    for (let run=0; run<2; run++) {
      const [tables, triggers] = migration.split('DELIMITER $$');
      await admin.query(tables);
      for (const sql of triggers.split('DELIMITER ;')[0].split('$$').map(value=>value.trim()).filter(Boolean)) await admin.query(sql);
    }
    const lifecycleMigration = fs.readFileSync(path.join(__dirname,'../db/deploy/20261023120000_notification_lifecycle_versions.sql'),'utf8');
    for (let run=0;run<2;run++) {
      const [tables,triggers]=lifecycleMigration.split('DELIMITER $$'); await admin.query(tables);
      for (const sql of triggers.split('DELIMITER ;')[0].split('$$').map(value=>value.trim()).filter(Boolean)) await admin.query(sql);
    }
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3362',DB_NAME:database,DB_USER:username,DB_PASSWORD:password,AUTH_IDENTITY_SECRET:'notification-dismissal-test-secret-32bytes'});
    pool = require('../src/config/db');
    await require('../src/core/models/cacheVersions').ensureReady();
    const model = require('../src/modules/audit/models/notification');
    const {orgStorage} = require('../src/utils/orgContext');
    await admin.query("INSERT INTO organizations(id,name) VALUES ('org','组织'),('other','其他组织')");
    await admin.query("INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('p','人员','p','p'),('q','他人','q','q')");
    const user={type:'user',id:'hr',personId:'p'}, manager={type:'admin',id:'admin',personId:'p'}, other={type:'user',id:'other-user',personId:'q'};
    const contexts=[user,manager].map((actor,i)=>({organizationId:'org',organizationName:'组织',contextId:'ctx'+i,actor}));
    const accessible = require('../src/core/services/accessibleOrganizations');
    accessible.listAccessibleActorContexts=async()=>contexts;
    const app = require('express')(); app.use(require('express').json());
    app.use((req,res,next)=>{req.authAccount={id:'account',personId:'p'};req.authContext={personId:'p',organizationId:'org',role:'user',contextId:'ctx0'};orgStorage.run('org',next);});
    app.use('/api',require('../src/modules/audit/routes/notification'));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const post=async(name,body={})=>(await fetch('http://127.0.0.1:'+server.address().port+'/api/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    const create=async(id,actor,event='event:round1',org='org')=>orgStorage.run(org,()=>model.create(id,{orgId:org,recipientType:actor.type,recipientId:actor.id,type:'system',title:'通知',eventKey:event+':'+actor.type+':'+actor.id}));
    const list=async(actor,org='org')=>orgStorage.run(org,()=>model.listForRecipient(actor,{limit:50}));
    await create('a',user); await create('b',manager); await create('c',other); await create('d',user,'event:round1','other');
    assert.equal((await list(user)).total,1);
    assert.equal((await post('listNotifications')).total,2);
    assert.equal((await post('deleteNotification',{id:'a',organizationId:'org',personId:'q'})).status,'success');
    assert.equal((await post('listNotifications')).total,0);
    assert.equal((await post('getNotificationUnreadCount')).count,0);
    assert.equal((await list(manager)).total,0);
    assert.equal((await list(other)).total,1);
    assert.equal((await list(user,'other')).total,1);
    assert.equal((await post('deleteNotification',{id:'c',organizationId:'org'})).status,'not_found');
    assert.equal((await post('deleteNotification',{id:'a',organizationId:'org'})).status,'success');
    await create('retry',user);
    assert.equal((await list(user)).total,0);
    // 收件副本已清理后重投仍隐藏；后来新岗位的相同业务事件也隐藏。
    await admin.query("DELETE FROM notifications WHERE id='a'");
    await create('redelivery',user);
    const newRole={type:'user',id:'new-job',personId:'p'};
    await create('new-job-copy',newRole);
    assert.equal((await list(newRole)).total,0);
    assert.equal((await list(user)).total,0);
    await create('new-round',user,'event:round2');
    assert.equal((await list(user)).total,1);
    // 历史自动键只消除身份部分，保留具体内容指纹。
    await create('legacy-a',user,'system:::user:hr:0123456789abcdef');
    await create('legacy-b',manager,'system:::admin:admin:0123456789abcdef');
    assert.equal((await post('deleteNotification',{id:'legacy-a',organizationId:'org'})).status,'success');
    assert.equal((await list(manager)).total,0);
    await create('legacy-new',manager,'system:::admin:admin:fedcba9876543210');
    assert.equal((await list(manager)).total,1);
    const beforeVersion=(await admin.query("SELECT version FROM cache_domain_versions WHERE org_id='org' AND domain='notification'"))[0][0].version;
    const clear=await post('deleteAllNotifications',{organizationId:'org'});
    assert.equal(clear.status,'success'); assert.equal(clear.partial,false);
    assert.equal((await post('listNotifications')).total,0);
    assert((await admin.query("SELECT version FROM cache_domain_versions WHERE org_id='org' AND domain='notification'"))[0][0].version>beforeVersion);
    assert.equal((await list(other)).total,1);
    // 无事件键的旧通知只隐藏自身，不能误伤同标题的新通知。
    await orgStorage.run('org',()=>model.batchCreate(['null-a','null-b'].map(id=>({id,orgId:'org',recipientType:'user',recipientId:'hr',type:'system',title:'相同标题'}))));
    await post('deleteNotification',{id:'null-a',organizationId:'org'});
    assert.deepEqual((await list(user)).items.map(row=>row.id),['null-b']);
    await assert.rejects(orgStorage.run('org',()=>model.listForRecipient({type:'user',id:'hr'},{limit:20})),/./);
    const count=(await admin.query('SELECT COUNT(*) n FROM notification_dismissals'))[0][0].n;
    await admin.query("CREATE TRIGGER test_reject_dismissal BEFORE INSERT ON notification_dismissals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test rejection'");
    assert.equal((await post('deleteNotification',{id:'null-b',organizationId:'org'})).status,'error');
    assert.equal((await admin.query('SELECT COUNT(*) n FROM notification_dismissals'))[0][0].n,count);
    assert.equal((await list(user)).total,1);
    await admin.query('DROP TRIGGER test_reject_dismissal');
    assert.equal((await post('deleteNotification',{id:'null-b',organizationId:'org'})).status,'success');
    // 审批提醒按真实轮次与步骤失效，延迟投递不能让旧进度重新出现。
    await admin.query("INSERT INTO audit_submissions(id,submission_number,submitted_by,org_id,status,current_step_index) VALUES ('audit-life','life','hr','org','in_progress',2)");
    await admin.query("INSERT INTO audit_submission_steps(id,submission_id,org_id,sort_order,round,status,processed_at) VALUES ('life-1','audit-life','org',1,1,'approved',NOW()),('life-2','audit-life','org',2,1,'pending',NULL),('life-3','audit-life','org',3,1,'pending',NULL)");
    const notifyAudit=async(id,round,step,action)=>orgStorage.run('org',()=>model.create(id,{orgId:'org',recipientType:'user',recipientId:'hr',type:'submission_'+action,title:'审批状态',targetType:'submission',targetId:'audit-life',eventKey:['audit','audit-life',round,step,action,'user','hr'].join(':')}));
    const assertAudit=async(ids)=>{
      const response=await post('listNotifications');
      assert.equal(response.status,'success');
      assert.deepEqual(response.items.map(item=>item.id).sort(),ids.slice().sort());
      assert.equal(response.total,ids.length);
      assert.equal((await post('getNotificationUnreadCount')).count,ids.length);
    };
    await notifyAudit('progress-1',1,1,'progress');
    await assertAudit(['progress-1']);
    await admin.query("UPDATE audit_submission_steps SET status='approved',processed_at=NOW() WHERE id='life-2'");
    await admin.query("UPDATE audit_submissions SET current_step_index=3 WHERE id='audit-life'");
    await assertAudit([]); // 不等下一条通知投递，旧进度和缓存立即失效。
    await notifyAudit('progress-2',1,2,'progress');
    await notifyAudit('late-progress-1',1,1,'progress');
    await assertAudit(['progress-2']);
    await admin.query("UPDATE audit_submission_steps SET status='approved',processed_at=NOW() WHERE id='life-3'");
    await admin.query("UPDATE audit_submissions SET status='approved' WHERE id='audit-life'");
    await notifyAudit('approved-1',1,3,'approved');
    await assertAudit(['approved-1']);
    await post('deleteNotification',{id:'approved-1',organizationId:'org'});
    await assertAudit([]); // 删除结果不能使上一条进度浮现。
    await admin.query("INSERT INTO audit_submission_steps(id,submission_id,org_id,sort_order,round,status) VALUES ('life-r2','audit-life','org',1,2,'pending')");
    await admin.query("UPDATE audit_submissions SET status='in_progress',current_step_index=1 WHERE id='audit-life'");
    await assertAudit([]);
    await admin.query("UPDATE audit_submission_steps SET status='rejected',processed_at=NOW() WHERE id='life-r2'");
    await admin.query("UPDATE audit_submissions SET status='rejected' WHERE id='audit-life'");
    await notifyAudit('rejected-2',2,1,'rejected');
    await assertAudit(['rejected-2']);
    await admin.query("UPDATE audit_submissions SET status='withdrawn' WHERE id='audit-life'");
    await assertAudit([]);
    await admin.query("INSERT INTO audit_submission_steps(id,submission_id,org_id,sort_order,round,status,processed_at) VALUES ('life-r3','audit-life','org',1,3,'approved',NOW())");
    await admin.query("UPDATE audit_submissions SET status='approved' WHERE id='audit-life'");
    await notifyAudit('approved-3',3,1,'approved');
    await assertAudit(['approved-3']);
    await admin.query("DELETE FROM audit_submissions WHERE id='audit-life'");
    await assertAudit([]);
    const notify=async(id,type,targetType,targetId,eventKey)=>orgStorage.run('org',()=>model.create(id,{orgId:'org',recipientType:'user',recipientId:'hr',type,title:type,targetType,targetId,eventKey:(eventKey||id)+':user:hr'}));
    await admin.query("INSERT INTO venues(id,name) VALUES ('v','场地')");
    await admin.query("INSERT INTO venue_bookings(id,venue_id,creator_org_id,approval_org_id,time_start,time_end,status) VALUES ('b','v','org','org',NOW(),DATE_ADD(NOW(),INTERVAL 1 HOUR),'approved')");
    await notify('booking-ok','booking_approved','booking','b'); await assertAudit(['booking-ok']);
    await admin.query("UPDATE venue_bookings SET status='cancelled' WHERE id='b'"); await assertAudit([]);
    await notify('booking-cancel','booking_cancelled','booking','b');
    await notify('booking-late','booking_approved','booking','b'); await assertAudit(['booking-cancel']);
    await post('deleteNotification',{id:'booking-cancel',organizationId:'org'}); await assertAudit([]);
    await admin.query("INSERT INTO hr_profile_records(id,hr_id,org_id,audit_status,reviewed_at) VALUES ('profile','hr','org','approved','2026-10-20 00:00:00')");
    await notify('profile-ok','hr_profile_approved','hr_profile','hr','hr-profile-review:profile:2026-10-20 00:00:00.000'); await assertAudit(['profile-ok']);
    await admin.query("UPDATE hr_profile_records SET audit_status='pending' WHERE id='profile'"); await assertAudit([]);
    await admin.query("UPDATE hr_profile_records SET audit_status='approved',reviewed_at='2026-10-21 00:00:00' WHERE id='profile'");
    await notify('profile-late','hr_profile_approved','hr_profile','hr','hr-profile-review:profile:2026-10-20 00:00:00.100'); await assertAudit([]);
    await notify('profile-current','hr_profile_approved','hr_profile','hr','hr-profile-review:profile:2026-10-21 00:00:00.000'); await assertAudit(['profile-current']);
    await admin.query("DELETE FROM hr_profile_records WHERE id='profile'"); await assertAudit([]);
    await admin.query("INSERT INTO score_activities(id,name,org_id) VALUES ('score','评分','org')");
    await admin.query("INSERT INTO result_publications(id,activity_id,org_id,is_published) VALUES ('pub','score','org',1)");
    await notify('published','score_results_published','result_publication','pub'); await assertAudit(['published']);
    await admin.query("UPDATE result_publications SET is_published=0 WHERE id='pub'"); await assertAudit([]);
    await notify('score-start','score_activity_started','score_activity','score'); await assertAudit([]);
    // 日程按同一业务读取函数核对名单、取消、改期和结束，而不是只检查通知存在。
    await admin.query("INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('hr','人员','p','org')");
    await admin.query("INSERT INTO organization_memberships(id,person_id,legacy_hr_id,org_id) VALUES ('mp','p','hr','org')");
    const now=Date.now(),start=now+5*60000,end=now+65*60000;
    const makeSpec=(a,b)=>require('../src/core/services/calendarOccurrences').normalizeSpec({title:'日程',startDate:new Date(a).toISOString().slice(0,10),endDate:new Date(b).toISOString().slice(0,10),startTime:new Date(a).toISOString().slice(11,16),endTime:new Date(b).toISOString().slice(11,16),recurrence:{frequency:'none'},reminders:[15]},0);
    const spec=makeSpec(start,end);
    await admin.query("INSERT INTO calendar_events(id,org_id,creator_person_id,creator_context_json,visibility,spec_json,targets_json) VALUES ('cal','org','p',?,'private',?,'[]')",[JSON.stringify({personId:'p',organizationId:'org',role:'user'}),JSON.stringify(spec)]);
    const lifecycle=require('../src/modules/audit/models/notificationLifecycle');
    let keys=await lifecycle.calendarKeys('org','p',now); assert.equal(keys.keys.length,1);
    await notify('calendar-now','calendar_reminder','calendar','cal',keys.keys[0]); await assertAudit(['calendar-now']);
    await admin.query("UPDATE calendar_events SET spec_json=? WHERE id='cal'",[JSON.stringify(makeSpec(start+86400000,end+86400000))]); await assertAudit([]);
    await admin.query("UPDATE calendar_events SET spec_json=? WHERE id='cal'",[JSON.stringify(spec)]); await assertAudit(['calendar-now']);
    assert.equal((await lifecycle.calendarKeys('org','p',end+1)).keys.length,0);
    await admin.query("INSERT INTO calendar_exits(id,org_id,event_id,person_id,occurrence_date,scope) VALUES ('exit','org','cal','p','2000-01-01','series')"); await assertAudit([]);
    await admin.query("DELETE FROM calendar_exits WHERE id='exit'"); await assertAudit(['calendar-now']);
    await admin.query("UPDATE calendar_events SET status='cancelled' WHERE id='cal'"); await assertAudit([]);
    await assert.rejects(notify('unregistered','unknown_type','system','x'),error=>error.code==='NOTIFICATION_LIFECYCLE_REQUIRED');
    console.log('PASS 通知跨身份删除；审批、场地、人事、评分、公示与日程失效；乱序投递、列表计数、缓存更新和双次迁移');
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + username + "'@'%'");
    await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
