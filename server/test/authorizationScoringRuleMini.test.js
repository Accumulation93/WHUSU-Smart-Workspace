'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(actions) {
  const filename = path.join(__dirname, '../../miniprogram/subpackages/scoring/pages/admin/modules/ruleBehavior.js');
  const calls = [], confirmations = [];
  let current = true;
  const context = { module: { exports: {} }, Behavior: value => value,
    wx: { showModal: options => confirmations.push(options), showToast() {} },
    require(name) {
      if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => current };
      if (name.includes('/locales/')) return require(path.resolve(path.dirname(filename), name));
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const page = { ...context.module.exports.methods,
    data: { authorizationEnforced: true, ruleForm: { id: '' },
      actionCapabilities: Object.fromEntries(actions.map(action => ['scoring.rules.' + action, true])) },
    async callCloud(name, body) { calls.push({ name, body }); return { status: 'success' }; },
    async loadRuleList() {}
  };
  return { page, calls, confirmations, invalidate: () => { current = false; } };
}

test('评分规则只读不能通过事件调用新增、编辑、批量修改、生成或删除', async () => {
  const { page, calls, confirmations } = harness(['read']);
  for (const method of ['saveRule', 'saveRuleCategory', 'applyClausesToSelectedRules',
    'generateRuleCategories', 'generateRuleCategoriesSafe', 'generateRuleCategoriesFinal', 'generateDefaultRules']) {
    await page[method]();
  }
  page.editRule({});
  page.deleteRule({});
  assert.equal(calls.length, 0);
  assert.equal(confirmations.length, 0);
});

test('新增和修改权限不互相代替', async () => {
  const create = harness(['create']);
  create.page.data.ruleForm.id = 'existing';
  await create.page.saveRule();
  await create.page.saveRuleCategory();
  await create.page.applyClausesToSelectedRules();
  const update = harness(['update']);
  await update.page.saveRule();
  await update.page.saveRuleCategory();
  await update.page.generateRuleCategoriesFinal();
  assert.equal(create.calls.length + update.calls.length, 0);
});

test('删除确认后重新核对页面与权限，正常删除保留目标并回读', async () => {
  const event = { currentTarget: { dataset: { id: 'rule-1' } } };
  for (const reason of ['page', 'permission', 'cancel', 'success']) {
    const source = harness(['delete']);
    source.page.deleteRule(event);
    assert.equal(source.confirmations.length, 1);
    if (reason === 'page') source.invalidate();
    if (reason === 'permission') source.page.data.actionCapabilities = {};
    await source.confirmations[0].success({ confirm: reason !== 'cancel' });
    assert.equal(source.calls.length, reason === 'success' ? 1 : 0);
    if (reason === 'success') assert.equal(source.calls[0].body.id, 'rule-1');
  }
});
