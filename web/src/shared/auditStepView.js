// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
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
// 轮次归属来自记录本身；历史结果不能从当前申请状态反推。
function groupAuditRounds(submission, steps, events) {
  const groups = new Map();
  function group(value) {
    const round = Math.max(1, Number(value) || 1);
    if (!groups.has(round)) groups.set(round, { round, steps: [], events: [] });
    return groups.get(round);
  }
  (steps || []).forEach(step => group(step.round).steps.push(step));
  (events || []).forEach(event => group(event.round).events.push(event));
  if (!groups.size) return [];
  const result = Array.from(groups.values()).sort((a, b) => a.round - b.round);
  result.forEach((item, index) => {
    item.current = index === result.length - 1;
    const terminal = item.events.filter(event => ['withdraw', 'reject'].includes(event.eventType)).slice(-1)[0];
    item.status = item.current ? submission.status : terminal ? (terminal.eventType === 'withdraw' ? 'withdrawn' : 'rejected')
      : item.steps.some(step => step.status === 'rejected') ? 'rejected'
        : item.steps.length && item.steps.every(step => step.status === 'approved') ? 'approved' : 'stopped';
    item.expanded = item.current || !['withdrawn', 'rejected', 'stopped'].includes(item.status);
  });
  return result;
}
const sharedModule = Object.freeze({ presentAuditStep, signingStepCurrent, groupAuditRounds });

export { presentAuditStep, signingStepCurrent, groupAuditRounds };
export default sharedModule;
