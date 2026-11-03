'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeMessage } = require('../../shared/messageFactsView');
const copy = require('../../shared/locales/zh-CN/messageFacts');

test('历史通知只按类型使用前端语料，不解析后端标题正文', () => {
  const result = describeMessage({ type: 'submission_rejected', title: 'UNTRUSTED_TITLE', description: 'UNTRUSTED_DESCRIPTION' }, copy, { notification: true, canOpen: true });
  assert.equal(result.title, copy.notifications.submission_rejected[0]);
  assert.equal(result.description, copy.notifications.submission_rejected[1]);
  assert.ok(!JSON.stringify(result).includes('UNTRUSTED'));
  const unavailable = describeMessage({ type: 'account_security' }, copy, { notification: true, canOpen: false });
  assert.equal(unavailable.description, copy.notificationDetailUnavailable);
  assert.equal(unavailable.canOpen, false);
});

test('待办业务标题原样保留，人员步骤和数量仅用结构化事实', () => {
  const result = describeMessage({ sourceType: 'audit_approval', title: 'UNTRUSTED', description: 'UNTRUSTED',
    displayFacts: { businessTitle: 'BUSINESS_TITLE', submitterName: 'PERSON_NAME', stepOrder: 3 } }, copy, { canOpen: true });
  assert.equal(result.title, 'BUSINESS_TITLE');
  assert.equal(result.description, copy.auditPendingFrom('PERSON_NAME', 3));
  for (const pendingCount of [undefined, '3', -1, Infinity]) {
    assert.equal(describeMessage({ sourceType: 'scoring_task', displayFacts: { pendingCount } }, copy).description, copy.scoringPendingGeneric);
  }
  assert.equal(describeMessage({ sourceType: 'audit_approval', displayFacts: { stepOrder: 0 } }, copy).description, copy.auditPendingGeneric);
  const venue = describeMessage({ sourceType: 'venue_approval', displayFacts: { venueName: 'VENUE', currentStepName: 'STEP' } }, copy);
  assert.deepEqual(venue.detailLines, [{ label: copy.todoVenueLabel, value: 'VENUE' }, { label: copy.todoCurrentStepLabel, value: 'STEP' }]);
});

test('角色名称不采用后端系统描述，缺失资料不伪装成普通岗位', () => {
  assert.equal(describeMessage({ role: 'admin', adminLevel: 'super_admin', identityName: 'UNTRUSTED' }, copy).workContextName, copy.context.superAdmin);
  assert.equal(describeMessage({ identityType: 'membership', identityName: 'UNTRUSTED' }, copy).workContextName, copy.context.noAssignment);
  assert.equal(describeMessage({ identityType: 'assignment', assignmentLabel: 'ASSIGNMENT' }, copy).workContextName, 'ASSIGNMENT');
  assert.equal(describeMessage({ identityName: 'UNTRUSTED' }, copy).workContextName, '');
});
