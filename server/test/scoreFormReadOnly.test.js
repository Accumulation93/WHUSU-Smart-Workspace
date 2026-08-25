'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';

let answerReads = 0;
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

const emptyModel = {};
const mocks = {
  '../../../core/models/department': { async getAll() { return [{ id: 'department-1', name: '部门' }]; } },
  '../../../core/models/identity': { async getAll() { return [{ id: 'identity-scorer', name: '评分人' }, { id: 'identity-target', name: '被评人' }]; } },
  '../../../core/models/workGroup': { async getAll() { return []; } },
  '../utils/pubCache': { async invalidate() {} },
  '../models/scoreActivity': { async getCurrent() { return { id: 'activity-1', name: '活动', is_paused: 0, participant_granularity: 'assignment' }; } },
  '../models/scoreTemplate': { async getById() { return { id: 'template-1', name: '模板', description: '' }; } },
  '../models/scoreQuestion': { async getByTemplateId() { return [{ id: 'question-1', question: '新问题', score_label: '', min_value: 0, start_value: 0, max_value: 100, step_value: 1 }]; } },
  '../models/rateRule': {
    async getByKey() { return { id: 'rule-1', is_active: 1, allow_self_assessment: 0 }; },
    async getById() { return { id: 'rule-1', is_active: 1, allow_self_assessment: 0 }; }
  },
  '../models/rateRuleClause': { async getByRuleId() { return [{ id: 'clause-1', scope_type: 'all_people', target_identity_id: '', require_all_complete: 0 }]; } },
  '../models/clauseTemplateConfig': { async getByClauseIds() { return [{ clause_id: 'clause-1', template_id: 'template-1', weight: 1, sort_order: 1, calculation_method: 'weighted_average', trim_high_count: 0, trim_low_count: 0 }]; } },
  '../models/scoreRecord': {
    async getByParticipantPair() { return [{ id: 'historical-record', submitted_at: '2026-08-01 00:00:00', template_config_signature: 'v1:historical' }]; },
    async remove() { throw new Error('读取评分表单不得删除评分记录'); }
  },
  '../models/scoreAnswer': {
    async getByRecordId() { answerReads += 1; return []; },
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
  assert.strictEqual(payload.status, 'historical_structure_conflict');
  assert.strictEqual(payload.readOnly, true);
  assert.strictEqual(payload.historicalRecord.id, 'historical-record');
  assert.strictEqual(answerReads, 0, '结构冲突时不得用当前问题顺序读取并映射历史答案');

  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/scoring/routes/scoring.js'), 'utf8');
  const formRoute = source.slice(
    source.indexOf("router.post('/getScoreFormData'"),
    source.indexOf("router.post('/submitScoreRecord'")
  );
  assert(!formRoute.includes('scoreRecordModel.remove('));
  assert(!formRoute.includes('scoreAnswerModel.removeByRecordId('));
  console.log('评分表单历史结构冲突只读契约测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
