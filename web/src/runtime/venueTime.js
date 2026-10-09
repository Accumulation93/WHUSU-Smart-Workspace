import native from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import { getSystemTimezoneConfig } from './dateTime.js';

export function toMinute(value) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(String(value))) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
export function toTime(value) { return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); }
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
