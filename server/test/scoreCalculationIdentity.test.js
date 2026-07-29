const assert = require('assert');
const Module = require('module');

const participants = [
  { id: 'scorer-1', person_id: 'person-1', department_id: 'dept', identity_id: 'scorer', work_group_id: '' },
  { id: 'scorer-2', person_id: 'person-2', department_id: 'dept', identity_id: 'scorer', work_group_id: '' },
  { id: 'target-1', person_id: 'person-3', department_id: 'dept', identity_id: 'target', work_group_id: '' },
  { id: 'target-2', person_id: 'person-4', department_id: 'dept', identity_id: 'target', work_group_id: '' }
];

const records = [
  {
    id: 'record-1',
    scorer_id: 'scorer-1',
    target_id: 'target-1',
    rule_id: 'rule-1',
    template_config_signature: 'template-1[1|weighted_average|0|0]'
  },
  {
    id: 'record-2',
    scorer_id: 'scorer-1',
    target_id: 'target-2',
    rule_id: 'rule-1',
    template_config_signature: 'template-1[1|weighted_average|0|0]'
  },
  {
    id: 'record-3',
    scorer_id: 'scorer-2',
    target_id: 'target-1',
    rule_id: 'rule-1',
    template_config_signature: 'template-1[1|weighted_average|0|0]'
  }
];

const answerScores = {
  'record-1': 10,
  'record-2': 20,
  'record-3': 100
};

const pool = {
  async query(sql) {
    if (sql.includes('SELECT participant_granularity')) return [[{ participant_granularity: 'person' }]];
    if (sql.includes('FROM rate_target_rules')) {
      return [[{
        id: 'rule-1',
        scorer_department_id: 'dept',
        scorer_identity_id: 'scorer',
        allow_self_assessment: 1
      }]];
    }
    if (sql.includes('FROM score_records')) return [records];
    if (sql.includes('FROM score_question_templates')) {
      return [[{ id: 'template-1', name: '模板' }]];
    }
    if (sql.includes('FROM score_questions')) {
      return [[{
        id: 'question-1',
        template_id: 'template-1',
        sort_order: 1,
        question: '评分',
        score_label: '',
        min_value: 0,
        start_value: 0,
        max_value: 100,
        step_value: 1
      }]];
    }
    if (sql.includes('FROM rate_rule_clauses')) {
      return [[{
        id: 'clause-1',
        rule_id: 'rule-1',
        scope_type: 'all_people',
        target_identity_id: 'target',
        require_all_complete: 1
      }]];
    }
    if (sql.includes('FROM clause_template_configs')) {
      return [[{
        id: 'config-1',
        clause_id: 'clause-1',
        template_id: 'template-1',
        weight: 1,
        calculation_method: 'weighted_average',
        trim_high_count: 0,
        trim_low_count: 0,
        sort_order: 1
      }]];
    }
    if (sql.includes('FROM score_answers')) {
      return [records.map((record) => ({
        record_id: record.id,
        question_index: 1,
        score: answerScores[record.id]
      }))];
    }
    if (sql.startsWith('UPDATE score_records')) return [{ affectedRows: 0 }];
    throw new Error('Unexpected SQL: ' + sql);
  }
};

const participantService = {
  normalizeGranularity(value) { return value === 'assignment' ? 'assignment' : 'person'; },
  async listParticipants() { return participants; },
  participantRecordId(record, side) { return record[side + '_id']; },
  isSameNaturalPerson(left, right) {
    return Boolean(left && right && left.person_id && left.person_id === right.person_id);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  if (request === '../../../utils/logger') return { logger: { debug() {}, info() {}, warn() {} } };
  if (request === '../services/participants') return participantService;
  return originalLoad.call(this, request, parent, isMain);
};
const { computeValidScoreMap } = require('../src/modules/scoring/utils/scoreCalc');
Module._load = originalLoad;

(async () => {
  const scores = await computeValidScoreMap('activity-1', 'org-1');
  assert.strictEqual(scores.get('target-1').finalScore, 10);
  assert.strictEqual(scores.get('target-2').finalScore, 20);
  assert.strictEqual(
    scores.get('target-1').contributorCount,
    1,
    '未完成全部目标的评分人不得混入其他评分人的分组'
  );

  const participantPath = require.resolve('../src/modules/scoring/services/participants');
  delete require.cache[participantPath];
  Module._load = function(request, parent, isMain) {
    if (request === '../../../config/db') return pool;
    return originalLoad.call(this, request, parent, isMain);
  };
  const realParticipantService = require(participantPath);
  Module._load = originalLoad;
  assert.strictEqual(
    realParticipantService.isSameNaturalPerson(
      { id: 'assignment-a', person_id: 'person-same' },
      { id: 'assignment-b', person_id: 'person-same' }
    ),
    true,
    '同一自然人不能通过切换岗位绕过自评限制'
  );

  console.log('评分完成性逐人过滤与多岗位自然人边界测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
