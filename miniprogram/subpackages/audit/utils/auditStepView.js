'use strict';
// 展示只能解释原始事实，不能按序号猜测已完成，不能用候选人替代实际经办人。
function presentAuditStep(submission, step, events, latestRound) {
  const round = Number(step.round || 1);
  const terminal = ['withdrawn', 'rejected', 'approved'].includes(submission.status);
  let state = 'future';
  if (step.status === 'approved') state = 'approved';
  else if (step.status === 'rejected') state = 'rejected';
  else if (step.status === 'superseded' || terminal) state = 'stopped';
  else if (submission.status === 'in_progress' && round === Number(latestRound || round)
    && step.status === 'pending' && Number(step.sortOrder) === Number(submission.currentStepIndex)) state = 'active';
  const eventType = state === 'approved' ? 'approve' : state === 'rejected' ? 'reject' : '';
  const event = eventType && (events || []).find(item => item.eventType === eventType
    && Number(item.round || 1) === round
    && (item.stepId ? item.stepId === step.id : Number(item.stepIndex) === Number(step.sortOrder)));
  const snapshot = event && event.operatorContextSnapshot || step.processedContextSnapshot;
  let context = snapshot;
  if (typeof context === 'string') { try { context = JSON.parse(context); } catch (_) { context = null; } }
  const name = event && event.operatorName || context && context.name || '';
  return { state, actorName: name, hasActor: Boolean(name), snapshot: context || null };
}
function signingStepCurrent(detail, target) {
  if (!detail || !target || detail.canApproveCurrentStep !== true || !detail.submission || detail.submission.status !== 'in_progress') return false;
  const steps = Array.isArray(detail.steps) ? detail.steps : [];
  const round = Math.max(1, ...steps.map(step => Number(step.round || 1)));
  const step = steps.find(item => item.id === target.stepId);
  const file = (detail.files || []).find(item => item.id === target.file.id);
  return !!step && step.status === 'pending' && Number(step.round || 1) === round
    && Number(step.round || 1) === Number(target.round || 1)
    && Number(step.sortOrder) === Number(detail.submission.currentStepIndex)
    && !!file && file.fileHash === target.file.fileHash;
}
module.exports = { presentAuditStep, signingStepCurrent };
