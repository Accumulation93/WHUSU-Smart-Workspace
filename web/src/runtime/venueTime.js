import native from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import { getSystemTimezoneConfig } from './dateTime.js';

export function toMinute(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(String(value))) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
export function toTime(value) { return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); }
export function addDays(date, days) { return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
export function weekStart(date) { return addDays(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7)); }
export function scheduleInstant(value) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(value))) return value;
  return new Date(Date.parse(value.replace(' ', 'T') + ':00Z') - getSystemTimezoneConfig().offset * 3600000).toISOString();
}
export function bookingWindowLabels(window) {
  function label(side) {
    const fallback = side === 'open' ? native.copy_584ba3052b : native.copy_9e824e777e;
    const prefix = side === 'open' ? native.copy_44ce05c859 : native.copy_db4932f471;
    const mode = window?.[side + 'AdvanceMode'];
    if (!mode) return fallback;
    if (mode === 'days') return prefix + Number(window[side + 'AdvanceDays'] || 0) + native.copy_d08fb8244e;
    const minutes = window[side + 'AdvanceMinutes'];
    if (minutes == null) return fallback;
    const total = Math.max(0, Number(minutes) || 0), hours = Math.floor(total / 60), remain = total % 60;
    return prefix + (!hours ? remain + native.copy_82b3c19342 : !remain ? hours + native.copy_57f8fbd947 : hours + native.copy_7bbe7387fa + remain + native.copy_82b3c19342);
  }
  return [label('open'), label('deadline')];
}
function advance(window, prefix) {
  const mode = window?.[prefix + 'AdvanceMode'];
  if (!mode) return null;
  return mode === 'days' ? Number(window[prefix + 'AdvanceDays'] || 0) * 1440 : Number(window[prefix + 'AdvanceMinutes'] || 0);
}
export function startAllowed(day, date, minute, window, now = Date.now()) {
  const timestamp = Date.parse(date + 'T00:00:00Z') + minute * 60000 - getSystemTimezoneConfig().offset * 3600000;
  const open = advance(window, 'open');
  const deadline = advance(window, 'deadline');
  return Number.isFinite(timestamp) && minute >= 0 && minute < 1440 && timestamp > now
    && (open === null || timestamp <= now + open * 60000)
    && (deadline === null || timestamp > now + deadline * 60000)
    && (day?.openSlots || []).some(slot => toMinute(slot.timeStart) <= minute && minute < toMinute(slot.timeEnd))
    && ![...(day?.bookedSlots || []), ...(day?.activitySlots || [])].some(slot => toMinute(slot.timeStart) <= minute && minute < toMinute(slot.timeEnd));
}
export function rangeError(day, date, start, end, window) {
  const from = toMinute(start); const to = toMinute(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return native.copy_9dc5c7d79f;
  if (to <= from) return native.copy_0b091cba77;
  if (!startAllowed(day, date, from, window)) return native.copy_6491116806;
  let cursor = from;
  const slots = [...(day?.openSlots || [])].sort((a, b) => toMinute(a.timeStart) - toMinute(b.timeStart));
  for (const slot of slots) {
    if (toMinute(slot.timeStart) > cursor) break;
    cursor = Math.max(cursor, toMinute(slot.timeEnd));
    if (cursor >= to) break;
  }
  if (cursor < to) return toTime(cursor) + native.copy_70d4911767;
  const blocked = [...(day?.bookedSlots || []), ...(day?.activitySlots || [])]
    .find(slot => toMinute(slot.timeStart) < to && toMinute(slot.timeEnd) > from);
  return blocked ? blocked.timeStart + native.copy_abf766aebc : '';
}
