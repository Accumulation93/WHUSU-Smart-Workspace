const assert = require('node:assert/strict');
const test = require('node:test');

global.wx = global.wx || { showToast() {} };
const { emptyHrProfileFilters, applyHrProfileFilters } = require('../modules/adminUtils');

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
      { assignmentNature: 'staff', department: '秘书处', identityCategoryName: '成员', workGroup: '' },
      { assignmentNature: 'staff', department: '权益部', identityCategoryName: '负责人', workGroup: '调研组' }
    ]
  }];
  const filters = Object.assign(emptyHrProfileFilters(), {
    departments: ['秘书处'],
    identities: ['负责人']
  });
  assert.equal(applyHrProfileFilters(rows, filters).length, 0);
  filters.departments = ['权益部'];
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
      { assignmentNature: 'staff', department: '秘书处', identityCategoryName: '成员', workGroup: '' },
      { assignmentNature: 'staff', department: '权益部', identityCategoryName: '负责人', workGroup: '' }
    ]
  }];

  const filters = emptyHrProfileFilters();
  filters.searchField = 'department';
  filters.keyword = '秘书处';
  filters.identities = ['负责人'];

  assert.strictEqual(applyHrProfileFilters(rows, filters).length, 0);
  filters.keyword = '权益部';
  assert.strictEqual(applyHrProfileFilters(rows, filters).length, 1);
});
