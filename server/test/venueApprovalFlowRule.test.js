const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return {};
  if (request === '../../../utils/orgContext') return { getCurrentOrgId: async () => 'org-test' };
  return originalLoad.call(this, request, parent, isMain);
};
const {
  matchesRule,
  matchesAnyRule
} = require('../src/modules/venue/models/venueApprovalFlowStepRule');
Module._load = originalLoad;

const approver = {
  department_id: 'department-1',
  work_group_id: 'work-group-1',
  identity_id: 'identity-1'
};
const applicant = {
  department_id: 'department-1',
  work_group_id: 'work-group-2',
  identity_id: 'identity-2'
};

assert.strictEqual(matchesRule({
  department_scope: 'same',
  work_group_scope: 'all',
  identity_scope: 'specific',
  specific_identity_id: 'identity-1,identity-3'
}, approver, applicant), true);

assert.strictEqual(matchesRule({
  department_scope: 'specific',
  specific_department_id: '',
  work_group_scope: 'all',
  identity_scope: 'all'
}, approver, applicant), false, 'specific 空集合不得退化为 all');

assert.strictEqual(matchesRule({
  department_scope: 'all',
  work_group_scope: 'specific',
  specific_work_group_id: null,
  identity_scope: 'all'
}, approver, applicant), false, 'specific 空职能组不得授权');

assert.strictEqual(matchesRule({
  department_scope: 'all',
  work_group_scope: 'all',
  identity_scope: 'specific',
  specific_identity_id: 'identity-2'
}, approver, applicant), false);

assert.strictEqual(matchesAnyRule([], approver, applicant), false);
console.log('场地审批规则最小授权测试通过');
