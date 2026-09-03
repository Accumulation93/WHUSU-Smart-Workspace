'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const routeSource = fs.readFileSync(path.join(root, 'src/modules/scoring/routes/scoring.js'), 'utf8');
const initSql = fs.readFileSync(path.join(root, 'db/init.sql'), 'utf8');
const removalMigration = fs.readFileSync(
  path.join(root, 'db/deploy/20260827200000_remove_score_record_revisions.sql'),
  'utf8'
);
const schemaContract = fs.readFileSync(path.join(root, 'src/utils/schemaContract.js'), 'utf8');
const scoringRule = fs.readFileSync(path.resolve(root, '../.claude/rules/scoring.md'), 'utf8');

const updateStart = routeSource.indexOf('async function updateExistingScoreRecord(options)');
const updateEnd = routeSource.indexOf("router.post('/submitScoreRecord'", updateStart);
const updateSource = routeSource.slice(updateStart, updateEnd);

assert(updateStart >= 0, '必须存在独立的当前评分覆盖事务');
assert(updateSource.includes('FOR UPDATE'), '覆盖前必须锁定当前评分');
assert(!updateSource.includes('score_record_revisions'), '重新评分不得保存旧评分副本');
assert(updateSource.includes('DELETE FROM score_answers'), '必须在事务内替换当前答案');
assert(updateSource.includes('revision_number = ?') && updateSource.includes('AND revision_number = ?'),
  '当前评分更新必须递增并发版本号并校验过期页面');
assert(updateSource.includes('score_revision_conflict'), '并发修改必须失败重载，禁止最后写入静默覆盖');
assert(updateSource.includes('buildHistoricalTemplateBundle(record'),
  '重新评分必须继续使用该记录自己的题目依据，禁止套用当前模板');
assert(updateSource.includes('invalidateScoreResultCaches'), '评分更新成功后必须同时失效公示与管理端结果缓存');

assert.match(initSql, /revision_number INT NOT NULL DEFAULT 1/i);
assert.doesNotMatch(initSql, /CREATE TABLE IF NOT EXISTS score_record_revisions/i);
assert.match(removalMigration, /DROP TABLE IF EXISTS score_record_revisions/i);
assert.match(removalMigration, /DELETE FROM absolute_time_source_registry/i);
assert(schemaContract.includes("'score_record_revisions'"), '结构契约必须把旧评分归档表列为禁止表');
assert(scoringRule.includes('已提交评分允许评分人重新打开修改'));
assert(scoringRule.includes('不得建立或保留旧评分副本'));

console.log('评分原子覆盖、并发防覆盖、旧归档表清理与原题目解释契约测试通过');
