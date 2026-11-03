import ui from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import booking from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import controls from '@/locales/zh-CN/shared/controlLayout.js';
import flow from '@/locales/zh-CN/shared/venueFlowManagement.js';
import factsCopy from '@/locales/zh-CN/shared/venueFacts.js';

export const clone = value => JSON.parse(JSON.stringify(value));
export const weekNames = [ui.copy_92af9d9017, ui.copy_e3233a4b58, ui.copy_2f48862253, ui.copy_017e3df1a1, ui.copy_41a9548e60, ui.copy_f2c74088c9, ui.copy_a814b25100];
export const cycleTypes = [
  { value: 'daily', label: ui.copy_13293d504a }, { value: 'weekly', label: ui.copy_1a6678cddf },
  { value: 'monthly', label: ui.copy_06a9527bac }, { value: 'yearly', label: ui.copy_9084e6bc76 }, { value: 'range', label: ui.copy_652116de6d }
];
export function parseValues(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : clone(value || []);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed) && parsed.values !== undefined && !Array.isArray(parsed.values)) throw new Error();
  return parsed;
}
export function activityValues(type, value) {
  const parsed = parseValues(value);
  const empty = { values: [], periodMode: 'none', periodStartDate: '', periodStartTime: '00:00', periodEndDate: '', periodEndTime: '23:59', repeatCount: 0 };
  if (type === 'datetime_range') return { ...empty, periodMode: 'range', periodStartDate: parsed.startDate || '', periodStartTime: parsed.startTime || '00:00', periodEndDate: parsed.endDate || '', periodEndTime: parsed.endTime || '23:59' };
  if (type === 'repeat') return { ...empty, periodMode: 'count', periodStartDate: parsed.startDate || '', periodStartTime: parsed.startTime || '00:00', repeatCount: Number(parsed.repeatCount) || 0 };
  if (Array.isArray(parsed)) return { ...empty, values: parsed };
  if (Array.isArray(parsed.values)) return { ...empty, ...parsed, periodMode: ['none', 'range', 'count'].includes(parsed.periodMode) ? parsed.periodMode : parsed.repeatCount > 0 && !parsed.periodEndDate ? 'count' : parsed.periodStartDate || parsed.periodEndDate ? 'range' : 'none' };
  return { ...empty, periodMode: parsed.startDate || parsed.endDate ? 'range' : 'none', periodStartDate: parsed.startDate || '', periodEndDate: parsed.endDate || '' };
}
export function cycleLabel(type, value) {
  const parsed = parseValues(value), values = Array.isArray(parsed) ? parsed : parsed.values || [];
  if (type === 'datetime_range') return flow.continuousOccupancy;
  if (type === 'repeat') return flow.intervalOccupancy;
  if (type === 'daily') return ui.copy_13293d504a;
  if (type === 'range') return parsed.startDate && parsed.endDate ? factsCopy.timeRange(parsed.startDate, parsed.endDate) : ui.copy_9d73203530;
  if (type === 'weekly') return values.map(day => weekNames[Number(day) - 1]).filter(Boolean).join(controls.listSeparator) || ui.copy_2b4df49497;
  if (type === 'monthly') return values.length && values.every(day => Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= 31)
    ? ui.monthlyDays(values.map(Number).join(controls.listSeparator)) : factsCopy.timeRangeMissing;
  if (type === 'yearly') return values.map(item => {
    if (!item || !item.m || !(item.dStart ?? item.d)) return factsCopy.timeRangeMissing;
    return item.dEnd === undefined ? ui.yearlyDate(item.m, item.dStart ?? item.d)
      : item.dEnd ? ui.monthlyDateRange(item.m, item.dStart ?? item.d, item.dEnd) : factsCopy.timeRangeMissing;
  }).join(controls.listSeparator);
  return '';
}
export function activityPeriodLabel(type, value) {
  const meta = activityValues(type, value);
  if (meta.periodMode === 'none') return ui.copy_dae9f72578;
  const start = meta.periodStartDate ? meta.periodStartDate + ' ' + meta.periodStartTime : ui.copy_f54e24d97d;
  if (meta.periodMode === 'count') return [ui.repeatFrom(start), booking.repeatedOccurrences(meta.repeatCount)].join('\n');
  return factsCopy.recurrenceValidity(start, meta.periodEndDate ? meta.periodEndDate + ' ' + meta.periodEndTime : ui.copy_b8c87b0fb5);
}
export function bookingWindowForm(row) {
  const result = { open: { mode: 'none', days: 7, hours: 0, minutes: 0 }, deadline: { mode: 'none', days: 0, hours: 0, minutes: 0 } };
  for (const side of ['open', 'deadline']) {
    const mode = row?.[side + 'AdvanceMode'];
    if (!mode) continue;
    result[side].mode = mode;
    if (mode === 'days') result[side].days = Number(row[side + 'AdvanceDays']) || 0;
    else { const minutes = Number(row[side + 'AdvanceMinutes']) || 0; result[side].hours = Math.floor(minutes / 60); result[side].minutes = minutes % 60; }
  }
  return result;
}
export function advanceMinutes(value) { return value.mode === 'none' ? null : value.mode === 'days' ? Number(value.days) * 1440 : Number(value.hours) * 60 + Number(value.minutes); }
