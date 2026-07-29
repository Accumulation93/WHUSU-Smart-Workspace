const assert = require('assert');
const { normalizeRule, normalizeFlowSteps } = require('../src/modules/venue/utils/approvalFlowValidation');

assert.deepStrictEqual(normalizeRule({
  departmentScope: 'specific',
  specificDepartmentId: 'dept-1, dept-1,dept-2',
  workGroupScope: 'all',
  specificWorkGroupId: 'ignored',
  identityScope: 'same'
}), {
  departmentScope: 'specific',
  specificDepartmentId: 'dept-1,dept-2',
  workGroupScope: 'all',
  specificWorkGroupId: null,
  identityScope: 'same',
  specificIdentityId: null
});

assert.throws(() => normalizeRule({
  departmentScope: 'specific',
  specificDepartmentId: ''
}), /请重新选择部门/);
assert.throws(() => normalizeRule({ identityScope: 'unexpected' }), /请重新选择审批范围/);
assert.throws(() => normalizeFlowSteps([]), /请添加审批步骤/);
assert.throws(() => normalizeFlowSteps([{
  name: '负责人审批',
  approvalMode: 'hr_rule',
  rules: []
}]), /请添加人事审批规则/);
assert.throws(() => normalizeFlowSteps([{
  name: '管理员审批',
  approvalMode: 'admin_any',
  rules: [{ departmentScope: 'all' }]
}]), /请清除其他规则/);

const normalized = normalizeFlowSteps([{
  name: '负责人审批',
  approvalMode: 'hr_rule',
  rules: [{ departmentScope: 'same', workGroupScope: 'all', identityScope: 'specific', specificIdentityId: 'head' }]
}]);
assert.strictEqual(normalized[0].rules[0].specificIdentityId, 'head');
console.log('场地审批流输入边界测试通过');
