const { safeString } = require('../../../utils/helpers');
const { matchesAnyRule } = require('../utils/venueApprovalRuleMatcher');
const approvalCopy = require('../../../locales/zh-CN/venueApproval');

const REASONS = Object.freeze({
  NO_FLOW: approvalCopy.noFlow,
  REJECTED: approvalCopy.rejected,
  COMPLETED: approvalCopy.completed,
  INVALID_STEP: approvalCopy.invalidStep,
  ADMIN_REQUIRED: approvalCopy.adminRequired,
  USER_ROLE_REQUIRED: approvalCopy.userRoleRequired,
  NO_RULES: approvalCopy.noRules,
  INVALID_HR: approvalCopy.applicantSnapshotMissing,
  RULE_MISMATCH: approvalCopy.ruleMismatch
});

function parseSnapshots(raw) {
  try {
    const snapshots = raw ? JSON.parse(raw) : [];
    return Array.isArray(snapshots) ? snapshots : [];
  } catch (_) {
    return [];
  }
}

function evaluateVenueApprovalStep({ booking, actor, steps, applicantHrInfo }) {
  if (!booking || !booking.approval_flow_id || Number(booking.approval_total_steps) <= 0) {
    return { ok: false, reason: REASONS.NO_FLOW };
  }

  const currentStep = Number(booking.approval_current_step);
  if (currentStep < 0) return { ok: false, reason: REASONS.REJECTED };
  if (currentStep >= Number(booking.approval_total_steps)) {
    return { ok: false, reason: REASONS.COMPLETED };
  }

  const flowSteps = Array.isArray(steps) ? steps : [];
  if (!flowSteps.length || currentStep >= flowSteps.length || !flowSteps[currentStep]) {
    return { ok: false, reason: REASONS.INVALID_STEP };
  }

  const step = flowSteps[currentStep];
  const approvalMode = safeString(step.approval_mode) || ((step.rules || []).length ? 'hr_rule' : 'admin_any');
  if (approvalMode === 'admin_any') {
    return actor && actor.type === 'admin'
      ? { ok: true, stepIndex: currentStep, stepName: step.name, totalSteps: flowSteps.length, step }
      : { ok: false, reason: REASONS.ADMIN_REQUIRED, step };
  }

  if (!actor || actor.type !== 'user') {
    return { ok: false, reason: REASONS.USER_ROLE_REQUIRED, step };
  }
  const actorAssignment = actor.assignment || actor.profile;
  const actorAssignmentId = safeString(actor.assignmentId);
  if (!actorAssignmentId
    || !actorAssignment
    || safeString(actorAssignment.assignment_id || actorAssignment.assignmentId) !== actorAssignmentId) {
    return { ok: false, reason: REASONS.INVALID_HR, step };
  }
  if (!Array.isArray(step.rules) || !step.rules.length) {
    return { ok: false, reason: REASONS.NO_RULES, step };
  }
  if (!matchesAnyRule(step.rules, actorAssignment, applicantHrInfo || null)) {
    return { ok: false, reason: REASONS.RULE_MISMATCH, step };
  }

  return {
    ok: true,
    stepIndex: currentStep,
    stepName: step.name,
    totalSteps: flowSteps.length,
    step
  };
}

module.exports = { REASONS, parseSnapshots, evaluateVenueApprovalStep };
