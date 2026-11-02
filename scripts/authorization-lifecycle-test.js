'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const storage = new Map([['activeOrgId', 'lifecycle-org'], ['activeRole', 'user'], ['activeOrgVersion', 1], ['token', 'test']]);
global.wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key), hideLoading() {}, getSystemInfoSync: () => ({ windowWidth: 390 }) };
global.Behavior = definition => definition;
const session = require('../miniprogram/utils/orgSession');
let definition;
global.Page = value => { definition = value; };
function instance(value) {
  const page = { data: {}, setData(patch) { Object.assign(this.data, patch); } };
  function merge(part) {
    for (const behavior of part.behaviors || []) merge(behavior);
    Object.assign(page.data, part.data || {}); Object.assign(page, part.methods || {});
  }
  merge(value); Object.assign(page, value); page.data = Object.assign({}, page.data);
  for (const name of ['unbindDialogKeyboard', 'releaseDialogScrollLock', 'clearPermissionCheckGuard']) page[name] = () => {};
  return page;
}
for (const relative of ['subpackages/scoring/pages/admin/admin', 'subpackages/venue/pages/venueManage/venueManage']) {
  require('../miniprogram/' + relative);
  const page = instance(definition);
  page.data.hasPermission = true; page.data.actionCapabilities = { test: true };
  session.consume(page);
  const pending = session.beginRequest(page, 'pending');
  page.onHide();
  assert.equal(session.isRequestCurrent(page, pending), false, relative + '隐藏后迟到响应必须失效');
  assert.equal(page.data.hasPermission, false);
  assert.equal(Object.keys(page.data.actionCapabilities).length, 0);
  const pendingUnload = session.beginRequest(page, 'pending');
  page.onUnload();
  assert.equal(session.isRequestCurrent(page, pendingUnload), false);
  if (relative.includes('/admin/')) {
    let refreshes = 0;
    page.workbenchShow = () => { refreshes += 1; };
    page._pageVisible = false;
    page._onOrgChanged({ role: 'admin' });
    page._pageVisible = true;
    page._onOrgChanged({ role: 'unknown' });
    assert.equal(refreshes, 0, '隐藏或非法角色不能刷新管理工作区');
    page._onOrgChanged({ role: 'user' });
    page._onOrgChanged({ role: 'admin' });
    assert.equal(refreshes, 2, '两种有效角色切换都必须重新进入统一判权');
  }
}

async function run() {
  let resolveRead;
  const filename = path.resolve(__dirname, '../miniprogram/subpackages/org/pages/assignmentNatures/assignmentNatures.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Page: value => { definition = value; }, wx: global.wx,
    require(name) {
      if (name.endsWith('/orgSession')) return session;
      if (name.endsWith('/api')) return { callFunction: () => new Promise(resolve => { resolveRead = resolve; }), getErrorText: () => 'failed' };
      if (name.endsWith('/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 80 }) };
      return {};
    }
  }, { filename });
  const page = instance(definition);
  page.onShow();
  page.onHide();
  resolveRead({ status: 'success', list: [{ id: 'late' }], canCreate: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.rows.length, 0, '岗位性质隐藏后的迟到目录不得恢复');
  page.onShow();
  resolveRead({ status: 'success', list: [{ id: 'current' }], canCreate: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.rows[0].id, 'current', '重新进入可读取新目录');
  page.onUnload();
  assert.equal(page.data.rows.length, 0);
  console.log('授权生命周期：2个真实Page/Behavior隐藏卸载及岗位性质迟到读取、重新进入通过');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
