import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import copy from '../../src/locales/zh-CN/index.js';

async function setup(page, permissions = { 'venue.resources': true, 'venue.bookings': true, 'venue.approvals': true, 'venue.purposes': true }) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions } }));
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: [{ id: 'v1', name: 'Room' }] } }));
}
const tab = (page, label) => page.locator('.venue-admin-tabs').getByRole('button', { name: label, exact: true });

test('native venue tabs preserve purpose drafts and successful writes reread without duplication across tabs', async ({ page }) => {
  await setup(page);
  let purposes = [], saves = 0, failRead = false;
  await page.route('**/api/listVenueBookingPurposes', route => route.fulfill({ json: failRead ? { status: 'error', message: 'Read failed' } : { status: 'success', purposes } }));
  await page.route('**/api/saveVenueBookingPurpose', route => {
    saves++; const body = route.request().postDataJSON();
    expect(body).toEqual({ id: '', text: 'Meeting' });
    if (saves === 1) return route.fulfill({ json: { status: 'duplicate', message: 'Rejected purpose' } });
    purposes = [{ id: 'p1', text: body.text }]; failRead = true;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/manage');
  await expect(page.locator('.venue-admin-tabs button')).toHaveText([ui.copy_ceffdfcdd7, ui.copy_20ba89a1cc, ui.copy_e7f0a24301, ui.copy_8dcf3fcf0b]);
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 310, height: 844 });
  const tabGeometry = await page.locator('.venue-admin-tabs button').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element), range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    return { width: box.width, textWidth: text.width, padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), lines: range.getClientRects().length, top: box.top };
  }));
  for (const item of tabGeometry) {
    expect(item.lines).toBe(1);
    expect(item.textWidth + item.padding).toBeLessThanOrEqual(item.width);
  }
  expect(Math.max(...tabGeometry.map(item => item.top)) - Math.min(...tabGeometry.map(item => item.top))).toBeLessThan(1);
  await page.setViewportSize(originalViewport);
  await tab(page, ui.copy_8dcf3fcf0b).click();
  await page.getByLabel(ui.copy_a97eb08acb).fill(' Meeting ');
  await tab(page, ui.copy_ceffdfcdd7).click();
  await tab(page, ui.copy_8dcf3fcf0b).click();
  await expect(page.getByLabel(ui.copy_a97eb08acb)).toHaveValue(' Meeting ');
  await page.getByRole('button', { name: ui.copy_4f9ebda03b, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Rejected purpose');
  await page.getByRole('button', { name: ui.copy_4f9ebda03b, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.common.retry, exact: true })).toBeEnabled();
  await tab(page, ui.copy_ceffdfcdd7).click();
  await tab(page, ui.copy_8dcf3fcf0b).click();
  await expect(page.getByLabel(ui.copy_a97eb08acb)).toHaveValue(' Meeting ');
  await expect(page.getByRole('button', { name: ui.copy_4f9ebda03b, exact: true })).toBeDisabled();
  failRead = false;
  await page.getByRole('button', { name: copy.common.retry, exact: true }).click();
  await expect(page.getByLabel(ui.copy_a97eb08acb)).toHaveValue('');
  await expect(page.locator('.purpose-row')).toContainText('Meeting');
  expect(saves).toBe(2);
});

