'use strict';

const assert = require('assert');
const path = require('path');
const server = require('../src/utils/dateValue');
const mini = require('../../miniprogram/utils/hrProfileDate');
const cases = require('./fixtures/hrDateValueCases.json');

// 服务端与小程序必须使用同一套识别口径：日期按字面取年月日、日期时间带偏移换算/无偏移按 UTC。
for (const item of cases.dateCases) {
  assert.strictEqual(server.normalizeDateValue(item.input), item.expected, '服务端日期 ' + item.input);
  assert.strictEqual(mini.normalizeDateLiteral(item.input), item.expected, '小程序日期 ' + item.input);
}
for (const input of cases.invalidCases) {
  assert.strictEqual(server.normalizeDateValue(input), '', '服务端应拒绝 ' + input);
  assert.strictEqual(mini.normalizeDateLiteral(input), '', '小程序应拒绝 ' + input);
  assert.strictEqual(server.normalizeDateTimeValue(input), '', '服务端日期时间应拒绝 ' + input);
  assert.strictEqual(mini.normalizeDateTimeInstant(input), '', '小程序日期时间应拒绝 ' + input);
}
for (const item of cases.datetimeCases) {
  assert.strictEqual(server.normalizeDateTimeValue(item.input), item.expected, '服务端日期时间 ' + item.input);
  assert.strictEqual(mini.normalizeDateTimeInstant(item.input), item.expected, '小程序日期时间 ' + item.input);
}
for (const item of cases.displayCases) {
  assert.strictEqual(server.formatDateTimeText(item.utc, item.offset), item.text, '服务端展示 ' + item.utc);
  assert.strictEqual(mini.formatDateTimeText(item.utc, item.offset), item.text, '小程序展示 ' + item.utc);
  assert.strictEqual(server.formatDatePickerValue(item.utc, item.offset), item.date);
  assert.strictEqual(mini.formatDateTimePickerDate(item.utc, item.offset), item.date);
  assert.strictEqual(server.formatTimePickerValue(item.utc, item.offset), item.time);
  assert.strictEqual(mini.formatDateTimePickerTime(item.utc, item.offset), item.time);
}
for (const item of cases.pickerCases) {
  assert.strictEqual(server.systemPickerToUtcIso(item.date, item.time, item.offset), item.expected, '服务端选择器 ' + item.date + ' ' + item.time);
  assert.strictEqual(mini.pickerToUtcIso(item.date, item.time, item.offset), item.expected, '小程序选择器 ' + item.date + ' ' + item.time);
}
for (const item of cases.columnCases) {
  assert.strictEqual(mini.detectColumnDateType(item.values), item.expected, '列类型推断 ' + JSON.stringify(item.values));
}

// 日期只取字面年月日：带时区偏移的完整时刻不做换算，避免日期字段因时区偏移跨天。
assert.strictEqual(server.normalizeDateValue('2006-10-20T23:30:00Z'), '2006-10-20');
assert.strictEqual(mini.normalizeDateLiteral('2006-10-20T23:30:00Z'), '2006-10-20');
// 日期时间无偏移按 UTC；带偏移按偏移还原。
assert.strictEqual(server.normalizeDateTimeValue('2006-10-20 23:30:00'), '2006-10-20T23:30:00Z');
assert.strictEqual(server.normalizeDateTimeValue('2006-10-20T23:30:00+08:00'), '2006-10-20T15:30:00Z');
// 展示按系统时区，绝不使用设备时区。
assert.strictEqual(server.formatDateTimeText('2006-10-20T23:30:00Z', 8), '2006-10-21 07:30:00');

// 与旧口径的差异必须显式记录：数据库格式现在可识别。
const databaseFormat = 'Fri Oct 20 2006 08:00:00 GMT+0800（China Standard Time）';
assert.strictEqual(server.normalizeDateValue(databaseFormat), '2006-10-20');
assert.strictEqual(server.normalizeDateTimeValue(databaseFormat), '2006-10-20T00:00:00Z');
assert.strictEqual(mini.normalizeDateLiteral(databaseFormat), '2006-10-20');
assert.strictEqual(mini.normalizeDateTimeInstant(databaseFormat), '2006-10-20T00:00:00Z');

console.log('人事日期/日期时间解析契约：' + path.basename(__filename) + ' 通过');
