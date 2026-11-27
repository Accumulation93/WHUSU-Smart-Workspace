'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function mount(relative, respond = async () => ({ status: 'success' })) {
  const filename = path.resolve(__dirname, '../../miniprogram/subpackages/workspace', relative);
  const calls = [], events = [], routes = [];
  let definition, revision = 0;
  const session = { consume: () => ({ changed: false }), getSnapshot: () => ({ contextId: 'context' }),
    beginRequest: () => revision, invalidateRequests: () => revision++, isRequestCurrent: (_, id) => id === revision };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; }, Component(value) { definition = value; },
    wx: { navigateTo: input => routes.push(input.url), redirectTo: input => routes.push(input.url) },
    require(request) {
      if (request.endsWith('/orgSession')) return session;
      if (request.endsWith('/navigationBarMetrics')) return { getNavigationBarMetrics: () => ({ totalHeight: 64 }) };
      if (request.endsWith('/eventBus')) return { on() {}, off() {} };
      if (request.endsWith('/dateTime')) return { ...require('../../miniprogram/utils/dateTime'), formatAbsoluteDate: () => '2026-11-27' };
      if (request.endsWith('/api')) return { callFunction: async input => { calls.push(input); return respond(input); }, getErrorText: error => error.message, createResultError: result => new Error(result.status) };
      return require(path.resolve(path.dirname(filename), request));
    }
  }, { filename });
  const instance = { ...(definition.methods || definition), data: JSON.parse(JSON.stringify(definition.data)), _visible: true,
    setData(values) { for (const [key, value] of Object.entries(values)) { const parts = key.split('.'); let target = this.data; while (parts.length > 1) { const part = parts.shift(); target = target[part] || (target[part] = {}); } target[parts[0]] = value; } }, triggerEvent(name, detail) { events.push({ name, detail }); } };
  return { instance, definition, calls, events, routes, session };
}

test('calendar participant settings distinguish readonly from failure and allow retry without saving', async () => {
  let canEdit = false;
  const { instance: editor, calls, events } = mount('components/calendar-editor/calendar-editor.js', async input =>
    input.name === 'getCalendarConfiguration' ? { status: 'success', timezoneOffset: 480 }
      : { status: 'success', canEdit, targets: [{ type: 'self' }], version: 1 });
  editor.initialize({ sourceKind: 'venue_activity', sourceId: 'activity' });
  await editor.load();
  assert.equal(editor.data.readonly, true);
  assert.equal(editor.data.failed, false);
  assert.equal(editor.data.notice, require('../../shared/locales/zh-CN/calendar').participantSettingsReadOnly);
  await editor.save();
  assert.ok(!calls.some(call => call.name === 'saveCalendarParticipants'));
  editor.back();
  assert.equal(events.at(-1).name, 'cancel');
  canEdit = true;
  await editor.load();
  assert.equal(editor.data.readonly, false);
  assert.equal(editor.data.failed, false);
  assert.equal(editor.data.draft.version, 1);
});

test('calendar scope switching restores separate dates, recurrence, participants and picker state before save', async () => {
  const view = require('../../shared/calendarView');
  const form = { ...view.blank('2026-11-02'), title: 'Series', recurrence: { frequency: 'weekly', interval: 1, weekdays: [1], count: 5 } };
  const detail = { id: 'event', version: 3, occurrenceDate: '2026-11-09', canUpdate: true,
    startAt: '2026-11-10T03:00:00Z', endAt: '2026-11-10T04:00:00Z', form: { ...form, title: 'Moved instance', reminders: [30] },
    seriesForm: form, targets: [{ type: 'self' }], visibility: 'private' };
  const { instance: editor, calls } = mount('components/calendar-editor/calendar-editor.js', async input => {
    if (input.name === 'getCalendarConfiguration') return { status: 'success', timezoneOffset: 480 };
    if (input.name === 'getCalendar') return { status: 'success', items: [detail] };
    return { status: 'success', id: detail.id };
  });
  editor.initialize({ id: detail.id, date: detail.occurrenceDate });
  await editor.load();
  assert.equal(editor.data.draft.startDate, '2026-11-10');
  editor.field({ currentTarget: { dataset: { field: 'title' } }, detail: { value: 'Instance draft' } });
  editor.scope({ detail: { value: '2' } });
  assert.equal(editor.data.draft.title, 'Series');
  assert.equal(editor.data.draft.startDate, '2026-11-02');
  assert.equal(editor.data.endMode, 2);
  editor.frequency({ detail: { value: '1' } });
  editor.targets({ detail: { value: [{ type: 'people', personIds: ['other'] }] } });
  editor.allDay({ detail: { value: true } });
  editor.endMode({ detail: { value: '1' } });
  editor.reminder({ detail: { value: '6' } });
  editor.scope({ detail: { value: '1' } });
  assert.equal(editor.data.draft.title, 'Instance draft');
  assert.equal(editor.data.draft.startDate, '2026-11-10');
  assert.equal(editor.data.draft.allDay, false);
  assert.equal(editor.data.frequencyIndex, 2);
  assert.equal(editor.data.endMode, 2);
  assert.equal(editor.data.reminderIndex, 4);
  assert.equal(editor.data.weekdays[0].selected, true);
  assert.equal(editor.data.draft.targets[0].type, 'self');
  editor.scope({ detail: { value: '2' } });
  assert.equal(editor.data.frequencyIndex, 1);
  assert.equal(editor.data.draft.allDay, true);
  assert.equal(editor.data.endMode, 1);
  assert.equal(editor.data.reminderIndex, 6);
  editor.scope({ detail: { value: '0' } });
  await editor.save();
  const saved = calls.find(call => call.name === 'saveCalendarEvent').data;
  assert.equal(saved.scope, 'instance');
  assert.equal(saved.occurrenceDate, '2026-11-09');
  assert.equal(saved.startDate, '2026-11-10');
  assert.equal(saved.recurrence.frequency, 'weekly');
  assert.equal(saved.recurrence.count, 5);
  assert.deepEqual(Array.from(saved.reminders), [30]);
  editor.dispose();
  assert.equal(editor._scopeDrafts, null);
});

