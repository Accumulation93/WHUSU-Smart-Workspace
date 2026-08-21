const assert = require('node:assert/strict');
const test = require('node:test');
const viewModel = require('../modules/personnelViewModel');

test('岗位显示名称只由身份类别、部门和职能组生成', () => {
  assert.equal(viewModel.buildAssignmentLabel({
    title: 'legacy-assignment-title',
    identityCategoryName: '部门负责人',
    department: '权益部',
    workGroup: '调研组'
  }), '部门负责人 · 权益部 · 调研组');
  assert.equal(viewModel.buildAssignmentLabel({ identity: '主席团成员', department: '主席团' }), '主席团成员 · 主席团');
});

test('岗位视图规范化身份类别并保留无岗位成员', () => {
  const organizations = viewModel.normalizeAssignments([{
    organizationId: 'org-1',
    assignments: [{ identityId: 'identity-1', identity: '部门负责人', department: '办公室' }]
  }, {
    organizationId: 'org-2',
    assignments: []
  }], '暂未设置岗位');
  assert.equal(organizations[0].assignments[0].identityCategoryId, 'identity-1');
  assert.equal(organizations[0].assignments[0].assignmentLabel, '部门负责人 · 办公室');
  assert.equal(organizations[1].hasAssignments, false);
});

test('资料审核对照保留空值变化且不混入未提交字段', () => {
  const rows = viewModel.buildProfileComparisonRows([
    { id: 'phone', label: '手机号' },
    { id: 'email', label: '邮箱' }
  ], { phone: '13800000000', email: 'old@example.com' }, { phone: '', email: 'new@example.com' }, '未填写');
  assert.deepEqual(rows, [{
    id: 'phone', label: '手机号', effectiveValue: '13800000000', pendingValue: '未填写', changed: true
  }, {
    id: 'email', label: '邮箱', effectiveValue: 'old@example.com', pendingValue: 'new@example.com', changed: true
  }]);
});

test('姓名或学号任一变化都进入全局纠错流程', () => {
  const current = { name: '甲', studentId: '20260001' };
  assert.equal(viewModel.hasBasicIdentityChange(current, { _name: '甲', _studentId: '20260001' }), false);
  assert.equal(viewModel.hasBasicIdentityChange(current, { _name: '乙', _studentId: '20260001' }), true);
  assert.equal(viewModel.hasBasicIdentityChange(current, { _name: '甲', _studentId: '20260002' }), true);
});
