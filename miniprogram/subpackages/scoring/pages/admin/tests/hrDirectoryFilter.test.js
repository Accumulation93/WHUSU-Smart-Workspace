const assert = require('node:assert/strict');
const test = require('node:test');

global.wx = global.wx || { showToast() {} };
const {
  emptyHrProfileFilters,
  applyHrProfileFilters,
  tryParseDateValue,
  validateProfileField
} = require('../modules/adminUtils');

test('多岗位组合筛选只允许同一岗位元组命中', () => {
  const rows = [{
    id: 'hr-1',
    name: '测试成员',
    studentId: '20260001',
    membershipStatus: 'active',
    assignmentCount: 2,
    auditStatus: 'approved',
    isComplete: true,
    accountState: 'active',
    wxBindStatus: 'bound',
    assignments: [
      { assignmentNature: 'staff', departmentId: 'dept-secretariat', department: '秘书处', identityCategoryId: 'identity-member', identityCategoryName: '成员', workGroup: '' },
      { assignmentNature: 'staff', departmentId: 'dept-rights', department: '权益部', identityCategoryId: 'identity-head', identityCategoryName: '负责人', workGroupId: 'group-research', workGroup: '调研组' }
    ]
  }];
  const filters = Object.assign(emptyHrProfileFilters(), {
    departments: ['dept-secretariat'],
    identities: ['identity-head']
  });
  assert.equal(applyHrProfileFilters(rows, filters).length, 0);
  filters.departments = ['dept-rights'];
  assert.equal(applyHrProfileFilters(rows, filters).length, 1);
});

test('岗位字段搜索与其他岗位筛选必须命中同一岗位元组', () => {
  const rows = [{
    id: 'member-1',
    name: '测试成员',
    studentId: '20260001',
    membershipStatus: 'active',
    assignmentCount: 2,
    auditStatus: 'approved',
    isComplete: true,
    accountState: 'bound',
    wxBindStatus: 'bound',
    assignments: [
      { assignmentNature: 'staff', departmentId: 'dept-secretariat', department: '秘书处', identityCategoryId: 'identity-member', identityCategoryName: '成员', workGroup: '' },
      { assignmentNature: 'staff', departmentId: 'dept-rights', department: '权益部', identityCategoryId: 'identity-head', identityCategoryName: '负责人', workGroup: '' }
    ]
  }];

  const filters = emptyHrProfileFilters();
  filters.searchField = 'department';
  filters.keyword = '秘书处';
  filters.identities = ['identity-head'];

  assert.strictEqual(applyHrProfileFilters(rows, filters).length, 0);
  filters.keyword = '权益部';
  assert.strictEqual(applyHrProfileFilters(rows, filters).length, 1);
});

test('同名岗位字典项只按组织内 ID 命中', () => {
  const rows = [{
    id: 'member-collision',
    name: '同名职能组成员',
    studentId: '20260002',
    membershipStatus: 'active',
    assignmentCount: 2,
    auditStatus: 'approved',
    isComplete: true,
    accountState: 'bound',
    wxBindStatus: 'bound',
    assignments: [
      { assignmentNature: 'staff', departmentId: 'dept-a', department: '甲部', identityCategoryId: 'identity-member', identityCategoryName: '成员', workGroupId: 'group-a', workGroup: '项目组' },
      { assignmentNature: 'staff', departmentId: 'dept-b', department: '乙部', identityCategoryId: 'identity-head', identityCategoryName: '负责人', workGroupId: 'group-b', workGroup: '项目组' }
    ]
  }];
  const filters = Object.assign(emptyHrProfileFilters(), {
    departments: ['dept-a'],
    identities: ['identity-head'],
    workGroups: ['group-a']
  });
  assert.equal(applyHrProfileFilters(rows, filters).length, 0);
  filters.departments = ['dept-b'];
  filters.workGroups = ['group-b'];
  assert.equal(applyHrProfileFilters(rows, filters).length, 1);
});

test('补充资料日期不接受时间戳且文本长度按 Unicode 码点计算', () => {
  assert.deepEqual(tryParseDateValue('2026/08/23'), { year: 2026, month: 8, day: 23 });
  const rawUtcTimestamp = ['2026-08-23', '11:10:16.000Z'].join('T');
  assert.equal(tryParseDateValue(rawUtcTimestamp), null);
  assert.equal(tryParseDateValue('23/08/2026'), null);
  assert.equal(validateProfileField({ type: 'text', label: '昵称', maxLength: 1 }, '𠮷'), '');
  assert.notEqual(validateProfileField({ type: 'text', label: '昵称', maxLength: 1 }, '𠮷好'), '');
});
