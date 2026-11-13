'use strict';
const assert = require('node:assert/strict');
const view = require('../shared/calendarView');
const rules = require('../shared/dateTimeFormat');
const copy = require('../shared/locales/zh-CN/time');
const messages = require('../shared/locales/zh-CN/messageFacts');
const formatters = {
  formatAbsoluteDate: rules.formatAbsoluteDate,
  formatDisplayTime: (value, options) => rules.formatDisplayTime(value, Object.assign({}, options, {
    copy, reviewLabel: copy.historicalTimezoneReviewRequired
  })),
  formatTimeRange: (start, end, options) => rules.formatTimeRange(start, end, Object.assign({}, options, {
    copy, reviewLabel: copy.historicalTimezoneReviewRequired
  }))
};
const fixtures = [
  [{startAt:'2026-11-14T08:30:42Z',endAt:'2026-11-14T10:30:59Z'},'2026年11月14日 16:30-18:30'],
  [{startAt:'2026-11-14T15:30:42Z',endAt:'2026-11-14T16:30:59Z'},'2026年11月14日 23:30-2026年11月15日 00:30'],
  [{startAt:'2026-11-13T16:00:00Z',endAt:'2026-11-14T16:00:00Z',allDay:true},'2026年11月14日（全天）'],
  [{startAt:'2026-12-30T16:00:00Z',endAt:'2027-01-02T16:00:00Z',allDay:true},'2026年12月31日 至 2027年1月2日（全天）'],
  [{startAt:'2026-11-14T05:00:00Z',endAt:'2026-11-15T05:00:00Z',allDay:true,timezoneOffset:-300},'2026年11月14日（全天）'],
  [{startAt:'2026-11-14T08:30:42Z'},'2026年11月14日 16:30'],
  [{allDay:true},''],
  [{startAt:'2026-11-13T16:00:00Z',allDay:true},'2026年11月14日（全天）'],
  [{startAt:'2026-11-14T08:30:42Z',endAt:'2026-11-14T10:30:59Z',startAtReviewStatus:'review_required'},'2026年11月14日 16:30 · 时间待核对-2026年11月14日 18:30'],
  [{startAt:'2026-11-14T08:30:42Z',startAtReviewStatus:'review_required'},'2026年11月14日 16:30 · 时间待核对'],
  [{endAt:'2026-11-14T10:30:59Z',endAtReviewStatus:'review_required'},'2026年11月14日 18:30 · 时间待核对']
];
for (const [item, expected] of fixtures) {
  const original = JSON.stringify(item);
  assert.equal(view.timeText(item, 480, formatters, copy, messages), expected);
  assert.equal(JSON.stringify(item), original);
}
console.log('Calendar time presentation: ' + fixtures.length + ' cases passed; raw inputs unchanged.');
