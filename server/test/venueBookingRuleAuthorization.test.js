const assert = require('assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');

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
assert.strictEqual(matchesBookingRule({
  rule_type: 'person', approver_hr_id: 'hr-1', approver_assignment_id: 'assignment-leader'
}, leader), true, '指定人员规则必须同时匹配人员与被指定岗位');
assert.strictEqual(matchesBookingRule({
  rule_type: 'person', approver_hr_id: 'hr-1', approver_assignment_id: 'assignment-leader'
}, member), false, '同一自然人的其他岗位不得命中指定人员规则');
assert.strictEqual(matchesBookingRule({
  rule_type: 'person', approver_hr_id: 'hr-1'
}, leader), false, '缺少历史岗位引用的旧指定人员规则必须失败关闭');
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

const venueAdminSource = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/venue/routes/venueAdmin.js'),
  'utf8'
);
const saveRuleStart = venueAdminSource.indexOf("router.post('/saveVenueBookingRule'");
const saveRuleEnd = venueAdminSource.indexOf("router.post('/deleteVenueBookingRule'", saveRuleStart);
const saveRuleSource = venueAdminSource.slice(saveRuleStart, saveRuleEnd);
assert.ok(saveRuleSource.includes('await conn.beginTransaction()'), '预约规则切换必须使用事务');
assert.ok(saveRuleSource.includes('venueModel.getByIdForUpdate(venueId, conn)'), '预约规则切换必须锁定场地配置入口');
assert.ok(saveRuleSource.includes('venueBookingRuleModel.removeByVenueId(venueId, conn)'), '直接通过必须清理同场地其他规则');
assert.ok(saveRuleSource.includes('venueApprovalFlowModel.removeByVenueId(venueId, conn)'), '直接通过必须清理同场地全部审批流');
assert.ok(saveRuleSource.includes('await conn.commit()'), '预约规则切换必须原子提交');

console.log('场地旧规则岗位授权与跨组织待办测试通过');
