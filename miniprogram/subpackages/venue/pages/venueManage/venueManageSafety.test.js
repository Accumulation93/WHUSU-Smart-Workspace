const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const venuePagesRoot = path.resolve(__dirname, '..');
const manageJs = fs.readFileSync(path.join(__dirname, 'venueManagementBehavior.js'), 'utf8');
const manageWxml = fs.readFileSync(path.join(__dirname, 'venueManagementContent.wxml'), 'utf8');
const bookingJs = fs.readFileSync(path.join(venuePagesRoot, 'venueBooking', 'venueBooking.js'), 'utf8');
const pendingJs = fs.readFileSync(path.resolve(venuePagesRoot, '../components/pendingApprovals/pendingApprovals.js'), 'utf8');
const pendingConfig = JSON.parse(fs.readFileSync(path.join(venuePagesRoot, 'pendingVenueApprovals', 'pendingVenueApprovals.json'), 'utf8'));
assert.equal(pendingConfig.usingComponents['pending-approvals'], '/subpackages/venue/components/pendingApprovals/pendingApprovals');
assert.match(fs.readFileSync(path.join(venuePagesRoot, 'pendingVenueApprovals', 'pendingVenueApprovals.wxml'), 'utf8'), /<pending-approvals /);

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

test('常用事由编辑态提供明确取消并恢复新增表单', () => {
  assert.match(manageWxml, /wx:if="\{\{purposeEditId\}\}"[\s\S]*?bindtap="cancelPurposeEdit"/);
  assert.match(manageJs, /cancelPurposeEdit\(\) \{\s+this\.setData\(\{ purposeEditId: '', purposeEditText: '' \}\);\s+\}/);
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
    if (source === pendingJs) {
      assert.match(source, /hide\(\) \{ this\._pageVisible = false; this\._syncActive\(\); \}/);
      assert.match(source, /if \(!this\.data\.active \|\| !this\._pageVisible\) \{ this\._suspend\(\); return; \}/);
      assert.match(source, /detached\(\) \{\s+this\._attached = false;\s+this\._suspend\(\);/);
      assert.match(source, /_suspend\(\) \{\s+this\._isPageVisible = false;\s+orgSession\.invalidateRequests\(this\);\s+this\._clearApprovalSyncTimer\(\);/);
    } else {
      assert.match(source, /onHide\(\) \{[\s\S]*?_clearApprovalSyncTimer\(\)/);
      assert.match(source, /onUnload\(\) \{[\s\S]*?_clearApprovalSyncTimer\(\)/);
    }
    assert.match(source, /if \(organizationState\.changed\) \{\s+this\._clearApprovalSyncTimer\(\);/);
    assert.doesNotMatch(source, new RegExp("setTimeout\\(function\\(\\) \\{ (?:that\\.)?" + loadMethod));
  });
}
