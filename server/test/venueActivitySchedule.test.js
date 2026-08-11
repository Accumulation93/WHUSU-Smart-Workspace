const assert = require('assert');
const { getActivitySlots, ruleValidationError } = require('../src/modules/venue/services/venueActivitySchedule');

const periodicRange = {
  id: 'activity-period',
  venue_id: 'venue-1',
  activity_name: '迎新活动',
  cycle_type: 'daily',
  cycle_values: {
    values: [],
    periodMode: 'range',
    periodStartDate: '2026-08-12', periodStartTime: '10:00',
    periodEndDate: '2026-08-13', periodEndTime: '12:00',
    repeatCount: 0
  },
  time_start: '09:00:00',
  time_end: '18:00:00',
  is_active: 1
};

const repeated = {
  id: 'activity-repeat',
  venue_id: 'venue-1',
  activity_name: '每周例会',
  cycle_type: 'weekly',
  cycle_values: {
    values: [1],
    periodMode: 'count',
    periodStartDate: '2026-08-10', periodStartTime: '00:00',
    periodEndDate: '', periodEndTime: '23:59',
    repeatCount: 3
  },
  time_start: '09:00:00',
  time_end: '10:00:00',
  is_active: 1
};

const legacy = {
  id: 'activity-legacy',
  venue_id: 'venue-1',
  activity_name: '工作日活动',
  cycle_type: 'weekly',
  cycle_values: [1, 3, 5],
  time_start: '14:00:00',
  time_end: '15:30:00',
  is_active: 1
};

const firstPeriodDay = getActivitySlots('2026-08-12', [periodicRange]);
assert.strictEqual(firstPeriodDay.length, 1);
assert.strictEqual(firstPeriodDay[0].timeStart, '10:00');
assert.strictEqual(firstPeriodDay[0].timeEnd, '18:00');

const lastPeriodDay = getActivitySlots('2026-08-13', [periodicRange]);
assert.strictEqual(lastPeriodDay.length, 1);
assert.strictEqual(lastPeriodDay[0].timeStart, '09:00');
assert.strictEqual(lastPeriodDay[0].timeEnd, '12:00');

const repeatDay = getActivitySlots('2026-08-24', [repeated]);
assert.strictEqual(repeatDay.length, 1);
const afterRepeatLimit = getActivitySlots('2026-08-31', [repeated]);
assert.strictEqual(afterRepeatLimit.length, 0);

const legacyDay = getActivitySlots('2026-08-12', [legacy]);
assert.strictEqual(legacyDay.length, 1);
assert.strictEqual(legacyDay[0].timeEnd, '15:30');

assert.strictEqual(ruleValidationError({
  cycleType: 'weekly',
  cycleValues: repeated.cycle_values,
  timeStart: '09:00',
  timeEnd: '10:00'
}), null);
assert.strictEqual(ruleValidationError({
  cycleType: 'daily',
  cycleValues: { values: [], periodStartDate: '2026-08-12', repeatCount: 0 },
  timeStart: '18:00',
  timeEnd: '09:00'
}), '活动每次占用的开始时间必须早于结束时间');
assert.strictEqual(ruleValidationError({
  cycleType: 'weekly',
  cycleValues: { values: [1], periodStartDate: '', repeatCount: 2 },
  timeStart: '09:00',
  timeEnd: '10:00'
}), '按重复次数时必须填写周期开始日期');

assert.strictEqual(getActivitySlots('2026-08-24', [{ ...repeated, cycle_values: { ...repeated.cycle_values, periodMode: 'range', periodEndDate: '2026-08-30' } }]).length, 1);
assert.strictEqual(ruleValidationError({
  cycleType: 'daily',
  cycleValues: { values: [], periodMode: 'range', periodStartDate: '2026-08-12', periodEndDate: '' },
  timeStart: '09:00',
  timeEnd: '10:00'
}), '按生效时间范围时必须填写开始和结束日期');
assert.strictEqual(ruleValidationError({
  cycleType: 'daily',
  cycleValues: { values: [], periodMode: 'count', periodStartDate: '2026-08-12', repeatCount: 0 },
  timeStart: '09:00',
  timeEnd: '10:00'
}), '按重复次数时请输入至少1次');

console.log('场地活动周期、时间范围与重复次数测试通过');
