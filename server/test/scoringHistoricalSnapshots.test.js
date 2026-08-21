const assert = require('assert');
const fs = require('fs');
const path = require('path');

const resultsSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/routes/results.js'),
  'utf8'
);

assert.match(resultsSource, /resolveHistoricalParticipant\(record, 'scorer', members\)/);
assert.match(resultsSource, /resolveHistoricalParticipant\(record, 'target', members\)/);
assert.doesNotMatch(
  resultsSource,
  /const rule = ruleById\.get\(safeString\(record\.ruleId\)\) \|\| null;\s*if \(!rule\) return;/,
  '当前规则被删除后不得直接丢弃历史评分记录'
);
assert.match(resultsSource, /historicalRuleUnavailable/);
assert.match(resultsSource, /historicalOnly: true/);
assert.match(resultsSource, /rawAnswers:/);
assert.match(resultsSource, /scorerHistoricalAssignmentUnavailable/);
assert.match(resultsSource, /targetHistoricalAssignmentUnavailable/);
assert.doesNotMatch(
  resultsSource,
  /rule\.scorerDepartment\s*\|\|\s*record\.scorerDepartment/,
  '历史评分人岗位不得被当前规则覆盖'
);

const participantSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/services/participants.js'),
  'utf8'
);
assert.doesNotMatch(participantSource, /ma\.title\s+AS\s+assignment_title/i);
assert.match(participantSource, /historicalAssignmentUnavailable:\s*!hasHistoricalAssignment/);

console.log('评分历史岗位快照与规则变更保留测试通过');
