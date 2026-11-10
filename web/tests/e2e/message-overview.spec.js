import { expect, test } from '@playwright/test';
import { mockApi, callsOf } from './fixtures.js';
import copy from '../../src/locales/zh-CN/shared/messageFacts.js';

const startTime = '2026-11-10T08:00:00.000Z';
const endTime = '2026-11-10T10:00:00.000Z';
const auditUrl = '/subpackages/audit/pages/submissionDetail/submissionDetail?id=overview';
const notificationCases = [
  ['submission_approved', { event: { roundOrder: 2 } }, copy.auditApproved, [copy.roundNumber(2)]],
  ['submission_progress', { event: { completedStepOrder: 1, completedStepName: 'Historical review', nextStepOrder: 2, nextStepName: 'Historical next review' }, current: { stepOrder: 4, stepName: 'Current review' } }, copy.auditProgress(1, 2), [copy.stepNameAndOrder(1, 'Historical review'), copy.stepNameAndOrder(2, 'Historical next review'), copy.stepNameAndOrder(4, 'Current review')]],
  ['submission_rejected', { event: { rejectedStepOrder: 3, rejectedStepName: 'Budget review', reason: 'Missing budget attachment' } }, copy.auditRejectedAt(3), ['Budget review', 'Missing budget attachment']],
  ['booking_approved', { venueName: 'North meeting room', startTime, endTime }, copy.venueApproved, ['North meeting room', '2026-11-10', '16:00', '18:00']],
  ['booking_rejected', { venueName: 'South meeting room', event: { reason: 'Room already reserved' } }, copy.venueRejected, ['South meeting room', 'Room already reserved']],
  ['booking_cancelled', { venueName: 'Library room' }, copy.venueCancelled, ['Library room']],
  ['hr_profile_approved', {}, copy.profileApproved, []],
  ['hr_profile_rejected', { event: { reason: 'Please verify the phone number' } }, copy.profileRejected, ['Please verify the phone number']],
  ['hr_profile_migration', { sourceOrganizationName: 'Source organization', targetOrganizationName: 'Receiving organization', current: { status: 'executed' } }, copy.migrationCurrentExecuted, ['Source organization', 'Receiving organization']],
  ['score_activity_started', { deadline: endTime }, copy.scoringStarted, ['2026-11-10', '18:00']],
  ['score_deadline_24h', { deadline: endTime }, null, ['2026-11-10', '18:00']],
  ['score_results_published', {}, copy.scoringPublished, []],
  ['calendar_reminder', { allDay: true, startDate: '2026-11-10', endDateInclusive: '2026-11-12' }, copy.calendarAllDay, ['2026-11-10', '2026-11-12']],
  ['account_security', { event: { subtype: 'wechat_recovered' } }, copy.accountWechatRecovered, []]
];

async function installMessages(page, notifications, todos = []) {
  const api = await mockApi(page, { emptyTodos: true, emptyNotifications: true });
  await page.route('**/api/listNotifications', route => route.fulfill({ json: { status: 'success', items: notifications, total: notifications.length, unreadCount: notifications.length, nextCursor: '' } }));
  await page.route('**/api/listTodos', route => route.fulfill({ json: { status: 'success', items: todos, total: todos.length, nextCursor: '' } }));
  return api;
}

test('all fourteen notification kinds retain business overview independently of opening details', async ({ page }) => {
  const items = notificationCases.map(([type, facts], index) => ({ id: `overview-${index}`, type, isRead: false,
    title: 'SERVER GENERATED TITLE MUST NOT RENDER', description: 'SERVER GENERATED DESCRIPTION MUST NOT RENDER',
    targetUrl: index % 2 ? '' : auditUrl, displayFacts: { businessTitle: `Business record ${index}`, ...facts } }));
  const api = await installMessages(page, items);
  await page.goto('/web/messages?tab=notifications');
  await expect(page.locator('.notification-item')).toHaveCount(14);
  for (const [index, entry] of notificationCases.entries()) {
    const row = page.locator('.notification-item').filter({ has: page.locator('.notification-title', { hasText: new RegExp(`^Business record ${index}$`) }) });
    await row.scrollIntoViewIfNeeded();
    if (entry[2]) await expect(row).toContainText(entry[2]);
    for (const fact of entry[3]) await expect(row).toContainText(fact);
    if (index % 2) {
      await expect(row.locator('.message-open')).toBeDisabled();
      await expect(row).toContainText(copy.notificationDetailUnavailable);
    }
  }
  const progress = page.locator('.notification-item').filter({ hasText: 'Business record 1' }).first();
  await expect(progress).not.toContainText(copy.auditProgress(4, 5));
  await expect(page.getByText('SERVER GENERATED TITLE MUST NOT RENDER')).toHaveCount(0);
  await expect(page.getByText('SERVER GENERATED DESCRIPTION MUST NOT RENDER')).toHaveCount(0);
  expect(callsOf(api.calls, 'markNotificationRead')).toHaveLength(0);
});

