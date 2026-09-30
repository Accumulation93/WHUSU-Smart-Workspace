'use strict';

/**
 * 场地借用审批原因的单一文案来源。
 * 原先在 venueApprovalPolicy 与 venueApprovalMultiFlow 各写一份（措辞还会漂移），
 * 这里收敛为一处，两个服务共同引用。
 */

const multiFlowCopy = require('./generated/modules/venue/services/venueApprovalMultiFlow');

module.exports = Object.freeze({
  noFlow: '该借用未设置审批流程',
  rejected: '该借用已被驳回',
  completed: '该借用已完成全部审批',
  invalidStep: '审批步骤设置异常，请联系管理员',
  adminRequired: '该步骤仅允许当前组织管理员审批',
  userRoleRequired: '该步骤需切换到普通用户工作角色审批',
  noRules: '请联系管理员设置审批条件',
  ruleMismatch: '你不符合当前审批步骤的审批条件',
  designatedOnly: '该步骤已指定审批人，只有指定人员可以审批',
  designateInvalid: '请选择符合条件的审批人',
  applicantSnapshotMissing: multiFlowCopy.applicantSnapshotMissing,
  flowSnapshotMissing: multiFlowCopy.flowSnapshotMissing,
  firstDesignationNotAllowed: multiFlowCopy.firstDesignationNotAllowed,
  nextDesignationNotAllowed: multiFlowCopy.nextDesignationNotAllowed
});
