'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadPage(relative, dependencies) {
  const filename = path.resolve(__dirname, '../../miniprogram/subpackages', relative);
  const localRequire = createRequire(filename);
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; },
    require(name) {
      const basename = name.split('/').at(-1);
      if (dependencies[basename]) return dependencies[basename];
      if (name.includes('/locales/') || ['authorizationEntryView', 'messageFactsView'].includes(basename)) return localRequire(name);
      return {};
    }
  }, { filename });
  return Object.assign({}, definition, { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } });
}

test('共享身份卡的姓名、工作角色和配色随同一会话变化，页面旧配色不能覆盖身份', () => {
  const filename = path.resolve(__dirname, '../../miniprogram/components/workspace-hero/workspace-hero.js');
  const localRequire = createRequire(filename);
  let definition;
  let snapshot = { role: 'admin', contextId: 'admin', orgName: 'Organization A' };
  const handlers = new Map();
  const dependencies = {
    orgSession: { getSnapshot: () => snapshot },
    eventBus: { on: (name, handler) => handlers.set(name, handler), off: name => handlers.delete(name) },
    authContext: {
      getRuntimeProfile: role => ({ name: role === 'admin' ? 'Admin A' : 'Member B', assignmentLabel: role === 'user' ? 'Department B' : '' }),
      getWorkContexts: () => [{ contextId: 'admin', name: 'Administrator' }, { contextId: 'member', name: 'Department B' }]
    },
    trustedNavigation: {}
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Component: value => { definition = value; },
    require: name => dependencies[name.split('/').at(-1)] || localRequire(name)
  }, { filename });
  const component = Object.assign({}, definition.methods, {
    data: { ...definition.data, tone: 'blue' },
    setData(patch) { Object.assign(this.data, patch); }
  });
  definition.lifetimes.attached.call(component);
  assert.equal(component.data.resolvedTone, 'admin');
  assert.equal(component.data.personName, 'Admin A');
  assert.equal(component.data.identityName, 'Administrator');
  assert.equal(handlers.size, 3);

  component.data.tone = 'admin';
  snapshot = { role: 'user', contextId: 'member', orgName: 'Organization B' };
  handlers.get('auth:selectionChanged')();
  assert.equal(component.data.resolvedTone, 'blue');
  assert.equal(component.data.personName, 'Member B');
  assert.equal(component.data.identityName, 'Department B');
  assert.equal(component.data.organizationName, 'Organization B');

  snapshot = { role: 'admin', contextId: 'admin', orgName: 'Organization A' };
  definition.pageLifetimes.show.call(component);
  assert.equal(component.data.resolvedTone, 'admin');
  assert.equal(component.data.personName, 'Admin A');
  snapshot = { role: '', contextId: '', orgName: '' };
  component[definition.properties.tone.observer]();
  assert.equal(component.data.resolvedTone, 'admin');
  component.data.tone = 'unknown';
  component[definition.properties.tone.observer]();
  assert.equal(component.data.resolvedTone, 'blue');
  definition.lifetimes.detached.call(component);
  assert.equal(handlers.size, 0);
});

test('门户同岗位返回时保留入口，丢弃迟到权限结果，明确撤权后清空', async () => {
  let sequence = 0;
  let fetchAccess = async () => { throw new Error('network'); };
  const page = loadPage('main/pages/portal/portal.js', {
    orgSession: { beginRequest: () => ++sequence, isRequestCurrent: (_page, request) => sequence === request, invalidateRequests: () => sequence++ },
    authorizationAccess: { readCurrentAuthorizationAccess: () => fetchAccess() },
    deviceMetadata: { cancel() {} },
    deviceMetadataReport: { cancel() {} },
    passwordBindingOffer: { cancel() {} }
  });
  page.refreshCurrentUser = () => {};
  page.stopPolling = () => {};
  page._modernAccess = { mode: 'enforced', canManageAuthorization: true };
  page._authorizationEntryAllowed = true;
  page._isPageVisible = true;
  await page.refreshAuthorizationEntry();
  assert.equal(page._authorizationEntryAllowed, true);

  let finish;
  fetchAccess = () => new Promise(resolve => { finish = resolve; });
  const pending = page.refreshAuthorizationEntry();
  page.onHide();
  finish({ mode: 'enforced', canManageAuthorization: false });
  await pending;
  assert.equal(page._authorizationEntryAllowed, true);

  page._isPageVisible = true;
  fetchAccess = async () => ({ mode: 'enforced', canManageAuthorization: false });
  await page.refreshAuthorizationEntry();
  assert.equal(page._authorizationEntryAllowed, false);
});

