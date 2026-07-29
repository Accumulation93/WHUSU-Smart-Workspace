const { safeString } = require('../../../utils/helpers');
const submissionStepModel = require('../models/auditSubmissionStep');
const messageDataModel = require('../models/messageData');
const { evaluateVenueApprovalStep } = require('../../venue/services/venueApprovalPolicy');
const { getUserScoringTask } = require('../../scoring/services/scoringTaskService');

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
  const steps = await submissionStepModel.getPendingByApprover(actor.id, actor.profile);
  const submitterIds = [...new Set(steps.map((item) => item.submitted_by).filter(Boolean))];
  const submitters = await messageDataModel.getHrPeople(submitterIds, orgId);
  const submitterMap = buildHrMap(submitters);
  return steps.map((step) => {
    const submitter = submitterMap.get(step.submitted_by);
    return {
      id: 'audit:' + safeString(step.id),
      type: 'todo',
      sourceType: 'audit_approval',
      title: safeString(step.title || step.submission_number || '审核事项'),
      description: '提交人 ' + safeString((submitter && submitter.name) || '信息已失效') +
        ' · 第' + safeString(step.sort_order) + '步',
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
  const flowIds = [...new Set(bookings.map((item) => item.approval_flow_id).filter(Boolean))];
  const steps = await messageDataModel.getVenueFlowSteps(flowIds, orgId);
  const stepsByFlow = groupBy(steps, 'flow_id');
  const currentSteps = [];
  for (const booking of bookings) {
    const flowSteps = stepsByFlow.get(booking.approval_flow_id) || [];
    const currentStep = flowSteps[Number(booking.approval_current_step)];
    if (currentStep) currentSteps.push(currentStep);
  }
  const rules = await messageDataModel.getVenueStepRules(
    [...new Set(currentSteps.map((item) => item.id))],
    orgId
  );
  const rulesByStep = groupBy(rules, 'step_id');
  const applicantIds = [...new Set(bookings.map((item) => item.user_hr_id).filter(Boolean))];
  const applicantMap = buildHrMap(await messageDataModel.getHrPeople(applicantIds, orgId));

  const items = [];
  for (const booking of bookings) {
    const flowSteps = stepsByFlow.get(booking.approval_flow_id) || [];
    const currentStep = flowSteps[Number(booking.approval_current_step)];
    if (!currentStep) continue;
    const stepRules = rulesByStep.get(currentStep.id) || [];
    currentStep.rules = stepRules;
    const authorization = evaluateVenueApprovalStep({
      booking,
      actor,
      steps: flowSteps,
      applicantHrInfo: applicantMap.get(booking.user_hr_id) || null
    });
    if (!authorization.ok) continue;
    const applicant = applicantMap.get(booking.user_hr_id);
    items.push({
      id: 'venue:' + safeString(booking.id),
      type: 'todo',
      sourceType: 'venue_approval',
      title: safeString(booking.title || '场地借用'),
      description: '场地：' + safeString(booking.venue_name || '信息已失效') +
        ' · 提交人 ' + safeString((applicant && applicant.name) || '信息已失效') +
        ' · ' + safeString(currentStep.name || ('第' + (Number(booking.approval_current_step) + 1) + '步')),
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
    title: safeString(task.activity.name || '考核评分'),
    description: '还有 ' + task.pendingCount + ' 人待评分',
    category: 'scoring',
    targetType: 'score_activity',
    targetId: safeString(task.activity.id),
    targetUrl: '/pages/home/home?subApp=scoring',
    createdAt: task.activity.created_at,
    dueAt: task.dueAt
  }];
}

async function listHrProfileItems(actor, orgId) {
  if (actor.type !== 'admin') return [];
  const records = await messageDataModel.getPendingHrProfiles(orgId);
  return records.map((record) => ({
    id: 'hr-profile:' + safeString(record.id),
    type: 'todo',
    sourceType: 'hr_profile_review',
    title: safeString(record.name || '人事资料变更'),
    description: '学号 ' + safeString(record.student_id || '信息已失效') + ' · 待审核补充资料',
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
