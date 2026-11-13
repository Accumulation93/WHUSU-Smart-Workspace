'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeMessage, messageCategory } = require('../../shared/messageFactsView');
const copy = require('../../shared/locales/zh-CN/messageFacts');

test('日程提醒兼容历史系统分类，其他通知不误归类', () => {
  assert.equal(messageCategory({ type: 'calendar_reminder', category: 'system' }), 'calendar');
  assert.equal(messageCategory({ type: 'calendar_reminder', category: 'calendar' }), 'calendar');
  assert.equal(messageCategory({ type: 'account_security', category: 'system' }), 'system');
  assert.equal(messageCategory({ title: 'calendar_reminder', category: 'system' }), 'system');
  assert.equal(messageCategory({ sourceType: 'venue_approval', category: 'venue' }), 'venue');
  assert.equal(messageCategory(null), '');
});

test('历史通知只按类型使用前端语料，不解析后端标题正文', () => {
  const result = describeMessage({ type: 'submission_rejected', title: 'UNTRUSTED_TITLE', description: 'UNTRUSTED_DESCRIPTION' }, copy, { notification: true, canOpen: true });
  assert.equal(result.title, copy.notificationTitles.submission_rejected);
  assert.equal(result.description, copy.auditRejected);
  assert.ok(!JSON.stringify(result).includes('UNTRUSTED'));
  const unavailable = describeMessage({ type: 'account_security' }, copy, { notification: true, canOpen: false });
  assert.equal(unavailable.description, copy.accountSecurityUnknown);
  assert.equal(unavailable.actionNotice, copy.notificationDetailUnavailable);
  assert.equal(unavailable.canOpen, false);
});

test('待办业务标题原样保留，人员步骤和数量仅用结构化事实', () => {
  const result = describeMessage({ sourceType: 'audit_approval', title: 'UNTRUSTED', description: 'UNTRUSTED',
    displayFacts: { businessTitle: 'BUSINESS_TITLE', submitterName: 'PERSON_NAME', stepOrder: 3 } }, copy, { canOpen: true });
  assert.equal(result.title, 'BUSINESS_TITLE');
  assert.equal(result.description, copy.auditTodoFrom('PERSON_NAME'));
  assert.deepEqual(result.detailLines, [{ label: copy.currentStepLabel, value: copy.todoStepOrder(3) }]);
  for (const pendingCount of [undefined, '3', -1, Infinity]) {
    assert.equal(describeMessage({ sourceType: 'scoring_task', displayFacts: { pendingCount } }, copy).description, copy.scoringTodoUnknown);
  }
  assert.equal(describeMessage({ sourceType: 'audit_approval', displayFacts: { stepOrder: 0 } }, copy).description, copy.auditTodo);
  const venue = describeMessage({ sourceType: 'venue_approval', displayFacts: { venueName: 'VENUE', currentStepName: 'STEP' } }, copy);
  assert.deepEqual(venue.detailLines, [{ label: copy.venueLabel, value: 'VENUE' }, { label: copy.currentStepLabel, value: 'STEP' }]);
});

test('通知保留业务标题、事件步骤和当前进展，不能用当前步骤补造历史下一步', () => {
  const facts = { businessTitle: 'TITLE', event: { completedStepOrder: 2, completedStepName: 'DONE', roundOrder: 1 }, current: { stepOrder: 5, stepName: 'NOW' } };
  const result = describeMessage({ type: 'submission_progress', displayFacts: facts }, copy, { notification: true, canOpen: false });
  assert.equal(result.title, 'TITLE');
  assert.equal(result.description, copy.auditProgressCompleted(2));
  assert.ok(result.detailLines.some(line => line.value === copy.stepNameAndOrder(5, 'NOW')));
  assert.equal(result.actionNotice, copy.notificationDetailUnavailable);
  facts.event.nextStepOrder = 3;
  facts.event.nextStepName = 'TRANSFERRED';
  const transferred = describeMessage({ type: 'submission_progress', displayFacts: facts }, copy, { notification: true });
  assert.equal(transferred.description, copy.auditProgress(2, 3));
  assert.ok(transferred.detailLines.some(line => line.label === copy.nextStepLabel && line.value === copy.stepNameAndOrder(3, 'TRANSFERRED')));
  const migrated = describeMessage({ type: 'hr_profile_migration', displayFacts: { current: { status: 'executed' } } }, copy, { notification: true });
  assert.equal(migrated.description, copy.migrationCurrentExecuted);
  const completed = describeMessage({ type: 'submission_progress', displayFacts: { current: { status: 'approved', stepOrder: 4, stepName: 'FINISHED' } } }, copy, { notification: true });
  assert.equal(completed.description, copy.auditProgressUnknown);
  assert.ok(!JSON.stringify(completed.detailLines).includes('FINISHED'));
});

