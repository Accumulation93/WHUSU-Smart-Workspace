const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const pageJs = fs.readFileSync(path.join(__dirname, 'myVenueBookings.js'), 'utf8');
const pageWxml = fs.readFileSync(path.join(__dirname, 'myVenueBookings.wxml'), 'utf8');
const pageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'myVenueBookings.json'), 'utf8'));

test('通知参数会在列表加载后自动打开指定借用的统一详情', () => {
  assert.match(pageJs, /query\.bookingId \|\| query\.id/);
  assert.match(pageJs, /this\._openPendingBooking\(bookings\)/);
  assert.match(pageWxml, /<venue-booking-detail booking="\{\{bookingDetail\}\}"><\/venue-booking-detail>/);
  assert.equal(
    pageJson.usingComponents['venue-booking-detail'],
    '/subpackages/venue/components/venueBookingDetail/venueBookingDetail'
  );
});

test('借用卡片可打开详情且取消与结束操作互斥呈现', () => {
  assert.match(pageWxml, /bindtap="openBookingDetail"/);
  assert.match(pageWxml, /wx:if="\{\{item\._canCancel\}\}"[\s\S]*catchtap="cancelBooking"/);
  assert.match(pageWxml, /wx:if="\{\{item\._canEnd\}\}"[\s\S]*catchtap="endBooking"/);
  const sandbox = { prepareVenueBookingDetail: booking => ({ ...booking, displayStatus: booking.status }) };
  runInNewContext(pageJs.slice(pageJs.indexOf('function decorateBooking('), pageJs.indexOf('function getNextStatusBoundary(')), sandbox);
  assert.equal(sandbox.decorateBooking({ status: 'pending', canCancel: false })._canCancel, false);
  assert.equal(sandbox.decorateBooking({ status: 'pending', canCancel: true })._canCancel, true);
  assert.equal(sandbox.decorateBooking({ status: 'approved' })._canCancel, true);
  assert.equal(sandbox.decorateBooking({ status: 'inUse', canEnd: false })._canEnd, false);
  assert.equal(sandbox.decorateBooking({ status: 'inUse', canEnd: true })._canEnd, true);
  assert.equal(sandbox.decorateBooking({ status: 'completed', canEnd: true })._canEnd, false);
  assert.match(pageJs, /name: 'cancelVenueBooking'/);
  assert.match(pageJs, /name: 'endVenueBooking'/);
});

for (const lifecycle of ['onHide', 'onUnload']) {
  test(`${lifecycle} 清理边界定时器与事件监听并丢弃迟到的列表响应`, async t => {
    const originalWx = global.wx;
    global.wx = { getStorageSync: () => undefined };
    t.after(() => {
      if (originalWx === undefined) delete global.wx;
      else global.wx = originalWx;
    });

    const startsAt = Date.parse('2026-11-24T10:00:00+08:00');
    const endsAt = startsAt + 6000;
    const boundary = lifecycle === 'onHide' ? startsAt : endsAt;
    const now = boundary - 3000;
    const scheduled = [];
    const cleared = [];
    const removed = [];
    const pageRequire = createRequire(__filename);
    let resolveBookings;
    let page;

    runInNewContext(pageJs, {
      Page: definition => { page = definition; },
      require(request) {
        if (request === '../../../../utils/api') {
          return {
            callFunction({ name }) {
              assert.equal(name, 'listMyVenueBookings');
              return new Promise(resolve => { resolveBookings = resolve; });
            }
          };
        }
        if (request === '../../../../utils/eventBus') return { off: (...args) => removed.push(args) };
        return pageRequire(request);
      },
      Date: { now: () => now },
      setTimeout(callback, delay) {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      clearTimeout(id) { cleared.push(id); }
    });

    const originalBooking = {
      id: 'existing-booking',
      status: 'approved',
      fullTimeStart: new Date(startsAt).toISOString(),
      fullTimeEnd: new Date(endsAt).toISOString()
    };
    page.data.bookings = [originalBooking];
    page.setData = (patch, done) => {
      Object.assign(page.data, patch);
      if (done) done();
    };
    page._isPageVisible = true;
    const listener = page.loadBookings.bind(page);
    page._boundVenueChanged = listener;
    page._scheduleStatusRefresh();
    assert.equal(scheduled.length, 1);
    assert.ok(scheduled[0].delay >= 3000 && scheduled[0].delay < 3100);
    const pending = page.loadBookings();
    assert.equal(page.data.loading, true);

    page[lifecycle]();
    assert.equal(page._isPageVisible, false);
    assert.equal(page._statusRefreshTimer, null);
    assert.deepEqual(cleared, [1]);
    assert.deepEqual(removed, [['venue:changed', listener]]);
    assert.equal(page._boundVenueChanged, null);
    page._scheduleStatusRefresh();
    assert.equal(scheduled.length, 1);

    resolveBookings({ status: 'success', bookings: [] });
    await pending;
    assert.equal(page.data.bookings.length, 1);
    assert.equal(page.data.bookings[0], originalBooking);
  });
}
