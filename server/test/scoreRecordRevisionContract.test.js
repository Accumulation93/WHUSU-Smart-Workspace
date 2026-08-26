'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const routeSource = fs.readFileSync(path.join(root, 'src/modules/scoring/routes/scoring.js'), 'utf8');
const initSql = fs.readFileSync(path.join(root, 'db/init.sql'), 'utf8');
const migrationSql = fs.readFileSync(
  path.join(root, 'db/deploy/20260827103000_score_record_revisions.sql'),
  'utf8'
);
const scoringRule = fs.readFileSync(path.resolve(root, '../.claude/rules/scoring.md'), 'utf8');

const revisionStart = routeSource.indexOf('async function reviseExistingScoreRecord(options)');
const revisionEnd = routeSource.indexOf("router.post('/submitScoreRecord'", revisionStart);
const revisionSource = routeSource.slice(revisionStart, revisionEnd);

assert(revisionStart >= 0, '必须存在独立的评分修订事务');
assert(revisionSource.includes('FOR UPDATE'), '修改前必须锁定当前评分和答案');
assert(revisionSource.includes('INSERT INTO score_record_revisions'), '修改前必须归档旧记录和旧答案');
assert(revisionSource.indexOf('INSERT INTO score_record_revisions') < revisionSource.indexOf('DELETE FROM score_answers'),
  '必须先归档旧版本，再替换当前答案');
assert(revisionSource.includes('revision_number = ?') && revisionSource.includes('AND revision_number = ?'),
  '当前评分更新必须递增修订号并执行乐观版本校验');
assert(revisionSource.includes('score_revision_conflict'), '并发修改必须失败重载，禁止最后写入静默覆盖');
assert(revisionSource.includes('buildHistoricalTemplateBundle(record'),
  '已评分修改必须继续使用该记录自己的题目快照，禁止套用当前模板');
assert(revisionSource.includes('pubCache.invalidate'), '评分修订成功后必须失效公示结果缓存');

assert.match(initSql, /CREATE TABLE IF NOT EXISTS score_record_revisions/i);
assert.match(initSql, /revision_number INT NOT NULL DEFAULT 1/i);
assert.match(initSql, /UNIQUE INDEX uk_score_revision \(record_id, revision_number\)/i);
assert.match(migrationSql, /information_schema\.COLUMNS/i);
assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS score_record_revisions/i);
assert.match(migrationSql, /absolute_time_source_registry/i);
assert(scoringRule.includes('已提交评分允许评分人重新打开修改'));
assert(!scoringRule.includes('已提交评分保持不可变'));

console.log('已评分可修改、旧版本归档、并发防覆盖与快照解释契约测试通过');
