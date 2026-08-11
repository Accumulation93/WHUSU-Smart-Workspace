const assert = require('assert');
const { getActivitySlots, ruleValidationError } = require('../src/modules/venue/services/venueActivitySchedule');

const exactRange = {
  id: 'activity-range',
  venue_id: 'venue-1',
  activity_name: '迎新活动',
  cycle_type: 'datetime_range',
  cycle_values: {
    startDate: '2026-08-12', startTime: '23:30',
    endDate: '2026-08-13', endTime: '01:30'
  },
  is_active: 1
};

const repeated = {
  id: 'activity-repeat',
  venue_id: 'venue-1',
  activity_name: '每周例会',
  cycle_type: 'repeat',
  cycle_values: {
    startDate: '2026-08-10', startTime: '09:00',
    endDate: '2026-08-10', endTime: '10:00',
    intervalUnit: 'week', intervalValue: 1, repeatCount: 3
  },
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

const crossDay = getActivitySlots('2026-08-13', [exactRange]);
assert.strictEqual(crossDay.length, 1);
assert.strictEqual(crossDay[0].timeStart, '00:00');
assert.strictEqual(crossDay[0].timeEnd, '01:30');
assert.strictEqual(crossDay[0].fullTimeStart, '2026-08-12 23:30');

const repeatDay = getActivitySlots('2026-08-17', [repeated]);
assert.strictEqual(repeatDay.length, 1);
assert.strictEqual(repeatDay[0].timeStart, '09:00');
assert.strictEqual(repeatDay[0].occurrenceIndex, 2);

const legacyDay = getActivitySlots('2026-08-12', [legacy]);
assert.strictEqual(legacyDay.length, 1);
assert.strictEqual(legacyDay[0].timeEnd, '15:30');

assert.strictEqual(ruleValidationError({ cycleType: 'datetime_range', cycleValues: exactRange.cycle_values }), null);
assert.strictEqual(ruleValidationError({
  cycleType: 'repeat',
  cycleValues: { ...repeated.cycle_values, repeatCount: 0 }
}), '重复次数必须是1至1000次');
assert.strictEqual(ruleValidationError({ cycleType: 'datetime_range', cycleValues: { startDate: '2026-08-12', startTime: '10:00', endDate: '2026-08-12', endTime: '09:00' } }), '活动结束时间必须晚于开始时间');

console.log('场地活动占用时间与重复规则测试通过');
