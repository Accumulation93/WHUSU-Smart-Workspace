'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const adapter = require('../src/core/models/venueBookingWindowCopy');
const { describeConfiguration } = require('../../shared/organizationCopyPresentation');
const ui = require('../../shared/locales/zh-CN/authorization');
test('借用时间复制严格区分不限制、天数与时长，并拒绝颠倒边界', () => {
  const base = { name: '会议室', open: { mode: 'days', days: 7 }, deadline: { mode: 'duration', hours: 1, minutes: 30 } };
  assert.deepEqual(adapter.normalize(base).deadline, base.deadline);
  for (const patch of [{ open: { mode: 'unknown' } }, { open: { mode: 'days', days: '7' } },
    { open: { mode: 'days', days: -1 } }, { open: { mode: 'duration', hours: 0, minutes: 60 } },
    { open: { mode: 'duration', hours: 1, minutes: 0 } }]) {
    assert.throws(() => adapter.normalize({ ...base, ...patch }), error => error.code === 'config_copy_invalid');
  }
  const noLimit = adapter.normalize({ name: '会议室', open: { mode: 'none' }, deadline: { mode: 'none' } });
  const view = describeConfiguration('venue.bookingWindows', noLimit, ui);
  assert.equal(view.notice, ui.configurationCopy.windowNotice);
  assert(view.sections[0].lines.includes(ui.configurationCopy.summaryRow(ui.configurationCopy.bookingDeadline, ui.configurationCopy.atBookingStart)));
});
test('来源已有数值矛盾时拒绝复制，不把损坏时间解释成无限制', async () => {
  for (const row of [
    { name: '会议室', open_advance_mode: null, open_advance_minutes: 20, open_advance_days: null },
    { name: '会议室', open_advance_mode: 'days', open_advance_days: 7, open_advance_minutes: 60 },
    { name: '会议室', open_advance_mode: 'duration', open_advance_minutes: null }
  ]) {
    await assert.rejects(adapter.source({ query: async () => [[row]] }, 'org', 'policy'), error => error.code === 'config_copy_invalid');
  }
});
