'use strict';

const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');

function signedSnapshot(scorerId, scorerPersonId, requiredTargets) {
  const rule = {
    id: 'rule-1',
    scorerDepartmentId: 'department-1',
    scorerIdentityCategoryId: 'identity-1',
    allowSelfAssessment: false
  };
  const clause = {
    id: 'clause-1',
    scopeType: 'all_people',
    targetIdentityCategoryId: '',
    requireAllComplete: false,
    requiredTargets
  };
  const templates = [{
    templateId: 'template-1',
    templateName: '提交时模板',
    weight: 1,
    sortOrder: 1,
    calculationMethod: 'weighted_average',
    trimHighCount: 0,
    trimLowCount: 0,
    questions: [{
      id: 'question-1',
      questionIndex: 1,
      globalQuestionIndex: 1,
      question: '提交时问题',
      scoreLabel: '',
      minValue: 0,
      startValue: 0,
      maxValue: 100,
      stepValue: 1
    }]
  }];
  const calculationPolicySignature = 'v1:' + crypto.createHash('sha256')
    .update(JSON.stringify({ rule, clause, templates }))
    .digest('hex');
  return {
    version: 1,
    activityId: 'activity-1',
    participantGranularity: 'assignment',
    templateConfigSignature: 'v2:template-1',
    calculationPolicySignature,
    scorer: {
      participantId: scorerId,
      subjectKey: 'assignment:' + scorerId,
      personId: scorerPersonId,
      assignmentId: scorerId,
      context: {}
    },
    target: {
      participantId: 'target-1',
      subjectKey: 'assignment:target-1',
      personId: 'target-person',
      assignmentId: 'target-1',
      context: {}
    },
    rule,
    clause,
    templates
  };
}

const target = {
  participantId: 'target-1',
  subjectKey: 'assignment:target-1',
  personId: 'target-person',
  assignmentId: 'target-1'
};
const scorerOneTarget = {
  participantId: 'scorer-1',
  subjectKey: 'assignment:scorer-1',
  personId: 'person-1',
  assignmentId: 'scorer-1'
};
const scorerTwoTarget = {
  participantId: 'scorer-2',
  subjectKey: 'assignment:scorer-2',
  personId: 'person-2',
  assignmentId: 'scorer-2'
};

// 两名评分人都排除本人，所以 requiredTargets 不同；最终仍应属于同一个权重组。
const records = [{
  id: 'record-1',
  template_config_signature: 'v2:template-1',
  calculation_context_snapshot: JSON.stringify(signedSnapshot(
    'scorer-1',
    'person-1',
    [target, scorerTwoTarget]
  ))
}, {
  id: 'record-2',
  template_config_signature: 'v2:template-1',
  calculation_context_snapshot: JSON.stringify(signedSnapshot(
    'scorer-2',
    'person-2',
    [target, scorerOneTarget]
  ))
}];

const pool = {
  async query(sql) {
    if (sql.includes('FROM score_records')) return [records];
    if (sql.includes('FROM score_answers')) {
      return [[
        { record_id: 'record-1', question_index: 1, score: 30 },
        { record_id: 'record-2', question_index: 1, score: 30 }
      ]];
    }
    throw new Error('出现非快照评分查询: ' + sql);
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  if (request === '../../../utils/logger') return { logger: { debug() {} } };
  return originalLoad.call(this, request, parent, isMain);
};
const { computeValidScoreMap } = require('../src/modules/scoring/utils/scoreCalc');
Module._load = originalLoad;

(async function run() {
  const result = await computeValidScoreMap('activity-1', 'org-1');
  assert.strictEqual(result.diagnostics.skippedRecords, 0);
  assert.strictEqual(result.finalScoreMap.get('target-1').finalScore, 30,
    '同类别双评分人排除本人时必须先求平均再应用一次权重，不能得到重复权重后的 60 分');
  assert.strictEqual(result.finalScoreMap.get('target-1').contributorCount, 1,
    '同一不可变计分策略只能形成一个最终权重组');
  console.log('评分完整性分组与最终权重聚合分离测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