test('purpose edit accepts 200 unicode codepoints, rejects 201 and delete confirms target and preserves conflicts', async ({ page }) => {
  await setup(page, { 'venue.purposes': true });
  let purposes = [{ id: 'p1', text: 'Original' }], saves = 0, deletes = 0;
  await page.route('**/api/listVenueBookingPurposes', route => route.fulfill({ json: { status: 'success', purposes } }));
  await page.route('**/api/saveVenueBookingPurpose', route => {
    const body = route.request().postDataJSON(); saves++;
    expect(body).toEqual({ id: 'p1', text: '😀'.repeat(200) }); purposes = [{ ...body }];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.route('**/api/deleteVenueBookingPurpose', route => {
    deletes++; expect(route.request().postDataJSON()).toEqual({ id: 'p1' });
    if (deletes === 1) return route.fulfill({ json: { status: 'conflict', message: 'Referenced purpose' } });
    purposes = []; return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/manage');
  await expect(page.locator('.venue-admin-tabs button')).toHaveText([ui.copy_8dcf3fcf0b]);
  await page.getByRole('button', { name: ui.copy_e040ae3016, exact: true }).click();
  const input = page.getByLabel(ui.copy_a97eb08acb);
  await input.fill('😀'.repeat(201));
  await page.getByRole('button', { name: ui.copy_27e5395986, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(ui.bookingPurposeTooLong); expect(saves).toBe(0);
  await input.fill('😀'.repeat(200));
  const layout = await page.locator('.purpose-input-row').evaluate(element => {
    const rects = [...element.children].map(child => child.getBoundingClientRect());
    return { tops: rects.map(rect => rect.top), right: rects.at(-1).right, outer: element.getBoundingClientRect().right, widths: rects.map(rect => rect.width) };
  });
  expect(Math.max(...layout.tops) - Math.min(...layout.tops)).toBeLessThan(1);
  expect(layout.right).toBeLessThanOrEqual(layout.outer + 1); expect(Math.min(...layout.widths)).toBeGreaterThan(30);
  await page.getByRole('button', { name: ui.copy_27e5395986, exact: true }).click();
  await expect(input).toHaveValue(''); await expect(page.locator('.purpose-row')).toContainText('😀'.repeat(200));
  const remove = page.locator('.purpose-row').getByRole('button', { name: ui.copy_acc985cabc, exact: true });
  await remove.click();
  await expect(page.getByRole('dialog')).toContainText('😀'.repeat(200));
  await page.getByRole('dialog').getByRole('button', { name: ui.copy_06dbb49961, exact: true }).click(); expect(deletes).toBe(0);
  await remove.click(); await page.getByRole('dialog').getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Referenced purpose');
  await expect(page.locator('.purpose-row')).toHaveCount(1);
  await remove.click(); await page.getByRole('dialog').getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click();
  await expect(page.getByText(ui.copy_b55eac70b1, { exact: true })).toBeVisible(); expect(deletes).toBe(2);
});

test('purpose saving blocks tabs and navigation then leaving clears the unsaved draft', async ({ page }) => {
  await setup(page);
  let release, started = false;
  await page.route('**/api/listVenueBookingPurposes', route => route.fulfill({ json: { status: 'success', purposes: [] } }));
  await page.route('**/api/saveVenueBookingPurpose', async route => {
    started = true; await new Promise(resolve => { release = resolve; }); await route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/portal'); await page.getByRole('button', { name: copy.portal.venueManage, exact: true }).click();
  await tab(page, ui.copy_8dcf3fcf0b).click(); await page.getByLabel(ui.copy_a97eb08acb).fill('Pending');
  await page.getByRole('button', { name: ui.copy_4f9ebda03b, exact: true }).click(); await expect.poll(() => started).toBe(true);
  await expect(tab(page, ui.copy_ceffdfcdd7)).toBeDisabled(); await page.goBack(); await expect(page).toHaveURL(/venue\/manage$/);
  release(); await expect(page.getByLabel(ui.copy_a97eb08acb)).toHaveValue('');
  await page.getByLabel(ui.copy_a97eb08acb).fill('Unsaved'); await page.goBack(); await expect(page).toHaveURL(/portal$/);
  await page.goForward(); await tab(page, ui.copy_8dcf3fcf0b).click(); await expect(page.getByLabel(ui.copy_a97eb08acb)).toHaveValue('');
});

test('management list merges pending outside date range, filters computed status and opens the shared detail', async ({ page }) => {
  await setup(page);
  const requests = [];
  const pending = { id: 'old', title: 'Older pending', status: 'pending', venueName: 'Room', userName: 'Applicant', creatorAssignmentLabel: 'Original role' };
  const completed = { id: 'done', title: 'Completed booking', status: 'approved', venueName: 'Room', timeStart: '2020-01-01T01:00:00Z', timeEnd: '2020-01-01T02:00:00Z', description: 'Saved description' };
  await page.route('**/api/listAllVenueBookings', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    return route.fulfill({ json: { status: 'success', bookings: body.timeFrom ? [pending, completed] : [pending] } });
  });
  await page.goto('/web/venue/manage'); await tab(page, ui.copy_20ba89a1cc).click();
  await expect(page.locator('.booking-row')).toHaveCount(2);
  expect(requests.some(request => request.status === 'pending' && !request.timeFrom && !request.timeTo)).toBe(true);
  expect(requests.some(request => / 00:00$/.test(request.timeFrom) && / 23:59$/.test(request.timeTo))).toBe(true);
  await page.getByRole('button', { name: ui.copy_dc59906817, exact: true }).click();
  await expect(page.locator('.booking-row')).toHaveCount(1);
  expect(requests.at(-1).status).toBe('approved');
  await page.locator('.booking-row').click(); await expect(page.getByRole('dialog')).toContainText('Saved description');
  await page.getByRole('dialog').press('Escape');
  const dates = await page.locator('.booking-dates').evaluate(element => [...element.children].map(child => ({ height: child.getBoundingClientRect().height, top: child.getBoundingClientRect().top })));
  expect(Math.abs(dates[0].height - dates[2].height)).toBeLessThan(1);
  expect(Math.abs(dates[0].height - dates[3].height)).toBeLessThan(1);
  await tab(page, ui.copy_e7f0a24301).click(); await expect(page).toHaveURL(/venue\/pending$/);
});

test('management approval keeps failed comments and uses step endpoint with native parameters before rereading', async ({ page }) => {
  await setup(page, { 'venue.approvals': true });
  let saved = false, writes = 0, failRead = false;
  const booking = { id: 'b1', title: 'Flow booking', status: 'pending', venueName: 'Room', userCanApprove: true,
    approvalProgress: { flowId: 'f1', currentStep: 0, totalSteps: 1, flowSteps: [], snapshots: [] } };
  await page.route('**/api/listAllVenueBookings', route => route.fulfill({ json: failRead ? { status: 'error', message: 'Read failed' } : { status: 'success', bookings: saved ? [] : [booking] } }));
  await page.route('**/api/approveVenueBookingStep', route => {
    writes++; expect(route.request().postDataJSON()).toEqual({ id: 'b1', comment: 'Approved comment' });
    if (writes === 1) return route.fulfill({ json: { status: 'conflict', message: 'Approval rejected' } });
    saved = true; failRead = true; return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/manage'); await page.locator('.booking-row').getByRole('button', { name: ui.copy_1bb7eb3e1a, exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel(ui.copy_bddb855314).fill('Approved comment');
  await dialog.getByRole('button', { name: ui.copy_49ef170f0b, exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Approval rejected'); await expect(dialog.getByLabel(ui.copy_bddb855314)).toHaveValue('Approved comment');
  await dialog.getByRole('button', { name: ui.copy_49ef170f0b, exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('alert')).toHaveText('Read failed');
  await expect(page.locator('.booking-row').getByRole('button', { name: ui.copy_1bb7eb3e1a, exact: true })).toBeDisabled();
  failRead = false; await page.getByRole('button', { name: copy.common.retry, exact: true }).click();
  await expect(page.locator('.booking-row')).toHaveCount(0); expect(writes).toBe(2);
});

test('booking permission alone shows no approvals and independent read failures retain the latest list', async ({ page }) => {
  await setup(page, { 'venue.bookings': true });
  let fail = false;
  await page.route('**/api/listAllVenueBookings', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: fail && !body.timeFrom ? { status: 'error', message: 'Pending read failed' } : { status: 'success', bookings: [{ id: 'b1', title: 'Retained', status: 'pending', userCanApprove: true }] } });
  });
  await page.goto('/web/venue/manage'); await expect(page.locator('.booking-row')).toHaveCount(1);
  await expect(page.locator('.venue-admin-tabs button')).toHaveText([ui.copy_20ba89a1cc]);
  await expect(page.locator('.booking-actions')).toHaveCount(0);
  fail = true; await page.getByRole('button', { name: ui.copy_dc59906817, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Pending read failed'); await expect(page.locator('.booking-row')).toContainText('Retained');
  await page.locator('.booking-row').click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  fail = false; await page.getByRole('button', { name: copy.common.retry, exact: true }).click(); await expect(page.locator('.booking-row')).toHaveCount(0);
});
