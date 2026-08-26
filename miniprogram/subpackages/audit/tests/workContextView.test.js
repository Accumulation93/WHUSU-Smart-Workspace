const assert = require('assert');
const view = require('../utils/workContextView');

const candidate = view.normalizeCandidate({
  id: 'hr-1',
  name: '测试人员',
  eligibleAssignments: [
    { assignmentId: 'a-1', identityCategory: '部门负责人', department: '办公室' },
    { assignmentId: 'a-2', identityCategory: '主席团成员', department: '主席团', workGroup: '统筹组' }
  ]
}, 'a-2');

assert.strictEqual(candidate.eligibleAssignments.length, 2);
assert.strictEqual(candidate.currentContextEligible, true);
assert.strictEqual(view.candidateMatches(candidate, { department: '主席团' }), true);
assert.strictEqual(view.candidateMatches(candidate, { identityCategory: '部门负责人' }), true);
assert.strictEqual(view.candidateMatches(candidate, { keyword: '统筹组' }), true);
assert.strictEqual(view.candidateMatches(candidate, { department: '宣传部' }), false);

const crossAssignmentFilters = {
  department: '办公室',
  identityCategory: '主席团成员'
};
assert.strictEqual(
  view.candidateMatches(candidate, crossAssignmentFilters),
  false,
  '部门和身份类别分别位于两个岗位时不得拼接命中'
);

const combinedFilters = {
  department: '主席团',
  identityCategory: '主席团成员',
  workGroup: '统筹组'
};
assert.strictEqual(view.candidateMatches(candidate, combinedFilters), true);
const combinedCandidates = view.decorateAssignmentSelection([
  view.filterCandidateAssignments(candidate, combinedFilters)
], []);
assert.deepStrictEqual(
  combinedCandidates[0].eligibleAssignments.map(function(assignment) { return assignment.assignmentId; }),
  ['a-2'],
  '页面候选只应保留同时满足组合筛选的岗位'
);

assert.strictEqual(view.candidateMatches(candidate, {
  department: '办公室',
  identityCategory: '部门负责人'
}), true);
const officeCandidates = view.decorateAssignmentSelection([
  view.filterCandidateAssignments(candidate, {
    department: '办公室',
    identityCategory: '部门负责人'
  })
], []);
assert.deepStrictEqual(
  officeCandidates[0].eligibleAssignments.map(function(assignment) { return assignment.assignmentId; }),
  ['a-1'],
  '切换筛选条件后应从完整岗位集合重新匹配'
);

const selectedViews = view.selectedAssignmentViews([candidate], ['a-2'], '岗位信息未完整配置');
assert.deepStrictEqual(selectedViews.map(function(item) {
  return [item.id, item.assignmentId, item.assignmentLabel];
}), [['hr-1', 'a-2', '主席团成员 · 主席团 · 统筹组']]);
assert.strictEqual(view.candidateMatches(candidate, {}), true);
const decorated = view.decorateAssignmentSelection([candidate], ['a-2']);
assert.strictEqual(decorated[0].eligibleAssignments[0].isSelected, false);
assert.strictEqual(decorated[0].eligibleAssignments[1].isSelected, true);

assert.deepStrictEqual(view.normalizeSnapshot(null), {
  hasSnapshot: false,
  assignmentLabel: ''
});
assert.strictEqual(view.normalizeSnapshot({
  assignmentId: 'a-1',
  identityCategory: '部门负责人',
  department: '办公室'
}).assignmentLabel, '部门负责人 · 办公室');

const pending = view.normalizePendingItem({
  requiredOrganizationId: 'org-2',
  requiredOrganizationName: '第二组织',
  requiredContextIds: ['ctx-2'],
  eligibleWorkContexts: [{ assignmentLabel: '主席团成员 · 主席团' }]
}, { organizationId: 'org-1', contextId: 'ctx-1', assignmentId: 'a-1' });
assert.strictEqual(pending.requiresContextSwitch, true);
assert.deepStrictEqual(pending.eligibleContextLabels, ['主席团成员 · 主席团']);

assert.strictEqual(view.isContextFailure({ status: 'assignment_mismatch' }), true);
assert.strictEqual(view.isContextFailure({ status: 'error' }), false);

console.log('audit work context view tests passed');
