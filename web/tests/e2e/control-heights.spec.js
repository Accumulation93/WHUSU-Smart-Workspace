import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';

async function metrics(locator) {
  return locator.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      height: box.height,
      width: box.width,
      top: box.top,
      right: box.right,
      minHeight: parseFloat(style.minHeight),
      paddingTop: parseFloat(style.paddingTop),
      paddingBottom: parseFloat(style.paddingBottom),
      paddingLeft: parseFloat(style.paddingLeft),
      paddingRight: parseFloat(style.paddingRight),
      display: style.display,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent
    };
  }));
}

function expectActionHeight(rows, height) {
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.height).toBeCloseTo(height, 0);
    expect(row.paddingTop).toBe(row.paddingBottom);
    expect(row.paddingLeft).toBe(row.paddingRight);
    expect(row.alignItems).toBe('center');
    expect(row.justifyContent).toBe('center');
  }
}

test('venue full, compact and inline controls retain their semantic heights across device bands', async ({ page }, testInfo) => {
  const width = page.viewportSize().width;
  const fullHeight = width < 520 ? 41 : 44;
  const compactHeight = width < 520 ? 26 : 32;
  const inlineHeight = width < 520 ? 28 : 32;
  const fullPadding = width < 520 ? [8, 14] : [10, 16];
  const compactPadding = width < 520 ? [3, 7] : width < 900 ? [5, 11] : [4, 10];
  const observed = { width };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page, { activeContextId: 'ctx-admin', contextPatch: { adminLevel: 'super_admin' } });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: {
    status: 'success', organizationId: 'org-1', adminLevel: 'super_admin',
    permissions: { 'venue.resources': true, 'venue.resources.delete': true, 'venue.bookings': true, 'venue.approvals': true }
  } }));
  const venues = [{ id: 'v1', name: 'Conference room', location: 'Floor 2', description: 'Shared meeting space' }];
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues } }));
  await page.route('**/api/listAllVenueBookings', route => route.fulfill({ json: { status: 'success', bookings: [] } }));
  await page.goto('/web/venue/manage');
  await expect(page.locator('.venue-add')).toBeEnabled();
  await expect(page.locator('.venue-resource .btn-quiet')).toHaveCount(5);
  observed.add = await metrics(page.locator('.venue-add'));
  observed.cardActions = await metrics(page.locator('.venue-resource .btn-quiet'));
  observed.back = await metrics(page.locator('.shell-back'));
  expectActionHeight(observed.add, fullHeight);
  expectActionHeight(observed.cardActions, compactHeight);
  expect(observed.add[0].paddingTop).toBe(fullPadding[0]);
  expect(observed.add[0].paddingLeft).toBe(fullPadding[1]);
  expect(observed.cardActions[0].paddingTop).toBe(compactPadding[0]);
  expect(observed.cardActions[0].paddingLeft).toBe(compactPadding[1]);
  expect(observed.back[0].width).toBe(32);
  expect(observed.back[0].height).toBe(32);
  await page.screenshot({ path: testInfo.outputPath('venue-controls.png'), fullPage: true, animations: 'disabled' });

  await page.locator('.venue-add').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(ui.copy_70ae057f15).fill('New room');
  observed.fields = await metrics(dialog.locator('input.field-input'));
  observed.footer = await metrics(dialog.locator('.venue-editor-actions button'));
  expectActionHeight(observed.footer, fullHeight);
  for (const field of observed.fields) {
    expect(field.minHeight).toBe(fullHeight);
    expect(field.height).toBeGreaterThanOrEqual(fullHeight);
    expect(field.height).toBeLessThan(fullHeight + 10);
    expect(field.paddingTop).toBe(fullPadding[0]);
    expect(field.paddingBottom).toBe(fullPadding[0]);
    expect(field.display).toBe('block');
  }
  let releaseSave;
  const saved = new Promise(resolve => { releaseSave = resolve; });
  await page.route('**/api/saveVenue', async route => {
    expect(route.request().postDataJSON().name).toBe('New room');
    await saved;
    await route.fulfill({ json: { status: 'success' } });
  });
  try {
    await dialog.getByRole('button', { name: ui.copy_c701dd2fcc, exact: true }).click();
    await expect(dialog.locator('.venue-editor-actions button').first()).toBeDisabled();
    observed.busyFooter = await metrics(dialog.locator('.venue-editor-actions button'));
    expectActionHeight(observed.busyFooter, fullHeight);
    await page.screenshot({ path: testInfo.outputPath('venue-saving-controls.png'), fullPage: true, animations: 'disabled' });
  } finally {
    releaseSave();
  }
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: ui.copy_20ba89a1cc, exact: true }).click();
  await expect(page.locator('.booking-dates .btn-quiet')).toBeEnabled();
  observed.inline = await metrics(page.locator('.booking-dates .date-surface, .booking-dates .btn-quiet'));
  expect(observed.inline).toHaveLength(3);
  for (const row of observed.inline) {
    expect(row.height).toBeCloseTo(inlineHeight, 0);
    expect(row.top).toBeCloseTo(observed.inline[0].top, 0);
  }
  await page.screenshot({ path: testInfo.outputPath('venue-inline-controls.png'), fullPage: true, animations: 'disabled' });

  await mockApi(page);
  await page.route('**/api/listVenuesForBooking', route => route.fulfill({ json: { status: 'success', venues } }));
  await page.goto('/web/venue/bookings');
  await expect(page.locator('.venue-card .btn-quiet-primary')).toBeEnabled();
  observed.borrowActions = await metrics(page.locator('.venue-card .list-row-actions button'));
  expectActionHeight(observed.borrowActions, compactHeight);
  await page.screenshot({ path: testInfo.outputPath('venue-borrow-controls.png'), fullPage: true, animations: 'disabled' });
  await testInfo.attach('control-dimensions', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
});
