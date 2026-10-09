import text from '@/locales/zh-CN/shared/generated/subpackages/venue/utils/venueBookingDetail.js';
import detailText from '@/locales/zh-CN/shared/generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js';
import { formatListTime } from './dateTime.js';

export function venueStatus(booking) {
  if (booking.status !== 'approved') return booking.status || 'pending';
  const start = Date.parse(booking.fullTimeStart || booking.timeStart);
  const end = Date.parse(booking.fullTimeEnd || booking.timeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'approved';
  return Date.now() < start ? 'approved' : Date.now() >= end ? 'completed' : 'inUse';
}
export function venueStatusLabel(booking) {
  return ({ pending: text.copy_8f73640107, approved: text.copy_ce171a2581, inUse: text.copy_ad310c8780,
    completed: text.copy_2220286f1c, rejected: text.copy_5d5af942c5, cancelled: text.copy_fd4601c1f9 })[venueStatus(booking)] || text.copy_4cfdf3f638;
}
export function venueProgress(raw) {
  if (!raw || !Number(raw.totalSteps)) return null;
  const totalSteps = Math.max(0, Number(raw.totalSteps));
  const flowId = String(raw.flowId || raw.currentFlowId || '');
  const snapshots = Array.isArray(raw.snapshots) ? raw.snapshots : [];
  const completed = snapshots.filter(item => item && (item.stepIndex ?? item.step_index) != null
    && (!flowId || String(item.flowId || item.flow_id || '') === flowId))
    .map(item => Number(item.stepIndex ?? item.step_index)).filter(index => Number.isFinite(index) && index >= 0);
  const isRejected = Boolean(raw.isRejected) || Number(raw.currentStep) < 0;
  const currentStep = isRejected ? -1 : Math.min(totalSteps, Math.max(0, Number(raw.currentStep) || 0, ...completed.map(index => index + 1)));
  const isApproved = !isRejected && (Boolean(raw.isApproved) || currentStep >= totalSteps);
  return { ...raw, flowId, snapshots, totalSteps, currentStep, isRejected, isApproved,
    percent: isRejected ? 0 : isApproved ? 100 : Math.round(currentStep / totalSteps * 100),
    text: isRejected ? text.copy_fb1a45d8be : isApproved ? text.copy_7602388726 : text.copy_29ec8299c4 + currentStep + '/' + totalSteps + text.copy_3cd1b8dd73 };
}
export function venueTimeRange(booking) {
  const start = formatListTime(booking.fullTimeStart || booking.timeStart, booking.fullTimeStart ? booking.fullTimeStartReviewStatus : booking.timeStartReviewStatus);
  const end = formatListTime(booking.fullTimeEnd || booking.timeEnd, booking.fullTimeEnd ? booking.fullTimeEndReviewStatus : booking.timeEndReviewStatus);
  return [start, end].filter(Boolean).join(' ' + detailText.copy_e8d9493a44 + ' ');
}
