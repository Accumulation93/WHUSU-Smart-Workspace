'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.DB_USER = process.env.DB_USER || 'contract-test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'contract-test';

const {
  matchesAnyCondition,
  matchesIdentityScopeCondition,
  matchesScope
} = require('../src/modules/audit/models/auditSubmissionStep');

const approver = {
  id: 'hr-approver',
  department_id: 'dept-a',
  work_group_id: 'wg-a',
  identity_id: 'ident-a'
};
const submitter = {
  id: 'hr-submitter',
  department_id: 'dept-a',
  work_group_id: 'wg-a',
  identity_id: 'ident-b'
};

for (const field of [
  ['departmentScope', 'specificDepartmentId'],
  ['workGroupScope', 'specificWorkGroupId'],
  ['identityScope', 'specificIdentityId']
]) {
  const condition = {
    departmentScope: 'all',
    workGroupScope: 'all',
    identityScope: 'all'
  };
  condition[field[0]] = 'specific';
  condition[field[1]] = '';
  assert.strictEqual(
    matchesIdentityScopeCondition(condition, approver, submitter),
    false,
    `${field[0]}=specific 但目标集合为空时必须拒绝`
  );
}

assert.strictEqual(matchesAnyCondition([{
  conditionType: 'person',
  personHrIds: ''
}], approver, submitter), false);

assert.strictEqual(matchesAnyCondition([{
  conditionType: 'identity_scope',
  departmentScope: 'own',
  workGroupScope: 'all',
  identityScope: 'specific',
  specificIdentityId: 'ident-a'
}], approver, submitter), true);

assert.strictEqual(matchesScope({
  scope_type: 'specific_department',
  scope_department_id: ''
}, approver, submitter), false);
assert.strictEqual(matchesScope({
  scope_type: 'specific_work_group',
  scope_department_id: 'dept-a',
  scope_work_group_id: ''
}, approver, submitter), false);
assert.strictEqual(matchesScope({
  scope_type: 'unexpected_scope'
}, approver, submitter), false);

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/audit/models/auditSubmissionStep.js'),
  'utf8'
);
assert(
  source.includes('Missing or corrupt historical snapshots fail closed')
    && !source.includes('_batchLoadTemplateConditions'),
  '步骤快照缺失或损坏时不得回退到更宽泛的当前模板或旧字段'
);

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/audit/routes/auditUser.js'),
  'utf8'
);
const authorizationSource = routeSource.slice(
  routeSource.indexOf('async function checkStepAuthorization'),
  routeSource.indexOf('// approveStep')
);
assert(
  routeSource.includes("status: 'historical_snapshot_missing'")
    && !authorizationSource.includes('getTemplateStepConditions'),
  '查看和执行审批时，损坏或缺失的显式条件都必须明确失败关闭'
);

console.log('审核审批条件 fail-closed 回归测试通过');
