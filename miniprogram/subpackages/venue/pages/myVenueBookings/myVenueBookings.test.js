const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
  assert.match(pageJs, /detail\._canCancel = detail\.displayStatus === 'pending' \|\| detail\.displayStatus === 'approved'/);
  assert.match(pageJs, /detail\._canEnd = detail\.displayStatus === 'inUse'/);
  assert.match(pageJs, /name: 'cancelVenueBooking'/);
  assert.match(pageJs, /name: 'endVenueBooking'/);
});

test('状态会在借用开始或结束边界到达时重新计算并清理定时器', () => {
  assert.match(pageJs, /getNextStatusBoundary\(this\.data\.bookings, now\)/);
  assert.match(pageJs, /if \(!this\._isPageVisible\) return;/);
  assert.match(pageJs, /onHide\(\) \{\s+this\._isPageVisible = false;\s+this\._clearStatusRefreshTimer\(\)/);
  assert.match(pageJs, /onUnload\(\) \{\s+this\._isPageVisible = false;[\s\S]*?this\._clearStatusRefreshTimer\(\)/);
});
