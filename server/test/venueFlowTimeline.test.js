const assert = require('assert');
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
const { buildFlowTimeline } = require('../../miniprogram/subpackages/venue/utils/flowTimeline');
const { prepareVenueBookingDetail } = require('../../miniprogram/subpackages/venue/utils/venueBookingDetail');
const { snapshotsForFlow } = require('../src/modules/venue/services/venueApprovalMultiFlow');

const snapshots = [
  { flowId: 'flow-a', stepIndex: 0, stepName: '初审', automatic: false, approverName: '甲' },
  { flowId: 'flow-a', stepIndex: 1, stepName: '复核', automatic: true, approverName: '甲' },
  { flowId: 'flow-b', stepIndex: 3, stepName: '其他路线', automatic: false, approverName: '乙' }
];

const timeline = buildFlowTimeline({
  flowId: 'flow-a',
  totalSteps: 2,
  currentStep: 2,
  isApproved: true,
  isRejected: false,
  flowSteps: [{ name: '初审' }, { name: '复核' }],
  snapshots
});

assert.strictEqual(timeline.length, 2);
assert.strictEqual(timeline[0].approverName, '甲');
assert.strictEqual(timeline[1].isAutomatic, true);
assert.strictEqual(timeline[1].label, '✓ 自动通过');
assert.ok(timeline.every(function(item) { return item.approverName !== '乙'; }),
  '其他并行路线相同步骤序号不得覆盖当前路线');

const detail = prepareVenueBookingDetail({
  status: 'pending',
  approvalProgress: {
    flowId: 'flow-a',
    totalSteps: 5,
    currentStep: 2,
    isApproved: false,
    isRejected: false,
    flowSteps: [{ name: '一' }, { name: '二' }, { name: '三' }, { name: '四' }, { name: '五' }],
    snapshots
  }
});
assert.strictEqual(detail.approvalProgress.currentStep, 2,
  '其他路线的高步骤序号不得抬高当前路线进度');

assert.deepStrictEqual(
  snapshotsForFlow(snapshots, 'flow-a').map(function(item) { return item.stepName; }),
  ['初审', '复核'],
  '详情接口不得把其他可选路线的处理记录混入当前路线'
);
assert.deepStrictEqual(
  snapshotsForFlow([{ stepIndex: 0, stepName: '旧版初审' }], 'flow-a').map(function(item) { return item.stepName; }),
  ['旧版初审'],
  '没有流程标识的单路线历史记录仍应正常展示'
);

console.log('场地审批时间轴流程隔离与自动通过展示测试通过');
