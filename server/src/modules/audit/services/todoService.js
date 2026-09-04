const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/services/todoService');
const { safeString } = require('../../../utils/helpers');
const submissionStepModel = require('../models/auditSubmissionStep');
const messageDataModel = require('../models/messageData');
const venueApprovalMultiFlow = require('../../venue/services/venueApprovalMultiFlow');
const venueBookingRuleModel = require('../../venue/models/venueBookingRule');
const { evaluateBookingRules } = require('../../venue/services/venueBookingRuleAuthorization');
const {
  resolveCurrentActorAssignment,
  resolveBookingApplicantAssignment,
  toRuleProfile
} = require('../../venue/services/venueAssignmentContext');
const { getUserScoringTask } = require('../../scoring/services/scoringTaskService');
const { loadEffectivePermissions } = require('../../../core/services/adminPermissions');

function groupBy(items, keyName) {
  const map = new Map();
  for (const item of items) {
    const key = item[keyName];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function buildHrMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.id, row);
  return map;
}

async function listAuditItems(actor, orgId) {
  if (actor.type !== 'user') return [];
  const steps = await submissionStepModel.getPendingByApprover(actor);
  const submitterIds = [...new Set(steps.map((item) => item.submitted_by).filter(Boolean))];
  const submitters = await messageDataModel.getHrPeople(submitterIds, orgId);
  const submitterMap = buildHrMap(submitters);
  return steps.map((step) => {
    const submitter = submitterMap.get(step.submitted_by);
    return {
      id: 'audit:' + safeString(step.id),
      type: 'todo',
      sourceType: 'audit_approval',
      title: safeString(step.title || step.submission_number || localeCopy.copy_ee071473de),
      description: localeCopy.copy_6438951f7d + safeString((submitter && submitter.name) || localeCopy.copy_de00c3e48a) +
        localeCopy.copy_80f5cda995 + safeString(step.sort_order) + localeCopy.copy_493a127a99,
      category: 'audit',
      targetType: 'submission',
      targetId: safeString(step.submission_id),
      targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + safeString(step.submission_id),
      createdAt: step.created_at,
      dueAt: null
    };
  });
}

async function listVenueItems(actor, orgId) {
  const bookings = await messageDataModel.getPendingVenueBookings(orgId);
  if (!bookings.length) return [];
  const applicantIds = [...new Set(bookings.map((item) => item.user_hr_id).filter(Boolean))];
  const applicantMap = buildHrMap(await messageDataModel.getHrPeople(applicantIds, orgId));
  let contextualActor = actor;
  if (actor.type === 'user') {
    const assignment = await resolveCurrentActorAssignment(actor, orgId);
    if (!assignment) return [];
    contextualActor = Object.assign({}, actor, { assignment, profile: toRuleProfile(assignment) });
  }

  const items = [];
  for (const booking of bookings) {
    const isFlowBooking = Boolean(
      (booking.approval_flow_id || booking.approval_flow_state_json)
      && Number(booking.approval_total_steps) > 0
    );
    let currentStepName = '';
    let applicant = applicantMap.get(booking.user_hr_id) || null;
    if (isFlowBooking) {
      const authorization = await venueApprovalMultiFlow.evaluateActorEligibility(
        booking,
        contextualActor,
        orgId
      );
      if (!authorization.ok) continue;
      const summary = authorization.summary || { flowSummary: [] };
      const firstActive = (summary.flowSummary || []).find((item) => item.active && !item.completed);
      currentStepName = safeString(firstActive && firstActive.stepName);
      applicant = authorization.applicantHrInfo || applicant;
    } else {
      const applicantAssignment = await resolveBookingApplicantAssignment(booking);
      if (!applicantAssignment) continue;
      const rules = await venueBookingRuleModel.getByVenueIdForOrg(booking.venue_id, orgId);
      if (!evaluateBookingRules(rules, contextualActor)) continue;
      applicant = toRuleProfile(applicantAssignment);
    }
    items.push({
      id: 'venue:' + safeString(booking.id),
      type: 'todo',
      sourceType: 'venue_approval',
      title: safeString(booking.title || localeCopy.copy_592351d93c),
      description: localeCopy.copy_d18a11f195 + safeString(booking.venue_name || localeCopy.copy_de00c3e48a) +
        localeCopy.copy_70c04ce8e3 + safeString((applicant && applicant.name) || localeCopy.copy_de00c3e48a) +
        ' · ' + safeString(currentStepName || (localeCopy.copy_93c50c01c0 + (Number(booking.approval_current_step) + 1) + localeCopy.copy_493a127a99)),
      category: 'venue',
      targetType: 'booking',
      targetId: safeString(booking.id),
      targetUrl: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals',
      createdAt: booking.created_at,
      dueAt: booking.time_start || null
    });
  }
  return items;
}

async function listScoringItems(actor) {
  if (actor.type !== 'user') return [];
  const task = await getUserScoringTask(actor.profile, null, null, actor);
  if (!task) return [];
  return [{
    id: 'scoring:' + safeString(task.activity.id),
    type: 'todo',
    sourceType: 'scoring_task',
    title: safeString(task.activity.name || localeCopy.copy_33a502217d),
    description: localeCopy.copy_50fc130639 + task.pendingCount + localeCopy.copy_67a5467bc2,
    category: 'scoring',
    targetType: 'score_activity',
    targetId: safeString(task.activity.id),
    targetUrl: '/subpackages/workspace/pages/home/home?subApp=scoring',
    createdAt: task.activity.created_at,
    dueAt: task.dueAt
  }];
}

async function listHrProfileItems(actor, orgId) {
  if (actor.type !== 'admin') return [];
  const effective = await loadEffectivePermissions(actor.profile, orgId);
  if (!effective.permissions || effective.permissions['hr.profile_review'] !== true) return [];
  const records = await messageDataModel.getPendingHrProfiles(orgId);
  return records.map((record) => ({
    id: 'hr-profile:' + safeString(record.id),
    type: 'todo',
    sourceType: 'hr_profile_review',
    title: safeString(record.name || localeCopy.copy_0a1d44e805),
    description: localeCopy.copy_5d43cbef1a + safeString(record.student_id || localeCopy.copy_de00c3e48a) + localeCopy.copy_c9fa920da1,
    category: 'hr',
    targetType: 'hr_profile',
    targetId: safeString(record.hr_id),
    targetUrl: '/subpackages/scoring/pages/admin/admin?subApp=hr',
    createdAt: record.requested_at || record.updated_at,
    dueAt: null
  }));
}

function compareTodo(a, b) {
  const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (at !== bt) return bt - at;
  return String(a.id).localeCompare(String(b.id));
}

async function listAll(actor, orgId) {
  const [auditItems, venueItems, scoringItems, hrItems] = await Promise.all([
    listAuditItems(actor, orgId),
    listVenueItems(actor, orgId),
    listScoringItems(actor),
    listHrProfileItems(actor, orgId)
  ]);
  return auditItems.concat(venueItems, scoringItems, hrItems).sort(compareTodo);
}

module.exports = { listAll, compareTodo };
