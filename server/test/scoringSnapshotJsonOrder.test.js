'use strict';

const assert = require('assert');

process.env.DB_USER = process.env.DB_USER || 'test-only';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test-only';

const { buildCalculationPolicySignature } = require('../src/modules/scoring/utils/calculationSnapshotSignature');
const { validateCalculationSnapshot } = require('../src/modules/scoring/utils/scoreCalc');

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  Object.keys(value).sort().forEach((key) => {
    output[key] = sortObjectKeys(value[key]);
  });
  return output;
}

const policy = {
  rule: {
    id: 'rule-1', scorerDepartmentId: 'department-1',
    scorerIdentityCategoryId: 'identity-1', allowSelfAssessment: false
  },
  clause: {
    id: 'clause-1', scopeType: 'all_people', targetIdentityCategoryId: '',
    requireAllComplete: false,
    requiredTargets: [{
      participantId: 'target-1', subjectKey: 'assignment:target-1',
      personId: 'person-target', assignmentId: 'target-1'
    }]
  },
  templates: [{
    templateId: 'template-1', templateName: '评分模板', weight: 1, sortOrder: 1,
    calculationMethod: 'weighted_average', trimHighCount: 0, trimLowCount: 0,
    questions: [{
      id: 'question-1', questionIndex: 1, globalQuestionIndex: 1,
      question: '评分题目', scoreLabel: '', minValue: 0, startValue: 0, maxValue: 100, stepValue: 1
    }]
  }]
};

const snapshot = Object.assign({
  version: 1,
  activityId: 'activity-1',
  participantGranularity: 'assignment',
  templateConfigSignature: 'v2:template-1',
  calculationPolicySignature: buildCalculationPolicySignature(policy, 1),
  scorer: { participantId: 'scorer-1', subjectKey: 'assignment:scorer-1' },
  target: { participantId: 'target-1', subjectKey: 'assignment:target-1' }
}, policy);

const mysqlJsonRoundTrip = sortObjectKeys(snapshot);
const validation = validateCalculationSnapshot({
  id: 'record-1',
  activity_id: 'activity-1',
  template_config_signature: 'v2:template-1',
  calculation_context_snapshot: JSON.stringify(mysqlJsonRoundTrip)
}, 'activity-1');

assert.strictEqual(validation.ok, true, validation.reason);
assert.strictEqual(
  buildCalculationPolicySignature(mysqlJsonRoundTrip, 1),
  snapshot.calculationPolicySignature,
  'MySQL JSON 重排对象键后，评分策略签名必须保持稳定'
);

console.log('评分计算快照 MySQL JSON 键顺序稳定性测试通过');
