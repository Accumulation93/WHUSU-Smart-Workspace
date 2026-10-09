import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/activityBehavior.js';
import personnel from '../../src/locales/zh-CN/shared/adminPersonnel.js';

async function setup(page) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: {
    status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'scoring.activities': true, 'scoring.templates': true }
  } }));
}

test('activity saves native parameters, rereads results and keeps an unfinished draft across tabs', async ({ page }) => {
  await setup(page);
  let list = [];
  let writes = 0;
  await page.route('**/api/listScoreActivities', route => route.fulfill({ json: { status: 'success', list } }));
  await page.route('**/api/saveScoreActivity', route => {
    const body = route.request().postDataJSON();
    writes++;
    expect(body).toMatchObject({ id: '', name: 'Activity', description: 'Description', startDate: '2026-10-09', endDate: '2026-10-10', participantGranularity: 'assignment' });
    expect(body).not.toHaveProperty('isPaused');
    if (writes === 1) return route.fulfill({ json: { status: 'duplicate', message: 'Rejected activity' } });
    list = [{ ...body, id: 'a1', isCurrent: false, isPaused: false }];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=scoring');
  const styles = await page.locator('form input:not([type="date"]), form textarea').evaluateAll(elements => elements.map(element => {
    const css = getComputedStyle(element); return { font: css.fontFamily, radius: css.borderRadius, background: css.backgroundImage };
  }));
  expect(styles[0]).toEqual(styles[1]);
  await page.getByLabel(ui.copy_a782814703).fill('Activity');
  await page.getByLabel(ui.copy_cbdd390194).fill('Description');
  await page.getByLabel(ui.copy_296051824f).fill('2026-10-09');
  await page.getByLabel(ui.copy_932ce40cfb).fill('2026-10-10');
  await page.getByRole('tab', { name: ui.copy_5a49161fd7 }).click();
  await page.getByRole('tab', { name: ui.copy_5aa4cb13ec }).click();
  await expect(page.getByLabel(ui.copy_a782814703)).toHaveValue('Activity');
  await page.getByRole('button', { name: ui.copy_189d8358eb }).click();
  await expect(page.getByText('Rejected activity')).toBeVisible();
  await expect(page.getByLabel(ui.copy_a782814703)).toHaveValue('Activity');
  await page.getByRole('button', { name: ui.copy_189d8358eb }).click();
  await expect(page.locator('.activity-row')).toContainText('Activity');
  await expect(page.getByLabel(ui.copy_a782814703)).toHaveValue('');
  expect(writes).toBe(2);
  await page.locator('.activity-row').getByRole('button', { name: ui.copy_e040ae3016 }).click();
  await expect(page.getByLabel(ui.copy_a782814703)).toHaveValue('Activity');
  await expect(page.getByLabel(ui.copy_296051824f)).toHaveValue('2026-10-09');
});

test('current activity and deletion require confirmation while pause and restore reread authoritative state', async ({ page }) => {
  await setup(page);
  let row = { id: 'a1', name: 'Existing activity', isCurrent: false, isPaused: false };
  let deleted = false;
  const calls = [];
  await page.route('**/api/listScoreActivities', route => route.fulfill({ json: { status: 'success', list: deleted ? [] : [row] } }));
  await page.route('**/api/setCurrentScoreActivity', route => {
    calls.push('current'); expect(route.request().postDataJSON().id).toBe('a1'); row.isCurrent = true;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.route('**/api/toggleActivityPause', route => {
    calls.push('pause'); expect(route.request().postDataJSON().id).toBe('a1'); row.isPaused = !row.isPaused;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.route('**/api/deleteScoreActivity', route => {
    calls.push('delete');
    if (calls.filter(name => name === 'delete').length === 1) return route.fulfill({ json: { status: 'conflict', message: 'Historical records prevent deletion' } });
    deleted = true; return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=scoring');
  const card = page.locator('.activity-row');
  await card.getByRole('button', { name: ui.copy_726cfc3525 }).click();
  await expect(page.getByRole('dialog')).toContainText('Existing activity');
  await page.getByRole('dialog').getByRole('button', { name: copy.common.cancel, exact: true }).click();
  expect(calls).toEqual([]);
  await card.getByRole('button', { name: ui.copy_726cfc3525 }).click();
  await page.getByRole('dialog').getByRole('button', { name: copy.common.confirm, exact: true }).click();
  await expect(card).toContainText(ui.copy_22123f353c);
  await card.getByRole('button', { name: ui.copy_74e00681c9 }).click();
  await expect(card).toContainText(ui.copy_82a3e85f96);
  await card.getByRole('button', { name: ui.copy_0735ccbfbd }).click();
  await expect(card.getByText(ui.copy_82a3e85f96)).toHaveCount(0);
  await card.getByRole('button', { name: ui.copy_acc985cabc }).click();
  await expect(page.getByRole('dialog')).toContainText(messages.copy_1d38f8a471);
  await page.getByRole('dialog').getByRole('button', { name: copy.common.confirm, exact: true }).click();
  await expect(page.getByText('Historical records prevent deletion')).toBeVisible();
  await expect(card).toContainText('Existing activity');
  expect(calls).toEqual(['current', 'pause', 'pause', 'delete']);
  await card.getByRole('button', { name: ui.copy_acc985cabc }).click();
  await page.getByRole('dialog').getByRole('button', { name: copy.common.confirm, exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('successful activity save followed by failed reread cannot create a duplicate after tab switching', async ({ page }) => {
  await setup(page);
  let saved = false;
  let recover = false;
  let writes = 0;
  await page.route('**/api/listScoreActivities', route => route.fulfill({ json: saved && !recover
    ? { status: 'unavailable', message: 'Read unavailable' }
    : { status: 'success', list: saved ? [{ id: 'a1', name: 'Saved activity' }] : [] } }));
  await page.route('**/api/saveScoreActivity', route => { saved = true; writes++; return route.fulfill({ json: { status: 'success' } }); });
  await page.goto('/web/admin?subApp=scoring');
  await page.getByLabel(ui.copy_a782814703).fill('Saved activity');
  await page.getByRole('button', { name: ui.copy_189d8358eb }).click();
  await expect(page.getByText('Read unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: ui.copy_189d8358eb })).toBeDisabled();
  await page.getByRole('tab', { name: ui.copy_5a49161fd7 }).click();
  await page.getByRole('tab', { name: ui.copy_5aa4cb13ec }).click();
  await expect(page.getByLabel(ui.copy_a782814703)).toHaveValue('Saved activity');
  await expect(page.getByRole('button', { name: ui.copy_189d8358eb })).toBeDisabled();
  recover = true;
  await page.getByRole('button', { name: personnel.dictionaryRetry }).click();
  await expect(page.getByLabel(ui.copy_a782814703)).toHaveValue('');
  await expect(page.locator('.activity-row')).toContainText('Saved activity');
  expect(writes).toBe(1);
});
