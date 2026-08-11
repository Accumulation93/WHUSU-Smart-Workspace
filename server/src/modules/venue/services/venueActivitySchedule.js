const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function parseCycleValues(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value) || {}; } catch (_) { return {}; }
}

function parseLocalDateTime(dateText, timeText) {
  if (!DATE_PATTERN.test(String(dateText || '')) || !TIME_PATTERN.test(String(timeText || ''))) return null;
  const [year, month, day] = String(dateText).split('-').map(Number);
  const [hour, minute] = String(timeText).split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function formatDate(value) {
  return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
}

function formatTime(value) {
  return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0');
}

function formatDateTime(value) {
  return formatDate(value) + ' ' + formatTime(value);
}

function dateMatchesLegacyCycle(dateText, cycleType, values) {
  if (cycleType === 'daily') return true;
  if (cycleType === 'range') return Boolean(values.startDate && values.endDate && dateText >= values.startDate && dateText <= values.endDate);
  const date = new Date(dateText + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return false;
  if (cycleType === 'weekly') return Array.isArray(values) && values.includes(date.getDay() === 0 ? 7 : date.getDay());
  if (cycleType === 'monthly') return Array.isArray(values) && values.includes(date.getDate());
  if (cycleType === 'yearly') {
    return Array.isArray(values) && values.some((item) => {
      if (!item || Number(item.m) !== date.getMonth() + 1) return false;
      const start = Number(item.dStart !== undefined ? item.dStart : item.d);
      const end = Number(item.dEnd !== undefined ? item.dEnd : item.d);
      return date.getDate() >= start && date.getDate() <= end;
    });
  }
  return false;
}

function legacyTimeRange(rule) {
  const timeStart = String(rule.time_start || '09:00:00').substring(0, 5);
  const timeEnd = String(rule.time_end || '18:00:00').substring(0, 5);
  if (!TIME_PATTERN.test(timeStart) || !TIME_PATTERN.test(timeEnd) || timeStart >= timeEnd) return null;
  return { timeStart, timeEnd };
}

function ruleValidationError(rule) {
  const cycleType = String(rule.cycleType || rule.cycle_type || 'weekly');
  const values = parseCycleValues(rule.cycleValues !== undefined ? rule.cycleValues : rule.cycle_values);
  if (cycleType === 'datetime_range' || cycleType === 'repeat') {
    const startAt = parseLocalDateTime(values.startDate, values.startTime);
    const endAt = parseLocalDateTime(values.endDate, values.endTime);
    if (!startAt || !endAt) return '请填写完整的活动开始和结束日期时间';
    if (endAt <= startAt) return '活动结束时间必须晚于开始时间';
    if (cycleType === 'repeat') {
      const intervalUnit = values.intervalUnit === 'week' ? 'week' : 'day';
      const intervalValue = Number(values.intervalValue);
      const repeatCount = Number(values.repeatCount);
      if (!['day', 'week'].includes(intervalUnit) || !Number.isInteger(intervalValue) || intervalValue < 1 || intervalValue > 365) {
        return '重复间隔必须是1至365天或周';
      }
      if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 1000) return '重复次数必须是1至1000次';
    }
    return null;
  }
  if (!legacyTimeRange({ time_start: rule.timeStart || rule.time_start, time_end: rule.timeEnd || rule.time_end })) return '活动开始时间必须早于结束时间';
  if (cycleType === 'range' && (!values.startDate || !values.endDate || values.startDate > values.endDate)) return '请填写有效的活动日期范围';
  return null;
}

function buildDetail(rule, occurrenceStart, occurrenceEnd) {
  const values = parseCycleValues(rule.cycle_values);
  return {
    id: rule.id,
    venueId: rule.venue_id,
    name: rule.activity_name || '活动',
    cycleType: rule.cycle_type || 'weekly',
    cycleValues: values,
    occurrenceStart: formatDateTime(occurrenceStart),
    occurrenceEnd: formatDateTime(occurrenceEnd)
  };
}

function getActivitySlots(dateText, activityRules) {
  const dayStart = parseLocalDateTime(dateText, '00:00');
  if (!dayStart) return [];
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
  const slots = [];
  for (const rule of activityRules || []) {
    if (!rule.is_active) continue;
    const cycleType = rule.cycle_type || 'weekly';
    const values = parseCycleValues(rule.cycle_values);
    const ranges = [];
    if (cycleType === 'datetime_range') {
      const start = parseLocalDateTime(values.startDate, values.startTime);
      const end = parseLocalDateTime(values.endDate, values.endTime);
      if (start && end) ranges.push({ start, end });
    } else if (cycleType === 'repeat') {
      const firstStart = parseLocalDateTime(values.startDate, values.startTime);
      const firstEnd = parseLocalDateTime(values.endDate, values.endTime);
      const intervalValue = Number(values.intervalValue) || 1;
      const intervalDays = values.intervalUnit === 'week' ? intervalValue * 7 : intervalValue;
      const repeatCount = Math.min(1000, Math.max(0, Number(values.repeatCount) || 0));
      if (firstStart && firstEnd && firstEnd > firstStart) {
        const duration = firstEnd.getTime() - firstStart.getTime();
        for (let index = 0; index < repeatCount; index += 1) {
          const start = new Date(firstStart.getTime() + index * intervalDays * 86400000);
          const end = new Date(start.getTime() + duration);
          if (end > dayStart && start < dayEnd) ranges.push({ start, end, occurrenceIndex: index + 1 });
          if (start >= dayEnd) break;
        }
      }
    } else if (dateMatchesLegacyCycle(dateText, cycleType, values)) {
      const timeRange = legacyTimeRange(rule);
      if (timeRange) {
        const start = parseLocalDateTime(dateText, timeRange.timeStart);
        const end = parseLocalDateTime(dateText, timeRange.timeEnd);
        if (start && end) ranges.push({ start, end });
      }
    }
    for (const range of ranges) {
      const start = range.start > dayStart ? range.start : dayStart;
      const end = range.end < dayEnd ? range.end : dayEnd;
      if (end <= start) continue;
      slots.push({
        ruleId: rule.id,
        ruleName: rule.activity_name || '活动',
        timeStart: formatTime(start),
        timeEnd: end.getTime() === dayEnd.getTime() ? '24:00' : formatTime(end),
        fullTimeStart: formatDateTime(range.start),
        fullTimeEnd: formatDateTime(range.end),
        occurrenceIndex: range.occurrenceIndex || 0,
        activity: buildDetail(rule, range.start, range.end)
      });
    }
  }
  return slots;
}

module.exports = { getActivitySlots, ruleValidationError, parseCycleValues };