test('calendar top tabs stay in one page and preserve the calendar while editing', () => {
  const { instance: page, routes } = mount('pages/calendar/calendar.js');
  page.onLoad({ date: '2026-11-02', mode: 'week' });
  page.data.metadata.permissions = { rules: true };
  page.load = () => {};
  for (const tab of ['rules', 'system', 'calendar']) {
    page.switchTab({ currentTarget: { dataset: { tab } } });
    assert.equal(page.data.activeTab, tab);
  }
  page.create();
  page.switchTab({ currentTarget: { dataset: { tab: 'system' } } });
  assert.equal(page.data.activeTab, 'calendar');
  assert.equal(page.data.editorOptions.date, '2026-11-02');
  page.closeEditor();
  assert.equal(page.data.selected, '2026-11-02');
  assert.equal(page.data.mode, 'week');
  assert.deepEqual(routes, []);
  page.data.metadata.permissions.rules = false;
  page.rules();
  assert.equal(page.data.activeTab, 'calendar');
  page.clear();
  assert.deepEqual(Object.keys(page.data.rulesOptions), []);
});

test('legacy calendar entries replace themselves and retain source and rule copy arguments', () => {
  for (const [name, area] of [['calendarEdit', 'edit'], ['calendarRules', 'rules'], ['calendarSystem', 'system'], ['calendarDetail', 'detail']]) {
    const { instance: page, routes } = mount(`pages/${name}/${name}.js`);
    page.onLoad({ id: 'event', date: '2026-11-02', sourceKind: 'venue_activity', sourceId: 'a+b', copyKind: 'calendar.rules', copyId: 'rule' });
    const query = new URLSearchParams(routes[0].split('?')[1]);
    assert.equal(query.get('area'), area);
    assert.equal(query.get('sourceId'), 'a+b');
    assert.equal(query.get('copyId'), 'rule');
    assert.equal(query.get('date'), '2026-11-02');
  }
});

test('calendar detail opens in place and editing keeps the selected period', () => {
  const { instance: page, routes } = mount('pages/calendar/calendar.js');
  page.onLoad({ date: '2026-11-02', mode: 'week' });
  page.open({ currentTarget: { dataset: { id: 'event', date: '2026-11-04' } } });
  assert.equal(page.data.detailOptions.managed, false);
  page.editDetail({ detail: { id: 'event', date: '2026-11-04' } });
  assert.equal(page.data.detailOptions, null);
  assert.equal(page.data.editorOptions.id, 'event');
  assert.equal(page.data.selected, '2026-11-02');
  assert.equal(page.data.mode, 'week');
  assert.deepEqual(routes, []);
});

