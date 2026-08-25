const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const venuePagesRoot = path.resolve(__dirname, '..');
const manageJs = fs.readFileSync(path.join(__dirname, 'venueManage.js'), 'utf8');
const manageWxml = fs.readFileSync(path.join(__dirname, 'venueManage.wxml'), 'utf8');
const bookingJs = fs.readFileSync(path.join(venuePagesRoot, 'venueBooking', 'venueBooking.js'), 'utf8');
const pendingJs = fs.readFileSync(path.join(venuePagesRoot, 'pendingVenueApprovals', 'pendingVenueApprovals.js'), 'utf8');

test('两个事由输入入口均限制 200 字且提交按 Unicode 字符复核', () => {
  assert.equal((manageWxml.match(/maxlength="200"/g) || []).length, 2);
  assert.match(manageJs, /function unicodeLength\(value\) \{\s+return Array\.from\(String\(value \|\| ''\)\)\.length;/);
  assert.match(manageJs, /unicodeLength\(normalizedText\) > BOOKING_PURPOSE_MAX_LENGTH/);
  assert.match(manageJs, /showShortToast\(localeCopy\.bookingPurposeTooLong\);\s+return;/);
});

test('两个事由删除入口共用一次确认且取消不请求', () => {
  assert.equal((manageWxml.match(/(?:bindtap|catchtap)="deletePurpose"/g) || []).length, 2);
  const handlerStart = manageJs.indexOf('deletePurpose(e)');
  const executorStart = manageJs.indexOf('async _deletePurposeTarget(target)', handlerStart);
  const handlerSource = manageJs.slice(handlerStart, executorStart);
  assert.match(handlerSource, /Object\.freeze\(\{ id:/);
  assert.match(handlerSource, /wx\.showModal\(/);
  assert.match(handlerSource, /if \(!modalResult\.confirm\) return;/);
  assert.doesNotMatch(handlerSource, /callFunction/);
  assert.match(manageJs.slice(executorStart), /name: 'deleteVenueBookingPurpose'/);
});

for (const [name, source, loadMethod, channel] of [
  ['场地借用页', bookingJs, 'loadPendingData', 'venueApprovalSyncDelay'],
  ['独立待审批页', pendingJs, 'loadData', 'pendingVenueApprovalSyncDelay']
]) {
  test(name + '的延迟同步只保留一个句柄并受生命周期和上下文保护', () => {
    assert.match(source, /_scheduleApprovalSync\(\) \{\s+this\._clearApprovalSyncTimer\(\);/);
    assert.match(source, new RegExp("orgSession\\.beginRequest\\(this, '" + channel + "'\\)"));
    assert.match(source, /if \(!this\._isPageVisible \|\| !orgSession\.isRequestCurrent\(this, request\)\) return;/);
    assert.match(source, new RegExp('this\\.' + loadMethod + '\\(\\);'));
    assert.match(source, /onHide\(\) \{[\s\S]*?_clearApprovalSyncTimer\(\)/);
    assert.match(source, /onUnload\(\) \{[\s\S]*?_clearApprovalSyncTimer\(\)/);
    assert.match(source, /if \(organizationState\.changed\) \{\s+this\._clearApprovalSyncTimer\(\);/);
    assert.doesNotMatch(source, new RegExp("setTimeout\\(function\\(\\) \\{ (?:that\\.)?" + loadMethod));
  });
}
