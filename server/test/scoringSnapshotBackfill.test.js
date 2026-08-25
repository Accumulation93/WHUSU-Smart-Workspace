'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const backfill = require('../scripts/backfillScoreCalculationSnapshots');

function participant(id, personId, departmentId, identityId) {
  return {
    id,
    membership_id: 'membership-' + id,
    legacy_hr_id: 'legacy-' + id,
    person_id: personId,
    name: '测试成员',
    student_id: 'student-' + id,
    assignment_kind: 'staff',
    department_id: departmentId,
    identity_id: identityId,
    work_group_id: '',
    org_id: 'org-1',
    department: '部门',
    identity: '身份',
    work_group: '',
    organization_name: '组织',
    legacy_hr_created_at: '2026-01-01 00:00:00',
    legacy_department_id: departmentId,
    legacy_identity_id: identityId,
    legacy_work_group_id: '',
    assignment_status: 'active',
    revoked_by_departure_id: null,
    assignment_created_at: '2026-07-29 00:00:00',
    assignment_updated_at: '2026-07-29 00:00:00'
  };
}

function dataset(records) {
  return {
    records,
    answers: records.flatMap((record) => ([
      { record_id: record.id, question_index: 1, score: 3 },
      { record_id: record.id, question_index: 2, score: 4 }
    ])),
    rules: [{
      id: 'rule-1', activity_id: 'activity-1', org_id: 'org-1',
      scorer_department_id: 'department-1', scorer_identity_id: 'identity-scorer',
      allow_self_assessment: 0, is_active: 1, updated_at: '2026-05-01 00:00:00'
    }, {
      id: 'rule-2', activity_id: 'activity-2', org_id: 'org-1',
      scorer_department_id: 'department-1', scorer_identity_id: 'identity-scorer',
      allow_self_assessment: 0, is_active: 1, updated_at: '2026-05-01 00:00:00'
    }],
    clauses: [{
      id: 'clause-1', rule_id: 'rule-1', scope_type: 'same_department_identity',
      target_identity_id: 'identity-target', require_all_complete: 1
    }, {
      id: 'clause-2', rule_id: 'rule-2', scope_type: 'same_department_identity',
      target_identity_id: 'identity-target', require_all_complete: 0
    }],
    configs: [{
      id: 'config-1', clause_id: 'clause-1', sort_order: 1, template_id: 'template-1',
      weight: 0.5, calculation_method: 'weighted_average', trim_high_count: 0, trim_low_count: 0
    }, {
      id: 'config-2', clause_id: 'clause-2', sort_order: 1, template_id: 'template-1',
      weight: 0.5, calculation_method: 'weighted_average', trim_high_count: 0, trim_low_count: 0
    }],
    templates: [{ id: 'template-1', name: '模板', updated_at: '2026-05-01 00:00:00' }],
    questions: [{
      id: 'question-1', template_id: 'template-1', sort_order: 1, question: '第一题', score_label: '',
      min_value: 0, start_value: 0, max_value: 5, step_value: 1
    }, {
      id: 'question-2', template_id: 'template-1', sort_order: 2, question: '第二题', score_label: '',
      min_value: 0, start_value: 0, max_value: 5, step_value: 1
    }],
    participants: [
      participant('assignment-scorer', 'person-scorer', 'department-1', 'identity-scorer'),
      participant('assignment-target', 'person-target', 'department-1', 'identity-target')
    ]
  };
}

function record(id, activityId, ruleId, signature) {
  return {
    id,
    activity_id: activityId,
    org_id: 'org-1',
    rule_id: ruleId,
    scorer_id: 'legacy-assignment-scorer',
    scorer_person_id: 'person-scorer',
    scorer_assignment_id: 'assignment-scorer',
    scorer_subject_key: 'legacy:scorer',
    target_id: 'legacy-assignment-target',
    target_person_id: 'person-target',
    target_assignment_id: 'assignment-target',
    target_subject_key: 'legacy:target',
    template_config_signature: signature,
    calculation_context_snapshot: null,
    submitted_at: '2026-06-01 00:00:00'
  };
}

const exactSignature = 'template-1[2|weighted_average|0|0]';
const eligibleDataset = dataset([
  record('record-1', 'activity-1', 'rule-1', exactSignature),
  record('record-2', 'activity-2', 'rule-2', exactSignature)
]);
const eligible = backfill.analyzeDataset(eligibleDataset, { reconstructedAt: '2026-08-26T00:00:00.000Z' });
assert.strictEqual(eligible.canBackfillAll, true);
assert.strictEqual(eligible.eligibleRecordCount, 2);
assert(eligible.activities.every((activity) => activity.status === 'ready'));

