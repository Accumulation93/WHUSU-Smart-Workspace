import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import userUi from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import controls from '../../src/locales/zh-CN/shared/controlLayout.js';
import copy from '../../src/locales/zh-CN/index.js';

async function setup(page, canBook = true) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'venue.resources': true, 'venue.bookings': canBook } } }));
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: [{ id: 'v1', name: 'Admin room' }] } }));
  await page.route('**/api/listVenueBookingPurposes', route => route.fulfill({ json: { status: 'success', purposes: [{ id: 'p1', text: 'Meeting' }] } }));
  const state = { date: '', saved: false, failDaily: false, failWeekly: false, weeklyReads: 0 };
  await page.route('**/api/getVenueSchedule', route => {
    const body = route.request().postDataJSON(), daily = body.dateFrom === body.dateTo;
    if (!daily) state.weeklyReads++;
    state.date = daily ? body.dateFrom : body.dateTo;
    if (daily ? state.failDaily : state.failWeekly) return route.fulfill({ json: { status: 'error', message: 'Schedule failed' } });
    return route.fulfill({ json: { status: 'success', dailySchedules: [{ date: state.date,
      openSlots: [{ timeStart: '08:00', timeEnd: '18:00' }], activitySlots: [], bookedSlots: state.saved
        ? [{ id: 'saved', title: 'Meeting', status: 'approved', timeStart: '09:00', timeEnd: '10:00', fullTimeStart: state.date + ' 09:00', fullTimeEnd: state.date + ' 10:00', visibility: 'details', description: 'Saved description' }]
        : [{ id: 'blocked', title: 'Occupied', status: 'approved', timeStart: '10:00', timeEnd: '11:00', visibility: 'occupancy_only' }] }] } });
  });
  await page.goto('/web/portal'); await page.getByRole('button', { name: copy.portal.venueManage, exact: true }).click();
  await page.getByRole('button', { name: ui.copy_391b522838, exact: true }).click();
  await expect(page.locator('.schedule-grid')).toBeVisible();
  return state;
}
const editor = page => page.getByRole('dialog', { name: 'Admin room · ' + ui.copy_05c1604f42, exact: true });
async function openBooking(page, state) { await page.getByRole('button', { name: state.date + ' 09:00', exact: true }).click(); await expect(editor(page)).toBeVisible(); }

test('admin schedule without booking permission has no create targets but shows protected occupancy', async ({ page }) => {
  await setup(page, false);
  await expect(page.locator('.schedule-target')).toHaveCount(0);
  await page.getByRole('button', { name: 'Occupied', exact: true }).click();
  await expect(page.getByRole('dialog', { name: userUi.copy_a1f843d887, exact: true })).toContainText('10:00');
  await expect(page.getByText('Saved description', { exact: true })).toHaveCount(0);
});

