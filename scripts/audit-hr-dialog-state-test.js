'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const admin = path.join(root, 'miniprogram/subpackages/scoring/pages/admin');
let behavior;
vm.runInNewContext(fs.readFileSync(path.join(admin, 'modules/auditBehavior.js'), 'utf8'), {
  module: { exports: {} },
  Behavior(value) { behavior = value; return value; },
  require(name) {
    if (name.includes('locales/')) return require(path.resolve(admin, 'modules', name));
    if (name === './adminUtils') return { showShortToast() {}, getErrorText: error => error.message };
    return {};
  },
  wx: { nextTick(callback) { callback(); }, createSelectorQuery() {
    throw new Error('步骤和条件编辑不得依赖测量才能显示正文');
  } }
});
function createPage() {
  return Object.assign({}, behavior.methods, {
    data: JSON.parse(JSON.stringify(behavior.data)),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const names = key.split('.');
        let target = this.data;
        for (const name of names.slice(0, -1)) target = target[name];
        target[names[names.length - 1]] = value;
      }
    }
  });
}
const page = createPage();
page.openAuditTemplateStepEditor();
page.data.auditTemplateStepForm.name = '审批步骤';
page.openStepConditionEditor();
page.onConditionTypeChange({ detail: { value: 2 } });
page.confirmAuditTemplateStep();
assert.equal(page.data.auditTemplateForm.steps.length, 0, '子条件未确认时不能提交上级步骤');
assert.equal(page.data.auditStepConditionEditorVisible, true);
page.confirmStepCondition();
assert.equal(page.data.auditStepConditionEditorVisible, false);
assert.equal(page.data.auditTemplateStepEditorVisible, true);
assert.equal(page.data.auditTemplateStepForm.conditions[0].conditionType, 'submitter');
page.confirmAuditTemplateStep();
assert.equal(page.data.auditTemplateForm.steps.length, 1);
page.openAuditTemplateStepEditor({ currentTarget: { dataset: { index: 0 } } });
page.openStepConditionEditor({ currentTarget: { dataset: { index: 0 } } });
page.onConditionTypeChange({ detail: { value: 0 } });
page.closeStepConditionEditor();
assert.equal(page.data.auditTemplateStepForm.conditions[0].conditionType, 'submitter', '取消不写回编辑副本');
page.openStepConditionEditor({ currentTarget: { dataset: { index: 0 } } });
page.onConditionTypeChange({ detail: { value: 0 } });
page.confirmStepCondition();
page.confirmAuditTemplateStep();
page.openAuditTemplateStepEditor({ currentTarget: { dataset: { index: 0 } } });
assert.equal(page.data.auditTemplateStepForm.conditions[0].conditionType, 'identity_scope', '确认后重开读取编辑结果');

// 执行真实模板表达式，覆盖可以操作和必须阻止的状态；不伪装成微信渲染。
const template = fs.readFileSync(path.join(admin, 'components/hrPermanentDeletionDialog/hrPermanentDeletionDialog.wxml'), 'utf8');
function attribute(marker, name) {
  const start = template.indexOf(marker);
  assert.ok(start >= 0);
  const attributeStart = template.indexOf(name + '="{{', start);
  assert.ok(attributeStart >= 0);
  const expressionStart = attributeStart + name.length + 4;
  return template.slice(expressionStart, template.indexOf('}}"', expressionStart));
}
const cleanupCondition = attribute('<view class="hr-deletion-section hr-deletion-consent"', 'wx:if');
const inputCondition = attribute('<view class="field hr-deletion-confirm"', 'wx:if');
const disabledCondition = attribute('<button class="danger-btn', 'disabled');
const data = { result: null, preview: { eligible: false, target: { studentId: 'test-number' } },
  canForce: true, forceAccepted: false, cleanup: [1], cleanupAccepted: false,
  scope: 'person', confirmation: '', loading: false };
const evaluate = expression => vm.runInNewContext(expression, data);
assert.equal(evaluate(inputCondition), false);
assert.equal(evaluate(disabledCondition), true);
data.forceAccepted = true;
assert.equal(Boolean(evaluate(cleanupCondition)), true, '强制确认后能勾选附件清理');
assert.equal(evaluate(inputCondition), true, '强制确认后能输入学号');
assert.equal(evaluate(disabledCondition), true);
data.cleanupAccepted = true;
assert.equal(evaluate(disabledCondition), true, '仍需核对学号');
data.confirmation = 'test-number';
assert.equal(evaluate(disabledCondition), false);
data.loading = true;
assert.equal(evaluate(disabledCondition), true);
data.loading = false; data.canForce = false;
assert.equal(evaluate(disabledCondition), true, '未授权不能强制删除');
data.preview.eligible = true;
assert.equal(evaluate(inputCondition), true);
assert.equal(evaluate(disabledCondition), false, '正常删除仍沿用原确认要求');
console.log('审核步骤新增、子条件取消/确认、重开回读和人事删除8种表单条件通过；未执行微信渲染或真实删除。');
