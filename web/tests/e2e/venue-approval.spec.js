import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals.js';
import picker from '../../src/locales/zh-CN/shared/personnelPicker.js';

const pending = { id: 'booking-1', title: 'Booking A', venueName: 'Room A', userName: 'Applicant', description: 'Long booking description '.repeat(40),
  creatorAssignmentLabel: 'Saved role', timeStart: '2026-10-10T01:00:00Z', timeEnd: '2026-10-10T02:00:00Z',
  canProcessInCurrentContext: true, approvalFlowId: 'flow-1', currentFlowId: 'flow-1', approvalCurrentStep: 0,
  approvalTotalSteps: 2, flowSteps: [{ name: 'First step' }, { name: 'Next step' }],
  flowSummary: [{ flowId: 'flow-1', allowDesignateNext: true, stepIndex: 0, totalSteps: 2 }], snapshots: [] };

test('pending venue approval opens in place and saves assignment selection before rereading', async ({ page }) => {
  await mockApi(page);
  let rows = [pending];
  let submitted;
  let reads = 0;
  await page.route('**/api/listPendingVenueApprovals', route => { reads++; return route.fulfill({ json: { status: 'success', pending: rows } }); });
  await page.route('**/api/listVenueApproverCandidates', route => route.fulfill({ json: { status: 'success', candidates: [
    { name: 'Person A', assignmentId: 'assignment-1', assignmentLabel: 'Role A', assignment: { assignmentId: 'assignment-1', departmentName: 'Department A' } },
    { name: 'Person A', assignmentId: 'assignment-2', assignmentLabel: 'Role B', assignment: { assignmentId: 'assignment-2', departmentName: 'Department B' } }
  ] } }));
  await page.route('**/api/approveVenueBookingStep', route => { submitted = route.request().postDataJSON(); rows = []; return route.fulfill({ json: { status: 'success' } }); });
  await page.goto('/web/venue/pending');
  await page.getByRole('button', { name: ui.copy_1bb7eb3e1a, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Booking A' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/venue\/pending$/);
  await dialog.getByRole('button', { name: ui.copy_6986f4a5fd }).click();
  const selection = page.getByRole('dialog', { name: ui.copy_1f13a570b9 });
  await selection.getByRole('button', { name: 'Person A Role B' }).click();
  await selection.getByRole('button', { name: picker.confirm, exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Person A · Role B' })).toBeVisible();
  await dialog.getByLabel(ui.copy_bddb855314).fill('Approved by current role');
  await expect(dialog.getByLabel(ui.copy_bddb855314)).not.toHaveCSS('border-radius', '0px');
  const geometry = await dialog.evaluate(element => {
    const footer = element.querySelector('.dialog-footer').getBoundingClientRect();
    const body = element.querySelector('.dialog-body').getBoundingClientRect();
    return { inside: footer.bottom <= window.innerHeight, overlap: body.bottom > footer.top + 1,
      overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(geometry).toEqual({ inside: true, overlap: false, overflow: false });
  await dialog.getByRole('button', { name: ui.copy_49ef170f0b }).click();
  await expect.poll(() => reads).toBe(2);
  expect(submitted).toEqual({ id: 'booking-1', comment: 'Approved by current role', flowId: 'flow-1', nextApproverAssignmentIds: ['assignment-2'] });
  await expect(page.getByText(ui.copy_a14c4e583b, { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('venue rejection preserves the dialog on failure and permits retry', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/listPendingVenueApprovals', route => route.fulfill({ json: { status: 'success', pending: [pending] } }));
  let count = 0;
  await page.route('**/api/rejectVenueBookingStep', route => {
    count++;
    return route.fulfill({ json: count === 1 ? { status: 'forbidden', message: 'Rejected request' } : { status: 'success' } });
  });
  await page.goto('/web/venue/pending');
  await page.getByRole('button', { name: ui.copy_0c90eb0204, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Booking A' });
  await dialog.getByRole('button', { name: ui.copy_cd42af3f87 }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Rejected request');
  await dialog.getByRole('button', { name: ui.copy_cd42af3f87 }).click();
  await expect(dialog).toHaveCount(0);
  expect(count).toBe(2);
});

test('venue detail is readonly when a different work role is required', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/listPendingVenueApprovals', route => route.fulfill({ json: { status: 'success', pending: [{ ...pending, canProcessInCurrentContext: false }] } }));
  await page.goto('/web/venue/pending');
  await expect(page.getByRole('button', { name: ui.copy_1bb7eb3e1a, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: ui.copy_48283f4043, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(ui.requiredContextGeneric);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
