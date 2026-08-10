const { buildFlowTimeline } = require('./flowTimeline');

const STATUS_LABELS = {
  pending: '待审核',
  approved: '已通过',
  inUse: '使用中',
  completed: '已完成',
  rejected: '已驳回',
  cancelled: '已取消'
};

function computeDisplayStatus(item) {
  if (!item) return '';
  if (item.status === 'pending' || item.status === 'rejected' || item.status === 'cancelled') return item.status;
  if (item.status === 'approved') {
    const now = new Date();
    const timeStart = new Date(String(item.timeStart || '').replace(' ', 'T'));
    const timeEnd = new Date(String(item.timeEnd || '').replace(' ', 'T'));
    if (now < timeStart) return 'approved';
    if (now >= timeEnd) return 'completed';
    return 'inUse';
  }
  return item.status || '';
}

function getSnapshotCompletedSteps(progress) {
  const snapshots = Array.isArray(progress && progress.snapshots) ? progress.snapshots : [];
  const stepIndexes = snapshots
    .filter(item => item && item.stepIndex !== undefined && item.stepIndex !== null)
    .map(item => Number(item.stepIndex))
    .filter(index => Number.isFinite(index) && index >= 0);
  return stepIndexes.length ? Math.max.apply(null, stepIndexes) + 1 : 0;
}

function prepareVenueBookingDetail(item) {
  const detail = Object.assign({}, item || {});
  detail.displayStatus = detail.displayStatus || computeDisplayStatus(detail);
  detail._statusLabel = STATUS_LABELS[detail.displayStatus] || detail.displayStatus || '状态未知';

  const rawProgress = detail.approvalProgress;
  if (!rawProgress || !Number(rawProgress.totalSteps)) {
    detail._approvalPercent = 0;
    detail._approvalProgressText = '';
    detail._flowTimeline = null;
    return detail;
  }

  const totalSteps = Math.max(0, Number(rawProgress.totalSteps) || 0);
  const rejected = Boolean(rawProgress.isRejected) || Number(rawProgress.currentStep) < 0;
  const snapshotCompletedSteps = getSnapshotCompletedSteps(rawProgress);
  const storedCurrentStep = Number(rawProgress.currentStep);
  const currentStep = rejected
    ? -1
    : Math.min(totalSteps, Math.max(0, Number.isFinite(storedCurrentStep) ? storedCurrentStep : 0, snapshotCompletedSteps));
  const approved = !rejected && (Boolean(rawProgress.isApproved) || currentStep >= totalSteps);
  const progress = Object.assign({}, rawProgress, {
    currentStep,
    totalSteps,
    isRejected: rejected,
    isApproved: approved,
    snapshots: Array.isArray(rawProgress.snapshots) ? rawProgress.snapshots : [],
    flowSteps: Array.isArray(rawProgress.flowSteps) ? rawProgress.flowSteps : []
  });

  detail.approvalProgress = progress;
  detail._approvalPercent = rejected ? 0 : (approved ? 100 : Math.round(currentStep / totalSteps * 100));
  detail._approvalBarColor = rejected ? 'background:linear-gradient(90deg,#ef4444 0%,#f87171 100%);' : '';
  detail._approvalProgressText = rejected
    ? '审批已驳回'
    : (approved ? '审批流程已完成' : '已完成 ' + currentStep + '/' + totalSteps + ' 步');
  detail._flowTimeline = buildFlowTimeline(progress);
  return detail;
}

module.exports = { computeDisplayStatus, prepareVenueBookingDetail };
