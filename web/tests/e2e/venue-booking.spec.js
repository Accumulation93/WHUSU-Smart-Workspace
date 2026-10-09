import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import picker from '../../src/locales/zh-CN/shared/personnelPicker.js';
import copy from '../../src/locales/zh-CN/index.js';

async function setup(page) {
  await mockApi(page);
  const saved = [];
  let request;
  let reads = 0;
  await page.route('**/api/listVenuesForBooking', route => route.fulfill({ json: { status: 'success', venues: [{ id: 'venue-1', name: 'Room A' }] } }));
  await page.route('**/api/getVenueSchedule', route => route.fulfill({ json: { status: 'success', dailySchedules: [{ openSlots: [{ timeStart: '09:00', timeEnd: '18:00' }], bookedSlots: [{ timeStart: '12:00', timeEnd: '13:00' }], activitySlots: [] }] } }));
  await page.route('**/api/getVenueApprovalFlowOptions', route => route.fulfill({ json: { status: 'success', allowUserSelect: true, flows: [{ id: 'flow-1', name: 'Flow A', allowDesignateFirst: true }] } }));
  await page.route('**/api/listVenueBookingPurposes', route => route.fulfill({ json: { status: 'success', purposes: [{ id: 'purpose-1', text: 'Meeting' }] } }));
  await page.route('**/api/listVenueApproverCandidates', route => route.fulfill({ json: { status: 'success', candidates: [{ name: 'Approver', assignmentId: 'assignment-2', assignmentLabel: 'Role B' }] } }));
  await page.route('**/api/createVenueBooking', route => {
    request = route.request().postDataJSON(); saved.push({ id: 'new-booking', ...request });
    return route.fulfill({ json: { status: 'success', id: 'new-booking' } });
  });
  await page.route('**/api/listMyVenueBookings', route => { reads++; return route.fulfill({ json: { status: 'success', bookings: saved } }); });
  return { saved, request: () => request, reads: () => reads };
}

test('booking opens in place with schedule, purpose, flow and first approver', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/web/venue/bookings');
  await expect(page.getByRole('button', { name: ui.copy_183fdf9907, exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  if (page.viewportSize().width < 520) {
    const layout = await page.locator('.venue-card').evaluate(card => ({ body: card.querySelector('.list-row-main').getBoundingClientRect().bottom, actions: card.querySelector('.list-row-actions').getBoundingClientRect().top }));
    expect(layout.actions).toBeGreaterThanOrEqual(layout.body);
  }
  await page.getByRole('button', { name: ui.copy_183fdf9907, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: ui.copy_2b262b7940 + ' · Room A' });
  await dialog.getByLabel(ui.copy_39fcaa02ad).fill('2035-10-10');
  await expect(dialog.locator('.time-display').first().getByRole('button', { name: ui.copy_7bbe7387fa })).toHaveText('09');
  await dialog.getByRole('button', { name: 'Meeting', exact: true }).click();
  await dialog.getByLabel(ui.copy_3bc010171a).selectOption('flow-1');
  await dialog.getByRole('button', { name: ui.copy_6986f4a5fd }).click();
  const selection = page.getByRole('dialog', { name: ui.copy_0522689efc });
  await selection.getByRole('button', { name: 'Approver Role B' }).click();
  await selection.getByRole('button', { name: picker.confirm, exact: true }).click();
  await dialog.getByRole('button', { name: ui.copy_02ef2f799d }).click();
  await expect.poll(state.reads).toBe(1);
  expect(state.request()).toMatchObject({ venueId: 'venue-1', title: 'Meeting', timeStart: '2035-10-10T09:00', timeEnd: '2035-10-10T10:00', flowId: 'flow-1', firstApproverAssignmentIds: ['assignment-2'] });
  expect(state.saved).toHaveLength(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/venue\/bookings$/);
});

test('time selection refuses occupied spans and legacy create URL uses the same dialog', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/web/venue/create?venueId=venue-1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(ui.copy_39fcaa02ad).fill('2035-10-10');
  const end = dialog.locator('.time-display').last();
  await expect(end.getByRole('button', { name: ui.copy_7bbe7387fa })).toHaveText('10');
  await dialog.locator('.time-display').first().getByRole('button', { name: ui.copy_7bbe7387fa }).click();
  const keyboard = dialog.locator('.time-keyboard');
  await keyboard.getByRole('button', { name: '1', exact: true }).click();
  await keyboard.getByRole('button', { name: '0', exact: true }).click();
  await keyboard.getByRole('button', { name: '⌫', exact: true }).click();
  await expect(keyboard.getByRole('button', { name: ui.copy_9feed17479 })).toHaveText('00');
  await keyboard.getByRole('button', { name: ui.copy_9feed17479 }).click();
  await keyboard.getByRole('button', { name: '3', exact: true }).click();
  await keyboard.getByRole('button', { name: '0', exact: true }).click();
  await keyboard.getByRole('button', { name: ui.copy_bd24ac5b0c, exact: true }).click();
  await dialog.getByRole('button', { name: ui.copy_d5973d50ff, exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(ui.copy_abf766aebc);
  await expect(end.getByRole('button', { name: ui.copy_7bbe7387fa })).toHaveText('11');
  await expect(end.getByRole('button', { name: ui.copy_9feed17479 })).toHaveText('30');
  await end.getByRole('button', { name: ui.copy_7bbe7387fa }).click();
  await keyboard.getByRole('button', { name: '1', exact: true }).click();
  await expect(keyboard.getByRole('button', { name: '3', exact: true })).toBeDisabled();
  await keyboard.press('Escape');
  await expect(keyboard).toHaveCount(0);
  expect(state.saved).toHaveLength(0);
  await dialog.getByRole('button', { name: ui.copy_09614cef6c, exact: true }).click();
  await expect(page).toHaveURL(/\/venue\/bookings$/);
});
