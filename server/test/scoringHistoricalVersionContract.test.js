'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scoringRoot = path.resolve(__dirname, '../src/modules/scoring');
const rulesSource = fs.readFileSync(path.join(scoringRoot, 'routes/rules.js'), 'utf8');
const templatesSource = fs.readFileSync(path.join(scoringRoot, 'routes/templates.js'), 'utf8');

const childConfigInsert = rulesSource.indexOf('INSERT INTO clause_template_configs');
const firstParentVersionWrite = rulesSource.indexOf(
  'UPDATE rate_target_rules SET activity_id = ?, scorer_department_id = ?, scorer_identity_id = ?'
);
assert(firstParentVersionWrite >= 0 && childConfigInsert > firstParentVersionWrite,
  '评分 clause/config 写入前必须在同一规则保存事务中更新父规则 updated_at');
assert(rulesSource.includes('allow_self_assessment = ?, updated_at = ?')
  && rulesSource.includes('const nowUtc = nowMysqlUtc();')
  && /await withTransaction\(async \((?:conn|connection)\) => \{/.test(rulesSource),
'父规则及其 clause/config 必须在同一事务、使用同一版本时间保存');

const routeFiles = fs.readdirSync(path.join(scoringRoot, 'routes'))
  .filter((name) => name.endsWith('.js'));
const clauseConfigWriters = routeFiles.filter((name) => {
  const source = fs.readFileSync(path.join(scoringRoot, 'routes', name), 'utf8');
  return /(?:INSERT INTO|UPDATE|DELETE FROM) clause_template_configs/i.test(source);
});
assert.deepStrictEqual(clauseConfigWriters.sort(), ['activities.js', 'rules.js'],
  '新增 clause/config 写入口时必须同步纳入父规则版本契约；删除活动只允许随父规则整体删除');
assert(!/UPDATE clause_template_configs/i.test(rulesSource),
  'clause/config 不允许脱离父规则版本写入原地修改');

const templateUpdate = templatesSource.indexOf('templateModel.update(id, orgId');
const questionRemoval = templatesSource.indexOf('questionModel.removeByTemplateId(id, connection)');
assert(templateUpdate >= 0 && questionRemoval > templateUpdate,
  '已有模板必须在同一事务中先更新时间版本，再替换后续评分使用的问题结构');
assert(templatesSource.includes('pool.withTransaction(async (connection) => {'),
  '模板保存、复制和删除必须使用事务，禁止留下部分写入');
assert(!/scoreRecordModel|scoreAnswerModel|DELETE FROM score_records|DELETE FROM score_answers/.test(templatesSource),
  '编辑模板绝不能删除历史评分或答案；历史记录由不可变计算快照解释');
assert(templatesSource.includes("removedRecordCount: 0"),
  '兼容响应必须明确表示模板编辑不会移除评分记录');
assert(templatesSource.includes('templateModel.getAll(orgId)')
  && templatesSource.includes('WHERE t.org_id = ?'),
'模板和题目目录必须按当前组织隔离');

console.log('评分父规则、子配置和模板历史版本时间契约测试通过');
