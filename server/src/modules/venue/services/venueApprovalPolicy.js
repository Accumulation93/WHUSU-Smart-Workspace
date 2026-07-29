const { safeString } = require('../../../utils/helpers');
const { matchesAnyRule } = require('../utils/venueApprovalRuleMatcher');

const REASONS = Object.freeze({
  NO_FLOW: '该借用没有配置审批流程',
  REJECTED: '该借用已被驳回',
  COMPLETED: '该借用已完成所有审批步骤',
  INVALID_STEP: '审批步骤配置异常',
  ADMIN_REQUIRED: '该步骤仅允许当前组织管理员审批',
  USER_ROLE_REQUIRED: '当前步骤需切换到普通用户身份审批',
  NO_RULES: '当前人事审批步骤没有配置审批条件',
  INVALID_HR: '绑定的人事信息不存在',
  RULE_MISMATCH: '您不符合当前审批步骤的审批条件',
  ALREADY_APPROVED: '您已审批过该借用的前置步骤，为保障职责分离，请由其他审批人处理当前步骤'
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
  const actorPersonId = safeString(actor && actor.personId);
  const actorLegacyId = safeString(actor && actor.id);
  const alreadyApproved = parseSnapshots(booking.approval_snapshots_json)
    .some((snapshot) => {
      const snapshotPersonId = safeString(snapshot.approverPersonId);
      if (actorPersonId && snapshotPersonId) return snapshotPersonId === actorPersonId;
      return actorLegacyId && safeString(snapshot.approverHrId) === actorLegacyId;
    });
  if (alreadyApproved) {
    return { ok: false, reason: REASONS.ALREADY_APPROVED, step };
  }

  const approvalMode = safeString(step.approval_mode) || ((step.rules || []).length ? 'hr_rule' : 'admin_any');
  if (approvalMode === 'admin_any') {
    return actor && actor.type === 'admin'
      ? { ok: true, stepIndex: currentStep, stepName: step.name, totalSteps: flowSteps.length, step }
      : { ok: false, reason: REASONS.ADMIN_REQUIRED, step };
  }

  if (!actor || actor.type !== 'user') {
    return { ok: false, reason: REASONS.USER_ROLE_REQUIRED, step };
  }
  if (!actor.profile || safeString(actor.profile.id) !== safeString(actor.id)) {
    return { ok: false, reason: REASONS.INVALID_HR, step };
  }
  if (!Array.isArray(step.rules) || !step.rules.length) {
    return { ok: false, reason: REASONS.NO_RULES, step };
  }
  if (!matchesAnyRule(step.rules, actor.profile, applicantHrInfo || null)) {
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
