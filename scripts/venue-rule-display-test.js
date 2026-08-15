'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  buildBookingRuleDisplayList
} = require('../miniprogram/subpackages/venue/utils/venueRuleDisplay');

const flow = { id: 'flow-43', name: '场地审批流程' };
const steps = [{ id: 'step-1' }, { id: 'step-2' }];

const flowOnly = buildBookingRuleDisplayList([], flow, steps);
assert.strictEqual(flowOnly.length, 1);
assert.strictEqual(flowOnly[0].id, '__flow__');
assert.strictEqual(flowOnly[0]._flowSteps, '2步');

const mixed = buildBookingRuleDisplayList([
  { id: 'admin-rule', rule_type: 'admin' }
], flow, steps);
assert.deepStrictEqual(mixed.map((item) => item.id), ['__flow__', 'admin-rule']);
assert.strictEqual(mixed[1]._ruleTypeLabel, '管理员审核');

const noFlow = buildBookingRuleDisplayList([
  { id: 'direct-rule', rule_type: 'direct' }
], null, []);
assert.strictEqual(noFlow.length, 1);
assert.strictEqual(noFlow[0]._ruleTypeLabel, '直接通过');

const bookingPageDir = path.join(__dirname, '..', 'miniprogram', 'subpackages', 'venue', 'pages', 'venueBooking');
const bookingMarkup = fs.readFileSync(path.join(bookingPageDir, 'venueBooking.wxml'), 'utf8');
const bookingStyles = fs.readFileSync(path.join(bookingPageDir, 'venueBooking.wxss'), 'utf8');
const bookingLocale = require('../miniprogram/locales/zh-CN/generated/subpackages/venue/pages/venueBooking/venueBooking');

const venueMetaBlock = bookingMarkup.match(/<view class="venue-meta">([\s\S]*?)<\/view>/);
assert.ok(venueMetaBlock, '可用场地必须提供统一的状态气泡行');
assert.ok(venueMetaBlock[1].includes("? 'direct' : 'approval'"), '审核方式气泡必须位于状态气泡行');
assert.ok(venueMetaBlock[1].includes('class="venue-tag window-open"'), '开放提交气泡必须位于状态气泡行');
assert.ok(venueMetaBlock[1].includes('class="venue-tag window-deadline"'), '截止提交气泡必须位于状态气泡行');
assert.match(bookingStyles, /\.venue-meta\s*\{[\s\S]*?flex-wrap:\s*nowrap;/, '可用场地气泡行不得自动换行');
assert.match(bookingStyles, /\.venue-tag\.window-open\s*\{[\s\S]*?background:/, '开放提交必须使用彩色气泡');
assert.match(bookingStyles, /\.venue-tag\.window-deadline\s*\{[\s\S]*?background:/, '截止提交必须使用彩色气泡');
assert.strictEqual(bookingLocale.copy_584ba3052b, '开放提交 不限');
assert.strictEqual(bookingLocale.copy_9e824e777e, '截止提交 借用前');
assert.strictEqual(bookingLocale.copy_44ce05c859, '开放提交 ');
assert.strictEqual(bookingLocale.copy_db4932f471, '截止提交 ');
assert.strictEqual(bookingLocale.copy_d08fb8244e, '日前');

console.log('场地借用规则与审批流程显示回归测试通过');
