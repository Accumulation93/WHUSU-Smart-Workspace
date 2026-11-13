'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { conditionFacts } = require('../src/modules/audit/utils/auditConditionFacts');

test('性质条件保留明确集合，旧条件不补造性质，失效引用标记不完整', () => {
  const values = conditionFacts([{ natureIds: ['staff'] }, {}, { natureIds: ['missing'] }, { natureIds: [] }], { natureMap: { staff: 'Nature' } });
  assert.deepEqual(values[0].natureNames, ['Nature']);
  assert.deepEqual(values[0].natureIds, ['staff']);
  assert.equal(values[1].natureIds, null);
  assert.deepEqual(values[1].natureNames, []);
  assert.equal(values[2].unresolved, true);
  assert.deepEqual(values[2].natureNames, []);
  assert.equal(values[3].unresolved, true);
});

test('审批条件只返回已解析名称与范围，不把内部编号当名称', () => {
  const input = [{ conditionType: 'hr_rule', departmentScope: 'specific',
    specificDepartmentId: 'dept-a,missing-dept', identityScope: 'all', workGroupScope: 'none',
    personHrIds: ['member-a', 'missing-person'] }];
  const result = conditionFacts(input, { deptMap: { 'dept-a': 'DEPARTMENT_NAME' }, hrMap: { 'member-a': 'PERSON_NAME' } });
  assert.deepEqual(result[0].departmentNames, ['DEPARTMENT_NAME']);
  assert.deepEqual(result[0].personNames, ['PERSON_NAME']);
  assert.equal(result[0].unresolved, true);
  assert.equal(result[0].identityScope, 'all');
  assert.equal(result[0].workGroupScope, 'none');
  assert.ok(!JSON.stringify(result).includes('missing-dept'));
  assert.ok(!JSON.stringify(result).includes('missing-person'));
  assert.equal(input[0].specificDepartmentId, 'dept-a,missing-dept');
});

test('空或未知条件不伪造全体范围与岗位说明', () => {
  assert.deepEqual(conditionFacts(null), []);
  const [item] = conditionFacts([null]);
  assert.equal(item.conditionType, '');
  assert.equal(item.departmentScope, '');
  assert.deepEqual(item.personNames, []);
  assert.equal(item.assignmentLabels, undefined);
});
