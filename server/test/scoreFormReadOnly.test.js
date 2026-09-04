'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { buildCalculationPolicySignature } = require('../src/modules/scoring/utils/calculationSnapshotSignature');

process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';

let answerReads = 0;
const historicalTemplates = [{
  templateId: 'template-old', templateName: '旧版评分表', weight: 1, sortOrder: 1,
  calculationMethod: 'weighted_average', trimHighCount: 0, trimLowCount: 0,
  questions: [{
    id: 'question-old', questionIndex: 1, globalQuestionIndex: 1,
    question: '旧版问题', scoreLabel: '历史标准', minValue: 0, startValue: 0, maxValue: 100, stepValue: 1
  }]
}];
const historicalPolicy = {
  rule: { id: 'rule-1', scorerDepartmentId: 'department-1', scorerIdentityCategoryId: 'identity-scorer', allowSelfAssessment: false },
  clause: { id: 'clause-old', scopeType: 'all_people', targetIdentityCategoryId: '', requireAllComplete: false, requiredTargets: [] },
  templates: historicalTemplates
};
const historicalCalculationSnapshot = {
  version: 1,
  capturedAt: '2026-08-01 00:00:00',
  activityId: 'activity-1',
  participantGranularity: 'assignment',
  templateConfigSignature: 'v2:historical',
  calculationPolicySignature: buildCalculationPolicySignature(historicalPolicy, 1),
  scorer: { participantId: 'assignment-scorer', subjectKey: 'assignment:assignment-scorer' },
  target: { participantId: 'assignment-target', subjectKey: 'assignment:assignment-target' },
  rule: historicalPolicy.rule,
  clause: historicalPolicy.clause,
  templates: historicalTemplates
};
const scorer = {
  id: 'assignment-scorer', assignment_id: 'assignment-scorer', legacy_hr_id: 'hr-scorer',
  person_id: 'person-scorer', membership_id: 'membership-scorer', name: '评分人', student_id: '1',
  department_id: 'department-1', identity_id: 'identity-scorer', work_group_id: '', assignment_kind: 'staff'
};
const target = {
  id: 'assignment-target', assignment_id: 'assignment-target', legacy_hr_id: 'hr-target',
  person_id: 'person-target', membership_id: 'membership-target', name: '被评人', student_id: '2',
  department_id: 'department-1', identity_id: 'identity-target', work_group_id: '', assignment_kind: 'staff'
};
let activeHistoricalRecord = {
  id: 'historical-record', rule_id: 'rule-1', submitted_at: '2026-08-01 00:00:00',
  revision_number: 3,
  template_config_signature: 'v2:historical',
  calculation_context_snapshot: JSON.stringify(historicalCalculationSnapshot)
};
let currentTemplateReads = 0;
let historicalParticipantAvailable = true;

