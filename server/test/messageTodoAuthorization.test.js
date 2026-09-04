const assert = require('assert');

const messageDataPath = require.resolve('../src/modules/audit/models/messageData');
const auditStepPath = require.resolve('../src/modules/audit/models/auditSubmissionStep');
const venueFlowPath = require.resolve('../src/modules/venue/services/venueApprovalMultiFlow');
const venueRulePath = require.resolve('../src/modules/venue/models/venueBookingRule');
const venueRuleAuthPath = require.resolve('../src/modules/venue/services/venueBookingRuleAuthorization');
const venueAssignmentPath = require.resolve('../src/modules/venue/services/venueAssignmentContext');
const scoringTaskPath = require.resolve('../src/modules/scoring/services/scoringTaskService');
const permissionsPath = require.resolve('../src/core/services/adminPermissions');
const todoServicePath = require.resolve('../src/modules/audit/services/todoService');

let pendingProfileReads = 0;
let allowReview = false;

require.cache[messageDataPath] = {
  id: messageDataPath,
  filename: messageDataPath,
  loaded: true,
  exports: {
    async getPendingVenueBookings() { return []; },
    async getHrPeople() { return []; },
    async getPendingHrProfiles() {
      pendingProfileReads += 1;
      return [{ id: 'review-1', hr_id: 'hr-1', name: '待审成员', student_id: '20260001' }];
    }
  }
};
require.cache[auditStepPath] = {
  id: auditStepPath, filename: auditStepPath, loaded: true,
  exports: { async getPendingByApprover() { return []; } }
};
require.cache[venueFlowPath] = {
  id: venueFlowPath, filename: venueFlowPath, loaded: true,
  exports: { async evaluateActorEligibility() { return { ok: false }; } }
};
require.cache[venueRulePath] = {
  id: venueRulePath, filename: venueRulePath, loaded: true,
  exports: { async getByVenueIdForOrg() { return []; } }
};
require.cache[venueRuleAuthPath] = {
  id: venueRuleAuthPath, filename: venueRuleAuthPath, loaded: true,
  exports: { evaluateBookingRules() { return false; } }
};
require.cache[venueAssignmentPath] = {
  id: venueAssignmentPath, filename: venueAssignmentPath, loaded: true,
  exports: {
    async resolveCurrentActorAssignment() { return null; },
    async resolveBookingApplicantAssignment() { return null; },
    toRuleProfile(value) { return value; }
  }
};
require.cache[scoringTaskPath] = {
  id: scoringTaskPath, filename: scoringTaskPath, loaded: true,
  exports: { async getUserScoringTask() { return null; } }
};
require.cache[permissionsPath] = {
  id: permissionsPath, filename: permissionsPath, loaded: true,
  exports: {
    async loadEffectivePermissions() {
      return { permissions: { 'hr.profile_review': allowReview } };
    }
  }
};

delete require.cache[todoServicePath];
const todoService = require(todoServicePath);
const actor = {
  type: 'admin',
  id: 'admin-1',
  profile: { id: 'admin-1', admin_level: 'admin', org_id: 'org-1' }
};

(async function run() {
  pendingProfileReads = 0;
  allowReview = false;
  const denied = await todoService.listAll(actor, 'org-1');
  assert.deepStrictEqual(denied, []);
  assert.strictEqual(pendingProfileReads, 0, '无资料审核权限时不得读取待审人员数据');

  allowReview = true;
  const allowed = await todoService.listAll(actor, 'org-1');
  assert.strictEqual(pendingProfileReads, 1);
  assert.strictEqual(allowed.length, 1);
  assert.strictEqual(allowed[0].targetUrl, '/subpackages/scoring/pages/admin/admin?subApp=hr');
  console.log('消息中心资料审核待办权限测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
