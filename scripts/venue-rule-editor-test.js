'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.resolve(__dirname, '../miniprogram/subpackages/venue/pages/venueManage');
const source = fs.readFileSync(path.join(base, 'venueManage.js'), 'utf8');
const template = fs.readFileSync(path.join(base, 'venueManage.wxml'), 'utf8');
let definition;
let queryCount = 0;
const timers = new Map();
let timerId = 0;
vm.runInNewContext(source, {
  Page(value) { definition = value; }, console,
  setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
  clearTimeout(id) { timers.delete(id); },
  require(name) {
    if (name.includes('locales/')) return require(path.resolve(base, name));
    if (name.endsWith('/api')) return { showShortToast() {}, getErrorText: () => '' };
    return {};
  },
  wx: {
    nextTick(callback) { callback(); },
    createSelectorQuery() {
      queryCount += 1;
      throw new Error('规则编辑器不得依赖异步测量才能展示正文');
    }
  }
});

function page() {
  const instance = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    loadFlowReferenceData() {},
    setData(patch, callback) {
      for (const key of Object.keys(patch)) {
        const parts = key.split('.');
        let target = this.data;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = patch[key];
      }
      if (callback) callback();
    }
  });
  instance.data.allDepartments = [{ id: 'd1', name: '部门甲' }];
  instance.data.allWorkGroups = [{ id: 'g1', name: '职能组甲' }];
  instance.data.allIdentities = [{ id: 'i1', name: '身份甲' }];
  instance.data.openRules = [{ id: 'open-1', name: '开放规则', cycle_type: 'weekly', cycle_values: [1, 3], time_start: '08:30', time_end: '20:00' }];
  instance.data.activityRules = [{ id: 'activity-1', activity_name: '周期会议', cycle_type: 'weekly', cycle_values: [2], time_start: '12:00', time_end: '13:00' }];
  instance.data.bookingRules = [{ id: 'booking-1', rule_type: 'direct' }];
  return instance;
}

function flushTimers() {
  const pending = Array.from(timers.values());
  timers.clear();
  pending.forEach(callback => callback());
}

function assertVisibleState(instance) {
  assert.strictEqual(instance.data.ruleEditorVisible, true);
  assert.strictEqual(instance.data.ruleEditorScrollStyle, undefined, '不得设置零高度或等待测量恢复正文');
  assert.strictEqual(queryCount, 0);
  flushTimers();
  assert.strictEqual(instance.data.ruleEditorVisible, true);
  assert.strictEqual(instance.data.ruleEditorScrollStyle, undefined);
}

for (const type of ['open', 'activity', 'booking']) {
  for (const editing of [false, true]) {
    const instance = page();
    instance.openRuleEditor({ currentTarget: { dataset: { type, id: editing ? type + '-1' : '' } } });
    assertVisibleState(instance);
    assert.strictEqual(instance.data.ruleEditorType, type);
    if (editing && type === 'open') assert.strictEqual(instance.data.ruleForm.name, '开放规则');
    if (editing && type === 'activity') assert.strictEqual(instance.data.ruleForm.name, '周期会议');
    if (editing && type === 'booking') assert.strictEqual(instance.data.ruleForm.ruleType, 'direct');
    instance.onRuleFormField({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '修改名称' } });
    assert.strictEqual(instance.data.ruleForm.name, '修改名称');
    instance.closeRuleEditor();
    flushTimers();
    assert.strictEqual(instance.data.ruleEditorVisible, false);
  }
}

for (const editing of [false, true]) {
  const instance = page();
  instance._openApprovalFlowEditor({ id: editing ? 'flow-1' : '', name: '审批流程', steps: editing ? [{ name: '审批步骤', rules: [] }] : [] });
  assertVisibleState(instance);
  assert.strictEqual(instance.data.ruleForm._flowSteps.length, editing ? 1 : 0);
  instance.openAddRuleFlowStep();
  flushTimers();
  assert.strictEqual(instance.data.ruleEditorScrollIntoView, 'rule-flow-step-editor');
  instance.openAddRuleFlowCondition();
  flushTimers();
  assert.strictEqual(instance.data.ruleEditorScrollIntoView, 'rule-flow-condition-editor');
  instance.closeRuleEditor();
  flushTimers();
  assert.strictEqual(instance.data.ruleEditorVisible, false);
}

assert.ok(template.includes('rule-editor-scroll ui-dialog-body'), '正文保留共享滚动样式');
assert.ok(template.includes('scroll-into-view="{{ruleEditorScrollIntoView}}"'), '展开步骤与条件仍定位到编辑区');
assert.ok(!template.includes('ruleEditorScrollStyle'), '模板不得绑定已删除的人工高度');
assert.ok(!source.includes('rule-editor-viewport-limit'), '不得查询不存在的测量节点');
console.log('场地规则编辑器：6种规则新增编辑、2种流程新增编辑与展开定位通过；不代表微信渲染或数据库保存验证。');
