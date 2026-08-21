const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './venueAssignmentContext') {
    return {
      toRuleProfile: function(assignment) {
        return {
          identity_id: assignment.identityCategoryId,
          department_id: assignment.departmentId,
          work_group_id: assignment.workGroupId
        };
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const {
  matchesBookingRule,
  evaluateBookingRuleWorkContexts
} = require('../src/modules/venue/services/venueBookingRuleAuthorization');
Module._load = originalLoad;

function userActor(assignmentId, identityCategoryId, contextId, organizationId) {
  return {
    type: 'user',
    id: 'hr-1',
    personId: 'person-1',
    assignmentId,
    contextId,
    organizationId,
    assignment: {
      assignmentId,
      identityCategoryId,
      departmentId: 'department-1',
      workGroupId: 'group-1'
    }
  };
}

const identityRule = {
  rule_type: 'identity',
  approver_identity_id: 'identity-leader',
  scope_department_id: 'department-1',
  scope_work_group_id: 'group-1'
};

const leader = userActor('assignment-leader', 'identity-leader', 'ctx-leader', 'org-1');
const member = userActor('assignment-member', 'identity-member', 'ctx-member', 'org-1');
assert.strictEqual(matchesBookingRule(identityRule, leader), true);
assert.strictEqual(matchesBookingRule(identityRule, member), false, '同一人员的错误岗位不得通过身份规则');
assert.strictEqual(matchesBookingRule({ rule_type: 'person', approver_hr_id: 'hr-1' }, member), true, '指定人员规则按自然人在组织内的稳定成员记录匹配');
assert.strictEqual(matchesBookingRule({ rule_type: 'admin' }, { type: 'admin' }), true);

const crossOrg = evaluateBookingRuleWorkContexts(
  [identityRule],
  [leader, { type: 'admin', id: 'admin-2', contextId: 'ctx-admin-2', organizationId: 'org-2' }],
  'org-1',
  'ctx-admin-2',
  'org-2'
);
assert.strictEqual(crossOrg.visible, true, '旧规则待办也应通过其他组织岗位跨组织可见');
assert.strictEqual(crossOrg.canProcessInCurrentContext, false, '旧规则待办在错误组织上下文中不得处理');

console.log('场地旧规则岗位授权与跨组织待办测试通过');
