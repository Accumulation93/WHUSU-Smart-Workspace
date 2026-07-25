'use strict';

const assert = require('assert');
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

console.log('场地借用规则与审批流程显示回归测试通过');
