const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function parseCycleValues(value) {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value) || {}; } catch (_) { return {}; }
}

function cycleMeta(value) {
  const parsed = parseCycleValues(value);
  if (Array.isArray(parsed)) return { values: parsed, periodStartDate: '', periodStartTime: '', periodEndDate: '', periodEndTime: '', repeatCount: 0 };
  if (parsed && Array.isArray(parsed.values)) return {
    values: parsed.values,
    periodStartDate: parsed.periodStartDate || parsed.startDate || '',
    periodStartTime: parsed.periodStartTime || parsed.startTime || '',
    periodEndDate: parsed.periodEndDate || parsed.endDate || '',
    periodEndTime: parsed.periodEndTime || parsed.endTime || '',
    repeatCount: Number(parsed.repeatCount) || 0
  };
  return { values: [], periodStartDate: parsed.startDate || '', periodStartTime: '', periodEndDate: parsed.endDate || '', periodEndTime: '', repeatCount: 0 };
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

function parseDateOnly(dateText) {
  if (!DATE_PATTERN.test(String(dateText || ''))) return null;
  const [year, month, day] = String(dateText).split('-').map(Number);
  const value = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function dateMatchesCycle(dateText, cycleType, values) {
  const meta = cycleMeta(values);
  if (meta.periodStartDate && dateText < meta.periodStartDate) return false;
  if (meta.periodEndDate && dateText > meta.periodEndDate) return false;
  if (cycleType === 'daily') return true;
  if (cycleType === 'range') return Boolean(meta.periodStartDate && meta.periodEndDate && dateText >= meta.periodStartDate && dateText <= meta.periodEndDate);
  const date = parseDateOnly(dateText);
  if (!date) return false;
  if (cycleType === 'weekly') return meta.values.includes(date.getDay() === 0 ? 7 : date.getDay());
  if (cycleType === 'monthly') return meta.values.includes(date.getDate());
  if (cycleType === 'yearly') {
    return meta.values.some((item) => {
      if (!item || Number(item.m) !== date.getMonth() + 1) return false;
      const start = Number(item.dStart !== undefined ? item.dStart : item.d);
      const end = Number(item.dEnd !== undefined ? item.dEnd : item.d);
      return date.getDate() >= start && date.getDate() <= end;
    });
  }
  return false;
}

function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function countOccurrencesThrough(dateText, cycleType, values) {
  const meta = cycleMeta(values);
  const startDate = parseDateOnly(meta.periodStartDate);
  const targetDate = parseDateOnly(dateText);
  if (!startDate || !targetDate || targetDate < startDate || !meta.repeatCount) return 0;
  let count = 0;
  let cursor = startDate;
  let guard = 0;
  while (cursor <= targetDate && guard < 36600) {
    if (dateMatchesCycle(formatDate(cursor), cycleType, { ...meta, periodStartDate: '', periodEndDate: '' })) count += 1;
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return count;
}

function legacyTimeRange(rule) {
  const timeStart = String(rule.time_start || rule.timeStart || '09:00:00').substring(0, 5);
  const timeEnd = String(rule.time_end || rule.timeEnd || '18:00:00').substring(0, 5);
  if (!TIME_PATTERN.test(timeStart) || !TIME_PATTERN.test(timeEnd) || timeStart >= timeEnd) return null;
  return { timeStart, timeEnd };
}

function ruleValidationError(rule) {
  const cycleType = String(rule.cycleType || rule.cycle_type || 'weekly');
  if (cycleType === 'datetime_range' || cycleType === 'repeat') return null;
  const timeRange = legacyTimeRange(rule);
  if (!timeRange) return '活动每次占用的开始时间必须早于结束时间';
  const meta = cycleMeta(rule.cycleValues !== undefined ? rule.cycleValues : rule.cycle_values);
  if (meta.periodStartDate && !parseLocalDateTime(meta.periodStartDate, meta.periodStartTime || '00:00')) return '请填写有效的周期开始日期时间';
  if (meta.periodEndDate && !parseLocalDateTime(meta.periodEndDate, meta.periodEndTime || '23:59')) return '请填写有效的周期结束日期时间';
  if (meta.periodStartDate && meta.periodEndDate && meta.periodStartDate > meta.periodEndDate) return '周期结束日期必须晚于或等于开始日期';
  if (meta.periodStartDate && meta.periodEndDate && meta.periodStartDate === meta.periodEndDate && (meta.periodStartTime || '00:00') >= (meta.periodEndTime || '23:59')) return '周期结束时间必须晚于周期开始时间';
  if (!Number.isInteger(meta.repeatCount) || meta.repeatCount < 0 || meta.repeatCount > 1000) return '重复次数必须是0至1000次';
  if (meta.repeatCount > 0 && !meta.periodStartDate) return '设置重复次数时必须填写周期开始日期';
  if (cycleType === 'range' && (!meta.periodStartDate || !meta.periodEndDate)) return '旧版日期范围规则缺少起止日期';
  return null;
}

function buildDetail(rule, occurrenceStart, occurrenceEnd) {
  return {
    id: rule.id,
    venueId: rule.venue_id,
    name: rule.activity_name || '活动',
    cycleType: rule.cycle_type || 'weekly',
    cycleValues: parseCycleValues(rule.cycle_values),
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

    // 兼容上一版已经保存的数据，但不再向新 UI 暴露这两个类别。
    if (cycleType === 'datetime_range' || cycleType === 'repeat') {
      const firstStart = parseLocalDateTime(values.startDate, values.startTime);
      const firstEnd = parseLocalDateTime(values.endDate, values.endTime);
      if (!firstStart || !firstEnd || firstEnd <= firstStart) continue;
      const ranges = [];
      if (cycleType === 'datetime_range') {
        ranges.push({ start: firstStart, end: firstEnd });
      } else {
        const intervalDays = values.intervalUnit === 'week' ? (Number(values.intervalValue) || 1) * 7 : (Number(values.intervalValue) || 1);
        const repeatCount = Math.min(1000, Math.max(0, Number(values.repeatCount) || 0));
        const duration = firstEnd.getTime() - firstStart.getTime();
        for (let index = 0; index < repeatCount; index += 1) {
          const start = new Date(firstStart.getTime() + index * intervalDays * 86400000);
          const end = new Date(start.getTime() + duration);
          if (end > dayStart && start < dayEnd) ranges.push({ start, end });
          if (start >= dayEnd) break;
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
          timeEnd: end.getTime() >= dayEnd.getTime() ? '24:00' : formatTime(end),
          fullTimeStart: formatDateTime(range.start),
          fullTimeEnd: formatDateTime(range.end),
          activity: buildDetail(rule, range.start, range.end)
        });
      }
      continue;
    }
    if (!dateMatchesCycle(dateText, cycleType, values)) continue;
    const timeRange = legacyTimeRange(rule);
    if (!timeRange) continue;
    const meta = cycleMeta(values);
    if (meta.repeatCount > 0 && countOccurrencesThrough(dateText, cycleType, values) > meta.repeatCount) continue;

    let start = parseLocalDateTime(dateText, timeRange.timeStart);
    let end = parseLocalDateTime(dateText, timeRange.timeEnd);
    const periodStart = meta.periodStartDate ? parseLocalDateTime(meta.periodStartDate, meta.periodStartTime || '00:00') : null;
    const periodEnd = meta.periodEndDate ? parseLocalDateTime(meta.periodEndDate, meta.periodEndTime || '23:59') : null;
    if (periodStart && start < periodStart) start = periodStart;
    if (periodEnd && end > periodEnd) end = periodEnd;
    if (!start || !end || end <= start || end <= dayStart || start >= dayEnd) continue;

    slots.push({
      ruleId: rule.id,
      ruleName: rule.activity_name || '活动',
      timeStart: formatTime(start),
      timeEnd: end.getTime() >= dayEnd.getTime() ? '24:00' : formatTime(end),
      fullTimeStart: formatDateTime(start),
      fullTimeEnd: formatDateTime(end),
      activity: buildDetail(rule, start, end)
    });
  }
  return slots;
}

module.exports = { getActivitySlots, ruleValidationError, parseCycleValues, cycleMeta };
