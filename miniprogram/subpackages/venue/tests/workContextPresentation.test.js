const assert = require('assert');

let storage = {};
global.wx = {
  getStorageSync(key) {
    return storage[key];
  },
  showModal() {}
};

const presentation = require('../utils/workContextPresentation');

const structuredLabel = presentation.formatAssignmentLabel({
  assignmentId: 'assignment-1',
  assignmentNature: 'staff',
  department: '组织部',
  identityCategory: '部门负责人',
  workGroup: '项目组'
});
assert.strictEqual(structuredLabel, '本会岗位 · 组织部 · 部门负责人 · 项目组');

assert.strictEqual(
  presentation.formatAssignmentLabel({ assignmentLabel: '主席团成员 · 主席团' }),
  '主席团成员 · 主席团'
);

const pending = presentation.decoratePendingBooking({
  id: 'booking-1',
  canProcessInCurrentContext: false,
  creatorAssignmentId: 'creator-assignment',
  creatorAssignmentLabel: '部门负责人 · 组织部',
  requiredWorkContexts: [{
    contextId: 'context-1',
    assignmentId: 'assignment-2',
    assignmentLabel: '主席团成员 · 主席团'
  }]
});
assert.strictEqual(pending._requiresContextSwitch, true);
assert.strictEqual(pending._creatorAssignmentText, '部门负责人 · 组织部');
assert.strictEqual(pending._requiredContextText, '主席团成员 · 主席团');

const approverCandidates = presentation.decorateApproverCandidates([{
  hrId: 'hr-1',
  personId: 'person-1',
  name: '测试成员',
  studentId: '20260001',
  assignments: [{
    assignmentId: 'assignment-leader',
    assignmentLabel: '部门负责人 · 组织部'
  }, {
    assignmentId: 'assignment-member',
    assignmentLabel: '委员 · 组织部'
  }]
}]);
assert.strictEqual(approverCandidates.length, 2, '每个岗位必须形成独立候选项');
assert.strictEqual(approverCandidates[0].assignmentId, 'assignment-leader');
assert.strictEqual(approverCandidates[0]._selectionText, '测试成员 · 部门负责人 · 组织部');
assert.ok(approverCandidates[1]._searchText.indexOf('委员 · 组织部') >= 0);

storage = {
  activeRole: 'user',
  roleProfiles: { user: { assignmentId: '' } }
};
assert.strictEqual(presentation.activeUserHasAssignment(), false);
storage.roleProfiles.user.assignmentId = 'assignment-3';
assert.strictEqual(presentation.activeUserHasAssignment(), true);

console.log('venue work context presentation tests passed');
