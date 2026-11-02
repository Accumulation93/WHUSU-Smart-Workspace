'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let invalidations = 0;
const page = require('./lib/loadVenueManagementPage')({
  require(name) {
    if (name.endsWith('/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 88 }) };
    if (name.endsWith('/orgSession')) return { invalidateRequests() { invalidations++; } };
    return {};
  }, wx: { hideLoading() {} }
});
let component;
const file = path.resolve(__dirname, '../miniprogram/subpackages/venue/pages/venueManage/venueManagement.js');
vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: () => ({}), Component(value) { component = value; } }, { filename: file });
let shows = 0, keyboard = 0;
const events = [];
const host = { ...page, data: structuredClone(page.data),
  setData(patch) { Object.assign(this.data, patch); },
  preparePermissionsAndLoad() { shows++; }, bindDialogKeyboard() { keyboard++; }, unbindDialogKeyboard() {},
  releaseDialogScrollLock() { for (const key of this.data.dialogLockKeys) this.data[key] = false; },
  triggerEvent(name, detail) { events.push({ name, detail }); }
};
component.lifetimes.attached.call(host);
component.pageLifetimes.show.call(host);
assert.equal(shows, 1, 'attached 和首次 show 不能重复加载');
assert.equal(keyboard, 1);
assert.equal(host.data.navTopPx, 88);
host.data.ruleEditorVisible = true;
host.data.dialogKeyboardHeight = 260;
Object.values(component.observers)[0].call(host);
assert.equal(events.at(-1).detail.visible, true);
assert.equal(events.at(-1).detail.keyboardHeight, 260);
host.data.venues = [{ id: 'private' }];
component.pageLifetimes.hide.call(host);
assert.equal(host.data.venues.length, 0);
assert.equal(host.data.hasPermission, false);
assert.equal(host.data.ruleEditorVisible, false);
component.pageLifetimes.show.call(host);
assert.equal(shows, 2);
component.lifetimes.detached.call(host);
assert.equal(events.at(-1).detail.visible, false);
assert.equal(invalidations, 2);
console.log('场地页内管理组件：首次显示不重复请求、宿主弹窗/键盘联动、隐藏清理、重进刷新、卸载解除锁定通过。');
