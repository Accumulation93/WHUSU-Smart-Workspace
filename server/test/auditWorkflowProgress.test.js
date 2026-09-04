'use strict';

const assert = require('assert');
const { calculateWorkflowProgress } = require('../../miniprogram/subpackages/audit/utils/workflowProgress');

let state = calculateWorkflowProgress([
  { sortOrder: 1, round: 1, status: 'approved' },
  { sortOrder: 2, round: 1, status: 'rejected' },
  { sortOrder: 3, round: 1, status: 'pending' },
  { sortOrder: 2, round: 2, status: 'approved' },
  { sortOrder: 3, round: 2, status: 'pending' }
]);
assert.strictEqual(state.stepsPerRound, 3);
assert.strictEqual(state.approvedCount, 2,
  '从驳回步骤继续时必须保留前序轮次已经通过的步骤进度');
assert.strictEqual(state.rejectedStep, null, '新轮次覆盖后的旧驳回状态不得继续作为当前状态');

state = calculateWorkflowProgress([
  { sortOrder: 1, round: 1, status: 'approved' },
  { sortOrder: 2, round: 1, status: 'rejected' },
  { sortOrder: 1, round: 2, status: 'pending' },
  { sortOrder: 2, round: 2, status: 'pending' }
]);
assert.strictEqual(state.approvedCount, 0, '从头重提必须以完整新轮次状态覆盖旧进度');

console.log('审核驳回重提进度合并测试通过');
