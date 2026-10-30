'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
if (!process.env.DEPLOY_TEST_DB_HOST) throw new Error('必须显式配置隔离数据库');
const configuration = {
  host: process.env.DEPLOY_TEST_DB_HOST,
  port: Number(process.env.DEPLOY_TEST_DB_PORT || 3306),
  user: process.env.DEPLOY_TEST_DB_USER || 'root',
  password: process.env.DEPLOY_TEST_DB_PASSWORD || '',
  multipleStatements: true
};

async function main() {
  const database = 'score_snapshot_test_' + process.pid + '_' + Date.now();
  const username = 'score_snapshot_' + process.pid;
  const password = crypto.randomBytes(24).toString('hex');
  const root = await mysql.createConnection(configuration);
  let pool;
  try {
    await root.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [database]);
    await root.query('CREATE USER ?@\'%\' IDENTIFIED BY ?', [username, password]);
    await root.query('GRANT ALL PRIVILEGES ON ??.* TO ?@\'%\'', [database, username]);
    await root.query('USE ??', [database]);
    await root.query(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
    Object.assign(process.env, { DB_HOST: configuration.host, DB_PORT: String(configuration.port), DB_NAME: database, DB_USER: username, DB_PASSWORD: password,
      AUTH_IDENTITY_SECRET: crypto.randomBytes(32).toString('hex') });
    pool = require('../src/config/db');
    const participants = require('../src/modules/scoring/services/participants');
    const identity = require('../src/core/models/unifiedIdentity');
    const helpers = require('../src/utils/helpers');
    const { orgStorage } = require('../src/utils/orgContext');
    await root.query("INSERT INTO organizations(id,name) VALUES ('org','测试组织')");
    await root.query("INSERT INTO departments(id,name,org_id) VALUES ('department','原部门','org')");
    await root.query("INSERT INTO identities(id,name,org_id) VALUES ('identity','成员','org')");
    for (const id of ['scorer', 'target']) {
      await root.query('INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?)', [id, id, id, id]);
      await root.query("INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,?,?,'org')", ['hr-' + id, id, id]);
      await root.query("INSERT INTO organization_memberships(id,person_id,legacy_hr_id,org_id) VALUES (?,?,?,'org')", ['membership-' + id, id, 'hr-' + id]);
      await root.query("INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES (?,?,'org','staff','department','identity')", ['assignment-' + id, 'membership-' + id]);
    }
    await root.query("INSERT INTO score_activities(id,name,org_id) VALUES ('activity','测试活动','org')");
    await root.query("INSERT INTO rate_target_rules(id,activity_id,scorer_department_id,scorer_identity_id,org_id) VALUES ('rule','activity','department','identity','org')");
    const scorer = await participants.resolveParticipant('org', 'assignment-scorer');
    const target = await participants.resolveParticipant('org', 'assignment-target');
    const targetSnapshot = participants.buildAssignmentSnapshot(target);
    const source = fs.readFileSync(path.join(__dirname, '../src/modules/scoring/routes/scoring.js'), 'utf8');
    const snapshotBuilders = vm.runInNewContext(
      source.slice(source.indexOf('function snapshotQuestion('), source.indexOf('function historicalParticipant('))
        + '\n({ buildTemplateConfigSignature, buildCalculationContextSnapshot })',
      { safeString: helpers.safeString, toNumber: helpers.toNumber, crypto, participantService: participants,
        canonicalizeCalculationSnapshot: require('../src/modules/scoring/utils/calculationSnapshotSchema').canonicalizeCalculationSnapshot }
    );
    const clause = { id: 'score-clause', scopeType: 'all_people', requireAllComplete: false,
      templateConfigs: [{ templateId: 'template', weight: 1, sortOrder: 1 }] };
    const templates = new Map([['template', { name: '测试模板', questions: [
      { id: 'question', question: '测试题目', min_value: 0, max_value: 100, start_value: 0, step_value: 1 }
    ] }]]);
    const templateSignature = snapshotBuilders.buildTemplateConfigSignature(clause.templateConfigs, templates);
    const calculation = snapshotBuilders.buildCalculationContextSnapshot({
      activityId: 'activity', granularity: 'assignment', capturedAt: '2026-10-30 00:00:00',
      rule: { id: 'rule', allow_self_assessment: 0 }, clause, templatesById: templates,
      templateConfigSignature: templateSignature, requiredTargetRecords: [target],
      scorer: { departmentId: 'department', identityId: 'identity' }, scorerRecord: scorer, targetRecord: target,
      scorerSubjectKey: 'assignment:assignment-scorer', targetSubjectKey: 'assignment:assignment-target', contextId: 'context-scorer'
    });
    const start = source.indexOf('await withTransaction(async (conn) => {', source.indexOf("router.post('/submitScoreRecord'"));
    const end = source.indexOf('\n    if (concurrentSubmissionResponse)', start);
    const transaction = source.slice(start, end);
    const base = {
      require: name => require(path.join(__dirname, '../src/modules/scoring/routes', name)),
      withTransaction: pool.withTransaction, generateId: helpers.generateId, safeString: helpers.safeString,
      unifiedIdentityModel: identity, participantService: participants,
      orgId: 'org', activityId: 'activity', scorerRecord: scorer, targetRecord: target,
      scorerSubjectKey: 'assignment:assignment-scorer', targetSubjectKey: 'assignment:assignment-target',
      clientRequestId: '', actorResult: { actor: { contextId: 'context-scorer' } },
      rule: { id: 'rule' }, templateConfigSignature: templateSignature, nowUtc: '2026-10-30 00:00:00',
      calculationContextSnapshot: calculation,
      normalizedAnswers: [{ questionIndex: 1, score: 80 }], localeCopy: { scoreRevisionConflict: '重新载入' }
    };
    const execute = context => vm.runInNewContext('(async () => { let resultRecordId; let duplicateResponse; let concurrentSubmissionResponse;\n'
      + transaction + '\nreturn {resultRecordId, concurrentSubmissionResponse}; })()', context);
    // 两个首提请求的前置读取都为空，随后第一个提交，再执行第二个事务。
    assert.equal((await root.query('SELECT id FROM score_records'))[0].length, 0);
    const first = await execute(base);
    const read = async () => {
      const [records] = await root.query('SELECT * FROM score_records WHERE id=?', [first.resultRecordId]);
      const [answers] = await root.query('SELECT question_index,score FROM score_answers WHERE record_id=?', [first.resultRecordId]);
      return { record: records[0], answers };
    };
    const before = await read();
    assert.deepEqual(before.record.scorer_context_snapshot, before.record.calculation_context_snapshot.scorer.context);
    assert.deepEqual(before.record.target_context_snapshot, before.record.calculation_context_snapshot.target.context);
    assert.equal(Number(before.answers[0].score), 80);
    assert.equal(before.record.calculation_context_snapshot.version, 2);
    assert.match(before.record.calculation_context_snapshot.calculationPolicySignature, /^v2:/);
    await root.query("UPDATE departments SET name='改名后的部门' WHERE id='department'");
    const second = await execute({ ...base, normalizedAnswers: [{ questionIndex: 1, score: 20 }],
      calculationContextSnapshot: { version: 2, scorer: { context: { assignmentLabel: '新的岗位依据' } } } });
    assert.equal(second.concurrentSubmissionResponse.status, 'score_revision_conflict');
    assert.deepEqual(await read(), before, '竞态请求不能覆盖岗位、计算依据、时间、版本或答案');
    await root.query("INSERT INTO result_publications(id,activity_id,org_id) VALUES ('publication','activity','org')");
    await root.query("INSERT INTO pub_merit_rules(id,publication_id,grantee_department_id,grantee_identity_id,org_id) VALUES ('merit-rule','publication','department','identity','org')");
    await root.query("INSERT INTO pub_merit_rule_clauses(id,rule_id,target_identity_id,org_id) VALUES ('clause','merit-rule','identity','org')");
    const publicationSource = fs.readFileSync(path.join(__dirname, '../src/modules/scoring/routes/publications.js'), 'utf8');
    const helperStart = publicationSource.indexOf('function buildDesignatorSnapshot(');
    const helperEnd = publicationSource.indexOf('// ─── getResultPublication', helperStart);
    const build = vm.runInNewContext(publicationSource.slice(helperStart, helperEnd) + '\nbuildDesignatorSnapshot', { safeString: helpers.safeString, participantService: participants });
    const administrator = build({ authContext: { contextId: 'admin:grant', personId: 'scorer', organizationId: 'org',
      organizationName: '测试组织', adminGrantId: 'grant', adminLevel: 'super_admin', identityName: '超级管理员' } }, { type: 'admin', name: '管理员' });
    const designationModel = require('../src/modules/scoring/models/meritListDesignation');
    await orgStorage.run('org', () => designationModel.create('designation', { publicationId: 'publication', clauseId: 'clause',
      targetHrId: 'hr-target', targetAssignmentId: target.assignment_id, targetContextSnapshot: targetSnapshot,
      designatedBy: 'admin-record', designatedByPersonId: 'scorer', designatedByContextSnapshot: administrator }));
    const saved = await orgStorage.run('org', () => designationModel.getById('designation'));
    assert.deepEqual(saved.designated_by_context_snapshot, JSON.parse(JSON.stringify(administrator)));
    assert.equal(saved.designated_by_context_snapshot.assignmentId, '');
    assert.equal(saved.designated_by_context_snapshot.organizationName, '测试组织');
    assert.equal(saved.designated_by_context_snapshot.adminGrantId, 'grant');
    assert.deepEqual(saved.target_context_snapshot, targetSnapshot);
    console.log('真实隔离 MySQL：评分首次写入回读、首次提交竞态不覆盖、管理身份指定保存回读共3组通过（非HTTP）');
  } finally {
    if (pool) await pool.end();
    await root.query('DROP DATABASE IF EXISTS ??', [database]);
    await root.query('DROP USER IF EXISTS ?@\'%\'', [username]);
    await root.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
