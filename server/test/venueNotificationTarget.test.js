const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverRoot = path.resolve(__dirname, '..');
const helperSource = fs.readFileSync(
  path.join(serverRoot, 'src/modules/venue/utils/venueNotificationHelper.js'),
  'utf8'
);
const routeSource = fs.readFileSync(
  path.join(serverRoot, 'src/modules/audit/routes/notification.js'),
  'utf8'
);

test('新建场地状态通知的持久化 URL 携带 bookingId', () => {
  assert.match(helperSource, /\?bookingId=' \+ encodeURIComponent\(normalizedBookingId\)/);
  assert.match(helperSource, /targetUrl: buildVenueBookingTargetUrl\(booking\.id\)/);
});

test('消息列表为新旧场地通知统一补齐 bookingId', () => {
  assert.match(routeSource, /myVenueBookings\?bookingId=' \+ encodeURIComponent\(targetId\)/);
  assert.match(routeSource, /booking: targetId/);
});
