'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pageDir = path.resolve(__dirname, '..');
const pageSource = fs.readFileSync(path.join(pageDir, 'home.js'), 'utf8');
const templateSource = fs.readFileSync(path.join(pageDir, 'home.wxml'), 'utf8');
const sharedStyles = fs.readFileSync(
  path.resolve(pageDir, '../../../../subpackages/main/styles/home.wxss'),
  'utf8'
);

test('管理员填写的字段说明与自动规则提醒分行显示', () => {
  // 说明来自字段自身（field.hint），规则提醒仍由 buildFieldHint 生成，两者互不覆盖。
  assert.match(pageSource, /hintLine: String\(field\.hint \|\| ''\)\.trim\(\)/);
  assert.match(pageSource, /hintText: buildFieldHint\(field\)/);
  assert.match(templateSource, /class="profile-field-hint" wx:if="\{\{item\.hintLine\}\}"/);
  assert.match(templateSource, /class="field-hint" wx:if="\{\{item\.hintText\}\}"/);
  // 说明最多 3 行、超出省略，且不挤压输入框。
  const hintRule = sharedStyles.match(/\.profile-field-hint\s*\{([^}]+)\}/);
  assert.ok(hintRule, '缺少填写说明样式');
  assert.match(hintRule[1], /-webkit-line-clamp:\s*3/);
  assert.match(hintRule[1], /overflow-wrap:\s*anywhere/);
});

test('补充资料加载失败与成功空状态严格分离并提供原地重试', () => {
  assert.match(pageSource, /errorText:\s*getErrorText\(result, copy\.text\.profileLoadFailed\)/);
  assert.match(pageSource, /retryUserHrProfile\(\)/);
  assert.match(templateSource, /class="profile-load-error"/);
  assert.match(templateSource, /bindtap="retryUserHrProfile"/);
  assert.match(templateSource, /!hrProfile\.errorText && \(!hrProfile\.template/);
});

test('只读资料和失败状态冻结所有资料输入控件', () => {
  const disabledContract = /disabled="\{\{hrProfile\.errorText \|\| hrProfile\.template\.editMode === 'readonly'\}\}"/g;
  const matches = templateSource.match(disabledContract) || [];
  // 文本/数字/手机号/邮箱输入、序列与日期选择器、日期时间的日期与时间两个选择器都必须冻结。
  assert.equal(matches.length, 9);
  assert.match(templateSource, /item\.type === 'datetime'[\s\S]*?data-part="date"[\s\S]*?data-part="time"/);
  assert.match(pageSource, /Array\.from\(value\)\.length/);
});
