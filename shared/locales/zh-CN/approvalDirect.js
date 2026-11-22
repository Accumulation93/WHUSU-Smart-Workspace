'use strict';

module.exports = {
  directApproveAction: '直接通过',
  directApproveChanged: '审批状态已变化，请刷新后再操作。',
  directApprovalActor: '实际经办人',
  directApprovalEvent: '超管直接通过',
  audit: {
    directApproveConfirm: '确认以你的名义通过这项申请吗？已完成的审批和签章会保留，系统会记录你的决定。',
    directApproveSucceeded: '申请已通过',
    directApproveMissing: '请先补齐「{stepTitle}」要求的{requirement}。',
    directApprovePendingMaterials: '补齐必需签章',
    originalApprover: '原审批人',
    bypassedUntilDirectDecision: '超管直接通过，此步骤未办理'
  },
  venue: {
    directApproveConfirm: '确认以你的名义通过这条借用吗？系统会记录你的决定。',
    directApproveSucceeded: '借用已通过'
  }
};
