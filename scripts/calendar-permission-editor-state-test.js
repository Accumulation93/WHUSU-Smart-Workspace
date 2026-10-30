'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPage(relative, respond) {
  const filename = path.resolve(__dirname, '..', relative);
  let definition;
  let revision = 0;
  const notices = [];
  const calls = [];
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; }, console,
    require(name) {
      if (name.includes('locales/')) return require(path.resolve(path.dirname(filename), name));
      if (name.endsWith('/calendarView')) return require(path.resolve(path.dirname(filename), name));
      if (name.endsWith('/orgSession')) return {
        beginRequest: () => revision, isRequestCurrent: (_, value) => revision === value,
        invalidateRequests() { revision++; }, consume: () => ({ changed: false }),
        getSnapshot: () => ({ contextId: 'context' })
      };
      if (name.endsWith('/api')) return {
        async callFunction(input) { calls.push(input); return respond(input); },
        showShortToast(value) { notices.push(value); }, getErrorText: error => error.message
      };
      return {};
    }, wx: {}
  });
  const instance = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); }
  });
  return { instance, calls, notices };
}

async function main() {
  for (const canEdit of [false, true]) {
    const loaded = loadPage('miniprogram/subpackages/workspace/pages/calendarEdit/calendarEdit.js', async input => {
      if (input.name === 'getCalendarConfiguration') return { status: 'success', timezoneOffset: 480 };
      return { status: 'success', canEdit, targets: [{ type: 'self' }], version: 1 };
    });
    const page = loaded.instance;
    page._visible = true;
    page._options = { sourceKind: 'venue_booking', sourceId: 'booking' };
    await page.load();
    assert.equal(page.data.loading, false);
    assert.equal(page.data.failed, !canEdit);
    if (!canEdit) {
      assert.ok(page.data.notice);
      await page.save();
      assert.equal(loaded.calls.some(call => call.name === 'saveCalendarParticipants'), false);
    } else {
      assert.equal(page.data.draft.version, 1);
      assert.equal(page.data.draft.targets[0].type, 'self');
    }
  }
  for (const action of ['detail', 'save']) {
    let resolve;
    const response = new Promise(done => { resolve = done; });
    const loaded = loadPage('miniprogram/subpackages/org/pages/adminPermissions/adminPermissions.js', () => response);
    const page = loaded.instance;
    page._active = true;
    page.data.selectedAdmin = { id: 'admin' };
    page.data.permissionGroups = [{ permissions: [{ key: 'venue.resources', editable: true, granted: true }] }];
    let reloaded = false;
    page.loadPage = async () => { reloaded = true; };
    const pending = action === 'detail' ? page.openAdmin({ currentTarget: { dataset: { id: 'admin' } } }) : page.savePermissions();
    page.onHide();
    resolve({ status: 'success', admin: { id: 'admin' }, groups: [] });
    await pending;
    assert.equal(page.data.editorVisible, false);
    assert.equal(page.data.selectedAdmin, null);
    assert.equal(page.data.saving, false);
    assert.equal(page.data.loading, false);
    assert.equal(reloaded, false);
    assert.equal(loaded.notices.length, 0);
  }
  const active = loadPage('miniprogram/subpackages/org/pages/adminPermissions/adminPermissions.js', async () => ({ status: 'success', admin: { id: 'admin' }, groups: [] }));
  active.instance._active = true;
  active.instance.loadPage = async () => {};
  await active.instance.openAdmin({ currentTarget: { dataset: { id: 'admin' } } });
  assert.equal(active.instance.data.editorVisible, true);
  await active.instance.savePermissions();
  assert.equal(active.instance.data.editorVisible, false);
  assert.equal(active.instance.data.saving, false);
  assert.equal(active.notices.length, 1);
  console.log('编辑界面状态回归通过：参会配置授权/失权2例，权限详情/保存离页迟到2例，正常详情/保存2例；非设备渲染或后端授权测试。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
