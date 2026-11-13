const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const time = require('../../miniprogram/utils/dateTime');
const detail = require('../../miniprogram/subpackages/venue/utils/venueBookingDetail');
const loadVenueManagementPage = require('../../scripts/lib/loadVenueManagementPage');

function loadPage(name) {
  const base = path.resolve(__dirname, '../../miniprogram/subpackages/venue/pages', name);
  let definition;
  const environment = {
    Page(value) { definition = value; }, console, setTimeout, clearTimeout,
    require(request) {
      if (request.endsWith('/venueBookingDetail')) return detail;
      if (request.endsWith('/dateTime')) return time;
      if (request.includes('locales/')) return require(path.resolve(base, request));
      return {};
    }
  };
  if (name === 'venueManage') definition = loadVenueManagementPage(environment);
  else vm.runInNewContext(fs.readFileSync(path.join(base, name + '.js'), 'utf8'), environment);
  assert.ok(definition);
  return Object.assign({}, definition, { data: { scheduleVenueName: '测试场地' }, setData(patch) { Object.assign(this.data, patch); } });
}

const pages = ['venueBooking', 'venueManage'].map(loadPage);
for (const offset of [-12, 0, 8, 12]) {
  time.setSystemTimezoneConfig(offset, 'activity-test');
  const shifted = value => new Date(Date.parse(value) + offset * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const cases = [
    ['2026-12-31T18:20:37Z', shifted('2026-12-31T18:20:37Z')],
    ['2027-01-01T00:40:58Z', shifted('2027-01-01T00:40:58Z')],
    ['2035-01-01 12:00', '2035-01-01 12:00'],
    ['2035-01-01 24:00', '2035-01-02 00:00']
  ];
  for (const [value, expected] of cases) assert.strictEqual(detail.formatActivityOccurrence(value), expected);
  for (const page of pages) {
    for (const [value, expected] of cases) {
      page.viewActivityScheduleDetail({ name: '活动', occurrenceStart: value, occurrenceEnd: value, cycleType: 'daily', cycleValues: {} });
      const [date, clock] = expected.split(' ');
      const [year, month, day] = date.split('-').map(Number);
      assert.strictEqual(page.data.activityDetail.occurrenceTime, `${year}年${month}月${day}日 ${clock}-${clock}`);
      assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(page.data.activityDetail.occurrenceTime));
      assert.strictEqual(page.data.activityDetail.venueName, '测试场地');
      page.closeActivityDetail();
      assert.strictEqual(page.data.activityDetailVisible, false);
      assert.strictEqual(page.data.activityDetail, null);
    }
    const activity = {name:'活动',occurrenceStart:'2035-01-01 16:30',occurrenceEnd:'2035-01-01 18:30',cycleType:'daily',cycleValues:{periodStartDate:'2035-01-01',periodStartTime:'16:30',periodEndDate:'2035-01-01',periodEndTime:'18:30'}};
    const original = JSON.stringify(activity);
    page.viewActivityScheduleDetail(activity);
    assert.strictEqual(page.data.activityDetail.cycleLabel, '重复活动有效期：2035年1月1日 16:30-18:30');
    assert.strictEqual(JSON.stringify(activity), original);
    page.closeActivityDetail();
  }
  assert.strictEqual(detail.formatActivityTimeRange('2035-01-01 12:00', '2035-01-01 18:30'), '2035年1月1日 12:00-18:30');
  assert.strictEqual(detail.formatActivityTimeRange('2035-01-01 23:00', '2035-01-01 24:00'), '2035年1月1日 23:00-2035年1月2日 00:00');
  assert.strictEqual(detail.formatActivityTimeRange('2035-01-01 12:00', '2035-01-01 18:30', {endReviewStatus:'review_required'}), '2035年1月1日 12:00-2035年1月1日 18:30 · 时间待核对');
}
time.clearSystemTimezoneConfig();
console.log('两处真实小程序活动详情：四个系统时区、跨年 ISO、旧墙上时间、午夜及关闭通过');
