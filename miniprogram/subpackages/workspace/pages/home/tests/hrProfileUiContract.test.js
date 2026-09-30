'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pageDir = path.resolve(__dirname, '..');
const pageSource = fs.readFileSync(path.join(pageDir, 'home.js'), 'utf8');
const templateSource = fs.readFileSync(path.join(pageDir, 'home.wxml'), 'utf8');

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
