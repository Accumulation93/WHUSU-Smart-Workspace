const assert = require('assert');
const fs = require('fs');
const path = require('path');
process.env.DB_USER = process.env.DB_USER || 'personnel_domain_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'personnel_domain_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'personnel-domain-test-secret';
const unifiedIdentity = require('../src/core/models/unifiedIdentity');
const { PERMISSION_DEFINITIONS } = require('../src/core/services/adminPermissions');

const completeAssignment = {
  assignment_title: '不得显示的自由文本岗位名称',
  identity_name: '部门负责人',
  department_name: '权益部',
  work_group_name: '维权组'
};
assert.strictEqual(
  unifiedIdentity.buildAssignmentLabel(completeAssignment),
  '部门负责人 · 权益部 · 维权组'
);
assert.strictEqual(
  unifiedIdentity.buildAssignmentLabel({ identity_name: '主席团成员', department_name: '主席团' }),
  '主席团成员 · 主席团'
);
assert.strictEqual(
  unifiedIdentity.buildAssignmentLabel({ assignment_title: '旧岗位名' }),
  '暂无岗位'
);

const globalAccountPermission = PERMISSION_DEFINITIONS.get('auth.accounts.global_manage');
assert(globalAccountPermission);
assert.deepStrictEqual(globalAccountPermission.targetLevels, ['super_admin']);
assert.deepStrictEqual(globalAccountPermission.defaultLevels, ['super_admin']);

const hrRouteSource = fs.readFileSync(path.resolve(__dirname, '../src/core/routes/hr.js'), 'utf8');
assert(hrRouteSource.includes('listMembershipAssignmentSummaries')
  && hrRouteSource.includes('assignments: assignmentSummary.assignments'),
'管理端人员目录必须一人一卡返回完整在职岗位数组，不能只暴露 hr_info 单岗位快照');

console.log('人事领域岗位名称与全局账号治理权限测试通过');
