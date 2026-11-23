'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

test('calendar rule controls keep read, update, and delete permissions separate', async () => {
  const filename = path.resolve(__dirname, '../../miniprogram/subpackages/workspace/pages/calendarRules/calendarRules.js');
  const requests = [];
  const session = { beginRequest: () => ({}), isRequestCurrent: () => true };
  let definition;
  const fixture = { status: 'success', canCreate: false, rules: [
    { id: 'read', version: 1, name: 'Read rule', enabled: true, canUpdate: false, canDelete: false },
    { id: 'write', version: 1, name: 'Edit rule', enabled: true, canUpdate: true, canDelete: true }
  ].map(rule => ({ ...rule, audience: [], targets: [], actions: ['assign'] })) };
  vm.runInNewContext(readFileSync(filename, 'utf8'), {
    Page: value => { definition = value; },
    require(request) {
      if (request.endsWith('/orgSession')) return session;
      if (request.endsWith('/api')) return { callFunction: async options => {
        requests.push(options);
        return options.name === 'getCalendarRules' ? fixture : { status: 'success' };
      } };
      return require(path.resolve(path.dirname(filename), request));
    }
  }, { filename });
  const page = { ...definition, _visible: true, data: { ...definition.data },
    setData(values) { Object.assign(this.data, values); } };
  const event = id => ({ currentTarget: { dataset: { id } } });
  await page.load();
  page.create();
  page.edit(event('read'));
  page.duplicate(event('write'));
  page.select(event('read'));
  await page.toggle(event('read'));
  assert.equal(page.data.draft, null);
  assert.equal(page.data.selected.length, 0);
  assert.equal(requests.length, 1);
  page.edit(event('write'));
  assert.equal(page.data.draft.id, 'write');
  await page.save();
  assert.equal(requests[1].name, 'saveCalendarRule');
  assert.equal(requests[1].data.id, 'write');
  page.select(event('write'));
  page.askDelete();
  await page.remove();
  assert.equal(requests[3].name, 'batchCalendarRules');
  assert.equal(requests[3].data.rules[0].id, 'write');
});