test('成员姓名不能借业务标题推断，评分零项不说还有零项', () => {
  const result = describeMessage({ sourceType: 'hr_profile_review', displayFacts: { businessTitle: 'BUSINESS' } }, copy);
  assert.equal(result.title, 'BUSINESS');
  assert.equal(result.description, copy.profileTodoUnknown);
  assert.equal(describeMessage({ sourceType: 'scoring_task', displayFacts: { pendingCount: 0 } }, copy).description, copy.scoringTodoComplete);
});

test('时间只接明确时区或全天日期，缺一端不伪造完整范围', () => {
  const options = { notification: true, formatDateTime: value => value, formatDate: value => value };
  const partial = describeMessage({ type: 'booking_approved', displayFacts: { businessTitle: 'BOOKING', startTime: '2026-11-10T08:00:00Z', endTime: '2026-11-10 09:00:00' } }, copy, options);
  assert.deepEqual(partial.detailLines, [{ label: copy.startTimeLabel, value: '2026-11-10T08:00:00Z' }]);
  const allDay = describeMessage({ type: 'calendar_reminder', displayFacts: { allDay: true, startDate: '2026-11-10', endDateInclusive: '2026-11-10' } }, copy, options);
  assert.equal(allDay.detailLines[0].value, copy.allDayDate('2026-11-10'));
  assert.equal(allDay.description, copy.calendarAllDay);
  const deadline = describeMessage({ type: 'score_deadline_24h', displayFacts: { deadline: '2026-11-10T08:00:00Z' } }, copy, options);
  assert.equal(deadline.description, copy.currentScoringDeadline('2026-11-10T08:00:00Z'));
  const seen = [];
  describeMessage({ type: 'booking_approved', displayFacts: { startTime: '2026-11-10T08:00:00Z', startTimeReviewStatus: 'review_required' } }, copy,
    { notification: true, formatDateTime(value, review) { seen.push(review); return value; } });
  assert.deepEqual(seen, ['review_required']);
  const located = describeMessage({ type: 'calendar_reminder', displayFacts: { allDay: true, startDate: '2026-11-10', endDateInclusive: '2026-11-10', location: 'CUSTOM_LOCATION', venueName: 'CUSTOM_LOCATION' } }, copy, options);
  assert.equal(located.detailLines.at(-1).label, copy.locationLabel);
  assert.equal(located.detailLines.at(-1).value, 'CUSTOM_LOCATION');
  assert.equal(located.detailLines.filter(line => line.value === 'CUSTOM_LOCATION').length, 1);
});

test('角色名称不采用后端系统描述，缺失资料不伪装成普通岗位', () => {
  assert.equal(describeMessage({ role: 'admin', adminLevel: 'super_admin', identityName: 'UNTRUSTED' }, copy).workContextName, copy.context.superAdmin);
  assert.equal(describeMessage({ identityType: 'membership', identityName: 'UNTRUSTED' }, copy).workContextName, copy.context.noAssignment);
  assert.equal(describeMessage({ identityType: 'assignment', assignmentLabel: 'ASSIGNMENT' }, copy).workContextName, 'ASSIGNMENT');
  assert.equal(describeMessage({ identityName: 'UNTRUSTED' }, copy).workContextName, '');
});

test('十四类通知均保留独立业务名称，未知类型不读取对象原型或旧系统句子', () => {
  assert.equal(Object.keys(copy.notificationTitles).length, 14);
  for (const type of Object.keys(copy.notificationTitles)) {
    const result = describeMessage({ type, title: 'UNTRUSTED', description: 'UNTRUSTED', displayFacts: { businessTitle: 'BUSINESS' } }, copy, { notification: true });
    assert.equal(result.title, 'BUSINESS');
    assert.equal(typeof result.description, 'string');
    assert.ok(result.description.length > 0);
    assert.ok(!JSON.stringify(result).includes('UNTRUSTED'));
  }
  const unknown = describeMessage({ type: '__proto__' }, copy, { notification: true });
  assert.equal(unknown.title, copy.unknownNotificationTitle);
  assert.equal(unknown.description, copy.unknownNotificationDescription);
});
