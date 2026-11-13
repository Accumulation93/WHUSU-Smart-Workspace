'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../shared/dateTimeFormat');
const mini = require('../../miniprogram/utils/dateTime');
const timeCopy = require('../../shared/locales/zh-CN/time');
const { describeMessage } = require('../../shared/messageFactsView');
const messageCopy = require('../../shared/locales/zh-CN/messageFacts');
const options = { timezoneOffset: 8, copy: timeCopy, reviewLabel: timeCopy.historicalTimezoneReviewRequired };
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const webSource = fs.readFileSync(path.join(__dirname, '../../web/src/runtime/dateTime.js'), 'utf8');
const web = { rules, timeCopy };
vm.runInNewContext(webSource.split('\n').filter(line => !line.startsWith('import ')).join('\n').replace(/^export function /gm, 'function '), web);

test('列表详情与实时钟仅展示分钟，原始时间和输入值保留', () => {
  const value = '2026-11-14T08:30:45.123Z';
  assert.equal(rules.formatListTime(value, options), '2026-11-14 16:30');
  assert.equal(rules.formatDetailTime(value, options), '2026-11-14 16:30');
  assert.equal(mini.formatDetailTime(value, 8), '2026-11-14 16:30');
  assert.equal(mini.formatSystemClock(value, true, 8), '16:30');
  assert.equal(rules.parseAbsoluteTime(value), Date.parse(value));
  assert.deepEqual(mini.splitSystemDateTime(value, 8), { date: '2026-11-14', time: '16:30' });
  assert.equal(mini.systemDateTimeToIsoUtc('2026-11-14', '16:30', 8), '2026-11-14T08:30:00.000Z');
});

test('同日范围只显示一次日期，跨日跨年依据系统时区', () => {
  const start = '2026-11-14T08:30:45Z';
  assert.equal(rules.formatTimeRange(start, '2026-11-14T10:30:59Z', options), '2026年11月14日 16:30-18:30');
  assert.equal(rules.formatTimeRange('2026-12-31T15:30:45Z', '2026-12-31T16:30:59Z', options), '2026年12月31日 23:30-2027年1月1日 00:30');
  assert.equal(rules.formatTimeRange(start, '2026-11-14T10:30:59Z', { ...options, timezoneOffset: -12 }), '2026年11月13日 20:30-22:30');
  assert.equal(mini.formatTimeRange(start, '2026-11-14T10:30:59Z', { timezoneOffset: 8 }), '2026年11月14日 16:30-18:30');
});

test('待核对标记逐端保留，缺失时间不伪造范围', () => {
  const start = '2026-11-14T08:30:45Z', end = '2026-11-14T10:30:59Z';
  assert.equal(rules.formatTimeRange(start, end, { ...options, startReviewStatus: 'review_required' }), '2026年11月14日 16:30 · 时间待核对-2026年11月14日 18:30');
  assert.equal(rules.formatTimeRange(start, '', options), '2026年11月14日 16:30');
  assert.equal(rules.formatTimeRange('', end, { ...options, endReviewStatus: 'review_required' }), '2026年11月14日 18:30 · 时间待核对');
  assert.equal(rules.formatTimeRange(start, 'invalid', { ...options, startReviewStatus: 'review_required' }), '2026年11月14日 16:30 · 时间待核对');
  assert.equal(rules.formatTimeRange('', '', options), '');
  assert.equal(rules.formatTimeRange('invalid', null, options), '');
  assert.equal(rules.formatDisplayTime(start, options), '2026年11月14日 16:30');
  const messageOptions = { notification: true, canOpen: false,
    formatDateTime: (value, reviewStatus) => rules.formatDisplayTime(value, { ...options, reviewStatus }),
    formatRange: (a, b, review) => rules.formatTimeRange(a, b, { ...options, ...review }) };
  const full = describeMessage({ type: 'calendar_reminder', displayFacts: { startTime: start, endTime: end } }, messageCopy, messageOptions);
  assert.equal(full.detailLines[0].value, '2026年11月14日 16:30-18:30');
  assert.equal(full.actionNotice, undefined);
  const partial = describeMessage({ type: 'calendar_reminder', displayFacts: { startTime: start } }, messageCopy, messageOptions);
  assert.deepEqual(partial.detailLines, [{ label: messageCopy.startTimeLabel, value: '2026年11月14日 16:30' }]);
});

test('网页包装保留字符串状态和对象参数，并尊重显式时区', () => {
  const value = '2026-11-14T08:30:45Z';
  web.setSystemTimezoneConfig(8);
  assert.equal(web.formatDisplayTime(value, 'review_required'), '2026年11月14日 16:30 · 时间待核对');
  assert.equal(web.formatDisplayTime(value, {timezoneOffset:-12,reviewStatus:'review_required'}), '2026年11月13日 20:30 · 时间待核对');
  assert.equal(web.formatTimeRange(value, '', {timezoneOffset:-12,startReviewStatus:'review_required'}), '2026年11月13日 20:30 · 时间待核对');
  assert.equal(web.formatTimeRange('', value, {timezoneOffset:0,endReviewStatus:'review_required'}), '2026年11月14日 08:30 · 时间待核对');
  assert.equal(web.formatTimeRange(value, '2026-11-14T10:30:59Z', {timezoneOffset:0}), '2026年11月14日 08:30-10:30');
});
