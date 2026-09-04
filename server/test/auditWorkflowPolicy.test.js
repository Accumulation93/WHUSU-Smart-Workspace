'use strict';

const assert = require('assert');
const Module = require('module');
const policy = require('../src/modules/audit/services/auditWorkflowPolicy');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return { async query() { return [[]]; } };
  if (request === '../../../utils/orgContext') return { async getCurrentOrgId() { return 'org-test'; } };
  if (request === '../services/auditSchemaCapabilities') {
    return { async getColumns() { return new Set(); } };
  }
  if (request === '../services/auditAssignmentContext') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const submissionStep = require('../src/modules/audit/models/auditSubmissionStep');
Module._load = originalLoad;

const identityCondition = {
  conditionType: 'identity_scope',
  departmentScope: 'all',
  workGroupScope: 'all',
  identityScope: 'specific',
  specificIdentityId: 'identity-chair'
};
const personCondition = {
  conditionType: 'person',
  personHrIds: 'hr-fixed',
  assignmentIds: 'assignment-fixed'
};

assert.strictEqual(policy.validateStepShape({
  actionType: 'pass',
  conditions: []
}).reason, 'step_conditions_required', '没有审批条件的步骤必须拒绝保存');
assert.strictEqual(policy.validateConditionShape({
  conditionType: 'unknown',
  departmentScope: 'all',
  workGroupScope: 'all',
  identityScope: 'all'
}).ok, false, '未知条件类型必须失败关闭');
assert.strictEqual(policy.validateConditionShape({
  conditionType: 'identity_scope',
  departmentScope: 'mystery',
  workGroupScope: 'all',
  identityScope: 'all'
}).ok, false, '未知范围值必须失败关闭');

const identityApprover = {
  id: 'hr-chair',
  assignment_id: 'assignment-chair',
  identity_id: 'identity-chair',
  department_id: 'department-1',
  work_group_id: 'group-1'
};
assert.strictEqual(submissionStep.matchesAnyCondition(
  [personCondition, identityCondition],
  identityApprover,
  identityApprover
), true, '固定人员与身份条件并列时必须保持 OR 语义');

const narrowed = policy.applyDesignationOverride(
  [personCondition, identityCondition],
  [{
    conditionType: 'person',
    personHrIds: 'hr-designated',
    assignmentIds: 'assignment-designated'
  }]
);
assert.strictEqual(submissionStep.matchesAnyCondition(
  narrowed,
  identityApprover,
  identityApprover
), false, '运行时指定后原始身份范围必须被收窄');
assert.strictEqual(submissionStep.matchesAnyCondition(
  narrowed,
  {
    id: 'hr-designated',
    assignment_id: 'assignment-designated',
    identity_id: 'identity-other'
  },
  identityApprover
), true, '被指定的具体岗位必须能够审批');
assert.deepStrictEqual(policy.stripDesignationOverrides(narrowed), [personCondition, identityCondition],
  '驳回重提必须能恢复原始审批条件');
assert.strictEqual(submissionStep.matchesAnyCondition(
  [{ conditionType: 'identity_scope', departmentScope: 'unknown' }],
  identityApprover,
  identityApprover
), false, '损坏的历史条件不得扩大审批权限');

console.log('审核条件校验、OR 语义、指定收窄与重提恢复测试通过');
