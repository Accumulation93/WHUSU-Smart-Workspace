const assert = require('assert');
const {
  findMyVenueApproval,
  matchesApprovalContext
} = require('../src/modules/venue/services/venueApprovalHistory');

const chairman = {
  type: 'user',
  id: 'hr-chen-yifan',
  personId: 'person-chen-yifan',
  assignmentId: 'assignment-chairman',
  contextId: 'assignment:chairman:org-1'
};

const formatDateTime = function(date) {
  return date.toISOString();
};

const legacySnapshot = {
  stepIndex: 0,
  stepName: '主席团成员审批',
  approverHrId: chairman.id,
  approverPersonId: chairman.personId,
  approvedAt: '2026-08-09 10:00:00',
  comment: '同意'
};

assert.strictEqual(
  matchesApprovalContext(legacySnapshot, chairman),
  false,
  '旧格式快照没有岗位引用时不得归入当前岗位'
);
assert.strictEqual(
  matchesApprovalContext(Object.assign({}, legacySnapshot, { approverContextId: 'assignment:other:org-1' }), chairman),
  false,
  '存在明确审批上下文时必须拒绝其他身份上下文'
);
assert.strictEqual(
  matchesApprovalContext(Object.assign({}, legacySnapshot, {
    approverContextId: '',
    approverAssignmentId: 'assignment-other'
  }), chairman),
  false,
  '新快照有岗位 ID 时必须拒绝同一人员的其他岗位'
);
assert.strictEqual(
  matchesApprovalContext(Object.assign({}, legacySnapshot, {
    approverContextId: '',
    approverAssignmentId: chairman.assignmentId
  }), chairman),
  true,
  '新快照应按当前岗位 ID 精确匹配'
);
assert.strictEqual(
  matchesApprovalContext(Object.assign({}, legacySnapshot, { role: 'admin' }), chairman),
  false,
  '存在旧格式身份类型时必须拒绝其他身份类型'
);

const snapshotBooking = {
  status: 'approved',
  approval_snapshots_json: JSON.stringify([
    Object.assign({}, legacySnapshot, { approverAssignmentId: chairman.assignmentId, approvedAt: '2026-08-09 09:00:00' }),
    Object.assign({}, legacySnapshot, { approverAssignmentId: chairman.assignmentId, approvedAt: '2026-08-09 10:00:00', comment: '最终同意' })
  ])
};
const snapshotResult = findMyVenueApproval(snapshotBooking, chairman, formatDateTime);
assert.strictEqual(snapshotResult.action, 'approved');
assert.strictEqual(snapshotResult.approvedAt, '2026-08-09 10:00:00');
assert.strictEqual(snapshotResult.comment, '最终同意');

const multiPositionResult = findMyVenueApproval({
  status: 'approved',
  approval_snapshots_json: JSON.stringify([
    Object.assign({}, legacySnapshot, {
      stepIndex: 0,
      approverAssignmentId: chairman.assignmentId,
      approverContextId: chairman.contextId,
      approvedAt: '2026-08-09 10:00:00'
    }),
    Object.assign({}, legacySnapshot, {
      stepIndex: 1,
      approverAssignmentId: 'assignment-other',
      approverContextId: '',
      approvedAt: '2026-08-09 11:00:00'
    }),
    Object.assign({}, legacySnapshot, {
      stepIndex: 2,
      approverAssignmentId: chairman.assignmentId,
      approverContextId: chairman.contextId,
      approvedAt: '2026-08-09 12:00:00'
    })
  ])
}, chairman, formatDateTime);
assert.strictEqual(multiPositionResult.stepIndex, 2, '多步后续进展中应返回当前岗位处理的最新步骤');
assert.strictEqual(multiPositionResult.assignmentId, chairman.assignmentId);

const scalarResult = findMyVenueApproval({
  status: 'rejected',
  approval_snapshots_json: '[]',
  approver_hr_id: chairman.id,
  approver_person_id: chairman.personId,
  approver_assignment_id: chairman.assignmentId,
  approver_context_snapshot: JSON.stringify({ contextId: chairman.contextId, role: 'user' }),
  approval_comment: '请补充材料',
  approval_reject_step: 1,
  updated_at: '2026-08-09T11:00:00.000Z'
}, chairman, formatDateTime);
assert.strictEqual(scalarResult.action, 'rejected');
assert.strictEqual(scalarResult.comment, '请补充材料');
assert.strictEqual(scalarResult.stepIndex, 1);

assert.strictEqual(findMyVenueApproval({
  status: 'approved',
  approval_snapshots_json: '[]',
  approver_hr_id: chairman.id,
  approver_person_id: chairman.personId,
  approver_context_snapshot: JSON.stringify({ contextId: chairman.contextId, role: 'user' })
}, chairman, formatDateTime), null, '旧标量记录没有岗位引用时也必须失败关闭');

console.log('场地审批历史实时匹配测试通过');
