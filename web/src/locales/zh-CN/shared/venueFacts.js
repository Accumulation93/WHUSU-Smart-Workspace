// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

// 独立定稿：docs/copy/venue-facts-editorial-20261103.md。
const sharedModule = Object.freeze({
  creatorAdmin: '管理员创建',
  creatorUser: '用户创建',
  creatorUnknown: '创建方式暂未确认',
  nameMissing: '姓名未记录',
  venueNameMissing: '场地名称未记录',
  assignmentMissing: '岗位未记录',
  approverMissing: '处理人未记录',
  approverRangeUnknown: '审批人范围暂未确认',
  defaultStepName: order => `第 ${order} 步审批`,
  stepNameMissing: '审批步骤',
  completedSteps: (completed, total) => `已完成 ${completed} / ${total} 个审批步骤`,
  approvalProgressUnknown: '审批进度暂未确认',
  updatedAt: time => `更新于 ${time}`,
  stepNumber: order => `第 ${order} 步`,
  stepCount: count => `${count} 个审批步骤`,
  timeRange: (start, end) => `${start} 至 ${end}`,
  originalSchedule: (start, end) => `原安排：${start} 至 ${end}`,
  originalScheduleRange: range => `原安排：${range}`,
  recurrenceValidity: (start, end) => `重复活动有效期：${start} 至 ${end}`,
  recurrenceValidityRange: range => `重复活动有效期：${range}`,
  unlimitedScope: label => `${label}：不限`,
  timeRangeMissing: '起止时间未完整记录',
  repeatCountMissing: '重复次数未记录'
});

export default sharedModule;
