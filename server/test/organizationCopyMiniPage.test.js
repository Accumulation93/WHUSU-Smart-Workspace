'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function harness(api) {
  const file = path.resolve(__dirname, '../../miniprogram/subpackages/org/pages/organizationCopy/organizationCopy.js');
  const localRequire = createRequire(file);
  let definition, epoch = 0;
  const versions = new Map();
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; }, wx: { pageScrollTo() {} },
    require(name) {
      if (name.endsWith('/utils/authorizationAccess')) return { readCurrentAuthorizationAccess: async () => ({ mode: 'enforced',
        grantedCapabilities: ['venue.purposes.share', 'venue.purposes.receive', 'venue.activityRules.share', 'venue.activityRules.receive'] }) };
      if (name.endsWith('/utils/api')) return { callFunction: api, getErrorText: error => error.message, showShortToast() {} };
      if (name.endsWith('/utils/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 88 }) };
      if (name.endsWith('/utils/orgSession')) return {
        consume: () => ({ snapshot: { role: 'admin' } }), getSnapshot: () => epoch, isCurrent: value => value === epoch,
        beginRequest(_page, key) { const version = (versions.get(key) || 0) + 1; versions.set(key, version); return { key, version, epoch }; },
        isRequestCurrent(_page, value) { return value.epoch === epoch && value.version === versions.get(value.key); },
        invalidateRequests() { epoch++; }
      };
      return localRequire(name);
    }
  }, { filename: file });
  const page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), setData(values) {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
  } });
  page.onLoad(); page._active = true;
  return page;
}
const event = index => ({ currentTarget: { dataset: { index } } });

test('接收重试复用请求号，显式关联后确认复制并重新读取状态', async () => {
  const calls = []; let failReceive = true, state = 'draft';
  const page = harness(async ({ name, data }) => {
    calls.push({ name, data: JSON.parse(JSON.stringify(data)) });
    if (name === 'getOrganizationConfigurationWorkspace') return { status: 'success', items: [{ id: 'share-a', version: 1, name: 'Meeting' }] };
    if (name === 'receiveOrganizationConfiguration') {
      if (failReceive) { failReceive = false; throw new Error('network'); }
      return { status: 'success', id: 'draft-a' };
    }
    if (name === 'getOrganizationConfigurationDraft') return { status: 'success', id: 'draft-a', version: 1, state, shareAvailable: true, payload: { name: 'Meeting' } };
    if (name === 'getOrganizationConfigurationCandidates') return { status: 'success', references: [{ token: 'venueId', kind: 'venue', label: 'Source venue' }], choices: { venue: [{ id: 'target', name: 'Target venue' }] } };
    if (name === 'applyOrganizationConfigurationDraft') { state = 'applied'; return { status: 'success', id: 'draft-a' }; }
    throw new Error(name);
  });
  await page.load();
  page.receive(event(0)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.busy, false); assert.equal(page.data.notice, 'network');
  page.receive(event(0)); await new Promise(resolve => setImmediate(resolve));
  const receives = calls.filter(item => item.name === 'receiveOrganizationConfiguration');
  assert.equal(receives[0].data.requestId, receives[1].data.requestId);
  assert.equal(page.data.complete, false);
  page.chooseReference({ ...event(0), detail: { value: 0 } });
  page.applyDraft();
  assert.ok(page.data.confirmation.includes('Source venue → Target venue'));
  assert.equal(calls.filter(item => item.name === 'applyOrganizationConfigurationDraft').length, 0);
  page.cancelConfirmation();
  page.applyDraft(); await page.confirm();
  assert.deepEqual(calls.find(item => item.name === 'applyOrganizationConfigurationDraft').data.references, { venueId: 'target' });
  assert.equal(page.data.draft.state, 'applied'); assert.equal(page.data.busy, false);
});

test('隐藏页面后旧复制请求不能恢复资料或清除新请求的加载状态', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const page = harness(async () => waiting);
  page.prepare('share', 'shareOrganizationConfiguration', { sourceRecordId: 'source' }, 'Confirm');
  const pending = page.confirm();
  page.onHide(); page._active = true; page.setData({ busy: true });
  release({ status: 'success' }); await pending;
  assert.equal(page.data.busy, true); assert.equal(page.data.items.length, 0); assert.equal(page.data.draft, null);
});

test('人员与岗位使用共享选择器的真实选择层级，清空不成为全部关联', async () => {
  const page = harness(async () => ({ status: 'success' }));
  page._mapping = {}; page.setData({ detailReady: true, references: [{ token: 'person', kind: 'person', label: 'Member', choices: [{ id: 'person-a', personId: 'person-a', name: 'Member' }] }] });
  page.openPicker(event(0)); assert.equal(page.data.picker.level, 'person');
  page.confirmPicker({ detail: { keys: ['person-a'] } }); assert.equal(page.data.complete, true);
  page.openPicker(event(0)); assert.equal(page.data.pickerValue.length, 1);
  page.confirmPicker({ detail: { keys: [] } }); assert.equal(page.data.complete, false);
  const template = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/subpackages/org/pages/organizationCopy/organizationCopy.wxml'), 'utf8');
  assert.ok(template.includes('selection-level="{{picker.level}}"'));
});

test('副本启用先确认目标场地，取消不写入，成功重新读取启用状态', async () => {
  const writes = []; let enabled = false;
  const page = harness(async ({ name, data }) => {
    if (name === 'getOrganizationConfigurationDraft') return { status: 'success', id: 'draft-a', kind: 'venue.openRules', state: 'applied',
      payload: { name: '来源规则' }, activation: { enabled, revision: 'a'.repeat(64), shared: true, venueName: '目标场地',
        payload: { name: '当前副本', cycleType: 'daily', cycleValues: [], timeStart: '08:00', timeEnd: '22:00' } } };
    if (name === 'enableOrganizationConfiguration') { writes.push(JSON.parse(JSON.stringify(data))); enabled = true; return { status: 'success', id: 'draft-a' }; }
    throw new Error(name);
  });
  await page.openDraft('draft-a');
  page.enableCopy();
  assert.match(page.data.confirmation, /目标场地/);
  assert.match(page.data.confirmation, /当前副本/);
  assert.match(page.data.confirmation, /所有组织/);
  page.cancelConfirmation(); assert.equal(writes.length, 0);
  page.enableCopy(); await page.confirm();
  assert.deepEqual(writes, [{ id: 'draft-a', revision: 'a'.repeat(64) }]);
  assert.equal(page.data.draft.activation.enabled, true);
  page.enableCopy(); assert.equal(page.data.confirmation, null);
});
