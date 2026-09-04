'use strict';

const assert = require('assert');
const candidateView = require('../modules/designationCandidateView');

const rows = [
  { assignmentId: 'grantee-a', departmentId: 'department-1', identityId: 'identity-grantee', workGroupId: 'group-a' },
  { assignmentId: 'grantee-b', departmentId: 'department-1', identityId: 'identity-grantee', workGroupId: 'group-b' },
  { assignmentId: 'target-a', departmentId: 'department-1', identityId: 'identity-target', workGroupId: 'group-a' },
  { assignmentId: 'target-b', departmentId: 'department-1', identityId: 'identity-target', workGroupId: 'group-b' },
  { assignmentId: 'target-c', departmentId: 'department-1', identityId: 'identity-other', workGroupId: 'group-c' },
  { assignmentId: 'target-other-department', departmentId: 'department-2', identityId: 'identity-target', workGroupId: 'group-a' }
];

const allPeople = candidateView.filterCandidatesForClause(rows, { scopeType: 'all_people' });
assert.strictEqual(allPeople.length, rows.length, '全部成员范围不得因空目标身份被过滤为空');

const sameDepartmentAll = candidateView.filterCandidatesForClause(rows, {
  scopeType: 'same_department_all',
  granteeDepartmentId: 'department-1'
});
assert.deepStrictEqual(
  sameDepartmentAll.map((item) => item.assignmentId).sort(),
  ['grantee-a', 'grantee-b', 'target-a', 'target-b', 'target-c'].sort(),
  '同部门全部不得错误要求目标身份'
);

const sameWorkGroupIdentity = candidateView.filterCandidatesForClause(rows, {
  scopeType: 'same_work_group_identity',
  granteeDepartmentId: 'department-1',
  granteeIdentityId: 'identity-grantee',
  targetIdentityId: 'identity-target'
});
assert.deepStrictEqual(
  sameWorkGroupIdentity.map((item) => item.assignmentId).sort(),
  ['target-a', 'target-b'],
  '同职能组范围必须覆盖授权身份在该部门内的全部实际职能组，不能任取第一个岗位'
);

console.log('评分评优候选范围与多职能组匹配测试通过');
