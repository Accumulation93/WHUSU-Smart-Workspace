'use strict';

function normalizeStep(step) {
  const item = step || {};
  return {
    sortOrder: Number(item.sortOrder || item.sort_order) || 0,
    round: Number(item.round) || 1,
    status: String(item.status || '')
  };
}

function calculateWorkflowProgress(rawSteps) {
  const effectiveByOrder = {};
  const orders = {};
  (Array.isArray(rawSteps) ? rawSteps : []).forEach(function(rawStep) {
    const step = normalizeStep(rawStep);
    if (!step.sortOrder) return;
    orders[step.sortOrder] = true;
    const current = effectiveByOrder[step.sortOrder];
    if (!current || step.round > current.round) effectiveByOrder[step.sortOrder] = step;
  });

  const effectiveSteps = Object.keys(effectiveByOrder).map(function(key) {
    return effectiveByOrder[key];
  }).sort(function(left, right) { return left.sortOrder - right.sortOrder; });
  const approvedCount = effectiveSteps.filter(function(step) {
    return step.status === 'approved';
  }).length;
  const rejectedStep = effectiveSteps.find(function(step) {
    return step.status === 'rejected';
  }) || null;

  return {
    stepsPerRound: Object.keys(orders).length || 1,
    approvedCount,
    rejectedStep,
    effectiveSteps
  };
}

module.exports = { calculateWorkflowProgress };
