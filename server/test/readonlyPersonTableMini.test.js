'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.resolve(__dirname, '../../miniprogram/components/readonly-person-table/readonly-person-table.js');
function render(people, historicalPositionText = '') {
  let component;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Component(value) { component = value; },
    require(value) { return require(path.resolve(path.dirname(filename), value)); }
  });
  const instance = { data: { ...component.data }, setData(patch) { Object.assign(this.data, patch); } };
  component.observers['people, historicalPositionText'].call(instance, people, historicalPositionText);
  return instance.data;
}
test('readonly personnel table keeps same-name people and each assigned work role as separate rows', () => {
  const people = [{ name: 'Same', targetAssignmentId: 'a', identity: 'Role A', department: 'Department' },
    { name: 'Same', targetAssignmentId: 'b', identity: 'Role B', workGroup: 'Group' }];
  const original = JSON.stringify(people), result = render(people);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].assignmentId, 'a');
  assert.equal(result.rows[1].assignmentId, 'b');
  assert.equal(result.rows[1].positions[0].identityCategory, 'Role B');
  assert.equal(JSON.stringify(people), original);
  assert.equal(result.copy.name, require('../../shared/locales/zh-CN/home').text.name);
  assert.ok(result.copy.workRole);
});
test('readonly personnel table preserves multiple roles, source notices and empty roles', () => {
  const result = render([{ name: 'A', personReference: 'reference', positions: [
    { identityCategory: 'First', department: 'One' }, { identityCategory: 'Second', workGroup: 'Two' }] },
    { targetName: 'B', assignmentId: 'historical', historicalAssignmentUnavailable: true },
    { name: 'C', positions: [], positionNotice: 'Restricted' }, { name: 'D', positions: [] }], 'Unverified');
  assert.equal(result.rows[0].positions.length, 2);
  assert.equal(result.rows[0].personReference, 'reference');
  assert.equal(result.rows[1].positionNotice, 'Unverified');
  assert.equal(result.rows[2].positionNotice, 'Restricted');
  assert.equal(result.rows[3].positions.length, 0);
  assert.ok(render([]).copy.noWorkRole);
});
