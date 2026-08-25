'use strict';

const assert = require('assert');
const Module = require('module');

let evaluatedState = '';
const mocks = {
  '../models/auditSubmissionStep': { async getPendingByApprover() { return []; } },
  '../models/messageData': {
    async getPendingVenueBookings() {
      return [{
        id: 'booking-1', venue_id: 'venue-1', venue_name: '会议室', title: '并行流程借用',
        user_hr_id: 'hr-applicant', status: 'pending', approval_org_id: 'org-1',
        approval_flow_id: 'flow-a', approval_flow_state_json: JSON.stringify({ flows: { 'flow-a': {}, 'flow-b': {} } }),
        approval_total_steps: 2, approval_current_step: 0, created_at: '2026-08-25 02:00:00',
        time_start: '2026-08-26 02:00:00'
      }];
    },
    async getHrPeople() { return [{ id: 'hr-applicant', name: '申请人' }]; },
    async getPendingHrProfiles() { return []; }
  },
  '../../venue/services/venueApprovalMultiFlow': {
    async evaluateActorEligibility(booking, actor) {
      evaluatedState = booking.approval_flow_state_json;
      assert.strictEqual(actor.assignmentId, 'assignment-b');
      return {
        ok: true,
        applicantHrInfo: { name: '申请人' },
        summary: { flowSummary: [{ active: true, completed: false, stepName: '流程 B 第一步' }] }
      };
    }
  },
  '../../venue/models/venueBookingRule': { async getByVenueIdForOrg() { return []; } },
  '../../venue/services/venueBookingRuleAuthorization': { evaluateBookingRules() { return false; } },
  '../../venue/services/venueAssignmentContext': {
    async resolveCurrentActorAssignment(actor) { return { assignmentId: actor.assignmentId }; },
    async resolveBookingApplicantAssignment() { return null; },
    toRuleProfile() { return {}; }
  },
  '../../scoring/services/scoringTaskService': { async getUserScoringTask() { return null; } }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const todoService = require('../src/modules/audit/services/todoService');
Module._load = originalLoad;

(async function run() {
  const items = await todoService.listAll({
    type: 'user', id: 'hr-approver', assignmentId: 'assignment-b', profile: {}
  }, 'org-1');
  assert.strictEqual(items.length, 1, '仅在并行流程 B 有资格时消息中心也必须产生待办');
  assert.strictEqual(items[0].sourceType, 'venue_approval');
  assert.match(items[0].description, /流程 B 第一步/);
  assert.match(evaluatedState, /flow-b/, '消息中心必须使用多流程状态而不是单一旧流程列');
  console.log('消息中心场地多流程待办一致性测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
