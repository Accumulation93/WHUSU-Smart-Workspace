'use strict';

const assert = require('node:assert/strict');
const nature = require('../src/core/services/natureRulePolicy');
const directory = require('../src/core/services/contactDirectoryPolicy');
const venue = require('../src/modules/venue/utils/venueApprovalRuleMatcher');
const audit = require('../src/modules/audit/services/auditWorkflowPolicy');
const Module = require('node:module');
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith('/config/db')) return {};
  return load.call(this, request, parent, isMain);
};
const copy = require('../src/core/models/venueApprovalCopy');
Module._load = load;

assert.equal(nature.matches(undefined, 'liaison'), true);
assert.equal(nature.matches(null, 'staff'), true);
assert.equal(nature.matches(['staff'], 'liaison'), false);
assert.equal(nature.matches(['staff', 'liaison'], 'liaison'), true);
const oldEdit = [{ key: 'same', natureIds: null }];
nature.preserveMissing(oldEdit, [{ key: 'same', natureIds: ['staff'] }], value => value.key);
assert.deepEqual(oldEdit[0].natureIds, ['staff']);
assert.throws(() => nature.preserveMissing([{ key: 'changed' }], [{ key: 'same', natureIds: ['staff'] }], value => value.key));
assert.throws(() => nature.preserveMissing([{ key: 'same' }], [{ key: 'same', natureIds: ['staff'] }, { key: 'same', natureIds: ['liaison'] }], value => value.key));
for (const invalid of [[], '', '{}', 'broken', [''], ['staff', {}]]) assert.equal(nature.matches(invalid, 'staff'), false);
assert.equal(audit.validateConditionShape({ conditionType: 'person', personHrIds: 'person', assignmentIds: 'job', natureIds: [] }).ok, false);
const rule = { department_scope: 'all', identity_scope: 'all', work_group_scope: 'all', nature_ids: '["staff"]' };
assert.equal(venue.matchesRule(rule, { assignment_kind: 'staff' }), true);
assert.equal(venue.matchesRule(rule, { assignment_kind: 'liaison' }), false);
assert.equal(venue.matchesAnyRule([rule, { ...rule, nature_ids: '["liaison"]' }], { assignment_kind: 'liaison' }), true);

const a = { id: 'a', nature: 'staff', departmentId: 'd1', identityCategoryId: 'i1', workGroupId: '' };
const b = { id: 'b', nature: 'liaison', departmentId: 'd2', identityCategoryId: 'i2', workGroupId: '' };
const person = { personId: 'person', assignments: [a, b] };
const catalog = { people: [person], natureIds: ['staff', 'liaison'], departmentIds: ['d1', 'd2'],
  identityCategoryIds: ['i1', 'i2'], workGroupIds: [], fields: [], identities: [{ id: 'i1', natureIds: ['staff'] }, { id: 'i2', natureIds: ['liaison'] }] };
const base = { name: 'test', enabled: true, audience: [{ type: 'people', personIds: ['person'] }], fieldIds: [] };
const grants = targets => directory.grants([{ ...base, targets }], [person], { personId: 'person', assignment: a }, catalog);
assert.deepEqual(grants([{ type: 'scope', natureIds: ['staff'], identityCategoryIds: ['i2'] }]), []);
assert.deepEqual(grants([{ type: 'scope', natureIds: ['staff'], identityCategoryIds: ['i1'] }]).map(item => item.assignment.id), ['a']);
assert.deepEqual(grants([{ type: 'scope', natureIds: ['missing'], identityCategoryIds: ['i1'] },
  { type: 'scope', natureIds: ['liaison'], identityCategoryIds: ['i2'] }]).map(item => item.assignment.id), ['b']);
assert.deepEqual(grants([{ type: 'scope', sameNature: true }]).map(item => item.assignment.id), ['a']);

const portable = { name: 'flow', venueReference: 'venue', allowUserSelect: false, allowDesignateFirst: false, allowDesignateNext: false,
  steps: [{ name: 'step', approvalMode: 'hr_rule', rules: [{ natureIds: ['nature'], departmentScope: 'all', identityScope: 'all', workGroupScope: 'all' }] }],
  references: [{ token: 'venue', kind: 'venue', label: 'v' }, { token: 'nature', kind: 'nature', label: 'n' }] };
assert.deepEqual(copy.normalize(portable).steps[0].rules[0].natureIds, ['nature']);
assert.throws(() => copy.normalize({ ...portable, references: portable.references.slice(0, 1) }));
console.log('PASS nature rules: legacy scope, explicit scopes, invalid branches, same-assignment matching and portable mappings');
