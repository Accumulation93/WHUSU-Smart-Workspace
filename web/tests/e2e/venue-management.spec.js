import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';

async function setup(page, permission = true) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'venue.resources': permission } } }));
}

test('venue editor uses native fields, preserves rejected input and reads back create and edit', async ({ page }) => {
  await setup(page);
  let venues = [], saves = 0;
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues } }));
  await page.route('**/api/saveVenue', route => {
    const body = route.request().postDataJSON(); saves++;
    if (saves === 1) return route.fulfill({ json: { status: 'conflict', message: 'Rejected venue' } });
    expect(Object.keys(body).sort()).toEqual(['description', 'id', 'location', 'name']);
    venues = [{ ...body, id: 'v1' }];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/manage');
  await expect(page.getByRole('button', { name: ui.copy_4fd7b5de41, exact: true })).toBeEnabled();
  const header = await page.locator('.panel-head').evaluate(element => {
    const title = element.querySelector('.section-title').getBoundingClientRect();
    const button = element.querySelector('button').getBoundingClientRect();
    const shell = element.getBoundingClientRect();
    return { titleWidth: title.width, buttonWidth: button.width, shellWidth: shell.width, buttonRight: button.right, shellRight: shell.right };
  });
  expect(header.titleWidth).toBeGreaterThan(header.shellWidth / 2);
  expect(header.buttonWidth).toBeLessThan(header.shellWidth / 2);
  expect(header.buttonRight).toBeLessThanOrEqual(header.shellRight + 1);
  await page.getByRole('button', { name: ui.copy_4fd7b5de41, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(ui.copy_70ae057f15).fill('Conference room');
  await dialog.getByLabel(ui.copy_b9966da09b).fill('Floor 2');
  await dialog.getByLabel(ui.copy_25e1199dc3).fill('Retained description');
  const surfaces = await dialog.locator('input, textarea').evaluateAll(elements => elements.map(element => {
    const css = getComputedStyle(element); return { background: css.backgroundImage, radius: css.borderRadius, font: css.fontFamily, display: css.display };
  }));
  expect(surfaces[0]).toEqual(surfaces[2]);
  const footer = await dialog.locator('.venue-editor-actions').evaluate(element => {
    const row = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return { width: row.width, parentWidth: parent.width, firstWidth: buttons[0].width, secondWidth: buttons[1].width, topDifference: Math.abs(buttons[0].top - buttons[1].top) };
  });
  expect(Math.abs(footer.width - footer.parentWidth)).toBeLessThan(1);
  expect(Math.abs(footer.firstWidth - footer.secondWidth)).toBeLessThan(1);
  expect(footer.topDifference).toBeLessThan(1);
  await dialog.getByRole('button', { name: ui.copy_c701dd2fcc }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Rejected venue');
  await expect(dialog.getByLabel(ui.copy_25e1199dc3)).toHaveValue('Retained description');
  await dialog.getByRole('button', { name: ui.copy_c701dd2fcc }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.venue-resource')).toContainText('Retained description');
  await expect(page.locator('.venue-resource .chip')).toHaveCount(0);
  await page.getByRole('button', { name: ui.copy_e040ae3016, exact: true }).click();
  await expect(dialog.getByLabel(ui.copy_b9966da09b)).toHaveValue('Floor 2');
  await dialog.getByLabel(ui.copy_b9966da09b).fill('Floor 3');
  await dialog.getByRole('button', { name: ui.copy_c701dd2fcc }).click();
  await expect(page.locator('.venue-resource')).toContainText('Floor 3');
  expect(venues[0]).toEqual({ id: 'v1', name: 'Conference room', location: 'Floor 3', description: 'Retained description' });
});

test('successful venue save with failed reread preserves input and prevents a duplicate after closing', async ({ page }) => {
  await setup(page);
  let failRead = false, saves = 0;
  await page.route('**/api/listVenues', route => route.fulfill({ json: failRead ? { status: 'error', message: 'Read failed' } : { status: 'success', venues: [{ id: 'v1', name: saves ? 'Changed' : 'Original' }] } }));
  await page.route('**/api/saveVenue', route => { saves++; failRead = true; return route.fulfill({ json: { status: 'success' } }); });
  await page.goto('/web/venue/manage');
  await page.getByRole('button', { name: ui.copy_e040ae3016, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(ui.copy_70ae057f15).fill('Changed');
  await dialog.getByRole('button', { name: ui.copy_c701dd2fcc }).click();
  await expect(dialog.getByRole('button', { name: copy.common.retry, exact: true })).toBeEnabled();
  await expect(dialog.getByLabel(ui.copy_70ae057f15)).toHaveValue('Changed');
  await expect(dialog.getByRole('button', { name: ui.copy_c701dd2fcc })).toBeDisabled();
  await dialog.getByRole('button', { name: ui.copy_06dbb49961, exact: true }).click();
  await expect(page.locator('.venue-resource')).toContainText('Original');
  await expect(page.getByRole('button', { name: ui.copy_e040ae3016, exact: true })).toBeDisabled();
  failRead = false;
  await page.getByRole('button', { name: copy.common.retry, exact: true }).click();
  await expect(page.locator('.venue-resource')).toContainText('Changed');
  await expect(page.getByRole('button', { name: ui.copy_e040ae3016, exact: true })).toBeEnabled();
  expect(saves).toBe(1);
});

test('venue delete confirms the named target, cancel does not write, rejection retains the card and success rereads', async ({ page }) => {
  await setup(page);
  let venues = [{ id: 'v1', name: 'Protected room' }], deletes = 0;
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues } }));
  await page.route('**/api/deleteVenue', route => {
    expect(route.request().postDataJSON()).toEqual({ id: 'v1' }); deletes++;
    if (deletes === 1) return route.fulfill({ json: { status: 'conflict', message: 'Delete rejected' } });
    venues = []; return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/manage');
  const remove = page.getByRole('button', { name: ui.copy_acc985cabc, exact: true });
  await remove.click();
  await expect(page.getByRole('dialog')).toContainText('Protected room');
  await page.getByRole('dialog').getByRole('button', { name: copy.common.cancel, exact: true }).click();
  expect(deletes).toBe(0);
  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: copy.common.confirm, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Delete rejected');
  await expect(page.locator('.venue-resource')).toContainText('Protected room');
  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: copy.common.confirm, exact: true }).click();
  await expect(page.getByText(ui.copy_5e9f82c1cf, { exact: true })).toBeVisible();
  expect(deletes).toBe(2);
});

test('venue management does not request or expose resources without its specific permission', async ({ page }) => {
  await setup(page, false);
  let reads = 0;
  await page.route('**/api/listVenues', route => { reads++; return route.fulfill({ json: { status: 'success', venues: [] } }); });
  await page.goto('/web/venue/manage');
  await expect(page.getByText(ui.copy_0de5656de5)).toBeVisible();
  await expect(page.getByRole('button', { name: ui.copy_4fd7b5de41, exact: true })).toHaveCount(0);
  expect(reads).toBe(0);
});

test('pending venue save freezes the editor and prevents closing until reread', async ({ page }) => {
  await setup(page);
  let release, started = false;
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: [] } }));
  await page.route('**/api/saveVenue', async route => {
    started = true; await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/manage');
  await page.getByRole('button', { name: ui.copy_4fd7b5de41, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(ui.copy_70ae057f15).fill('Pending room');
  await dialog.getByRole('button', { name: ui.copy_c701dd2fcc }).click();
  await expect.poll(() => started).toBe(true);
  await expect(dialog.getByRole('button', { name: ui.copy_09614cef6c, exact: true })).toBeDisabled();
  await expect(dialog.getByLabel(ui.copy_70ae057f15)).toBeDisabled();
  await dialog.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
});
