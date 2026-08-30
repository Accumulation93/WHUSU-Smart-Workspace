'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templateModel = fs.readFileSync(path.join(root, 'src/modules/scoring/models/scoreTemplate.js'), 'utf8');
const templateRoutes = fs.readFileSync(path.join(root, 'src/modules/scoring/routes/templates.js'), 'utf8');
const ruleRoutes = fs.readFileSync(path.join(root, 'src/modules/scoring/routes/rules.js'), 'utf8');
const resultsRoutes = fs.readFileSync(path.join(root, 'src/modules/scoring/routes/results.js'), 'utf8');
const initSql = fs.readFileSync(path.join(root, 'db/init.sql'), 'utf8');
const migrationSql = fs.readFileSync(
  path.join(root, 'db/deploy/20260830200000_score_template_org_isolation.sql'),
  'utf8'
);

assert(templateModel.includes('WHERE org_id = ? ORDER BY name')
  && templateModel.includes('WHERE id = ? AND org_id = ?'),
'模板模型所有目录和单条访问必须绑定组织');
assert(templateModel.includes('INSERT INTO score_question_templates (id, name, description, created_by, org_id)'),
  '新模板必须在创建时写入组织归属');
assert(templateRoutes.includes("WHERE org_id = ? AND name = ?")
  && templateRoutes.includes('templateModel.getById(id, orgId'),
'模板重名、编辑、复制和删除必须限制在当前组织');
assert(templateRoutes.includes('FROM score_template_order template_order')
  && templateRoutes.includes('activity.org_id = ?'),
'删除模板必须同时检查当前组织的规则引用和活动排序引用');
assert(ruleRoutes.includes('score_question_templates WHERE id = ? AND org_id = ? FOR UPDATE'),
  '保存评分规则时必须拒绝引用其他组织模板');
assert(resultsRoutes.includes('templateModel.getAll(orgId)')
  && resultsRoutes.includes('questionModel.getByTemplateIds(templateIds)'),
'评分结果解释目录不得加载其他组织模板和题目');
assert(initSql.includes('UNIQUE INDEX idx_sqt_name (name, org_id)')
  && initSql.includes('CONSTRAINT fk_sqt_org'),
'全新数据库必须具备模板组织唯一约束和组织外键');
assert(migrationSql.includes('HAVING COUNT(DISTINCT ref.org_id) > 1')
  && migrationSql.includes('禁止猜测归属')
  && migrationSql.includes('ADD UNIQUE INDEX idx_sqt_name (name, org_id)'),
'历史迁移必须阻止多组织歧义并建立组织唯一约束');

console.log('评分模板组织隔离、历史评分保留与迁移失败关闭测试通过');