test('门户每次搜索只提交一次视图更新，时区变化只重排已显示的消息', () => {
  let offset = 8;
  const page = loadPage('main/pages/portal/portal.js', {
    api: { formatAuditTime: value => value + ':' + offset },
    trustedNavigation: { isTrustedRoute: () => false }
  });
  const patches = [];
  page.setData = patch => { patches.push(patch); Object.assign(page.data, patch); };
  const cards = [{ label: 'Audit' }, { label: 'Calendar' }];
  page.data.portalCards = cards;
  page.onAppSearchInput({ detail: { value: 'audit' } });
  assert.equal(patches.length, 1);
  assert.equal(page.data.filteredPortalCards.length, 1);
  assert.equal(page.data.filteredPortalCards[0], cards[0]);
  page.clearAppSearch();
  assert.equal(patches.length, 2);
  assert.equal(page.data.filteredPortalCards, cards);

  page.onShow = () => assert.fail('时区变化不能触发门户重新加载');
  page.data.notifications = [{ id: 'notice', createdAt: 'instant', _showDelete: true, _swipeX: -72 }];
  page.data.notificationNextCursor = 'page-2';
  offset = 9;
  page.onSystemTimezoneChanged();
  assert.equal(patches.length, 3);
  assert.equal(page.data.notifications[0].createdAtText, 'instant:9');
  assert.equal(page.data.notifications[0]._showDelete, true);
  assert.equal(page.data.notifications[0]._swipeX, -72);
  assert.equal(page.data.notificationNextCursor, 'page-2');
});

test('日程返回时保留当前日期、筛选和结果，换岗位后清空结果并重新加载', () => {
  let switched = false;
  let invalidated = 0;
  const page = loadPage('workspace/pages/calendar/calendar.js', {
    orgSession: { consume: () => ({ changed: switched }), invalidateRequests: () => invalidated++ }
  });
  let reads = 0;
  page.load = () => reads++;
  const visibleItems = [{ id: 'event' }];
  page.setData({ visibleItems, mode: 'week', selected: '2026-11-23', query: 'test', loading: true });
  page.onHide();
  assert.equal(page.data.visibleItems, visibleItems);
  assert.equal(page.data.loading, false);
  page.onShow();
  assert.equal(page.data.visibleItems, visibleItems);
  assert.equal(page.data.mode, 'week');
  assert.equal(page.data.selected, '2026-11-23');
  assert.equal(page.data.query, 'test');
  assert.equal(reads, 1);
  switched = true;
  page.onShow();
  assert.equal(page.data.visibleItems.length, 0);
  assert.equal(reads, 2);
  assert.equal(invalidated, 2);
});

test('从复制记录的子页面返回重新读取原记录，换组织只读新列表', () => {
  let changed = false;
  const page = loadPage('org/pages/organizationCopy/organizationCopy.js', {
    orgSession: { consume: () => ({ changed, snapshot: { role: 'admin' } }), invalidateRequests() {} }
  });
  let opened;
  let loads = 0;
  page.openDraft = id => { opened = id; };
  page.load = () => { loads++; };
  page.setData({ draft: { id: 'copy-record' }, tab: 'drafts' });
  page.onHide();
  assert.equal(page.data.draft, null);
  page.onShow();
  assert.equal(opened, 'copy-record');
  assert.equal(page.data.tab, 'drafts');
  assert.equal(loads, 0);
  page.setData({ draft: { id: 'copy-record' } });
  page.onHide();
  changed = true;
  page.onShow();
  assert.equal(loads, 1);
  assert.equal(page.data.draft, null);
});
