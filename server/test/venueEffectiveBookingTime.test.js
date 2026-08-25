'use strict';

const assert = require('assert');
const { effectiveBookingStart } = require('../src/modules/venue/services/venueEffectiveBookingTime');

const approvalTime = new Date('2026-08-25T04:00:00.000Z');
const futureStart = new Date('2026-08-26T02:00:00.000Z');
const pastStart = new Date('2026-08-24T02:00:00.000Z');

assert.strictEqual(
  effectiveBookingStart(futureStart, approvalTime).toISOString(),
  futureStart.toISOString(),
  '提前审批不得把未来借用开始时间提前到审批时刻'
);
assert.strictEqual(
  effectiveBookingStart(pastStart, approvalTime).toISOString(),
  approvalTime.toISOString(),
  '原开始时间已过时才从审批时刻生效'
);
assert.throws(
  () => effectiveBookingStart('invalid', approvalTime),
  (error) => error instanceof TypeError && error.code === 'invalid_booking_time'
);

console.log('场地审批有效开始时间测试通过');
