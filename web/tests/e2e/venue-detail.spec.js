import { expect, test } from '@playwright/test';
import { mockApi, callsOf } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
const booking = {
  id: 'detail-booking', title: 'Saved venue request', venueName: 'Meeting room', status: 'pending',
  orgName: 'Historical organization', userName: 'Applicant', creatorAssignmentLabel: 'Historical assignment',
  userDept: 'Historical department', userIdentity: 'Historical identity', userWorkGroup: 'Historical group',
  description: 'Saved description '.repeat(100), timeStart: '2035-01-01T01:00:00.000Z', timeEnd: '2035-01-01T02:00:00.000Z',
  approvalProgress: { flowId: 'flow-a', currentStep: 0, totalSteps: 3,
    flowSteps: [{ name: 'Step A' }, { name: 'Step B' }, { name: 'Step C' }],
    snapshots: [{ flowId: 'flow-a', stepIndex: 1, approverName: 'Historical reviewer', comment: 'Saved opinion' },
      { flowId: 'flow-b', stepIndex: 2, approverName: 'Other route reviewer' }] }
};
test('my booking opens shared detail and cancel does not open detail', async ({ page }) => {
  const api = await mockApi(page);
  await page.route('**/api/listMyVenueBookings', route => route.fulfill({ json: { status: 'success', bookings: [booking] } }));
  await page.goto('/web/venue/mine');
  const layout = await page.locator('.booking-card').evaluate(card => ({ body: card.querySelector('.list-row-main').getBoundingClientRect().bottom, actions: card.querySelector('.list-row-actions').getBoundingClientRect().top }));
  expect(layout.actions).toBeGreaterThanOrEqual(layout.body);
  await page.getByRole('button', { name: copy.venue.cancelAction, exact: true }).click();
  await expect(page.getByRole('dialog', { name: copy.venue.detailTitle })).toHaveCount(0);
  await page.getByRole('button', { name: copy.common.cancel, exact: true }).click();
  expect(callsOf(api.calls, 'cancelVenueBooking')).toHaveLength(0);
  await page.getByRole('button', { name: booking.title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: copy.venue.detailTitle });
  await expect(dialog.getByText('Historical organization', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Historical assignment', { exact: true })).toBeVisible();
  await dialog.locator('summary').filter({ hasText: 'Step B' }).click();
  await expect(dialog.getByText('Saved opinion', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '67');
  await expect(dialog.getByText('Other route reviewer', { exact: false })).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});
test('history card opens the same complete detail without a second hero or refresh action', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/listVenueApprovalHistory', route => route.fulfill({ json: { status: 'success', history: [booking] } }));
  await page.route('**/api/getVenueApprovalHistoryDetail', route => route.fulfill({ json: { status: 'success', detail: booking } }));
  await page.goto('/web/venue/history');
  await expect(page.getByRole('button', { name: copy.audit.actionRefresh, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: booking.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: booking.title })).toBeVisible();
  await expect(page.getByText('Historical group', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '67');
});