test('calendar viewing scope sends only the selected scope and restores own scope after permission loss', async () => {
  let allowed = true;
  const { instance: page, calls } = mount('pages/calendar/calendar.js', async input => input.name === 'getCalendarConfiguration'
    ? { status: 'success', permissions: { manage: allowed }, timezoneOffset: 480 } : { status: 'success', items: [] });
  page.onLoad({ date: '2026-11-02' });
  await page.load();
  assert.equal(calls.at(-1).data.managed, false);
  page.data.managed = true;
  await page.load();
  assert.equal(calls.at(-1).data.managed, true);
  allowed = false;
  await page.load();
  assert.equal(page.data.managed, false);
  assert.equal(calls.at(-1).data.managed, false);
  const count = calls.length;
  page.setManaged({ detail: { value: '1' } });
  assert.equal(calls.length, count);
});

test('calendar failed date changes never show the previous date under the new heading', async () => {
  let fail = false;
  const { instance: page } = mount('pages/calendar/calendar.js', async input => {
    if (input.name === 'getCalendarConfiguration') return { status: 'success', timezoneOffset: 480, permissions: {} };
    if (fail) throw new Error('offline');
    return { status: 'success', items: [{ id: 'event', title: 'Meeting', occurrenceDate: '2026-11-02',
      startAt: '2026-11-02T01:00:00Z', endAt: '2026-11-02T02:00:00Z', sourceKind: 'manual' }] };
  });
  page.onLoad({ date: '2026-11-02', mode: 'month' });
  await page.load();
  assert.equal(page.data.visibleItems.length, 1);
  fail = true;
  await page.load();
  assert.equal(page.data.visibleItems.length, 1);
  page.data.selected = '2026-12-02';
  await page.load();
  assert.equal(page.data.visibleItems.length, 0);
  assert.equal(page.data.days.find(day => day.selected).date, '2026-12-02');
  assert.equal(page.data.listReady, false);
  assert.equal(page.data.notice, 'offline');
  page.data.mode = 'list';
  page.render();
  assert.equal(page.data.resultsHeading, '2026-12');
  page.data.mode = 'month';
  page.render();
  assert.equal(page.data.resultsHeading, '2026-12-02');
  page.clear();
  assert.equal(page.data.listReady, false);
});

test('calendar confirmation fixes its target, retains failed action and prevents a second hidden write', async () => {
  let resolve;
  const { instance: detail, calls, events } = mount('components/calendar-detail/calendar-detail.js', () => new Promise(done => { resolve = done; }));
  detail.data.detail = { id: 'event', version: 4, occurrenceDate: '2026-11-04', attending: true, visibility: 'organization' };
  detail.confirm({ currentTarget: { dataset: { action: 'leave' } } });
  detail.data.detail.version = 5;
  detail.scope({ detail: { value: '1' } });
  const first = detail.execute();
  detail.scope({ detail: { value: '2' } });
  detail.cancel();
  detail.suspend();
  detail.resume();
  await detail.execute();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.version, 4);
  assert.equal(calls[0].data.scope, 'following');
  assert.equal(detail.data.confirmation, true);
  resolve({ status: 'conflict' });
  await first;
  assert.equal(detail.data.busy, false);
  assert.equal(detail.data.notice, 'conflict');
  assert.equal(detail.data.confirmation, true);
  const second = detail.execute();
  resolve({ status: 'success' });
  await second;
  assert.equal(events.filter(event => event.name === 'changed').length, 1);
  assert.equal(detail.data.confirmation, false);
});

test('subscription write stays locked when hidden and never exposes a late credential', async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const { instance: panel, calls } = mount('components/calendar-system/calendar-system.js', () => response);
  panel.data.confirmation = true;
  const pending = panel.execute();
  panel.suspend();
  panel.resume();
  await panel.execute();
  assert.equal(calls.length, 1);
  assert.equal(panel.data.busy, true);
  resolve({ status: 'success', url: 'https://example.invalid/private', password: 'fixture' });
  await pending;
  assert.equal(panel.data.busy, false);
  assert.equal(panel.data.subscription, null);
});

test('copied rule entry is consumed once and hidden rule drafts survive', async () => {
  const { instance: panel, events } = mount('components/calendar-rules/calendar-rules.js', async () => ({ status: 'success', canCreate: true,
    rules: [{ id: 'copy', name: 'Rule', audience: [], targets: [], actions: ['assign'], canUpdate: true, canDelete: true }] }));
  panel.initialize({ copyKind: 'calendar.rules', copyId: 'copy' });
  await panel.load();
  assert.equal(panel.data.draft.id, 'copy');
  assert.equal(events.filter(event => event.name === 'entryconsumed').length, 1);
  panel.suspend();
  panel.resume();
  assert.equal(panel.data.draft.id, 'copy');
  panel.closeEditor();
  await panel.load();
  assert.equal(panel.data.draft, null);
  assert.equal(events.filter(event => event.name === 'entryconsumed').length, 1);
});
