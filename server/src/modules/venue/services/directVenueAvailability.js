'use strict';

const config = require('../../../core/models/systemConfig');
const openRules = require('../models/venueOpenRule');
const activityRules = require('../models/venueActivityRule');
const { getSystemDate, getSystemMinuteOfDay } = require('../../../utils/dateTime');
const { dateMatchesCycle, getActivitySlots } = require('./venueActivitySchedule');

function minutes(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

function availability(start, end, rules, activities, timezone) {
  const date = getSystemDate(start, timezone);
  const from = getSystemMinuteOfDay(start, timezone);
  const to = getSystemMinuteOfDay(end, timezone);
  if (!date || getSystemDate(end, timezone) !== date || end <= start) return 'invalid_booking_time';
  const intervals = rules.filter(rule => Number(rule.is_active) === 1
    && dateMatchesCycle(date, rule.cycle_type, rule.cycle_values))
    .map(rule => [minutes(rule.time_start), minutes(rule.time_end)])
    .filter(interval => Number.isFinite(interval[0]) && interval[1] > interval[0])
    .sort((left, right) => left[0] - right[0]);
  let cursor = from;
  for (const [opens, closes] of intervals) {
    if (cursor >= to || opens > cursor) break;
    cursor = Math.max(cursor, closes);
  }
  if (cursor < to || !intervals.some(([opens, closes]) => from >= opens && from < closes)) {
    return 'venue_booking_outside_open_hours';
  }
  const overlapping = getActivitySlots(date, activities, timezone).some(slot =>
    new Date(slot.fullTimeStart) < end && new Date(slot.fullTimeEnd) > start);
  return overlapping ? 'venue_booking_activity_conflict' : '';
}

async function check(venueId, start, end, connection) {
  const settings = await config.get(connection);
  const rules = await openRules.getByVenueId(venueId, connection);
  const activities = await activityRules.getByVenueId(venueId, connection);
  return availability(start, end, rules, activities, settings?.timezone ?? 8);
}

module.exports = { availability, check };
