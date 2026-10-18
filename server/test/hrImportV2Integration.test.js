'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.HR_IMPORT_TEST_DB_HOST || '127.0.0.1';
  const port = Number(process.env.HR_IMPORT_TEST_DB_PORT || 3362);
  const database = 'hr_import_v2_test_' + process.pid + '_' + Date.now();
  const username = 'hr_v2_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({ host, port, user: process.env.TEST_DB_ADMIN_USER || 'root', password: process.env.TEST_DB_ADMIN_PASSWORD || '', multipleStatements: true });
  let pool;
  try {
    await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
    await admin.query("CREATE USER '" + username + "'@'%' IDENTIFIED BY ?", [password]);
    await admin.query('GRANT ALL PRIVILEGES ON `' + database + "`.* TO '" + username + "'@'%'");
    await admin.query('USE `' + database + '`');
    await admin.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, '../db/deploy/20261009220000_hr_import_v2.sql'), 'utf8');
    await admin.query(migration); await admin.query(migration);
    Object.assign(process.env, { DB_HOST: host, DB_PORT: String(port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password });
    pool = require('../src/config/db');
    const model = require('../src/core/models/hrImportV2');
    const actor = { personId: 'operator', contextId: 'admin-context', organizationId: 'org-test' };
    const permissions = ['hr.import', 'hr.people', 'hr.departments', 'hr.identities', 'hr.work_groups'];
    const authorize = async () => ({ effective: { keys: permissions } });
    await admin.query("INSERT INTO organizations (id,name) VALUES ('org-test','隔离测试组织')");
    await admin.query("INSERT INTO departments (id,name,org_id) VALUES ('d1','部门甲','org-test')");
    await admin.query("INSERT INTO identities (id,name,org_id) VALUES ('i1','成员','org-test')");
    await admin.query("INSERT INTO work_groups (id,name,department_id,org_id) VALUES ('g1','组甲','d1','org-test')");
    await admin.query("INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES ('p1','测试甲','001','001')");
    await admin.query("INSERT INTO hr_info (id,name,student_id,org_id) VALUES ('h1','测试甲','001','org-test')");
    await admin.query("INSERT INTO organization_memberships (id,person_id,org_id,legacy_hr_id) VALUES ('m1','p1','org-test','h1')");
    await admin.query("INSERT INTO membership_assignments (id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES ('a1','m1','org-test','staff','d1','i1')");
    const { createPage } = require('./hrImportPage.test');
    const pageFixture = createPage(async () => ({ status: 'success', fields: [] }), {
      fileName: '三列增补.xlsx', headers: ['姓名', '学号', '职能组'], rows: [['测试甲', '001', '组甲']]
    });
    await pageFixture.page.loadMetadata(); await pageFixture.page.chooseFile();
    const input = JSON.parse(JSON.stringify(pageFixture.page.payload()));
    const preview = await model.preview(input, actor, authorize);
    assert.equal(preview.summary.canExecute, true);
    const [before] = await admin.query("SELECT work_group_id FROM membership_assignments WHERE id='a1'"); assert.equal(before[0].work_group_id, null);
    const submit = { previewId: preview.previewId, requestId: 'import_request_0001' };
    const first = await model.execute(submit, actor, authorize);
    assert.equal(first.summary.updatedAssignments, 1); assert.equal(first.saved[0].assignmentCount, 1);
    const [saved] = await admin.query("SELECT id, work_group_id FROM membership_assignments WHERE membership_id='m1'");
    assert.deepEqual(saved.map(row => [row.id, row.work_group_id]), [['a1', 'g1']]);
    assert.deepEqual(await model.execute(submit, actor, authorize), first);
    assert.deepEqual(await model.result(submit, actor), first);
    assert.deepEqual(await model.execute({ previewId: preview.previewId, requestId: 'import_request_0002' }, actor, authorize), first);
    console.log('PASS 三列预览不写入、同岗补充、真实回读与重复提交');

    const second = await model.preview(input, actor, authorize);
    await assert.rejects(model.execute({ previewId: second.previewId, requestId: submit.requestId }, actor, authorize), error => error.code === 'import_request_conflict');
    await assert.rejects(model.execute({ previewId: second.previewId, requestId: 'import_other_org_01' }, Object.assign({}, actor, { organizationId: 'other' }), authorize), error => error.code === 'import_expired');
    await assert.rejects(model.execute({ previewId: second.previewId, requestId: 'import_denied_001' }, actor, async () => { throw new Error('test-denied'); }), /test-denied/);
    await admin.query("UPDATE membership_assignments SET work_group_id=NULL WHERE id='a1'");
    await assert.rejects(model.execute({ previewId: second.previewId, requestId: 'import_stale_0001' }, actor, authorize), error => error.code === 'import_stale');
    console.log('PASS 请求冲突、组织隔离、执行授权和预览失效');

    const newInput = { schemaVersion: 2, headers: ['姓名','学号'], rows: [['新增无岗','002'], ['新增无岗','002']], basicMapping: { name: 0, studentId: 1 }, decisions: {} };
    const newPreview = await model.preview(newInput, actor, authorize);
    assert.equal(newPreview.summary.newMembers, 1);
    const newResult = await model.execute({ previewId: newPreview.previewId, requestId: 'import_new_000001' }, actor, authorize);
    assert.equal(newResult.saved[0].assignmentCount, 0);
    const [newPeople] = await admin.query("SELECT COUNT(*) n FROM persons WHERE normalized_student_id='002'"); assert.equal(newPeople[0].n, 1);
    console.log('PASS 无岗位成员创建及重复行归并');

    await admin.query("INSERT INTO org_hr_profile_template_snapshots (id,org_id) VALUES ('t1','org-test')");
    await admin.query("INSERT INTO org_hr_profile_template_snapshot_fields (id,snapshot_id,label,type) VALUES ('f1','t1','学院','text')");
    await admin.query("INSERT INTO hr_profile_records (id,hr_id,name,template_snapshot_id,audit_status,org_id) VALUES ('r1','h1','测试甲','t1','pending','org-test')");
    await admin.query("INSERT INTO hr_profile_record_values (id,record_id,is_pending,field_id,field_value,org_id) VALUES ('v1','r1',1,'f1','待审核学院','org-test')");
    const profileInput = { schemaVersion: 2, headers: ['姓名','学号','学院'], rows: [['测试甲','001','生效学院']], basicMapping: { name: 0, studentId: 1 }, extensionMapping: [{ fieldId: 'f1', columnIndex: 2 }], decisions: {} };
    const profilePreview = await model.preview(profileInput, actor, authorize);
    await model.execute({ previewId: profilePreview.previewId, requestId: 'import_profile_01' }, actor, authorize);
    const [values] = await admin.query("SELECT is_pending,field_value FROM hr_profile_record_values WHERE record_id='r1' ORDER BY is_pending");
    assert.deepEqual(values.map(row => [row.is_pending, row.field_value]), [[0, '生效学院'], [1, '待审核学院']]);
    const [record] = await admin.query("SELECT audit_status FROM hr_profile_records WHERE id='r1'"); assert.equal(record[0].audit_status, 'pending');
    console.log('PASS 生效资料导入保留待审值及待审核状态');

    const invalidInput = Object.assign({}, newInput, { rows: [['应回滚','003'], ['', '004']] });
    const invalidPreview = await model.preview(invalidInput, actor, authorize);
    await assert.rejects(model.execute({ previewId: invalidPreview.previewId, requestId: 'import_invalid_01' }, actor, authorize), error => error.code === 'import_problems');
    assert.equal((await admin.query("SELECT COUNT(*) n FROM persons WHERE normalized_student_id='003'"))[0][0].n, 0);
    invalidInput.decisions = { rows: { 3: { exclude: true } } };
    const excludedPreview = await model.preview(invalidInput, actor, authorize);
    await model.execute({ previewId: excludedPreview.previewId, requestId: 'import_exclude_01' }, actor, authorize);
    assert.equal((await admin.query("SELECT COUNT(*) n FROM persons WHERE normalized_student_id='003'"))[0][0].n, 1);
    console.log('PASS 非法后续项整单不写，明确排除后成功');

    const rollbackInput = Object.assign({}, newInput, { rows: [['事务回滚','005']] });
    const rollbackPreview = await model.preview(rollbackInput, actor, authorize);
    await admin.query("CREATE TRIGGER import_test_failure BEFORE INSERT ON organization_memberships FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test-rollback'");
    await assert.rejects(model.execute({ previewId: rollbackPreview.previewId, requestId: 'import_rollback_1' }, actor, authorize), /test-rollback/);
    assert.equal((await admin.query("SELECT COUNT(*) n FROM persons WHERE normalized_student_id='005'"))[0][0].n, 0);
    await admin.query('DROP TRIGGER import_test_failure');
    await model.execute({ previewId: rollbackPreview.previewId, requestId: 'import_rollback_1' }, actor, authorize);
    assert.equal((await admin.query("SELECT COUNT(*) n FROM persons WHERE normalized_student_id='005'"))[0][0].n, 1);
    console.log('PASS 真实事务失败回滚及原请求重试');

    const multiInput = { schemaVersion: 2, headers: ['姓名','学号','岗位性质','部门','身份类别','职能组'], rows: [['多岗新人','007','staff','部门甲','成员','组甲'], ['多岗新人','007','liaison','新部门','成员','新职能组']], basicMapping: { name: 0, studentId: 1, nature: 2, department: 3, identity: 4, workGroup: 5 }, decisions: { rows: { 2: { mode: 'new' }, 3: { mode: 'new' } } } };
    let multiPreview = await model.preview(multiInput, actor, authorize);
    assert.equal(multiPreview.summary.canExecute, false);
    const dictIssues = await model.details({ previewId: multiPreview.previewId, category: 'dictionary' }, actor);
    multiInput.decisions.dictionaries = dictIssues.items.map(item => item.dictionaryKey);
    multiPreview = await model.preview(multiInput, actor, authorize);
    assert.equal(multiPreview.summary.canExecute, true);
    const multiResult = await model.execute({ previewId: multiPreview.previewId, requestId: 'import_multi_0001' }, actor, authorize);
    assert.equal(multiResult.saved[0].assignmentCount, 2);
    assert.equal((await admin.query("SELECT COUNT(*) n FROM work_groups g JOIN departments d ON d.id=g.department_id WHERE g.name='新职能组' AND d.name='新部门' AND g.org_id='org-test'"))[0][0].n, 1);
    console.log('PASS 同一成员新增两岗及分类确认后同事务创建');

    const exported = await model.exportTable({ includeProfile: true }, actor, authorize);
    const exportedRow = exported.rows.find(row => row[1] === '001'); assert.equal(exportedRow[6], 'a1'); assert.equal(exportedRow[7].length, 64); assert.equal(exportedRow[8], '生效学院');
    const excel = await model.exportTable({ includeProfile: true, format: 'xlsx' }, actor, authorize);
    const { parseWorkbookTables } = require('../src/utils/excelFile');
    const sheets = await parseWorkbookTables(Buffer.from(excel.fileBase64, 'base64'));
    assert.equal(sheets[0].table.find(row => row[1] === '001')[1], '001');
    const roundTrip = { schemaVersion: 2, headers: exported.headers, rows: [exportedRow], basicMapping: { name: 0, studentId: 1, nature: 2, department: 3, identity: 4, workGroup: 5, assignmentId: 6, assignmentVersion: 7 }, extensionMapping: [{ fieldId: 'f1', columnIndex: 8 }] };
    const roundPreview = await model.preview(roundTrip, actor, authorize);
    assert.equal(roundPreview.summary.canExecute, true); assert.equal(roundPreview.summary.updatedAssignments, 0);
    const concurrent = await Promise.all([model.execute({ previewId: roundPreview.previewId, requestId: 'concurrent_request_1' }, actor, authorize), model.execute({ previewId: roundPreview.previewId, requestId: 'concurrent_request_1' }, actor, authorize)]);
    assert.deepEqual(concurrent[0], concurrent[1]);
    console.log('PASS Excel文本学号、导出回导和并发重复请求');
    const issues = await model.exportIssues({ previewId: invalidPreview.previewId }, actor); assert.equal(issues.rows[0][2], '3');
    await admin.query("UPDATE hr_import_previews SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY) WHERE id=?", [invalidPreview.previewId]);
    await model.cleanup(); await assert.rejects(model.details({ previewId: invalidPreview.previewId }, actor), error => error.code === 'import_expired');
    console.log('PASS 专用导出、问题行号及过期清理');
    const express = require('express');
    await admin.query("INSERT INTO persons (id,name,student_id,normalized_student_id) VALUES ('operator','导入管理员','900','900')");
    await admin.query("INSERT INTO accounts (id,person_id,status) VALUES ('operator-account','operator','verified')");
    await admin.query("INSERT INTO admin_grants (id,person_id,org_id,admin_level) VALUES ('operator-grant','operator','','super_admin')");
    const app = express(); app.use(express.json());
    app.use((req, res, next) => {
      req.authAccount = { id: 'operator-account', personId: 'operator' };
      req.authContext = { personId: 'operator', contextId: 'admin-context', organizationId: 'org-test', role: req.get('X-Test-Role') || 'admin' };
      next();
    });
    app.use(require('../src/middleware/orgContext').orgContextMiddleware);
    app.use(require('../src/core/routes/hr'));
    const listener = app.listen(0, '127.0.0.1');
    await new Promise(resolve => listener.once('listening', resolve));
    try {
      const request = async (name, body, role) => {
        const response = await fetch('http://127.0.0.1:' + listener.address().port + '/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Role': role || 'admin' }, body: JSON.stringify(body) });
        return response.json();
      };
      assert.equal((await request('previewHrTableImport', { schemaVersion: 999 })).status, 'import_upgrade_required');
      const legacyInput = { headers: ['姓名', '学号', '部门', '身份'], rows: [['旧版兼容成员', 'legacy009', '部门甲', '成员']],
        basicMapping: { name: 0, studentId: 1, department: 2, identity: 3 }, extensionMapping: [], skipInvalid: false };
      assert.equal((await request('previewHrTableImport', legacyInput, 'user')).status, 'organization_forbidden');
      assert.equal((await request('previewHrTableImport', legacyInput)).status, 'success');
      const legacyResult = await request('importHrTable', legacyInput);
      assert.equal(legacyResult.status, 'success', JSON.stringify(legacyResult));
      const legacyRows = (await admin.query("SELECT name FROM hr_info WHERE student_id='legacy009' AND org_id='org-test'"))[0];
      assert.equal(legacyRows.length, 1); assert.equal(legacyRows[0].name, '旧版兼容成员');
      assert.notEqual((await request('previewHrTableImport', {})).status, 'import_upgrade_required');
      assert.equal((await request('previewHrTableImport', input, 'user')).status, 'organization_forbidden');
      const routedPreview = await request('previewHrTableImport', input);
      assert.equal(routedPreview.status, 'success'); assert.equal(routedPreview.summary.canExecute, true);
      const routedResult = await request('importHrTable', { schemaVersion: 2, previewId: routedPreview.previewId, requestId: 'http_import_request_1' });
      assert.equal(routedResult.status, 'success');
      assert.equal((await admin.query("SELECT work_group_id FROM membership_assignments WHERE id='a1'"))[0][0].work_group_id, 'g1');
      await admin.query("UPDATE admin_grants SET status='revoked' WHERE id='operator-grant'");
      assert.equal((await request('exportHrAssignmentTable', {})).status, 'organization_forbidden');
    } finally { await new Promise(resolve => listener.close(resolve)); }
    console.log('PASS 真实HTTP路由、数据库权限复核、保存回读与权限撤销');
    // 预览已读取人员且即将保存时，永久删除必须等待该事务，再清除新插入的计划。
    let releasePreview, reachedInsert;
    const insertionReached = new Promise(resolve => { reachedInsert = resolve; });
    const insertionRelease = new Promise(resolve => { releasePreview = resolve; });
    const previewInFlight = model.preview(input, actor, async connection => {
      const originalQuery = connection.query.bind(connection);
      connection.query = async (...args) => {
        if (String(args[0]).includes('INSERT INTO hr_import_previews')) {
          connection.query = originalQuery;
          reachedInsert(); await insertionRelease;
        }
        return originalQuery(...args);
      };
      return authorize();
    });
    await insertionReached;
    const deletionConnection = await pool.getConnection();
    let deletionComplete = false;
    const deletion = (async () => {
      try {
        await deletionConnection.beginTransaction();
        await deletionConnection.query("SELECT id FROM persons WHERE id='p1' FOR UPDATE");
        await require('../src/core/models/hrMemberDeletion').cleanupHrImportPreviews(deletionConnection,
          { personId: 'p1', studentId: '001', organizationId: 'org-test' });
        await deletionConnection.commit(); deletionComplete = true;
      } finally { deletionConnection.release(); }
    })();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(deletionComplete, false);
    releasePreview();
    const completedPreview = await previewInFlight;
    await deletion;
    assert.equal((await admin.query('SELECT id FROM hr_import_previews WHERE id=?', [completedPreview.previewId]))[0].length, 0);
    console.log('PASS 并发预览与删除共用自然人屏障，提交后无残留计划');
    const many = Array.from({ length: 5000 }, (_, index) => 'scale-' + index);
    let queryCount = 0;
    await model.loadContext({ query: async (...args) => { queryCount += 1; return pool.query(...args); } }, actor.organizationId, many, permissions, false);
    assert(queryCount <= 7); console.log('PASS 5000行人员匹配查询数=' + queryCount);
    const migrationRunner = require('../scripts/runDeploymentMigrations');
    const migrations = migrationRunner.discoverMigrations();
    const ownMigration = migrations.find(item => item.name === '20261009220000_hr_import_v2.sql');
    assert(ownMigration); assert.equal(ownMigration.destructive, false);
    // 本专项只检查本轮迁移，其他分阶段退役迁移由其独立版本/数据库测试负责。
    const planDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hr-import-migration-'));
    const planFile = path.join(planDirectory, ownMigration.name);
    try {
      fs.copyFileSync(ownMigration.path, planFile);
      const migrationPlan = await migrationRunner.planMigrations(planDirectory);
      assert(migrationPlan.pending.some(item => item.name === ownMigration.name));
    } finally { fs.unlinkSync(planFile); fs.rmdirSync(planDirectory); }
    console.log('PASS 隔离数据库迁移plan与新增非破坏性迁移识别');
    console.log('HR import v2 isolated database integration passed');
  } finally {
    if (pool) await pool.end();
    await admin.query('DROP DATABASE IF EXISTS `' + database + '`');
    await admin.query("DROP USER IF EXISTS '" + username + "'@'%'");
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
