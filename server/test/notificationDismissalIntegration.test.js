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
    const versionsMigration = fs.readFileSync(path.join(__dirname,'../db/deploy/20260907120000_performance_cache_versions.sql'),'utf8');
    const [versionTable, versionTriggers] = versionsMigration.split('DELIMITER $$');
    await admin.query(versionTable);
    for (const sql of versionTriggers.split('DELIMITER ;')[0].split('$$').map(value=>value.trim()).filter(Boolean)) await admin.query(sql);
    const migration = fs.readFileSync(path.join(__dirname,'../db/deploy/20261019200000_notification_person_dismissals.sql'),'utf8');
    // 按迁移的客户端分隔符逐段执行，触发器正文保持完整。
    for (let run=0; run<2; run++) {
      const [tables, triggers] = migration.split('DELIMITER $$');
      await admin.query(tables);
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
    console.log('PASS 通知双次迁移、真实HTTP删除回读、跨岗位/管理身份/新岗位、重投/清理后重投、其他人与组织隔离、新事件保留、旧键、清空、未读计数、事务失败重试及版本更新');
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + username + "'@'%'");
    await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