const firstEntry = eligible.activities[0].entries[0];
assert.strictEqual(firstEntry.calculationSnapshot.reconstruction.mode,
  'legacy_exact_signature_timestamp_proven');
assert.deepStrictEqual(firstEntry.calculationSnapshot.reconstruction.signedFields,
  ['templateId', 'questionCount', 'calculationMethod', 'trimHighCount', 'trimLowCount']);
assert(firstEntry.calculationSnapshot.reconstruction.provenFields.includes('weight'),
  '父规则版本早于提交且规则写路由保证子配置变更触碰父规则时，权重才可标记为已证明');
assert.deepStrictEqual(firstEntry.calculationSnapshot.reconstruction.cutoverFields, []);
assert.strictEqual(firstEntry.calculationSnapshot.clause.requiredTargets.length, 1,
  'requiredTargets 必须按提交时成员与岗位有效区间重建，不能用实际评分记录倒推');
assert.strictEqual(firstEntry.scorerContext.assignmentId, 'assignment-scorer');

const unscoredRequiredTargetDataset = dataset([
  record('record-with-unscored-target', 'activity-1', 'rule-1', exactSignature)
]);
unscoredRequiredTargetDataset.participants.push(
  participant('assignment-target-unscored', 'person-target-unscored', 'department-1', 'identity-target')
);
const unscoredRequiredTarget = backfill.analyzeDataset(unscoredRequiredTargetDataset);
assert.strictEqual(
  unscoredRequiredTarget.activities[0].entries[0].calculationSnapshot.clause.requiredTargets.length,
  2,
  'requiredTargets 必须包含提交时 scope 内尚未产生评分记录的人，不能用已打分集合冒充应评集合'
);

const joinedLaterTargetDataset = dataset([
  record('record-before-new-member', 'activity-1', 'rule-1', exactSignature)
]);
const joinedLaterTarget = participant(
  'assignment-target-joined-later', 'person-target-joined-later', 'department-1', 'identity-target'
);
joinedLaterTarget.legacy_hr_created_at = '2026-06-02 00:00:00';
joinedLaterTargetDataset.participants.push(joinedLaterTarget);
const joinedLaterResult = backfill.analyzeDataset(joinedLaterTargetDataset);
assert.strictEqual(
  joinedLaterResult.activities[0].entries[0].calculationSnapshot.clause.requiredTargets.length,
  1,
  '提交后才进入 legacy hr_info 的成员不得进入历史 requiredTargets'
);

const blankAssignmentReferenceDataset = dataset([
  record('record-blank-assignment', 'activity-1', 'rule-1', exactSignature)
]);
blankAssignmentReferenceDataset.records[0].scorer_assignment_id = '';
blankAssignmentReferenceDataset.records[0].target_assignment_id = '';
const blankAssignmentReference = backfill.analyzeDataset(blankAssignmentReferenceDataset);
assert.strictEqual(blankAssignmentReference.canBackfillAll, true,
  '旧记录 assignment_id 为空时必须由 org + legacy_hr_id 唯一映射证明后补入快照');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return {};
  if (request === '../../../utils/logger') return { logger: { debug() {} } };
  return originalLoad.call(this, request, parent, isMain);
};
const { validateCalculationSnapshot } = require('../src/modules/scoring/utils/scoreCalc');
Module._load = originalLoad;
assert.strictEqual(validateCalculationSnapshot({
  template_config_signature: exactSignature,
  calculation_context_snapshot: firstEntry.calculationSnapshot
}, 'activity-1').ok, true, '回填结果必须通过线上不可变快照完整性验证');

const mixedDataset = dataset([
  record('record-good', 'activity-1', 'rule-1', exactSignature),
  record('record-bad', 'activity-1', 'rule-1', 'unmatched-signature'),
  record('record-other-activity', 'activity-2', 'rule-2', exactSignature)
]);
const mixed = backfill.analyzeDataset(mixedDataset, { reconstructedAt: '2026-08-26T00:00:00.000Z' });
assert.strictEqual(mixed.canBackfillAll, false);
assert.strictEqual(mixed.activities.find((item) => item.activityId === 'activity-1').status, 'isolated',
  '同一活动只要存在一条无法证明的记录，就必须整体隔离，不能形成半套解释');
assert.strictEqual(mixed.activities.find((item) => item.activityId === 'activity-1').blockedRecordCount, 2);
assert.strictEqual(mixed.activities.find((item) => item.activityId === 'activity-2').status, 'ready',
  '一个活动不一致时不得阻止另一个完全可证明活动回填发布');
assert.strictEqual(mixed.eligibleRecordCount, 1);

