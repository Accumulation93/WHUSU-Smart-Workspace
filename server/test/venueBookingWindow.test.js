const assert = require('assert');
const {
  normalizeBookingWindow,
  validateBookingWindow
} = require('../src/modules/venue/services/venueBookingWindow');

const normalized = normalizeBookingWindow({
  open: { mode: 'days', days: 3 },
  deadline: { mode: 'duration', hours: 2, minutes: 30 }
});
assert.strictEqual(normalized.openAdvanceMinutes, 4320);
assert.strictEqual(normalized.deadlineAdvanceMinutes, 150);

assert.throws(() => normalizeBookingWindow({
  open: { mode: 'duration', hours: 1, minutes: 0 },
  deadline: { mode: 'days', days: 1 }
}), /开放时间必须早于或等于截止时间/);

const start = new Date(2026, 7, 12, 12, 0, 0);
const nowBeforeOpen = new Date(2026, 7, 9, 11, 59, 59);
assert.strictEqual(
  validateBookingWindow({ open_advance_minutes: 3 * 24 * 60, deadline_advance_minutes: null }, start, nowBeforeOpen).code,
  'booking_not_open'
);
const nowAfterDeadline = new Date(2026, 7, 12, 12, 0, 0);
assert.strictEqual(
  validateBookingWindow({ open_advance_minutes: null, deadline_advance_minutes: null }, start, nowAfterDeadline).code,
  'booking_closed'
);
assert.strictEqual(
  validateBookingWindow({ open_advance_minutes: null, deadline_advance_minutes: 30 }, start, new Date(2026, 7, 12, 11, 29, 0)),
  null
);
console.log('场地借用时间窗口测试通过');
