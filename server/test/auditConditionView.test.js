'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildConditions, buildStarterConditions } = require('../../shared/auditConditionView');
const copy = require('../../shared/locales/zh-CN/auditConditions');

test('conditions preserve each group and each same-position dimension', () => {
  const view = buildConditions({ conditionFacts: [
    { conditionType: 'submitter' },
    { conditionType: 'identity_scope', departmentScope: 'own', identityScope: 'specific', identityNames: ['role-a','role-b'], workGroupScope: 'all' }
  ] }, copy);
  assert.equal(view.groups.length, 2);
  assert.equal(view.groups[0].text, copy.approvalSubmitterCondition);
  assert.equal(view.groups[1].rows[0].value, copy.approvalOwnDepartment);
  assert.equal(view.groups[1].rows[1].value, copy.approvalSpecifiedValues('role-a、role-b'));
  assert.equal(view.groups[1].rows[2].value, copy.approvalAllWorkGroups);
  assert.equal(view.hint, copy.approvalConditionGroupsHint);
});

test('missing conditions never become an unrestricted range or server-provided display', () => {
  const view = buildConditions({ approverDesc: 'untrusted-server-display', conditionFacts: [
    { conditionType: 'identity_scope', departmentScope: 'specific', departmentNames: ['known'], unresolved: true }
  ] }, copy);
  assert.equal(view.groups[0].rows[0].value, copy.approvalSpecifiedValues('known'));
  assert.equal(view.groups[0].rows[1].value, copy.approvalDimensionUnavailable);
  assert.equal(view.groups[0].notice, copy.approvalConditionIncomplete);
  assert.equal(JSON.stringify(view).includes('untrusted-server-display'), false);
  assert.equal(buildConditions({ approverDesc: 'untrusted' }, copy).summary, copy.approverRangeUnavailable);
});

test('starter conditions do not describe approval duties or reinterpret unsupported settings', () => {
  const view = buildStarterConditions({conditionFacts:[{conditionType:'person',personKind:'assignment',personNames:['name · position']}]},copy,true);
  assert.equal(view.groups[0].text,copy.starterAssignmentsCondition('name · position'));
  assert.equal(view.summary,copy.starterAssignmentsCondition('name · position'));
  const unsupported = buildStarterConditions({conditionFacts:[{conditionType:'identity_scope',departmentScope:'own',identityScope:'all',workGroupScope:'all'}]},copy,true);
  assert.equal(unsupported.groups[0].notice,copy.starterConditionNeedsReview);
  assert.equal(unsupported.groups[0].rows.length,0);
  const publicView = buildStarterConditions({conditionFacts:[{conditionType:'submitter'}]},copy,false);
  assert.equal(publicView.groups[0].notice,copy.starterRangeUnavailable);
});

test('named positions and legacy people retain distinct descriptions', () => {
  const assignment = buildConditions({conditionFacts:[{conditionType:'person',personKind:'assignment',personNames:['name · position']}]},copy);
  assert.equal(assignment.summary,copy.approvalAssignmentsCondition('name · position'));
  const legacy = buildConditions({conditionFacts:[{conditionType:'person',personNames:['name']}]},copy);
  assert.equal(legacy.summary,copy.approvalPeopleCondition('name'));
});
