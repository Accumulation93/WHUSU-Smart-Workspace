'use strict';

const assert = require('node:assert/strict');

let definition;
global.Component = component => { definition = component; };
require('../miniprogram/components/list-filter-row/list-filter-row');
delete global.Component;

function mount(range, { rangeKey = '', multiple = false, value = 0 } = {}) {
  const events = [];
  const row = {
    data: { range, rangeKey, multiple, value },
    setData(patch) { Object.assign(this.data, patch); },
    triggerEvent(name, detail) { events.push({ name, detail }); }
  };
  definition.observers['range, rangeKey, multiple'].call(row, range, rangeKey, multiple);
  const choose = index => definition.methods.choose.call(row, { currentTarget: { dataset: { index } } });
  return { row, choose, events };
}

const single = mount(['All', 'Department']);
assert.deepEqual(single.row.data.options.map(item => item.label), ['All', 'Department']);
single.choose(0);
assert.equal(single.events.length, 0);
single.choose(1);
assert.deepEqual(single.events[0], { name: 'change', detail: { value: '1' } });
single.row.data.value = 1;
single.choose(0);
assert.deepEqual(single.events[1].detail.value, '0');

const multiple = mount([
  { label: 'Same label', value: 'department-a', selected: true },
  { label: 'Same label', value: 'department-b', selected: false }
], { rangeKey: 'label', multiple: true });
assert.deepEqual(multiple.row.data.options.map(item => item.selected), [true, false]);
multiple.choose(1);
assert.deepEqual(multiple.events[0].detail.value, ['department-a', 'department-b']);
multiple.choose(0);
assert.deepEqual(multiple.events[1].detail.value, []);
assert.deepEqual(mount([]).row.data.options, []);

console.log('小程序共享筛选行通过单选、清除、多选、同名不同值及空候选验证。');
