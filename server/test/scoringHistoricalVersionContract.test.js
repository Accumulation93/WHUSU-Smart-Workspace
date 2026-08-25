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
  && rulesSource.includes('await withTransaction(async (conn) => {'),
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

const templateUpdate = templatesSource.indexOf('templateModel.update(id, { name, description, updatedBy: admin.id, updatedAt: nowUtc })');
const questionRemoval = templatesSource.indexOf('questionModel.removeByTemplateId(id)');
assert(templateUpdate >= 0 && questionRemoval > templateUpdate,
  '已有模板的问题结构改变前必须先更新模板 updated_at，供历史版本预检证明');
assert(templatesSource.includes('function buildQuestionStructureSignature')
  && templatesSource.includes('oldSig !== newSig'),
'模板题目范围、起始值、上限和步长变化必须被结构签名识别');

console.log('评分父规则、子配置和模板历史版本时间契约测试通过');