test('admin booking uses locked date, native hour and minute selection, rejects conflicts and rereads a saved booking', async ({ page }) => {
  const state = await setup(page); let writes = 0, originalId;
  await page.route('**/api/createAdminVenueBooking', route => {
    const body = route.request().postDataJSON(); writes++;
    expect(body).toEqual({ venueId: 'v1', title: 'Meeting', description: 'Saved description', timeStart: state.date + 'T09:00', timeEnd: state.date + 'T10:00', clientRequestId: expect.any(String) });
    if (writes === 1) { originalId = body.clientRequestId; return route.fulfill({ json: { status: 'conflict', message: 'Rejected booking' } }); }
    expect(body.clientRequestId).toBe(originalId); state.saved = true;
    return route.fulfill({ json: { status: 'success', id: 'saved' } });
  });
  await openBooking(page, state); const dialog = editor(page);
  await dialog.getByRole('button', { name: 'Meeting', exact: true }).click();
  await expect(dialog.locator('input[type=date]')).toHaveCount(0); await expect(dialog).toContainText(state.date + ' · ' + ui.copy_8a0b0acde8);
  const start = dialog.getByRole('group', { name: ui.copy_deb776d2af, exact: true }), end = dialog.getByRole('group', { name: ui.copy_2bd6adcbb9, exact: true });
  await expect(start.getByLabel(userUi.copy_7bbe7387fa)).toHaveValue('09'); await expect(end.getByLabel(userUi.copy_7bbe7387fa)).toHaveValue('10');
  await end.getByLabel(userUi.copy_7bbe7387fa).selectOption('11'); await expect(dialog.getByRole('alert')).toHaveText(controls.timeRangeUnavailable);
  await expect(end.getByLabel(userUi.copy_7bbe7387fa)).toHaveValue('10');
  const handle = dialog.locator('.admin-handle.start'), box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.up();
  await expect(start.getByLabel(userUi.copy_9feed17479)).toHaveValue('00');
  await handle.press('ArrowRight'); await expect(start.getByLabel(userUi.copy_9feed17479)).toHaveValue('10');
  await handle.press('ArrowLeft'); await expect(start.getByLabel(userUi.copy_9feed17479)).toHaveValue('00');
  await dialog.getByLabel(ui.copy_90f94d6263).fill('Saved description');
  await dialog.getByRole('button', { name: ui.copy_df031d471b, exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Rejected booking'); await expect(dialog.getByLabel(ui.copy_90f94d6263)).toHaveValue('Saved description');
  await dialog.getByRole('button', { name: ui.copy_df031d471b, exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('.schedule-grid').getByRole('button', { name: 'Meeting', exact: true })).toBeVisible();
  await page.locator('.schedule-grid').getByRole('button', { name: 'Meeting', exact: true }).click();
  await expect(page.getByRole('dialog', { name: userUi.copy_40d594ac66, exact: true })).toContainText('Saved description');
  expect(writes).toBe(2); expect(state.weeklyReads).toBe(2);
});

test('admin booking retries unavailable day without losing fields and saved reread failure cannot duplicate the write', async ({ page }) => {
  const state = await setup(page); state.failDaily = true; let writes = 0;
  await page.route('**/api/createAdminVenueBooking', route => { writes++; state.saved = true; state.failWeekly = true; return route.fulfill({ json: { status: 'success', id: 'saved' } }); });
  await openBooking(page, state); const dialog = editor(page);
  await dialog.getByLabel(ui.copy_bbb0cc00c9).fill('Meeting');
  await expect(dialog.getByRole('alert')).toHaveText('Schedule failed'); await expect(dialog.getByRole('button', { name: ui.copy_df031d471b, exact: true })).toBeDisabled();
  state.failDaily = false; await dialog.getByRole('button', { name: copy.common.retry, exact: true }).click();
  await expect(dialog.getByLabel(ui.copy_bbb0cc00c9)).toHaveValue('Meeting');
  await dialog.getByRole('button', { name: ui.copy_df031d471b, exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('alert')).toHaveText('Schedule failed');
  await expect(page.locator('.schedule-target')).toHaveCount(0);
  state.failWeekly = false; await page.getByRole('button', { name: copy.common.retry, exact: true }).click();
  await expect(page.locator('.schedule-grid').getByRole('button', { name: 'Meeting', exact: true })).toBeVisible(); expect(writes).toBe(1);
});

test('pending admin booking prevents dialog closing and page navigation until the write finishes', async ({ page }) => {
  const state = await setup(page); let release, started = false;
  await page.route('**/api/createAdminVenueBooking', async route => { started = true; await new Promise(resolve => { release = resolve; }); state.saved = true; await route.fulfill({ json: { status: 'success', id: 'saved' } }); });
  await openBooking(page, state); const dialog = editor(page);
  await dialog.getByLabel(ui.copy_bbb0cc00c9).fill('Meeting'); await dialog.getByRole('button', { name: ui.copy_df031d471b, exact: true }).click();
  await expect.poll(() => started).toBe(true); await expect(dialog.getByLabel(ui.copy_bbb0cc00c9)).toBeDisabled();
  await dialog.press('Escape'); await expect(dialog).toBeVisible(); await page.goBack(); await expect(page).toHaveURL(/venue\/manage$/);
  release(); await expect(dialog).toHaveCount(0); await expect(page.locator('.schedule-grid').getByRole('button', { name: 'Meeting', exact: true })).toBeVisible();
});
