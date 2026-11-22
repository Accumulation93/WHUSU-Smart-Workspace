'use strict';

const { normalizeApprovalActionType, AuditApprovalIntegrityError } = require('./auditApprovalIntegrity');
const INVALID_MATERIAL = 'approval_material_invalid';

function remainingSteps(steps, submission, expectedStepId) {
  if (!submission || submission.status !== 'in_progress') return [];
  const currentRound = Math.max(0, ...steps.map(step => Number(step.round || 1)));
  const current = Number(submission.current_step_index);
  const round = steps.filter(step => Number(step.round || 1) === currentRound)
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  if (!Number.isInteger(current) || current < 1 || current > round.length
    || round.some((step, index) => Number(step.sort_order) !== index + 1
      || step.status !== (index + 1 < current ? 'approved' : 'pending'))) return [];
  const result = round.slice(current - 1);
  return !expectedStepId || result[0].id === expectedStepId ? result : [];
}

function materialsByStep(raw, remaining) {
  if (raw === undefined) return new Map();
  if (!Array.isArray(raw) || raw.length > remaining.length) throw new AuditApprovalIntegrityError(INVALID_MATERIAL);
  const ids = new Set(remaining.map(step => step.id));
  const result = new Map();
  for (const item of raw) {
    if (!item || !ids.has(item.stepId) || result.has(item.stepId) || !Array.isArray(item.signatures)) {
      throw new AuditApprovalIntegrityError(INVALID_MATERIAL);
    }
    result.set(item.stepId, item.signatures);
  }
  return result;
}

function describe(steps) {
  try {
    return steps.map(step => ({ stepId: step.id, index: Number(step.sort_order),
      name: step.step_name || '', actionType: normalizeApprovalActionType(step.action_type) }));
  } catch (error) {
    if (!(error instanceof AuditApprovalIntegrityError)) throw error;
    return [];
  }
}

module.exports = { remainingSteps, materialsByStep, describe };
