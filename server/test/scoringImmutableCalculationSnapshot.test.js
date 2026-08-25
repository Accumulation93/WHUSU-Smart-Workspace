'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const path = require('path');

function makeSnapshot() {
  const rule = {
    id: 'deleted-rule',
    scorerDepartmentId: 'old-department',
    scorerIdentityCategoryId: 'old-identity',
    allowSelfAssessment: false
  };
  const clause = {
    id: 'deleted-clause',
    scopeType: 'all_people',
    targetIdentityCategoryId: 'old-target-identity',
    requireAllComplete: false,
    requiredTargets: [{
      participantId: 'left-target-assignment',
      subjectKey: 'assignment:left-target-assignment',
      personId: 'target-person',
      assignmentId: 'left-target-assignment'
    }]
  };
  const templates = [{
    templateId: 'deleted-template',
    templateName: '提交时模板',
    weight: 2,
    sortOrder: 1,
    calculationMethod: 'weighted_average',
    trimHighCount: 0,
    trimLowCount: 0,
    questions: [{
      id: 'deleted-question-1', questionIndex: 1, globalQuestionIndex: 1,
      question: '提交时第一题', scoreLabel: '', minValue: 0, startValue: 0, maxValue: 100, stepValue: 1
    }, {
      id: 'deleted-question-2', questionIndex: 2, globalQuestionIndex: 2,
      question: '提交时第二题', scoreLabel: '', minValue: 0, startValue: 0, maxValue: 100, stepValue: 1
    }]
  }];
  const policySignature = 'v1:' + crypto.createHash('sha256')
    .update(JSON.stringify({ rule, clause, templates })).digest('hex');
  return {
    version: 1,
    activityId: 'activity-1',
    participantGranularity: 'assignment',
    templateConfigSignature: 'v2:submission-signature',
    calculationPolicySignature: policySignature,
    scorer: {
      participantId: 'left-scorer-assignment', subjectKey: 'assignment:left-scorer-assignment',
      personId: 'scorer-person', assignmentId: 'left-scorer-assignment', context: { identityCategoryId: 'old-identity' }
    },
    target: {
      participantId: 'left-target-assignment', subjectKey: 'assignment:left-target-assignment',
      personId: 'target-person', assignmentId: 'left-target-assignment', context: { identityCategoryId: 'old-target-identity' }
    },
    rule,
    clause,
    templates
  };
}

const queryLog = [];
const records = [{
  id: 'historical-record',
  activity_id: 'activity-1',
  org_id: 'org-1',
  scorer_assignment_id: 'left-scorer-assignment',
  target_assignment_id: 'left-target-assignment',
  template_config_signature: 'v2:submission-signature',
  calculation_context_snapshot: JSON.stringify(makeSnapshot())
}, {
  id: 'legacy-without-snapshot',
  activity_id: 'activity-1',
  org_id: 'org-1',
  template_config_signature: 'legacy'
}];

const pool = {
  async query(sql) {
    queryLog.push(sql);
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error('结果读取不得写库: ' + sql);
    if (sql.includes('FROM score_records')) return [records];
    if (sql.includes('FROM score_answers')) {
      return [[
        { record_id: 'historical-record', question_index: 1, score: 10 },
        { record_id: 'historical-record', question_index: 2, score: 20 }
      ]];
    }
    throw new Error('结果计算不得读取当前岗位、规则或模板: ' + sql);
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
  const result = await computeValidScoreMap('activity-1', 'org-1', { includeCounts: true });
  assert.strictEqual(result.finalScoreMap.get('left-target-assignment').finalScore, 60,
    '调岗、离任、规则删除和模板删除后仍必须按提交时两道题总分及权重计算');
  assert.strictEqual(result.targetSnapshots.get('left-target-assignment').assignmentId, 'left-target-assignment',
    '已离任目标必须随结果返回提交时目标快照，不能因当前成员目录缺失而从结果或导出消失');
  assert.strictEqual(result.diagnostics.reasons.missing_calculation_snapshot, 1,
    '缺少历史计算快照的记录必须失败关闭并返回诊断');
  assert(queryLog.every((sql) => /^\s*SELECT\b/i.test(sql)), '结果读取链不得产生任何 UPDATE/DELETE/INSERT');
  assert(queryLog.every((sql) => !/membership_assignments|rate_target_rules|rate_rule_clauses|score_questions|score_question_templates/i.test(sql)),
    '历史结果不得依赖当前岗位、规则和模板');

  const source = fs.readFileSync(path.resolve(__dirname, '../src/modules/scoring/utils/scoreCalc.js'), 'utf8');
  assert(!/UPDATE\s+score_records|DELETE\s+FROM|INSERT\s+INTO/i.test(source),
    '评分结果计算源码必须保持纯读取');
  const resultsRoute = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/scoring/routes/results.js'),
    'utf8'
  );
  assert((resultsRoute.match(/mergeHistoricalTargets\(/g) || []).length >= 3,
    '管理概览与导出必须合并提交时目标快照，保留已离任历史对象');
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../db/deploy/20260825234500_score_calculation_context_snapshot.sql'),
    'utf8'
  );
  assert(migration.includes('calculation_context_snapshot') && migration.includes('information_schema.COLUMNS'),
    '评分解释快照迁移必须幂等检查字段后再新增');
  assert(migration.includes('score_snapshot_backfill_audits')
    && !migration.includes('UPDATE score_records'),
  'SQL 不得猜测回填旧评分记录；证明性回填与隔离结果必须进入专用审计账本');
  console.log('评分历史计算快照、失败关闭与纯读取测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
