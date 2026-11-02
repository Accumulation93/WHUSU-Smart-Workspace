'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdapter } = require('../src/core/models/venueSharedRuleCopy');
const { getActivitySlots } = require('../src/modules/venue/services/venueActivitySchedule');
const base = { name: '例会', sourceVenueId: 'source', sourceVenueName: '会议室', timeStart: '09:00', timeEnd: '18:00' };
const activity = createAdapter('venue.activityRules');
function slots(rule, date) {
  return getActivitySlots(date, [{ id: 'rule', venue_id: 'venue', activity_name: '例会', is_active: 1,
    cycle_type: rule.cycleType, cycle_values: rule.cycleValues, time_start: rule.timeStart, time_end: rule.timeEnd }], 480);
}
test('旧周期缺少模式字段时沿用既有日期或次数解释，不变成无限期', () => {
  for (const cycleValues of [
    { values: [1, 3], periodStartDate: '2026-11-01', periodEndDate: '2026-12-15' },
    { values: [1, 3], periodStartDate: '2026-11-01', repeatCount: 3 }
  ]) {
    const source = { ...base, cycleType: 'weekly', cycleValues };
    const copied = activity.normalize(source);
    assert.notEqual(copied.cycleValues.periodMode, 'none');
    for (const date of ['2026-10-28', '2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-12-16']) {
      // 展示详情保留规范化格式不同，真正占用片段须完全一致。
      const geometry = rule => slots(rule, date).map(({ activity: _detail, ...value }) => value);
      assert.deepEqual(geometry(copied), geometry(source));
    }
  }
});
test('旧连续跨日及间隔活动复制保留实际占用，开放规则不接受活动专有类型', () => {
  for (const cycleType of ['datetime_range', 'repeat', 'range']) {
    const source = { ...base, cycleType, cycleValues: { startDate: '2026-11-01', endDate: '2026-11-03',
      ...(cycleType === 'range' ? {} : { startTime: '16:30', endTime: '10:00', intervalUnit: 'week', intervalValue: 2, repeatCount: 3 }) } };
    const copied = activity.normalize(source);
    for (const date of ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-15', '2026-11-17', '2026-12-13']) {
      const geometry = rule => slots(rule, date).map(({ activity: _detail, ...value }) => value);
      assert.deepEqual(geometry(copied), geometry(source));
    }
    if (cycleType !== 'range') assert.throws(() => createAdapter('venue.openRules').normalize(source));
  }
});
test('损坏日期、未知周期及未知限制明确拒绝', () => {
  for (const cycleValues of [{ values: [1], periodMode: 'unknown' },
    { values: [1], periodMode: 'range', periodStartDate: '2026-02-30', periodEndDate: '2026-03-30' },
    { values: [1], periodMode: 'count', periodStartDate: '2026-11-01', repeatCount: 1001 }]) {
    assert.throws(() => activity.normalize({ ...base, cycleType: 'weekly', cycleValues }), error => error.code === 'config_copy_invalid');
  }
  assert.throws(() => activity.normalize({ ...base, cycleType: 'unknown', cycleValues: [] }));
});
