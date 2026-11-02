'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resource } = require('../src/modules/venue/models/venueBookingResource');
const snapshot = { assignmentId: 'job', personId: 'person', organizationId: 'org', assignmentKind: 'custom',
  departmentId: 'department', identityCategoryId: 'identity', workGroupId: 'group' };
const row = { id: 'booking', creator_person_id: 'person', creator_org_id: 'org', creator_assignment_id: 'job',
  creator_context_snapshot: JSON.stringify(snapshot) };
test('借用范围使用提交岗位和可扩展性质，不依赖现任岗位', () => {
  assert.deepEqual(resource(row, 'org').assignment, { id: 'job', personId: 'person', organizationId: 'org', active: true,
    natureId: 'custom', departmentId: 'department', identityCategoryId: 'identity', workGroupId: 'group' });
  assert.equal(resource(row, 'approving-org').assignment, undefined);
  assert.equal(resource(row, 'org').ownerPersonId, 'person');
});
test('缺失、损坏、类型错误及不一致的岗位资料不提供动态范围授权', () => {
  for (const input of [null, '', 'broken', '[]', 'null', JSON.stringify({ ...snapshot, assignmentKind: '' }),
    JSON.stringify({ ...snapshot, organizationId: 'other' }), JSON.stringify({ ...snapshot, assignmentId: 'other' }),
    JSON.stringify({ ...snapshot, personId: 'other' }), JSON.stringify({ ...snapshot, departmentId: ['department'] }),
    JSON.stringify({ ...snapshot, workGroupId: ['group'] })]) {
    assert.equal(resource({ ...row, creator_context_snapshot: input }, 'org').assignment, undefined, String(input));
  }
});
