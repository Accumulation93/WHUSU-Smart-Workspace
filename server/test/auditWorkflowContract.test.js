'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routePath = path.resolve(__dirname, '../src/modules/audit/routes/auditUser.js');
const adminRoutePath = path.resolve(__dirname, '../src/modules/audit/routes/auditAdmin.js');
const behaviorPath = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/auditBehavior.js');
const adminWxmlPath = path.resolve(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/admin.wxml');

const routeSource = fs.readFileSync(routePath, 'utf8');
const adminRouteSource = fs.readFileSync(adminRoutePath, 'utf8');
const behaviorSource = fs.readFileSync(behaviorPath, 'utf8');
const adminWxmlSource = fs.readFileSync(adminWxmlPath, 'utf8');

const startRoute = routeSource.slice(
  routeSource.indexOf("router.post('/startAuditSubmission'"),
  routeSource.indexOf("router.post('/startAdHocAudit'")
);

assert(startRoute.includes('const orgId = await getCurrentOrgId();'),
  '发起模板审批必须先解析当前组织，不能在保存时引用未定义的 orgId');
assert(startRoute.includes('return Number(o.stepIndex) === i + 1;'),
  '模板步骤覆盖必须按对外的一-based 步骤编号匹配');
assert(routeSource.includes('stepIndex: Number(ts.sort_order) || idx + 1'),
  '模板预览必须把第一步以 stepIndex=1 返回给发起人');

// A first-step override must narrow only step 1; later steps keep their own rules.
const overrides = [{ stepIndex: 1, personHrIds: ['hr-first'] }];
const stepConditions = [
  [{ conditionType: 'person', personHrIds: 'hr-first' }],
  [{ conditionType: 'identity_scope', departmentScope: 'all', workGroupScope: 'all', identityScope: 'specific', specificIdentityId: 'identity-next' }]
];
for (let i = 0; i < stepConditions.length; i += 1) {
  const override = overrides.find((item) => Number(item.stepIndex) === i + 1);
  if (override) stepConditions[i] = override.personHrIds.map((id) => ({ conditionType: 'person', personHrIds: id }));
}
assert.deepStrictEqual(stepConditions[0], [{ conditionType: 'person', personHrIds: 'hr-first' }]);
assert.deepStrictEqual(stepConditions[1], [{
  conditionType: 'identity_scope', departmentScope: 'all', workGroupScope: 'all',
  identityScope: 'specific', specificIdentityId: 'identity-next'
}]);

assert(behaviorSource.includes("_auditConditionTarget: 'step'"),
  '打开步骤条件编辑器必须明确写入步骤表单，不能沿用发起条件表单');
assert(behaviorSource.includes('auditMultiPickerSelectedCount: Object.keys(selectedIds).length'),
  '选择器打开时必须同步已选数量');
assert(adminRouteSource.includes("const orgId = await getCurrentOrgId();")
  && adminRouteSource.includes("message: '请先选择组织'"),
  '保存审批流程前必须校验当前组织');
assert(adminWxmlSource.includes('auditTemplateStepEditorVisible')
  && adminWxmlSource.includes('catchtouchmove="noop"'),
  '审批步骤弹窗必须锁住背景触摸，内部 scroll-view 才能独立滚动');

console.log('审批流程：建流程、首步指定、发起和弹窗交互契约测试通过');
