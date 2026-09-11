'use strict';

// 日内时刻不做时区换算；滑块与原生选择框共用同一份分钟事实。
function minutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
  const parts = value.split(':').map(Number);
  if (parts[0] > 24 || parts[1] > 59 || (parts[0] === 24 && parts[1])) return null;
  return parts[0] * 60 + parts[1];
}
function time(value) {
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}
function freeRanges(day) {
  const open = (day && day.openSlots || []).map(s => [minutes(s.timeStart), minutes(s.timeEnd)])
    .filter(s => s[0] !== null && s[1] > s[0]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  open.forEach(s => {
    const last = merged[merged.length - 1];
    if (last && last[1] >= s[0]) last[1] = Math.max(last[1], s[1]);
    else merged.push(s.slice());
  });
  let free = merged;
  (day && (day.bookedSlots || []).concat(day.activitySlots || []) || []).forEach(slot => {
    const start = minutes(slot.timeStart), end = minutes(slot.timeEnd);
    if (start === null || end === null || end <= start) return;
    const next = [];
    free.forEach(s => {
      if (end <= s[0] || start >= s[1]) next.push(s);
      else {
        if (start > s[0]) next.push([s[0], start]);
        if (end < s[1]) next.push([end, s[1]]);
      }
    });
    free = next;
  });
  return free;
}
function choose(day, startText, endText, changingStart) {
  const start = minutes(startText);
  let end = minutes(endText);
  const span = freeRanges(day).find(s => start !== null && start >= s[0] && start < Math.min(s[1], 1439));
  if (!span) return null;
  const limit = Math.min(span[1], 1439);
  if (changingStart && (end === null || end <= start || end > limit)) end = Math.min(start + 60, limit);
  if (end === null || end <= start || end > limit) return null;
  return { start: time(start), end: time(end) };
}
function patch(day, startText, endText) {
  const start = minutes(startText), end = minutes(endText);
  const hours = new Set();
  (day && day.openSlots || []).forEach(s => {
    const a = minutes(s.timeStart), b = minutes(s.timeEnd);
    if (a === null || b === null) return;
    for (let h = Math.floor(a / 60); h <= Math.min(23, Math.floor(b / 60)); h++) hours.add(h);
  });
  const options = Array.from(hours).sort((a, b) => a - b).map(value => ({ value, label: String(value).padStart(2, '0') }));
  const position = value => ((value || 0) / 1440 * 100).toFixed(2);
  return {
    adminBookingTimeStart: startText || '', adminBookingTimeEnd: endText || '',
    adminStartHours: options, adminEndHours: options,
    adminStartHourIdx: Math.max(0, options.findIndex(h => h.value === Math.floor(start / 60))),
    adminStartMinIdx: start === null ? 0 : start % 60,
    adminEndHourIdx: Math.max(0, options.findIndex(h => h.value === Math.floor(end / 60))),
    adminEndMinIdx: end === null ? 0 : end % 60,
    adminStartHandlePercent: position(start), adminEndHandlePercent: position(end === null ? Math.min((start || 0) + 60, 1439) : end),
    adminTimelineSelection: start !== null && end !== null && end > start
      ? { left: position(start), end: position(end), width: position(end - start) } : null
  };
}
function dragMinute(initial, delta, width) {
  if (!Number.isFinite(initial) || !Number.isFinite(delta) || !(width > 0)) return null;
  return Math.max(0, Math.min(1439, Math.round((initial + delta / width * 1440) / 10) * 10));
}
module.exports = { minutes, time, freeRanges, choose, patch, dragMinute };
