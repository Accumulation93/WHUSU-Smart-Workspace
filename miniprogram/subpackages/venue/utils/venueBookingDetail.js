const localeCopy = require('../../../locales/zh-CN/generated/subpackages/venue/utils/venueBookingDetail');
const { buildFlowTimeline } = require('./flowTimeline');

const STATUS_LABELS = {
  pending: localeCopy.copy_8f73640107,
  approved: localeCopy.copy_ce171a2581,
  inUse: localeCopy.copy_ad310c8780,
  completed: localeCopy.copy_2220286f1c,
  rejected: localeCopy.copy_5d5af942c5,
  cancelled: localeCopy.copy_fd4601c1f9
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
  detail._statusLabel = STATUS_LABELS[detail.displayStatus] || detail.displayStatus || localeCopy.copy_4cfdf3f638;

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
    ? localeCopy.copy_fb1a45d8be
    : (approved ? localeCopy.copy_7602388726 : localeCopy.copy_29ec8299c4 + currentStep + '/' + totalSteps + localeCopy.copy_3cd1b8dd73);
  detail._flowTimeline = buildFlowTimeline(progress);
  return detail;
}

module.exports = { computeDisplayStatus, prepareVenueBookingDetail };
