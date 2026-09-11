'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const selection = require('../miniprogram/subpackages/venue/utils/adminTimeSelection');
const day = { openSlots: [{ timeStart: '08:00', timeEnd: '12:00' }, { timeStart: '13:00', timeEnd: '24:00' }],
  bookedSlots: [{ timeStart: '10:00', timeEnd: '11:00' }], activitySlots: [] };
assert.deepStrictEqual(selection.choose(day, '09:30', '', true), { start: '09:30', end: '10:00' });
assert.strictEqual(selection.choose(day, '09:30', '11:30', false), null);
assert.strictEqual(selection.choose(day, '11:30', '13:30', false), null);
assert.strictEqual(selection.choose(day, '10:00', '', true), null);
assert.strictEqual(selection.choose(day, '08:00', '08:00', false), null);
assert.deepStrictEqual(selection.choose(day, '23:30', '', true), { start: '23:30', end: '23:59' });
assert.strictEqual(selection.minutes(''), null);
assert.strictEqual(selection.minutes('25:00'), null);
for (const width of [240, 520, 900]) {
  assert.strictEqual(selection.dragMinute(540, width / 24, width), 600);
  assert.strictEqual(selection.dragMinute(540, -width, width), 0);
  const patch = selection.patch(day, '09:20', '09:50');
  assert.strictEqual(patch.adminStartHours[patch.adminStartHourIdx].value, 9);
  assert.strictEqual(patch.adminStartMinIdx, 20);
  assert.strictEqual(patch.adminEndMinIdx, 50);
}

// 加载真实页面方法，验证异步测量与手势结束竞态；不冒充设备渲染测试。
let definition, rectCallback, response;
const frames = [];
const base = path.resolve(__dirname, '../miniprogram/subpackages/venue/pages/venueManage');
vm.runInNewContext(fs.readFileSync(path.join(base, 'venueManage.js'), 'utf8'), {
  Page: value => { definition = value; }, console, setTimeout, clearTimeout,
  require: name => {
    if (name.includes('adminTimeSelection')) return selection;
    if (name.includes('locales/')) return require(path.resolve(base, name));
    if (name.endsWith('/api')) return { callFunction: async () => response, showShortToast() {}, getErrorText: () => '' };
    if (name.endsWith('/orgSession')) return { beginRequest: () => ({}), isRequestCurrent: () => true };
    return {};
  },
  wx: { showLoading() {}, hideLoading() {}, nextTick: fn => frames.push(fn),
    createSelectorQuery: () => ({ select: value => {
      assert.strictEqual(value, '.admin-timeline-drag .timeline-bar');
      return { boundingClientRect: fn => { rectCallback = fn; return { exec() {} }; } };
    } }) }
});
const page = Object.assign({}, definition, { data: Object.assign({}, definition.data),
  setData(update) { Object.assign(this.data, update); } });
Object.assign(page.data, selection.patch(day, '09:00', '10:00'), { _adminDayData: day, adminBookingVisible: true });
const touch = x => ({ currentTarget: { dataset: { handle: 'start' } }, touches: [{ clientX: x }] });
page.onAdminTimelineStart(touch(50));
page.onAdminTimelineEnd();
rectCallback({ left: 0, width: 240 });
assert.strictEqual(page._adminTimelineDrag, null);
// 松手早于尺寸返回也必须保留最后位置，不能依赖调试模式放慢事件。
page.onAdminTimelineStart(touch(50));
page.onAdminTimelineEnd({ type: 'touchend', changedTouches: [{ clientX: 55 }] });
rectCallback({ width: 240 });
assert.strictEqual(page.data.adminBookingTimeStart, '09:30');
assert.strictEqual(page._adminTimelineDrag, null);
Object.assign(page.data, selection.patch(day, '09:00', '10:00'));
page.onAdminTimelineStart(touch(50));
page.onAdminTimelineEnd({ type: 'touchcancel', changedTouches: [{ clientX: 55 }] });
rectCallback({ width: 240 });
assert.strictEqual(page.data.adminBookingTimeStart, '09:00');
// 新手势或关闭窗口必须作废旧测量，不得迟到写回。
page.onAdminTimelineStart(touch(50));
page.onAdminTimelineEnd({ changedTouches: [{ clientX: 55 }] });
const oldMeasure = rectCallback;
page.onAdminTimelineStart(touch(70));
oldMeasure({ width: 240 });
assert.strictEqual(page.data.adminBookingTimeStart, '09:00');
page.closeAdminBooking();
rectCallback({ width: 240 });
assert.strictEqual(page._adminTimelineDrag, null);
page.data.adminBookingVisible = true;
page.onAdminTimelineStart(touch(50));
rectCallback({ left: 0, width: 240 });
assert.strictEqual(page.data.adminBookingTimeStart, '09:00');
page.onAdminTimelineMove(touch(55));
frames.splice(0).forEach(fn => fn());
assert.strictEqual(page.data.adminBookingTimeStart, '09:30');
assert.strictEqual(page.data.adminStartMinIdx, 30);
page.onAdminTimelineMove(touch(80));
frames.splice(0).forEach(fn => fn());
assert.strictEqual(page.data.adminBookingTimeStart, '09:30');
page.closeAdminBooking();
assert.strictEqual(page._adminTimelineDrag, null);

(async () => {
  response = { status: 'success', dailySchedules: [day] };
  page.data.adminBookingVisible = true;
  page.data.adminBookingTimeEnd = '';
  await page._loadAdminAvailability('2026-09-12', '09:00');
  assert.strictEqual(page.data.adminBookingTimeEnd, '10:00');
  assert.ok(page.data.adminTimelineSelection);
  response = { status: 'success', dailySchedules: [] };
  await page._loadAdminAvailability('2026-09-13', '09:00');
  assert.strictEqual(page.data.adminTimelineBlocks.length, 0);
  assert.strictEqual(page.data.adminTimelineSelection, null);
  console.log('管理员时间选择：区间、三档宽度、初始值、双向同步与迟到回调回归通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
