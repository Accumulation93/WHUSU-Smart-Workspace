'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const view = require('../../shared/contactDirectoryView');
async function main() {
  const host = process.env.DIRECTORY_TEST_DB_HOST || process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1', port = Number(process.env.DIRECTORY_TEST_DB_PORT || process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'directory_test_' + process.pid + '_' + Date.now(), username = 'dir_' + process.pid, password = crypto.randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root', password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  try {
    await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
    await admin.query("CREATE USER '" + username + "'@'%' IDENTIFIED BY ?", [password]);
    await admin.query('GRANT ALL PRIVILEGES ON `' + database + "`.* TO '" + username + "'@'%'");
    await admin.query('USE `' + database + '`');
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261018230000_hr_contact_directory.sql'), 'utf8');
    await admin.query(migration); await admin.query(migration);
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const model = require('../src/core/models/contactDirectory');
    const authorize = async connection => { assert(connection); };
    await admin.query("INSERT INTO organizations(id,name) VALUES ('org','测试组织'),('other','其他组织')");
    await admin.query("INSERT INTO departments(id,name,org_id) VALUES ('d1','部门甲','org'),('d2','部门乙','org')");
    await admin.query("INSERT INTO identities(id,name,org_id) VALUES ('i1','成员','org'),('i2','负责人','org')");
    for (const [id,name] of [['v','查看者'],['a','同名'],['b','同名'],['nojob','无岗位']]) {
      await admin.query('INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?)',[id,name,id,id]);
      await admin.query('INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,?,?,?)',['h'+id,name,id,'org']);
      await admin.query('INSERT INTO organization_memberships(id,person_id,legacy_hr_id,org_id) VALUES (?,?,?,?)',['m'+id,id,'h'+id,'org']);
    }
    for (const [id,person,dept,identity] of [['v1','v','d1','i1'],['a1','a','d1','i1'],['a2','a','d2','i2'],['b1','b','d2','i1']])
      await admin.query("INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES (?,?,'org','staff',?,?)",[id,'m'+person,dept,identity]);
    await admin.query("INSERT INTO org_hr_profile_template_snapshots(id,org_id) VALUES ('template','org')");
    await admin.query("INSERT INTO org_hr_profile_template_snapshot_fields(id,snapshot_id,label,type) VALUES ('phone','template','电话','phone'),('email','template','邮箱','email'),('secret','template','学号','text')");
    for (const person of ['a','b']) {
      await admin.query("INSERT INTO hr_profile_records(id,hr_id,template_snapshot_id,org_id) VALUES (?,?,'template','org')",['r'+person,'h'+person]);
      for (const field of ['phone','email']) await admin.query("INSERT INTO hr_profile_record_values(id,record_id,field_id,field_value,is_pending,org_id) VALUES (?,?,?,?,0,'org')",[person+field,'r'+person,field,person+'-'+field]);
    }
    await admin.query("INSERT INTO hr_profile_record_values(id,record_id,field_id,field_value,is_pending,org_id) VALUES ('pending','ra','phone','pending-secret',1,'org')");
    const actor = { personId: 'v', organizationId: 'org', assignmentId: 'v1' };
    assert.deepEqual(await model.read(actor), {groups:[]});
    const input = view.blankRule(); input.name = '前端规则'; input.audience[0].personIds = ['v']; input.targets = [{type:'people',personIds:['a']}]; input.fieldIds = ['phone'];
    const saved = await model.save(view.payload(input),'org',authorize);
    assert.equal(saved.version,1);
    const config = await model.configuration('org',authorize);
    assert.equal(config.rules[0].id,saved.id); assert.equal(config.fields.length,2);
    assert(!JSON.stringify(config.people).includes('student')); assert(!JSON.stringify(config).includes('a-phone'));
    const second = await model.save(view.payload(Object.assign({},input,{name:'另一条',targets:[{type:'people',personIds:['b']}],fieldIds:['email']})),'org',authorize);
    let cards = (await model.read(actor)).groups.flatMap(group=>group.items);
    assert.equal(cards.length,3); assert.equal(cards.filter(card=>card.relatedKeys.length).length,2);
    assert.deepEqual(cards.map(card=>card.fields.map(field=>field.value)).sort(), [['a-phone'],['a-phone'],['b-email']]);
    assert(!JSON.stringify(cards).includes('pending-secret')); assert(!JSON.stringify(cards).includes('personId')); assert(!JSON.stringify(cards).includes('student'));
    await assert.rejects(model.save(Object.assign({},saved,{fieldIds:['secret']}),'org',authorize),error=>error.code==='staleReferences');
    await assert.rejects(model.save(saved,'other',authorize),error=>['staleReferences','work_context_required'].includes(error.code));
    await assert.rejects(model.save(input,'org',async()=>{throw new Error('denied');}),/denied/);
    const updated = await model.save(Object.assign({},saved,{name:'修改后'}),'org',authorize); assert.equal(updated.version,2);
    await assert.rejects(model.save(saved,'org',authorize),error=>error.code==='conflict');
    await assert.rejects(model.batch({action:'delete',rules:[{id:updated.id,version:2},{id:second.id,version:99}]},'org',authorize),error=>error.code==='conflict');
    assert.equal((await model.configuration('org',authorize)).rules.length,2);
    await model.batch({action:'disable',rules:[{id:updated.id,version:2}]},'org',authorize);
    assert.equal((await model.read(actor)).groups.flatMap(group=>group.items).length,1);
    await model.batch({action:'enable',rules:[{id:updated.id,version:3}]},'org',authorize);
    const dynamic = Object.assign({},input,{name:'同部门',targets:[{type:'scope',sameDepartment:true}],fieldIds:[]});
    const third = await model.save(dynamic,'org',authorize);
    await model.batch({action:'delete',rules:[{id:updated.id,version:4},{id:second.id,version:1}]},'org',authorize);
    cards = (await model.read(actor)).groups.flatMap(group=>group.items); assert.equal(cards.length,2); assert(cards.every(card=>!card.fields.length));
    await admin.query("UPDATE membership_assignments SET department_id='d2' WHERE id='v1'");
    cards = (await model.read(actor)).groups.flatMap(group=>group.items); assert.equal(cards.length,3);
    await admin.query("UPDATE organization_memberships SET status='left' WHERE id='mb'");
    assert.equal((await model.read(actor)).groups.flatMap(group=>group.items).length,2);
    assert.deepEqual(await model.read({...actor,organizationId:'other'}),{groups:[]});
    const noJob = await model.save({...input,name:'无岗位',targets:[{type:'people',personIds:['nojob']}],fieldIds:[]},'org',authorize);
    assert((await model.read(actor)).groups.some(group=>group.items.some(card=>card.name==='无岗位')));
    await pool.withTransaction(connection=>model.cleanupPerson(connection,'nojob','org'));
    assert.equal((await model.configuration('org',authorize)).rules.find(rule=>rule.id===noJob.id).enabled,false);
    await pool.withTransaction(connection=>model.cleanupPerson(connection,'v','org'));
    assert.deepEqual(await model.read(actor),{groups:[]});
    await model.batch({action:'delete',rules:(await model.configuration('org',authorize)).rules.map(rule=>({id:rule.id,version:rule.version}))},'org',authorize);
    assert.equal((await model.configuration('org',authorize)).rules.length,0);
    assert(third.id);
    console.log('PASS 通讯录真实表单新增/编辑/复制参数、启停删除、逐列隐私、同名多岗、调岗离任、并发版本和批量回滚');
  } finally {
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + username + "'@'%'"); await admin.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
