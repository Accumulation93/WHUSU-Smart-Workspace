'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return { query: async function() { return [[]]; } };
  if (request === '../../../utils/logger') return { logger: { debug() {} } };
  return originalLoad.call(this, request, parent, isMain);
};
const { getHistoricalSnapshotFailure } = require('../src/modules/scoring/utils/scoreCalc');
Module._load = originalLoad;

const missing = getHistoricalSnapshotFailure({
  reasons: { missing_calculation_snapshot: 3, required_targets_incomplete: 2 }
});
assert.strictEqual(missing.status, 'historical_snapshot_missing');
assert.strictEqual(missing.missingSnapshotCount, 3);
assert.strictEqual(missing.affectedRecordCount, 3,
  '业务上的未完成评分不得混入历史证据损坏数量');
assert.strictEqual(getHistoricalSnapshotFailure({ reasons: { required_targets_incomplete: 2 } }), null,
  '仅未完成评分不应阻止安全的历史结果展示');

const resultsSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/routes/results.js'), 'utf8'
);
const publicationsSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/routes/publications.js'), 'utf8'
);

assert((resultsSource.match(/getHistoricalSnapshotFailure\(diagnostics\)/g) || []).length >= 2,
  '管理端概览与导出都必须传播历史快照诊断');
assert(resultsSource.includes("status === 'historical_snapshot_missing'")
  && publicationsSource.includes("status === 'historical_snapshot_missing'"),
  '管理结果与公开结果必须显式返回 historical_snapshot_missing');
assert(publicationsSource.includes('getHistoricalSnapshotFailure(cached.diagnostics)'),
  '公开结果不得从缓存吞掉历史快照诊断');
assert((resultsSource.match(/inspectImmutableRecords\(enrichedRecords, activityId\)/g) || []).length >= 2,
  '管理端详情链和导出链都必须先校验不可变提交快照');
assert((resultsSource.match(/loadRulesWithClauses\(activityId/g) || []).length === 1,
  '历史详情与导出不得调用当前评分规则；只允许保留未调用的兼容函数定义');
assert((resultsSource.match(/buildTaskData\(members, rules, records\)/g) || []).length === 1,
  '完成情况与目标记录不得由当前成员和规则重新生成');
assert(resultsSource.includes('const templates = getRecordTemplateScores(record)')
  && resultsSource.includes('question.globalQuestionIndex'),
  '记录详情和导出必须读取提交快照中的模板、题目、权重和全局题号');

console.log('评分历史快照缺失显式失败传播测试通过');
