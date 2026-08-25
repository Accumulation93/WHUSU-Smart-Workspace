const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  BOOKING_PURPOSE_MAX_LENGTH,
  unicodeLength,
  isBookingPurposeLengthValid
} = require('../src/modules/venue/services/venueTextValidation');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/venue/routes/venueAdmin.js'),
  'utf8'
);
const localeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/locales/zh-CN/generated/modules/venue/routes/venueAdmin.js'),
  'utf8'
);

function routeSource(route, nextRoute) {
  const start = source.indexOf("router.post('" + route + "'");
  const end = nextRoute ? source.indexOf("router.post('" + nextRoute + "'", start + 1) : source.length;
  assert.ok(start >= 0, route + ' 路由必须存在');
  assert.ok(end > start, route + ' 路由边界必须有效');
  return source.slice(start, end);
}

test('事由长度按 Unicode 字符计算并拒绝第 201 个字符', () => {
  assert.equal(BOOKING_PURPOSE_MAX_LENGTH, 200);
  assert.equal(unicodeLength('甲'.repeat(200)), 200);
  assert.equal(unicodeLength('😀'.repeat(200)), 200);
  assert.equal(unicodeLength('😀'.repeat(201)), 201);
  assert.equal(isBookingPurposeLengthValid('😀'.repeat(200)), true);
  assert.equal(isBookingPurposeLengthValid('😀'.repeat(201)), false);

  const saveSource = routeSource('/saveVenueBookingPurpose', '/deleteVenueBookingPurpose');
  assert.match(saveSource, /!isBookingPurposeLengthValid\(text\)/);
  assert.match(saveSource, /status: 'invalid_params', message: localeCopy\.bookingPurposeTooLong/);
  assert.doesNotMatch(saveSource, /'事由已更新'|'事由已创建'/);
  assert.match(localeSource, /bookingPurposeTooLong:\s*["']事由内容最多填写 200 个字符["']/);
});

test('事由删除继续保留数据库引用阻断并返回 locale 提示', () => {
  const deleteSource = routeSource('/deleteVenueBookingPurpose');
  assert.match(deleteSource, /venueBookingPurposeModel\.getById\(id\)/);
  assert.match(deleteSource, /SELECT 1 FROM venue_bookings WHERE title = \? LIMIT 1/);
  assert.match(deleteSource, /\[existing\.text\]/);
  assert.match(deleteSource, /if \(referenceRows\.length\) \{\s+return res\.json\(\{ status: 'conflict', message: localeCopy\.bookingPurposeReferenced \}\);/);
  assert.match(deleteSource, /venueBookingPurposeModel\.remove\(id\)/);
  assert.match(deleteSource, /ER_ROW_IS_REFERENCED/);
  assert.match(deleteSource, /ER_ROW_IS_REFERENCED_2/);
  assert.match(deleteSource, /status: 'conflict', message: localeCopy\.bookingPurposeReferenced/);
  assert.match(localeSource, /bookingPurposeReferenced:/);
  assert.doesNotMatch(deleteSource, /message: safeString\(e\.message\)/);
});
