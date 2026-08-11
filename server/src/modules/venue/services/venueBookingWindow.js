const MAX_ADVANCE_DAYS = 36500;
const MAX_ADVANCE_MINUTES = MAX_ADVANCE_DAYS * 24 * 60;

function integerOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeAdvance(label, input) {
  if (!input || input.enabled === false || input.mode === '' || input.mode === 'none') {
    return {
      mode: null,
      days: null,
      minutes: null
    };
  }
  const mode = input.mode === 'days' ? 'days' : input.mode === 'duration' ? 'duration' : '';
  if (!mode) throw new Error(label + '请选择设置方式');
  if (mode === 'days') {
    const days = integerOrNull(input.days);
    if (days === null || days < 0 || days > MAX_ADVANCE_DAYS) {
      throw new Error(label + '请输入 0-' + MAX_ADVANCE_DAYS + ' 之间的整数天数');
    }
    return { mode, days, minutes: days * 24 * 60 };
  }
  const hours = integerOrNull(input.hours);
  const minutes = integerOrNull(input.minutes);
  if (hours === null || minutes === null || hours < 0 || hours > MAX_ADVANCE_DAYS * 24 || minutes < 0 || minutes > 59) {
    throw new Error(label + '请输入合法的小时和分钟');
  }
  const total = hours * 60 + minutes;
  if (total > MAX_ADVANCE_MINUTES) throw new Error(label + '提前时长过大');
  return { mode, days: null, minutes: total };
}

function normalizeBookingWindow(input) {
  const source = input || {};
  const open = normalizeAdvance('开放时间', source.open);
  const deadline = normalizeAdvance('截止时间', source.deadline);
  if (open.minutes !== null && deadline.minutes !== null && open.minutes < deadline.minutes) {
    throw new Error('开放时间必须早于或等于截止时间');
  }
  return {
    id: source.id || null,
    openAdvanceMode: open.mode,
    openAdvanceDays: open.days,
    openAdvanceMinutes: open.minutes,
    deadlineAdvanceMode: deadline.mode,
    deadlineAdvanceDays: deadline.days,
    deadlineAdvanceMinutes: deadline.minutes
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    venueId: row.venue_id,
    orgId: row.org_id,
    openAdvanceMode: row.open_advance_mode,
    openAdvanceDays: row.open_advance_days === null ? null : Number(row.open_advance_days),
    openAdvanceMinutes: row.open_advance_minutes === null ? null : Number(row.open_advance_minutes),
    deadlineAdvanceMode: row.deadline_advance_mode,
    deadlineAdvanceDays: row.deadline_advance_days === null ? null : Number(row.deadline_advance_days),
    deadlineAdvanceMinutes: row.deadline_advance_minutes === null ? null : Number(row.deadline_advance_minutes)
  };
}

function validateBookingWindow(row, bookingStart, now) {
  if (!row || !(bookingStart instanceof Date) || Number.isNaN(bookingStart.getTime())) return null;
  const current = now instanceof Date ? now : new Date();
  const openMinutes = row.open_advance_minutes === null || row.open_advance_minutes === undefined
    ? null : Number(row.open_advance_minutes);
  const deadlineMinutes = row.deadline_advance_minutes === null || row.deadline_advance_minutes === undefined
    ? null : Number(row.deadline_advance_minutes);
  if (openMinutes !== null && current.getTime() < bookingStart.getTime() - openMinutes * 60000) {
    return { code: 'booking_not_open', message: '该场地尚未开放借用，请按规则提前提交' };
  }
  const deadline = deadlineMinutes === null
    ? bookingStart.getTime()
    : bookingStart.getTime() - deadlineMinutes * 60000;
  if (current.getTime() >= deadline) {
    return { code: 'booking_closed', message: '该场地已超过借用截止时间，请选择更晚的借用开始时间' };
  }
  return null;
}

module.exports = {
  MAX_ADVANCE_DAYS,
  normalizeBookingWindow,
  fromRow,
  validateBookingWindow
};
