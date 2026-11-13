'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const calendar = require('../shared/calendarView');
const copy = require('../shared/locales/zh-CN/calendar');
const relations = require('../shared/locales/zh-CN/identityNatureRelations');
const metadata = { people: [{ personId: 'p', name: '成员甲', assignments: [] }], natures: [{ id: 'staff', name: '本会岗位' }], departments: [{ id: 'd', name: '办公室' }], identities: [], workGroups: [] };
assert.deepEqual(calendar.participantSourceSummary({ type: 'people', personIds: ['p'] }, metadata, copy, relations), [copy.participantPeopleSummary(1, '成员甲')]);
assert.deepEqual(calendar.participantSourceSummary({ type: 'people', personIds: ['missing'] }, metadata, copy, relations), [copy.participantPeopleCount.replace('{count}', '1')]);
const scope = { type: 'scope', natureIds: ['staff'], departmentIds: [], identityCategoryIds: [], workGroupIds: [], sameDepartment: true };
const lines = calendar.participantSourceSummary(scope, metadata, copy, relations);
assert(lines.includes(copy.scopeFieldLine(copy.department, copy.sameDepartment)));
assert(!lines.some(line => line.includes('查看者')));
const filename = path.resolve(__dirname, '../miniprogram/subpackages/workspace/components/calendarConditions/calendarConditions.js');
let definition;
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Component(value) { definition = value; }, require: createRequire(filename), wx: { pageScrollTo() {} }, console });
const changes = [];
const component = { ...definition.methods, data: { ...definition.data }, properties: { value: [{ type: 'people', personIds: ['p'] }, scope], metadata, participants: true, audience: false, disabled: false },
  setData(patch, callback) { Object.assign(this.data, patch); if(callback)callback(); },
  triggerEvent(name, detail) { if(name === 'change') { changes.push(detail.value); this.properties.value = detail.value; this.rebuild(); } },
  createSelectorQuery() { return { select() { return this; }, boundingClientRect() { return this; }, selectViewport() { return this; }, scrollOffset() { return this; }, exec(done) { done([{ top: 100 }, { scrollTop: 0 }]); } }; }
};
const event = index => ({ currentTarget: { dataset: { index } } });
component.rebuild();assert.equal(component.data.activeIndex, -1);
assert.equal(component.data.rows[1].dimensions[0].summary,copy.sameDepartment);
assert.equal(component.data.rows[1].dimensions[1].summary,copy.unlimited);
component.editSource(event(0));assert.equal(component.data.activeIndex, 0);
component.openPicker(event(0));component.closePicker();assert.equal(changes.length, 0);
component.editSource(event(1));component.finishSource();assert.equal(changes.length, 0);
component.add({ currentTarget: { dataset: { type: 'people' } } });assert.equal(component.data.activeIndex, 2);
component.openPicker(event(2));component.confirmPicker({ detail: { items: [{ personId: 'p' }] } });
assert.equal(component.data.activeIndex, -1);assert.deepEqual(Array.from(component.properties.value[2].personIds), ['p']);
component.remove(event(2));assert.equal(component.properties.value.length, 2);assert.equal(component.properties.value[1].sameDepartment, true);
component.properties.disabled = true;const before = changes.length;component.add({ currentTarget: { dataset: { type: 'scope' } } });assert.equal(changes.length, before);
console.log('PASS 参会来源摘要、相同岗位主体、单组编辑、人员取消/确认、草稿保留及禁用写入');