const lateRuleDataset = dataset([record('record-late-rule', 'activity-1', 'rule-1', exactSignature)]);
lateRuleDataset.rules[0].updated_at = '2026-06-01 00:00:01';
const lateRule = backfill.analyzeDataset(lateRuleDataset);
assert.strictEqual(lateRule.canBackfillAll, false);
assert.strictEqual(lateRule.activities[0].reasons.rule_updated_after_submission, 1,
  '父规则晚于提交时必须阻断，不能使用当前权重解释历史记录');

const lateTemplateDataset = dataset([record('record-late-template', 'activity-1', 'rule-1', exactSignature)]);
lateTemplateDataset.templates[0].updated_at = '2026-06-01 00:00:01';
const lateTemplate = backfill.analyzeDataset(lateTemplateDataset);
assert.strictEqual(lateTemplate.activities[0].reasons.template_updated_after_submission, 1,
  '模板晚于提交时必须阻断，不能使用当前题目解释历史答案');

const invalidAnswerDataset = dataset([record('record-invalid-answer', 'activity-1', 'rule-1', exactSignature)]);
invalidAnswerDataset.answers[0].score = 3.5;
const invalidAnswer = backfill.analyzeDataset(invalidAnswerDataset);
assert.strictEqual(invalidAnswer.activities[0].reasons.answer_step_mismatch, 1,
  '答案必须同时满足题目范围与步长');

const ambiguousAssignmentDataset = dataset([
  record('record-ambiguous-assignment', 'activity-1', 'rule-1', exactSignature)
]);
const duplicateScorerAssignment = participant(
  'assignment-scorer-duplicate', 'person-scorer', 'department-1', 'identity-scorer'
);
duplicateScorerAssignment.legacy_hr_id = 'legacy-assignment-scorer';
ambiguousAssignmentDataset.participants.push(duplicateScorerAssignment);
const ambiguousAssignment = backfill.analyzeDataset(ambiguousAssignmentDataset);
assert.strictEqual(ambiguousAssignment.activities[0].reasons.scorer_legacy_assignment_ambiguous, 1,
  'org + legacy_hr_id 在提交时存在多个岗位时必须阻断');

const futureMemberDataset = dataset([record('record-future-member', 'activity-1', 'rule-1', exactSignature)]);
futureMemberDataset.participants[1].legacy_hr_created_at = '2026-06-02 00:00:00';
const futureMember = backfill.analyzeDataset(futureMemberDataset);
assert.strictEqual(futureMember.activities[0].reasons.target_legacy_assignment_missing, 1,
  '提交后才加入或创建的岗位不得进入历史 requiredTargets');

const publicReport = backfill.publicReport(eligible);
assert(!Object.prototype.hasOwnProperty.call(publicReport.activities[0], 'entries'),
  '预检输出不得包含姓名、学号或完整人员快照');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'db/deploy/20260825234500_score_calculation_context_snapshot.sql'),
  'utf8'
);
const deploy = fs.readFileSync(path.join(root, 'scripts/deployProduction.sh'), 'utf8');
assert(migration.includes('score_snapshot_backfill_audits')
  && !migration.includes('historical_record_count')
  && !migration.includes('missing_snapshot_count'),
'SQL 迁移只负责结构和隔离账本，不能在证明性脚本运行前一刀切阻断所有旧记录');
assert(deploy.includes('backfillScoreCalculationSnapshots.js')
  && deploy.includes('backfillScoreCalculationSnapshots.js" --require-all')
  && deploy.includes('backfillScoreCalculationSnapshots.js" --apply --require-all'),
'部署的只读预检与写入都必须启用全量证明门禁');
const scriptSource = fs.readFileSync(
  path.join(root, 'scripts/backfillScoreCalculationSnapshots.js'),
  'utf8'
);
assert(scriptSource.indexOf('if (apply && !analysis.canBackfillAll)')
  < scriptSource.indexOf('await persistAnalysis(connection, analysis)'),
'apply 必须在任何持久化之前拒绝存在 isolated 活动的数据集');
assert(scriptSource.includes("scorer_assignment_id = COALESCE(NULLIF(TRIM(record_row.scorer_assignment_id), ''), pending.scorer_assignment_id)")
  && scriptSource.includes("target_assignment_id = COALESCE(NULLIF(TRIM(record_row.target_assignment_id), ''), pending.target_assignment_id)"),
'唯一映射证明通过后，必须在同一事务补齐旧记录为空的 person/assignment 引用');
const backfillUpdate = scriptSource.slice(
  scriptSource.indexOf('UPDATE score_records record_row'),
  scriptSource.indexOf('for (const activity of analysis.activities)', scriptSource.indexOf('UPDATE score_records record_row'))
);
assert(!/subject_key\s*=/.test(backfillUpdate),
  '旧 subject_key 不是本次证明字段，不得静默改写；历史读取必须以不可变快照为准');

console.log('评分历史快照证明性预检、按活动隔离与部署回填测试通过');