const emptyModel = {};
const mocks = {
  '../../../core/models/department': { async getAll() { return [{ id: 'department-1', name: '部门' }]; } },
  '../../../core/models/identity': { async getAll() { return [{ id: 'identity-scorer', name: '评分人' }, { id: 'identity-target', name: '被评人' }]; } },
  '../../../core/models/workGroup': { async getAll() { return []; } },
  '../utils/pubCache': { async invalidate() {} },
  '../models/scoreActivity': {
    async getCurrent() {
      return {
        id: 'activity-1', name: '活动', is_paused: 1,
        start_date: '2099-01-01', end_date: '2000-01-01',
        participant_granularity: 'assignment'
      };
    }
  },
  '../models/scoreTemplate': { async getById() { currentTemplateReads += 1; return { id: 'template-1', name: '模板', description: '' }; } },
  '../models/scoreQuestion': { async getByTemplateId() { return [{ id: 'question-1', question: '新问题', score_label: '', min_value: 0, start_value: 0, max_value: 100, step_value: 1 }]; } },
  '../models/rateRule': {
    async getByKey() { return { id: 'rule-1', is_active: 1, allow_self_assessment: 0 }; },
    async getById() { return { id: 'rule-1', is_active: 1, allow_self_assessment: 0 }; }
  },
  '../models/rateRuleClause': { async getByRuleId() { return [{ id: 'clause-1', scope_type: 'all_people', target_identity_id: '', require_all_complete: 0 }]; } },
  '../models/clauseTemplateConfig': { async getByClauseIds() { return [{ clause_id: 'clause-1', template_id: 'template-1', weight: 1, sort_order: 1, calculation_method: 'weighted_average', trim_high_count: 0, trim_low_count: 0 }]; } },
  '../models/scoreRecord': {
    async getByParticipantPair() {
      return [activeHistoricalRecord];
    },
    async remove() { throw new Error('读取评分表单不得删除评分记录'); }
  },
  '../models/scoreAnswer': {
    async getByRecordId() { answerReads += 1; return [{ question_index: 1, score: 88 }]; },
    async removeByRecordId() { throw new Error('读取评分表单不得删除评分答案'); }
  },
  '../../../core/models/adminInfo': emptyModel,
  '../../../core/services/currentActor': { async resolveCurrentActor() { return { ok: true, actor: { type: 'user', assignmentId: scorer.id, contextId: 'ctx-scorer' } }; } },
  '../../../core/models/unifiedIdentity': emptyModel,
  '../services/participants': {
    normalizeGranularity() { return 'assignment'; },
    async resolveActorParticipant() { return scorer; },
    async resolveParticipant() { return target; },
    isSameNaturalPerson(left, right) { return left.person_id === right.person_id; },
    buildAssignmentLabel(record) { return record.identity_id + ' · ' + record.department_id; },
    buildAssignmentSnapshot(record) { return { assignmentId: record.assignment_id, personId: record.person_id }; },
    resolveHistoricalParticipant(record, side) {
      const source = side === 'scorer' ? scorer : target;
      if (!historicalParticipantAvailable) {
        return {
          assignmentId: source.assignment_id,
          personId: source.person_id,
          name: '',
          studentId: '',
          departmentId: '',
          department: '',
          identityCategoryId: '',
          identityCategory: '',
          historicalAssignmentUnavailable: true
        };
      }
      return {
        assignmentId: source.assignment_id,
        personId: source.person_id,
        name: source.name,
        studentId: source.student_id,
        departmentId: source.department_id,
        department: '部门',
        identityCategoryId: source.identity_id,
        identityCategory: side === 'scorer' ? '评分人' : '被评人',
        historicalAssignmentUnavailable: false
      };
    },
    participantSubjectKey(record) { return 'assignment:' + record.assignment_id; },
    async listParticipants() { return [scorer, target]; }
  },
  '../../../utils/orgContext': { async getCurrentOrgId() { return 'org-1'; } }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const router = require('../src/modules/scoring/routes/scoring');
Module._load = originalLoad;

const layer = router.stack.find((item) => item.route && item.route.path === '/getScoreFormData');
assert(layer, '缺少 getScoreFormData 路由');

(async function run() {
  let payload;
  await layer.route.stack[0].handle({ body: { targetId: target.id } }, {
    json(value) { payload = value; return value; }
  });
  assert.strictEqual(payload.status, 'success');
  assert.strictEqual(payload.readOnly, false, '完整历史快照必须允许重新修改');
  assert.strictEqual(payload.existingRecord.id, 'historical-record');
  assert.strictEqual(payload.existingRecord.revisionNumber, 3);
  assert.strictEqual(payload.templateBundle.questions[0].question, '旧版问题');
  assert.strictEqual(payload.templateBundle.questions[0].score, '88');
  assert.strictEqual(answerReads, 1, '结构冲突时应按不可变历史题目快照映射历史答案');
  assert.strictEqual(currentTemplateReads, 0, '历史评分不得再读取当前模板来解释旧答案');
  assert.strictEqual(payload.currentActivity.id, 'activity-1', '活动暂停或时间范围变化后历史记录仍须正常打开');

  activeHistoricalRecord = Object.assign({}, activeHistoricalRecord, {
    calculation_context_snapshot: JSON.stringify(Object.assign({}, historicalCalculationSnapshot, {
      calculationPolicySignature: 'invalid-signature'
    }))
  });
  payload = null;
  await layer.route.stack[0].handle({ body: { targetId: target.id } }, {
    json(value) { payload = value; return value; }
  });
  assert.strictEqual(payload.status, 'success');
  assert.strictEqual(payload.readOnly, true, '缺少可验证题目范围的降级记录才允许只读');
  assert.strictEqual(payload.readOnlyReason, 'historical_snapshot_degraded');
  assert.strictEqual(payload.templateBundle.degraded, true);
  assert.strictEqual(payload.templateBundle.questions[0].question, '历史评分第 1 题');
  assert.strictEqual(payload.templateBundle.questions[0].score, '88');
  assert.strictEqual(currentTemplateReads, 0, '验签失败的旧记录也不得套用当前模板');

  historicalParticipantAvailable = false;
  payload = null;
  await layer.route.stack[0].handle({ body: { targetId: target.id } }, {
    json(value) { payload = value; return value; }
  });
  assert.strictEqual(payload.scorer.historicalAssignmentUnavailable, true);
  assert.strictEqual(payload.scorer.name, '', '缺少历史岗位快照时不得回填当前评分人资料');
  assert.strictEqual(payload.scorer.department, '', '缺少历史岗位快照时不得把当前部门伪装为历史部门');
  assert.strictEqual(payload.target.name, '', '缺少历史岗位快照时不得回填当前被评分人资料');

  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/scoring/routes/scoring.js'), 'utf8');
  const formRoute = source.slice(
    source.indexOf("router.post('/getScoreFormData'"),
    source.indexOf("router.post('/submitScoreRecord'")
  );
  assert(!formRoute.includes("status: 'historical_structure_conflict'"));
  assert(!formRoute.includes('scoreRecordModel.remove('));
  assert(!formRoute.includes('scoreAnswerModel.removeByRecordId('));
  console.log('评分表单按不可变历史题目快照恢复及降级只读详情测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
