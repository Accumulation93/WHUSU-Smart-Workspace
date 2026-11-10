'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

async function run() {
  process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || crypto.randomBytes(48).toString('hex');
  const host = process.env.DEPLOY_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.DEPLOY_TEST_DB_PORT || 3362);
  const database = 'venue_purposes_test_' + process.pid + '_' + Date.now();
  const user = 'vp_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host, port, user: process.env.DEPLOY_TEST_DB_USER || 'root',
    password: process.env.DEPLOY_TEST_DB_PASSWORD || '', multipleStatements: true });
  let pool, server;
  try {
    await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [user, password]);
    await admin.query("GRANT ALL ON ??.* TO ?@'%'", [database, user]);
    await admin.query('USE ??', [database]);
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    await admin.query(`CREATE TABLE cache_domain_versions (org_id VARCHAR(64), domain VARCHAR(32), version BIGINT UNSIGNED NOT NULL, PRIMARY KEY(org_id, domain));
      INSERT INTO organizations(id,name) VALUES ('a','组织甲'),('b','组织乙');
      INSERT INTO venue_booking_purposes(id,text,sort_order) VALUES ('legacy','旧版事由',2);`);
    const migration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261101013000_organization_venue_purposes.sql'), 'utf8');
    await admin.query(migration); await admin.query(migration);
    assert.equal((await admin.query('SELECT COUNT(*) AS n FROM organization_venue_booking_purposes'))[0][0].n, 2);
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261031160000_unified_authorization.sql'), 'utf8'));
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: user, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const model = require('../src/modules/venue/models/venueBookingPurpose');
    const transitionMigration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261101100000_venue_purpose_storage_transition.sql'), 'utf8');
    await admin.query(transitionMigration); await admin.query(transitionMigration);
    const storage = require('../src/modules/venue/models/venuePurposeStorage');
    // 模拟旧进程在首次复制后保存，兼容进程必须立即读到同一份内容。
    await admin.query("UPDATE venue_booking_purposes SET text='旧进程最后修改' WHERE id='legacy'");
    assert.equal((await model.getById('legacy', 'a')).text, '旧进程最后修改');
    await model.update('legacy', { text: '兼容进程修改' }, 'a');
    assert.equal((await admin.query("SELECT text FROM venue_booking_purposes WHERE id='legacy'"))[0][0].text, '兼容进程修改');
    await assert.rejects(pool.withTransaction(connection => storage.requireOrganizationStorage(connection)),
      error => error.code === 'venue_purpose_storage_not_activated');
    const compatibleSha = 'a'.repeat(40);
    await assert.rejects(storage.activate(compatibleSha, async () => false), error => error.code === 'venue_purpose_deployment_not_ready');
    assert.equal((await admin.query('SELECT phase FROM venue_purpose_storage_transition'))[0][0].phase, 'legacy');
    await model.update('legacy', { text: '旧版事由' }, 'a');
    await admin.query("INSERT INTO organization_venue_booking_purposes(org_id,id,text) VALUES ('a','stale','已被旧进程删除')");
    await admin.query("INSERT INTO venue_booking_purposes(id,text,sort_order) VALUES ('late','复制后旧进程新增',99)");
    // 人为令复制失败，确认预备副本删除和模式更新均回滚。
    await admin.query(`CREATE TRIGGER test_purpose_copy_failure BEFORE INSERT ON organization_venue_booking_purposes
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected_copy_failure'`);
    await assert.rejects(storage.activate(compatibleSha, async () => true), /injected_copy_failure/);
    assert.equal((await admin.query('SELECT phase FROM venue_purpose_storage_transition'))[0][0].phase, 'legacy');
    assert.equal((await admin.query("SELECT COUNT(*) n FROM organization_venue_booking_purposes WHERE id='stale'"))[0][0].n, 1);
    await admin.query('DROP TRIGGER test_purpose_copy_failure');
    let releaseWrite;
    let enteredWrite;
    const entered = new Promise(resolve => { enteredWrite = resolve; });
    const pendingWrite = storage.usingStorage(async (connection, isolated) => {
      assert.equal(isolated, false);
      enteredWrite();
      await new Promise(resolve => { releaseWrite = resolve; });
      await connection.query("UPDATE venue_booking_purposes SET text='切换前最后一次写入' WHERE id='late'");
    });
    await entered;
    let verified = false;
    const pendingActivation = storage.activate(compatibleSha, async () => { verified = true; return true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(verified, false, '切换必须等已进入的兼容写事务结束');
    releaseWrite();
    await pendingWrite;
    const activated = await pendingActivation;
    assert.deepEqual(activated, { changed: true, compatibleSha, organizationCount: 2, purposeCount: 2 });
    assert.equal((await model.getById('late', 'a')).text, '切换前最后一次写入');
    assert.equal((await model.getById('late', 'b')).text, '切换前最后一次写入');
    assert.equal(await model.getById('stale', 'a'), null);
    await model.remove('late', 'a'); await model.remove('late', 'b');
    assert.equal((await model.getById('legacy', 'b')).text, '旧版事由');
    const express = require('express');
    const app = express(); app.use(express.json());
    // 注入隔离认证结果；验证真实业务路由和数据库，不冒充完整登录或管理员授权链。
    app.use((req, _res, next) => {
      req.authAccount = { id: 'account', personId: 'person' };
      req.authContext = { role: 'admin', personId: 'person', contextId: 'context', organizationId: req.get('x-test-org'), adminGrantId: 'grant', adminLevel: 'admin' };
      next();
    });
    app.use(require('../src/modules/venue/routes/venueAdmin'));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function post(route, body, org = 'a') {
      return (await fetch('http://127.0.0.1:' + server.address().port + route, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-org': org }, body: JSON.stringify(body) })).json();
    }
    assert.equal((await post('/saveVenueBookingPurpose', { id: 'legacy', text: '甲的新事由', sortOrder: 3 })).status, 'success');
    assert.equal((await post('/listVenueBookingPurposes', {})).purposes[0].text, '甲的新事由');
    assert.equal((await post('/listVenueBookingPurposes', {}, 'b')).purposes[0].text, '旧版事由');
    const created = await post('/saveVenueBookingPurpose', { text: '仅甲可见', sortOrder: 4 });
    assert.equal(created.status, 'success');
    assert.equal((await model.getById(created.id, 'a')).text, '仅甲可见');
    assert.equal((await post('/saveVenueBookingPurpose', { id: created.id, text: '伪造跨组织编辑' }, 'b')).status, 'not_found');
    assert.equal(await model.getById(created.id, 'b'), null);
    assert.equal((await post('/deleteVenueBookingPurpose', { id: 'legacy' })).status, 'success');
    await admin.query("INSERT INTO organizations(id,name) VALUES ('c','新组织')");
    await admin.query(migration);
    await admin.query(transitionMigration);
    assert.equal((await storage.activate(compatibleSha, async () => { throw Error('already_activated'); })).changed, false);
    assert.equal(await model.getById('legacy', 'a'), null);
    assert.equal((await model.getById('legacy', 'b')).text, '旧版事由');
    assert.deepEqual(await model.getAll('c'), []);
    assert.equal((await admin.query("SELECT text FROM venue_booking_purposes WHERE id='legacy'"))[0][0].text, '旧版事由');
    assert((await admin.query("SELECT version FROM cache_domain_versions WHERE org_id='a' AND domain='venue'"))[0][0].version >= 3);
    await assert.rejects(model.getAll(), error => error.code === 'venue_purpose_organization_required');
    console.log('组织事由隔离MySQL与HTTP：旧编号编辑回读、各组织独立、跨组织拒绝、删除后重跑不复活、新组织不自动复制及事务版本通过。');

    const copyMigration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261101023000_organization_config_copy.sql'), 'utf8');
    await admin.query(copyMigration); await admin.query(copyMigration);
    const copying = require('../src/core/models/organizationConfigCopy');
    const source = { organizationId: 'a', contextId: 'source-context' };
    const target = { organizationId: 'b', contextId: 'target-context' };
    const stranger = { organizationId: 'c', contextId: 'other-context' };
    const calls = [];
    // 此段验证事务与类型适配；权限服务的真实账号链由授权集成测试另验，不把回调替身称为真实授权。
    const guard = async (_connection, ref, kind, action, id) => {
      assert.equal(kind, 'venue.purposes');
      calls.push({ orgId: ref.organizationId, action, id });
      if (ref.organizationId === 'c') throw Error('denied');
    };
    const shareInput = { kind: 'venue.purposes', sourceRecordId: created.id, targetOrganizationId: 'b',
      payload: { text: '客户端伪造的事由', secret: '不应被复制' } };
    await assert.rejects(copying.share({ ...shareInput, kind: 'audit.stamps' }, source, guard), /unsupported/);
    await assert.rejects(copying.share(shareInput, source, async () => { throw Error('denied'); }), /denied/);
    const shared = await copying.share(shareInput, source, guard);
    const [sharedRows] = await admin.query('SELECT payload_json FROM organization_config_shares WHERE id = ?', [shared.id]);
    const sharedPayload = typeof sharedRows[0].payload_json === 'string' ? JSON.parse(sharedRows[0].payload_json) : sharedRows[0].payload_json;
    assert.deepEqual(sharedPayload, { text: '仅甲可见', sortOrder: 4 });
    assert(calls.some(call => call.orgId === 'a' && call.action === 'share' && call.id === created.id));
    assert(calls.some(call => call.orgId === 'a' && call.action === 'read' && call.id === created.id));
    const receiveInput = { shareId: shared.id, shareVersion: 1, requestId: 'first-copy' };
    await assert.rejects(copying.receive(receiveInput, stranger, guard), /unavailable/);
    await assert.rejects(copying.receive(receiveInput, target, async () => { throw Error('denied'); }), /denied/);
    const received = await copying.receive(receiveInput, target, guard);
    assert.equal(received.state, 'draft');
    assert.deepEqual(await copying.receive(receiveInput, target, guard), received);
    assert.equal((await model.getAll('b')).length, 1);
    await assert.rejects(copying.apply({ id: received.id, version: 1 }, target, async (_connection, _ref, _kind, action) => {
      if (action === 'create') throw Error('denied');
    }), /denied/);
    assert.equal((await model.getAll('b')).length, 1);
    await model.update(created.id, { text: '来源后续修改' }, 'a');
    const applied = await copying.apply({ id: received.id, version: 1 }, target, guard);
    assert.equal((await model.getById(applied.resultId, 'b')).text, '仅甲可见');
    assert.deepEqual(await copying.apply({ id: received.id, version: 1 }, target, guard), applied);
    assert.equal((await model.getAll('b')).length, 2);
    await copying.revoke({ id: shared.id, version: 1 }, source, guard);
    assert.equal((await model.getById(applied.resultId, 'b')).text, '仅甲可见');
    await assert.rejects(copying.receive({ ...receiveInput, requestId: 'after-revoke' }, target, guard), /unavailable/);
    await assert.rejects(copying.revoke({ id: shared.id, version: 1 }, source, guard), /conflict/);
    const secondShare = await copying.share(shareInput, source, guard);
    const secondDraft = await copying.receive({ shareId: secondShare.id, shareVersion: 1, requestId: 'second-copy' }, target, guard);
    await copying.revoke({ id: secondShare.id, version: 1 }, source, guard);
    await assert.rejects(copying.apply({ id: secondDraft.id, version: 1 }, target, guard), /unavailable/);
    assert.equal((await admin.query('SELECT state FROM organization_config_copy_drafts WHERE id = ?', [secondDraft.id]))[0][0].state, 'draft');
    const thirdShare = await copying.share({ ...shareInput, sourceRecordId: 'legacy' }, { organizationId: 'b', contextId: 'b-source' }, guard)
      .catch(error => { assert.match(error.message, /invalid/); return null; });
    assert.equal(thirdShare, null);
    const duplicateShare = await copying.share({ ...shareInput, sourceRecordId: 'legacy', targetOrganizationId: 'a' }, target, guard);
    const duplicateDraft = await copying.receive({ shareId: duplicateShare.id, shareVersion: 1, requestId: 'duplicate-copy' }, source, guard);
    await model.create('same-name', { text: '旧版事由', sortOrder: 2 }, 'a');
    await assert.rejects(copying.apply({ id: duplicateDraft.id, version: 1 }, source, guard), /duplicate/);
    assert.equal((await admin.query('SELECT state FROM organization_config_copy_drafts WHERE id = ?', [duplicateDraft.id]))[0][0].state, 'draft');
    assert.equal((await admin.query("SELECT COUNT(*) AS n FROM organization_config_copy_changes WHERE action = 'apply'"))[0][0].n, 1);
    console.log('配置复制事由适配器：白名单成包、来源与目标分开校验、接收仅草稿、重复请求、撤回分享、独立副本、重名拒绝及失败不改草稿通过；不包含真实授权链或两端界面。');
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261031160000_unified_authorization.sql'), 'utf8'));
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/deploy/20261110190000_assignment_nature_description.sql'), 'utf8'));
    await admin.query(`INSERT INTO departments(id,org_id,name,description) VALUES ('a-dept','a','共同名称','部门说明'),('b-dept','b','共同名称','');
      INSERT INTO identities(id,org_id,name,description) VALUES ('a-identity','a','成员类别','类别说明');
      INSERT INTO work_groups(id,org_id,department_id,name,description) VALUES ('a-group','a','a-dept','同名职能组','职能组说明');
      INSERT INTO assignment_natures(id,org_id,name,description) VALUES ('a-nature','a','可扩展性质','仅用于专项工作岗位');`);
    const dictionaryGuard = async (_connection, ref, kind, action) => {
      assert(['a', 'b'].includes(ref.organizationId));
      assert(['hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures'].includes(kind));
      assert(['share', 'read', 'receive', 'create'].includes(action));
    };
    async function dictionaryDraft(kind, recordId, requestId) {
      const sharedDictionary = await copying.share({ kind, sourceRecordId: recordId, targetOrganizationId: 'b' }, source, dictionaryGuard);
      return copying.receive({ shareId: sharedDictionary.id, shareVersion: 1, requestId }, target, dictionaryGuard);
    }
    const departmentDraft = await dictionaryDraft('hr.departments', 'a-dept', 'department');
    await assert.rejects(copying.apply({ id: departmentDraft.id, version: 1 }, target, dictionaryGuard), /duplicate/);
    const identityDraft = await dictionaryDraft('hr.identities', 'a-identity', 'identity');
    const identityResult = await copying.apply({ id: identityDraft.id, version: 1 }, target, dictionaryGuard);
    assert.equal((await admin.query('SELECT description FROM identities WHERE id = ? AND org_id = ?', [identityResult.resultId, 'b']))[0][0].description, '类别说明');
    const groupDraft = await dictionaryDraft('hr.workGroups', 'a-group', 'work-group');
    await assert.rejects(copying.apply({ id: groupDraft.id, version: 1 }, target, dictionaryGuard), /reference/);
    await assert.rejects(copying.apply({ id: groupDraft.id, version: 1, references: { departmentId: 'a-dept' } }, target, dictionaryGuard), /reference/);
    assert.equal((await admin.query("SELECT COUNT(*) AS n FROM work_groups WHERE org_id = 'b'"))[0][0].n, 0);
    const groupInput = { id: groupDraft.id, version: 1, references: { departmentId: 'b-dept' } };
    const groupResult = await copying.apply(groupInput, target, dictionaryGuard);
    assert.equal((await admin.query('SELECT department_id FROM work_groups WHERE org_id = ? AND id = ?', ['b', groupResult.resultId]))[0][0].department_id, 'b-dept');
    assert.deepEqual(await copying.apply(groupInput, target, dictionaryGuard), groupResult);
    await assert.rejects(copying.apply({ ...groupInput, references: { departmentId: 'a-dept' } }, target, dictionaryGuard), /conflict/);
    const natureDraft = await dictionaryDraft('hr.assignmentNatures', 'a-nature', 'nature');
    const natureResult = await copying.apply({ id: natureDraft.id, version: 1 }, target, dictionaryGuard);
    assert.equal(natureResult.resultId.length, 32);
    assert.equal((await admin.query('SELECT name FROM assignment_natures WHERE org_id = ? AND id = ?', ['b', natureResult.resultId]))[0][0].name, '可扩展性质');
    assert.equal((await admin.query('SELECT description FROM assignment_natures WHERE org_id = ? AND id = ?', ['b', natureResult.resultId]))[0][0].description, '仅用于专项工作岗位');
    const oldNatureShare = await copying.share({ kind: 'hr.assignmentNatures', sourceRecordId: 'a-nature', targetOrganizationId: 'b' }, source, dictionaryGuard);
    const oldNaturePayload = { name: '旧版分享的岗位性质' };
    const oldNatureJson = JSON.stringify(oldNaturePayload);
    const oldNatureHash = crypto.createHash('sha256').update(oldNatureJson).digest('hex');
    await admin.query('UPDATE organization_config_shares SET payload_json=?,payload_hash=? WHERE id=?', [oldNatureJson, oldNatureHash, oldNatureShare.id]);
    const oldNatureDraft = await copying.receive({ shareId: oldNatureShare.id, shareVersion: 1, requestId: 'old-nature-copy' }, target, dictionaryGuard);
    assert.deepEqual((await copying.detail({ id: oldNatureDraft.id }, target, dictionaryGuard)).payload, oldNaturePayload);
    const oldNatureResult = await copying.apply({ id: oldNatureDraft.id, version: 1 }, target, dictionaryGuard);
    const [oldNatureRows] = await admin.query('SELECT name,description FROM assignment_natures WHERE org_id=? AND id=?', ['b', oldNatureResult.resultId]);
    assert.deepEqual(oldNatureRows[0], { name: oldNaturePayload.name, description: '' });
    assert.equal((await admin.query('SELECT payload_hash FROM organization_config_shares WHERE id=?', [oldNatureShare.id]))[0][0].payload_hash, oldNatureHash);
    await admin.query(`INSERT INTO score_question_templates(id,org_id,name,description,created_by)
      VALUES ('source-template','a','可复用评分表','保留题目与数值','source-private-actor');
      INSERT INTO score_questions(id,template_id,sort_order,question,score_label,min_value,start_value,max_value,step_value)
      VALUES ('question-a','source-template',2,'第二题','说明二',-2,0,6,0.25),
        ('question-b','source-template',1,'第一题','说明一',0,3,5,0.5);`);
    const scoreGuard = async (_connection, ref, kind, action) => {
      assert(['a', 'b'].includes(ref.organizationId));
      assert.equal(kind, 'scoring.templates');
      assert(['share', 'read', 'receive', 'create'].includes(action));
    };
    const scoreOffer = await copying.share({ kind: 'scoring.templates', sourceRecordId: 'source-template', targetOrganizationId: 'b' }, source, scoreGuard);
    const scoreDraft = await copying.receive({ shareId: scoreOffer.id, shareVersion: 1, requestId: 'score-template' }, target, scoreGuard);
    const scoreDetail = await copying.detail({ id: scoreDraft.id }, target, scoreGuard);
    assert.deepEqual(scoreDetail.payload.questions.map(item => item.question), ['第一题', '第二题']);
    assert.equal(JSON.stringify(scoreDetail.payload).includes('source-private-actor'), false);
    assert.equal(JSON.stringify(scoreDetail.payload).includes('question-a'), false);
    await admin.query("UPDATE score_questions SET question='来源后来修改' WHERE id='question-b'");
    const scoreResult = await copying.apply({ id: scoreDraft.id, version: 1 }, target, scoreGuard);
    const [copiedQuestions] = await admin.query('SELECT * FROM score_questions WHERE template_id = ? ORDER BY sort_order', [scoreResult.resultId]);
    assert.equal(copiedQuestions.length, 2);
    assert.equal(copiedQuestions[0].question, '第一题');
    assert.equal(Number(copiedQuestions[1].step_value), 0.25);
    assert.equal(Number(copiedQuestions[1].min_value), -2);
    assert(copiedQuestions.every(item => !['question-a', 'question-b'].includes(item.id)));
    assert.equal((await admin.query('SELECT org_id,created_by FROM score_question_templates WHERE id=?', [scoreResult.resultId]))[0][0].org_id, 'b');
    assert.deepEqual(await copying.apply({ id: scoreDraft.id, version: 1 }, target, scoreGuard), scoreResult);
    const secondScoreDraft = await copying.receive({ shareId: scoreOffer.id, shareVersion: 1, requestId: 'score-template-duplicate' }, target, scoreGuard);
    await assert.rejects(copying.apply({ id: secondScoreDraft.id, version: 1 }, target, scoreGuard), /duplicate/);
    assert.equal((await copying.detail({ id: secondScoreDraft.id }, target, scoreGuard)).state, 'draft');
    console.log('评分模板复制：题序、数值、来源后续修改隔离、新编号、私有作者不外传、重复提交及重名回滚通过。');
    const natureDetail = await copying.detail({ id: natureDraft.id }, target, dictionaryGuard);
    assert.equal(natureDetail.state, 'applied');
    assert.equal(natureDetail.payload.name, '可扩展性质');
    await assert.rejects(copying.detail({ id: natureDraft.id }, source, dictionaryGuard), /missing/);
    await assert.rejects(copying.available({ kind: ['venue.purposes'] }, target, guard), /unsupported/);
    await assert.rejects(copying.available({ kind: 'venue.purposes' }, target, async () => { throw Error('denied'); }), /denied/);
    const offersBefore = await copying.available({ kind: 'venue.purposes' }, target, guard);
    assert.equal(offersBefore.items.length, 0);
    for (let index = 0; index < 31; index += 1) await copying.share(shareInput, source, guard);
    const offersFirst = await copying.available({ kind: 'venue.purposes' }, target, guard);
    assert.equal(offersFirst.items.length, 30);
    assert(offersFirst.next);
    const offersLast = await copying.available({ kind: 'venue.purposes', after: offersFirst.next }, target, guard);
    assert.equal(offersLast.items.length, 1);
    assert.equal(offersLast.next, '');
    assert.equal(new Set(offersFirst.items.concat(offersLast.items).map(item => item.id)).size, 31);
    await admin.query('UPDATE organization_config_shares SET payload_json = ? WHERE id = ?',
      [JSON.stringify({ text: '数据库内容已变化', sortOrder: 4 }), offersFirst.items[0].id]);
    await assert.rejects(copying.available({ kind: 'venue.purposes' }, target, guard), /invalid/);
    await assert.rejects(admin.query("DELETE FROM organizations WHERE id = 'a'"), error => error.code === 'ER_ROW_IS_REFERENCED_2');
    console.log('岗位字典复制：部门重名不覆盖、身份与性质实际创建回读、职能组显式映射本组织部门、跨组织与空关联拒绝、重复提交关联不变及来源组织引用保护通过。');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS ??', [database]);
    await admin.query("DROP USER IF EXISTS ?@'%'", [user]);
    await admin.end();
  }
}
run().catch(error => { console.error(error.code === 'ERR_ASSERTION' ? error.stack : error.code || error.message); process.exitCode = 1; });
