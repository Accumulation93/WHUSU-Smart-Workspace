'use strict';

// 日程按系列的固定系统时区展开；不读取运行机器的本地时区。
const DAY = 86400000;
class CalendarError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function invalid() { throw new CalendarError('invalidSchedule'); }
function dateParts(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  if (year < 1900 || year > 2200 || new Date(time).toISOString().slice(0, 10) !== value) invalid();
  return { year, month, day, time };
}
function dateText(time) { return new Date(time).toISOString().slice(0, 10); }
function integer(value, min, max) { if (!Number.isInteger(value) || value < min || value > max) invalid(); return value; }
function normalizeRule(value) {
  if (value == null || value.frequency === 'none') return { frequency: 'none' };
  if (!value || !['daily','weekly','monthly','yearly'].includes(value.frequency)) invalid();
  const frequency = value.frequency;
  const interval = integer(value.interval === undefined ? 1 : value.interval, 1, 99);
  const count = value.count == null ? null : integer(value.count, 1, 1000);
  const until = value.until || '';
  if (until) dateParts(until);
  if (count !== null && until) invalid();
  const weekdays = frequency === 'weekly' && Array.isArray(value.weekdays)
    ? Array.from(new Set(value.weekdays.map(day => integer(day, 1, 7)))).sort() : [];
  if (value.weekdays !== undefined && (!Array.isArray(value.weekdays) || (frequency !== 'weekly' && value.weekdays.length))) invalid();
  return { frequency, interval, count, until, weekdays };
}
function normalizeTimes(input, offset) {
  integer(offset, -720, 840);
  const start = dateParts(input.startDate), end = dateParts(input.endDate);
  const allDay = input.allDay === true;
  function minutes(value) {
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid();
    const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute;
  }
  const startMinute = allDay ? 0 : minutes(input.startTime);
  const endMinute = allDay ? 0 : minutes(input.endTime);
  const startAt = start.time + startMinute * 60000 - offset * 60000;
  const endAt = end.time + endMinute * 60000 - offset * 60000;
  if (endAt <= startAt || endAt - startAt > 366 * DAY) invalid();
  const rule = normalizeRule(input.recurrence);
  if (rule.until && rule.until < input.startDate) invalid();
  return { startDate:input.startDate, endDate:input.endDate, startMinute, endMinute, allDay,
    startAt, endAt, timezoneOffset:offset, recurrence:rule };
}
function normalizeWindow(from, to) {
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * DAY) invalid();
  return {start, end};
}
function periodDates(anchor, rule, period) {
  const increment = period * rule.interval;
  if (rule.frequency === 'daily') return [anchor.time + increment * DAY];
  if (rule.frequency === 'weekly') {
    const weekday = new Date(anchor.time).getUTCDay() || 7;
    const monday = anchor.time - (weekday - 1) * DAY + increment * 7 * DAY;
    return (rule.weekdays.length ? rule.weekdays : [weekday]).map(day => monday + (day - 1) * DAY);
  }
  const month = rule.frequency === 'monthly' ? anchor.month - 1 + increment : anchor.month - 1;
  const year = rule.frequency === 'yearly' ? anchor.year + increment : anchor.year;
  const first = new Date(Date.UTC(year, month, 1));
  const candidate = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), anchor.day);
  // 月末不存在的日期和非闰年的2月29日跳过，不挪到下月。
  return new Date(candidate).getUTCMonth() === first.getUTCMonth() ? [candidate] : [];
}
function expand(times, from, to) {
  const window = normalizeWindow(from, to);
  const anchor = dateParts(times.startDate);
  const rule = normalizeRule(times.recurrence);
  const duration = times.endAt - times.startAt;
  const output = [];
  function append(date) {
    const start = date + times.startMinute * 60000 - times.timezoneOffset * 60000;
    if (start < window.end && start + duration > window.start) output.push({
      occurrenceDate:dateText(date), startAt:new Date(start).toISOString(), endAt:new Date(start + duration).toISOString(), allDay:times.allDay
    });
  }
  if (rule.frequency === 'none') { append(anchor.time); return output; }
  const floorDate = window.start - duration + times.timezoneOffset * 60000;
  let period = 0;
  if (rule.count === null && floorDate > anchor.time) {
    const floor = new Date(floorDate);
    const distance = rule.frequency === 'daily' ? (floorDate - anchor.time) / DAY
      : rule.frequency === 'weekly' ? (floorDate - anchor.time) / (7 * DAY)
        : rule.frequency === 'monthly' ? (floor.getUTCFullYear() - anchor.year) * 12 + floor.getUTCMonth() - anchor.month + 1
          : floor.getUTCFullYear() - anchor.year;
    period = Math.max(0, Math.floor(distance / rule.interval) - 1);
  }
  let emitted = 0;
  for (let steps = 0; steps < 5000; steps++, period++) {
    const dates = periodDates(anchor, rule, period);
    const periodStart = rule.frequency === 'monthly' ? Date.UTC(anchor.year, anchor.month - 1 + period * rule.interval, 1)
      : rule.frequency === 'yearly' ? Date.UTC(anchor.year + period * rule.interval, 0, 1)
        : anchor.time + period * rule.interval * DAY * (rule.frequency === 'weekly' ? 7 : 1) - (rule.frequency === 'weekly' ? 6 * DAY : 0);
    if (periodStart - times.timezoneOffset * 60000 >= window.end) return output;
    for (const date of dates) {
      if (date < anchor.time) continue;
      if (rule.until && dateText(date) > rule.until) return output;
      emitted++;
      if (rule.count !== null && emitted > rule.count) return output;
      append(date);
      if (output.length > 2000) throw new CalendarError('rangeTooLarge');
    }
  }
  throw new CalendarError('rangeTooLarge');
}
module.exports = { CalendarError, normalizeRule, normalizeTimes, normalizeWindow, expand, dateParts, dateText };
