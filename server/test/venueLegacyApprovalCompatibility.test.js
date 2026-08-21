const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/venue/routes/venueAdmin.js'),
  'utf8'
);

function routeSource(route, nextRoute) {
  const start = source.indexOf("router.post('" + route + "'");
  const end = source.indexOf("router.post('" + nextRoute + "'", start + 1);
  assert.ok(start >= 0, route + ' 路由必须存在');
  assert.ok(end > start, nextRoute + ' 路由必须位于其后');
  return source.slice(start, end);
}

const approveSource = routeSource('/approveVenueBooking', '/rejectVenueBooking');
const rejectSource = routeSource('/rejectVenueBooking', '/listVenueBookingPurposes');

for (const endpoint of [approveSource, rejectSource]) {
  const guardIndex = endpoint.indexOf('isFlowManagedBooking(booking)');
  const authorizationIndex = endpoint.indexOf('canReviewVenueBooking(req, booking)');
  assert.ok(guardIndex >= 0, '旧审批端点必须识别流程型借用');
  assert.ok(authorizationIndex > guardIndex, '流程型借用必须在旧授权和写入前安全拒绝');
  assert.ok(endpoint.indexOf('return rejectLegacyFlowEndpoint(req, res)', guardIndex) > guardIndex);
}

assert.ok(approveSource.indexOf('// Legacy approval') >= 0, '非流程旧审批仍须保持兼容');
assert.strictEqual(
  approveSource.indexOf('SET approval_current_step = ?'),
  -1,
  '旧通过端点不得再按单一全局步骤推进流程型借用'
);
assert.strictEqual(
  rejectSource.indexOf('approval_reject_step'),
  -1,
  '旧驳回端点不得再绕过多流程状态机直接写流程驳回步骤'
);
assert.ok(source.indexOf('safeString(booking && booking.approval_flow_state_json)') >= 0);
assert.ok(source.indexOf("status: 'client_upgrade_required'") >= 0);
assert.ok(
  source.indexOf('resolveBookingApplicantAssignment(booking)') >= 0,
  '非流程旧借用也必须先确认存在不可变申请岗位引用，禁止回读 hr_info 授权'
);

console.log('场地旧审批接口兼容与多流程防绕过测试通过');