test('all four todo kinds expose the actual applicant task count step and schedule', async ({ page }) => {
  const cases = [
    ['audit_approval', { submitterName: 'Applicant A', currentStepOrder: 2, currentStepName: 'Finance review' }, copy.auditTodoFrom('Applicant A'), ['Finance review']],
    ['venue_approval', { applicantName: 'Applicant B', venueName: 'East hall', startTime, endTime, currentStepOrder: 1 }, copy.venueTodoFrom('Applicant B'), ['East hall', '16:00', '18:00']],
    ['scoring_task', { pendingCount: 7, deadline: endTime }, copy.scoringTodo(7), ['18:00']],
    ['hr_profile_review', { memberName: 'Member C' }, copy.profileTodo('Member C'), ['Member C']]
  ];
  await installMessages(page, [], cases.map(([sourceType, facts], index) => ({ id: `todo-${index}`, type: 'todo', sourceType, targetUrl: auditUrl, displayFacts: { businessTitle: `Requested work ${index}`, ...facts } })));
  await page.goto('/web/messages');
  await expect(page.locator('.notification-item')).toHaveCount(4);
  for (const [index, entry] of cases.entries()) {
    const row = page.locator('.notification-item').filter({ hasText: `Requested work ${index}` });
    await expect(row).toContainText(entry[2]);
    for (const fact of entry[3]) await expect(row).toContainText(fact);
  }
});

test('portal preserves long business names and complete details without horizontal clipping', async ({ page }, testInfo) => {
  const title = 'Annual joint organization conference and venue coordination '.repeat(5);
  await installMessages(page, [{ id: 'long-overview', type: 'booking_approved', isRead: false, targetUrl: '', displayFacts: { businessTitle: title, venueName: 'North building multipurpose conference hall', startTime, endTime } }]);
  await page.goto('/web/portal');
  const row = page.locator('.notification-item').filter({ hasText: title.trim() });
  await expect(row).toContainText(copy.venueApproved);
  await expect(row).toContainText('18:00');
  await expect(row).toContainText(copy.notificationDetailUnavailable);
  const geometry = await row.evaluate(element => [...element.querySelectorAll('.notification-title, .notification-desc')].map(node => ({
    width: node.clientWidth, scrollWidth: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight,
    overflow: getComputedStyle(node).textOverflow, whiteSpace: getComputedStyle(node).whiteSpace
  })));
  for (const line of geometry) {
    expect(line.scrollWidth).toBeLessThanOrEqual(line.width + 1);
    expect(line.scrollHeight).toBeLessThanOrEqual(line.height + 1);
    expect(line.whiteSpace).not.toBe('nowrap');
  }
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('message-overview.png'), fullPage: true });
  await row.evaluate(element => { const scroller = element.closest('.message-preview-scroll'); scroller.scrollTop = scroller.scrollHeight; });
  const lastLine = row.getByText(copy.notificationDetailUnavailable, { exact: true });
  await expect(lastLine).toBeInViewport();
  const bottom = await lastLine.evaluate(element => ({ line: element.getBoundingClientRect().bottom, viewport: element.closest('.message-preview-scroll').getBoundingClientRect().bottom }));
  expect(bottom.line).toBeLessThanOrEqual(bottom.viewport + 1);
  await page.screenshot({ path: testInfo.outputPath('message-overview-bottom.png'), fullPage: true });
});

test('historical notifications without event facts do not invent completed steps or parse old text', async ({ page }) => {
  await installMessages(page, [
    { id: 'history-current', type: 'submission_progress', targetUrl: auditUrl, description: 'Previously completed step 99', displayFacts: { businessTitle: 'Current authorized record', current: { stepOrder: 4, stepName: 'Final review' } } },
    { id: 'history-missing', type: 'submission_progress', targetUrl: '', title: 'Private obsolete title', description: 'Previously completed step 99', displayFacts: {} },
    { id: 'migration-event', type: 'hr_profile_migration', targetUrl: '', displayFacts: { businessTitle: 'Migration history', event: { status: 'pending' }, current: { status: 'executed' } } }
  ]);
  await page.goto('/web/messages?tab=notifications');
  const current = page.locator('.notification-item').filter({ hasText: 'Current authorized record' });
  await expect(current).toContainText(copy.auditCurrentStep(4));
  await expect(current).not.toContainText(copy.completedStepLabel);
  const unknown = page.locator('.notification-item').filter({ hasText: copy.auditProgressUnknown });
  await expect(unknown).toContainText(copy.notificationTitles.submission_progress);
  await expect(unknown).toContainText(copy.notificationDetailUnavailable);
  await expect(unknown).not.toContainText(copy.currentProgressLabel);
  const migration = page.locator('.notification-item').filter({ hasText: 'Migration history' });
  await expect(migration).toContainText(copy.migrationPending);
  await expect(migration).not.toContainText(copy.migrationCurrentExecuted);
  await expect(page.getByText('Private obsolete title')).toHaveCount(0);
  await expect(page.getByText('Previously completed step 99')).toHaveCount(0);
});
