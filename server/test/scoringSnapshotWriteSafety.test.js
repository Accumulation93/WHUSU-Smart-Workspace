'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { safeString } = require('../src/utils/helpers');
process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';
const participantService = require('../src/modules/scoring/services/participants');

const publicationSource = fs.readFileSync(path.join(__dirname, '../src/modules/scoring/routes/publications.js'), 'utf8');
const designatorStart = publicationSource.indexOf('function buildDesignatorSnapshot(');
const designatorEnd = publicationSource.indexOf('// ─── getResultPublication', designatorStart);
const buildDesignatorSnapshot = vm.runInNewContext(
  publicationSource.slice(designatorStart, designatorEnd) + '\nbuildDesignatorSnapshot',
  { safeString, participantService }
);
const adminContext = {
  contextId: 'admin:grant-a', role: 'admin', personId: 'person-a', assignmentId: '',
  organizationId: 'org-a', organizationName: '测试组织', adminGrantId: 'grant-a',
  adminLevel: 'super_admin', identityName: '超级管理员'
};
const adminSnapshot = buildDesignatorSnapshot({ authContext: adminContext }, { type: 'admin', name: '管理者' });
for (const key of ['contextId', 'personId', 'organizationId', 'organizationName', 'adminGrantId', 'adminLevel', 'identityName']) {
  assert.strictEqual(adminSnapshot[key], adminContext[key], '管理指定记录必须保留认证角色的 ' + key);
}
assert.strictEqual(adminSnapshot.assignmentId, '', '管理身份不得虚构成员岗位');
const assignment = {
  assignment_id: 'assignment-a', person_id: 'person-a', organization_id: 'org-a',
  organization_name: '测试组织', department_id: 'department-a', department: '提交时部门',
  identity_id: 'identity-a', identity: '提交时身份', assignment_kind: 'staff', name: '成员'
};
const userSnapshot = buildDesignatorSnapshot({ authContext: {} }, { type: 'user', contextId: 'context-a' }, assignment);
assert.strictEqual(userSnapshot.assignmentLabel, '提交时身份 · 提交时部门');
assert.strictEqual(userSnapshot.organizationId, 'org-a');
assert.strictEqual(userSnapshot.contextId, 'context-a');
assignment.department = '调岗后的部门';
assert.strictEqual(userSnapshot.department, '提交时部门', '后续岗位变化不能改变已生成的历史资料');

// 执行实际事务回调，模拟前置查询为空后另一请求先提交成功的竞态。
const scoringSource = fs.readFileSync(path.join(__dirname, '../src/modules/scoring/routes/scoring.js'), 'utf8');
const submissionStart = scoringSource.indexOf("router.post('/submitScoreRecord'");
const transactionStart = scoringSource.indexOf('await withTransaction(async (conn) => {', submissionStart);
const transactionEnd = scoringSource.indexOf('\n    if (concurrentSubmissionResponse)', transactionStart);
const transactionSource = scoringSource.slice(transactionStart, transactionEnd);
assert(transactionStart > submissionStart && transactionEnd > transactionStart);
const history = {
  id: 'already-saved', scorer_context_snapshot: { assignmentLabel: '原评分岗位' },
  target_context_snapshot: { assignmentLabel: '原目标岗位' },
  calculation_context_snapshot: { scorer: { context: { assignmentLabel: '原评分岗位' } } },
  answers: [{ questionIndex: 1, score: 80 }]
};
const originalHistory = JSON.stringify(history);
let completedResponse;
let writes = 0;
const connection = {
  async query(sql) {
    if (String(sql).trim().startsWith('SELECT id, submitted_at, template_config_signature')) return [[history]];
    writes += 1;
    throw new Error('首次提交竞态不得改写已保存记录或答案');
  }
};
const context = {
  require() {
    return {
      stableResourceId() { return 'resource-a'; },
      async claim() { return { claimed: true }; },
      async complete(_connection, _claim, response) { completedResponse = response; }
    };
  },
  async withTransaction(callback) { return callback(connection); },
  generateId() { return 'candidate-id'; }, safeString,
  unifiedIdentityModel: { async lockActiveBusinessSubjects() {} },
  scorerRecord: assignment, targetRecord: { ...assignment, assignment_id: 'assignment-b' },
  orgId: 'org-a', activityId: 'activity-a', scorerSubjectKey: 'assignment:a', targetSubjectKey: 'assignment:b',
  clientRequestId: 'request-b', localeCopy: { scoreRevisionConflict: '请重新载入后提交' }
};
(async () => {
  const response = await vm.runInNewContext(
    '(async () => { let resultRecordId; let duplicateResponse; let concurrentSubmissionResponse;\n'
      + transactionSource + '\nreturn concurrentSubmissionResponse; })()', context
  );
  assert.strictEqual(response.status, 'score_revision_conflict');
  assert.strictEqual(completedResponse.status, 'score_revision_conflict');
  assert.strictEqual(writes, 0);
  assert.strictEqual(JSON.stringify(history), originalHistory, '两套岗位资料、计算依据和答案必须保持原样');
  console.log('评分首次提交竞态及评优指定人资料检查通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
