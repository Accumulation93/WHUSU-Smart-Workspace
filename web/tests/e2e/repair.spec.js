import { expect, test } from '@playwright/test';
import { mockApi, callsOf } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import homeLocale from '../../src/locales/zh-CN/shared/home.js';
const homeCopy = homeLocale.text;

test('notification stays unread when its detail cannot be opened', async ({ page }) => {
  const api = await mockApi(page);
  await page.route('**/api/getSubmissionDetail', route => route.fulfill({ json: { status: 'forbidden', message: 'detail unavailable' } }));
  await page.goto('/web/portal');
  await page.locator('.notification-item').filter({ hasText: '有一条新的审核申请' }).click();
  await expect(page.getByText('detail unavailable')).toBeVisible();
  expect(callsOf(api.calls, 'markNotificationRead')).toHaveLength(0);
});

test('business rejection does not show approval success', async ({ page }) => {
  await mockApi(page, { detail: { canApproveCurrentStep: true } });
  await page.route('**/api/approveStep', route => route.fulfill({ json: { status: 'forbidden', message: 'approval denied' } }));
  await page.goto('/web/audit/submission/submission-1');
  await page.getByRole('button', { name: copy.audit.actionApprove, exact: true }).click();
  await expect(page.getByText('approval denied')).toBeVisible();
  await expect(page.getByText(copy.audit.approveDone, { exact: true })).toHaveCount(0);
});

test('profile saves actual field values and reloads saved result', async ({ page }) => {
  await mockApi(page);
  let saved = { contact: 'old@example.com', date: '2026-10-09', meeting: '2026-10-09T01:00:00.000Z' };
  let reads = 0;
  await page.route('**/api/getUserHrProfile', route => {
    reads++;
    return route.fulfill({ json: { status: 'success', profile: { name: 'Test' }, values: saved,
      template: { editMode: 'direct', fields: [
        { id: 'contact', label: 'Email', type: 'email', required: true },
        { id: 'date', label: 'Date', type: 'date' },
        { id: 'meeting', label: 'Meeting', type: 'datetime' }
      ] }
    } });
  });
  await page.route('**/api/submitUserHrProfile', route => {
    saved = route.request().postDataJSON().values;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/hr/profile');
  await page.getByLabel('Email').fill('new@example.com');
  await page.getByLabel('Meeting').fill('2026-10-10T10:30');
  await page.getByRole('button', { name: homeCopy.saveProfile, exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  expect(saved).toEqual({ contact: 'new@example.com', date: '2026-10-09', meeting: '2026-10-10T02:30:00.000Z' });
  await expect(page.getByLabel('Email')).toHaveValue('new@example.com');
  await expect(page.getByLabel('Meeting')).toHaveValue('2026-10-10T10:30');
});

test('venue history uses id and detail response from server', async ({ page }) => {
  await mockApi(page);
  let request;
  await page.route('**/api/getVenueApprovalHistoryDetail', route => {
    request = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', detail: { title: 'Saved booking', venueName: 'Room A', userName: 'Applicant', applicantAssignmentLabel: 'Saved role', approvalProgress: null } } });
  });
  await page.goto('/web/venue/history/booking-1');
  await expect(page.getByRole('heading', { name: 'Saved booking' })).toBeVisible();
  expect(request).toEqual({ id: 'booking-1' });
  await expect(page.getByText('Saved role')).toBeVisible();
});
