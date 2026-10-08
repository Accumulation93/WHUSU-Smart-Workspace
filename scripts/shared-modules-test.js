'use strict';

/**
 * 共用模块回归测试。
 *
 * 1. 时间展示规则：唯一源与小程序现有实现必须给出完全相同的结果；
 * 2. 接口约定：唯一源登记的写入与登录入口必须覆盖小程序当前的内联清单；
 * 3. 网页副本：自动生成的 ES 模块必须暴露与唯一源一致的导出。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharedDate = require('../shared/dateTimeFormat.js');
const sharedContracts = require('../shared/apiContracts.js');
const miniDate = require('../miniprogram/utils/dateTime.js');
const miniTimeCopy = require('../miniprogram/locales/zh-CN/time.js');

// ---------- 时间展示规则 ----------
miniDate.setSystemTimezoneConfig(8, '1', false, '');

const absoluteFixtures = [
  '2026-01-02T03:04:05.000Z',
  '2026-01-02T03:04:05Z',
  '2026-01-02 03:04:05',
  '2026-06-30 23:59:59.500',
  '2026-12-31T16:00:00.000Z',
  ''
];

absoluteFixtures.forEach((value) => {
  assert.strictEqual(
    sharedDate.formatListTime(value, { timezoneOffset: 8 }),
    miniDate.formatListTime(value, { timezoneOffset: 8 }),
    '列表时间展示必须与小程序一致：' + value
  );
  assert.strictEqual(
    sharedDate.formatDetailTime(value, { timezoneOffset: 8 }),
    miniDate.formatDetailTime(value, { timezoneOffset: 8 }),
    '详情时间展示必须与小程序一致：' + value
  );
  assert.strictEqual(
    sharedDate.formatAbsoluteDate(value, 8),
    miniDate.formatAbsoluteDate(value, 8),
    '日期展示必须与小程序一致：' + value
  );
  assert.strictEqual(
    sharedDate.parseAbsoluteTime(value),
    miniDate.parseAbsoluteTime(value),
    '绝对时间解析必须与小程序一致：' + value
  );
  const sharedSplit = sharedDate.formatDetailTime(value, { timezoneOffset: 8 }).split(' ');
  const miniSplit = miniDate.splitSystemDateTime(value, 8);
  assert.strictEqual(sharedSplit[0] || '', miniSplit.date, '日期部分必须与小程序一致：' + value);
  assert.strictEqual((sharedSplit[1] || '').slice(0, 5), miniSplit.time, '时刻部分必须与小程序一致：' + value);
});

// 展示偏移只影响显示结果，不改变原始绝对时间。
const offsets = [-12, -5, 0, 8, 14];
offsets.forEach((offset) => {
  assert.strictEqual(
    sharedDate.formatDetailTime('2026-03-01T00:00:00.000Z', { timezoneOffset: offset }),
    miniDate.formatDetailTime('2026-03-01T00:00:00.000Z', { timezoneOffset: offset }),
    '偏移 ' + offset + ' 下的详情时间必须一致'
  );
});

// 来源不明的历史时间必须带待核对标记，标签由调用方从语言资源提供。
assert.strictEqual(
  sharedDate.formatListTime('2026-01-02T03:04:05.000Z', {
    timezoneOffset: 8,
    reviewStatus: 'review_required',
    reviewLabel: miniTimeCopy.historicalTimezoneReviewRequired
  }),
  miniDate.formatListTime('2026-01-02T03:04:05.000Z', {
    timezoneOffset: 8,
    reviewStatus: 'review_required'
  }),
  '待核对标记必须与小程序一致'
);
assert.throws(
  () => sharedDate.formatListTime('2026-01-02T03:04:05.000Z', {
    timezoneOffset: 8,
    reviewStatus: 'review_required'
  }),
  /reviewLabel is required/,
  '缺待核对标签时必须报错，不能静默少显示一段'
);

// 日期型与规则型值不做时区换算。
assert.strictEqual(sharedDate.formatDateOnly('2026-02-29'), '');
assert.strictEqual(sharedDate.formatDateOnly('2024-02-29'), '2024-02-29');
assert.strictEqual(miniDate.formatDateOnly('2026-02-29'), sharedDate.formatDateOnly('2026-02-29'));
assert.strictEqual(miniDate.formatClockTime('08:05:00'), sharedDate.formatClockTime('08:05:00'));
assert.strictEqual(sharedDate.formatClockTime('24:00'), '');
assert.strictEqual(miniDate.formatClockTime('24:00'), sharedDate.formatClockTime('24:00'));

// ---------- 接口约定 ----------
const apiSource = fs.readFileSync(path.join(root, 'miniprogram/utils/api.js'), 'utf8');

function inlineBlockKeys(source, name) {
  const pattern = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n\\};');
  const match = source.match(pattern);
  assert.ok(match, '小程序仍应保留 ' + name + ' 内联清单，迁移到共用源时同步更新本测试');
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line && line.includes(':'))
    .map((line) => line.slice(0, line.indexOf(':')).replace(/['"]/g, '').trim())
    .sort();
}

assert.deepStrictEqual(
  Object.keys(sharedContracts.IDEMPOTENT_WRITE_APIS).sort(),
  inlineBlockKeys(apiSource, 'IDEMPOTENT_WRITE_APIS'),
  '幂等写入清单必须与小程序一致'
);
assert.deepStrictEqual(
  Object.keys(sharedContracts.AUTH_ENTRY_APIS).sort(),
  inlineBlockKeys(apiSource, 'AUTH_ENTRY_APIS'),
  '登录入口清单必须与小程序一致'
);
assert.strictEqual(sharedContracts.isIdempotentWrite('submitScoreRecord'), true);
assert.strictEqual(sharedContracts.isIdempotentWrite('listTodos'), false);
assert.strictEqual(sharedContracts.isAuthEntry('auth/password/session'), true);
assert.strictEqual(sharedContracts.isAuthEntry('listTodos'), false);

// ---------- 网页副本 ----------
const webSharedDir = path.join(root, 'web/src/shared');
const webModules = ['apiContracts.js', 'dateTimeFormat.js'];
webModules.forEach((module) => {
  const target = path.join(webSharedDir, module);
  assert.ok(fs.existsSync(target), '网页副本必须存在：' + module);
  const source = fs.readFileSync(target, 'utf8');
  assert.ok(source.includes('export default sharedModule;'), '网页副本必须是可用的 ES 模块：' + module);
  assert.ok(source.includes('请勿直接修改'), '网页副本必须标明是自动生成：' + module);
});

const webContracts = fs.readFileSync(path.join(webSharedDir, 'apiContracts.js'), 'utf8');
Object.keys(sharedContracts).forEach((name) => {
  assert.ok(
    new RegExp('export \\{[^}]*\\b' + name + '\\b[^}]*\\}').test(webContracts),
    '网页副本必须导出 ' + name
  );
});

console.log('共用模块时间规则、接口约定与网页副本一致性测试通过');
