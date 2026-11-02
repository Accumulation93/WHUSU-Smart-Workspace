import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';
const text = ui.configurationCopy;

async function setup(page) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', organizationId: 'org-1', contextId: 'ctx-admin', role: 'admin',
    capabilities: ['venue.purposes.share', 'venue.purposes.receive', 'venue.activityRules.share', 'venue.activityRules.receive', 'venue.bookingWindows.receive'],
    grantedCapabilities: ['venue.purposes.share', 'venue.purposes.receive', 'venue.activityRules.share', 'venue.activityRules.receive', 'venue.bookingWindows.receive']
  } }));
  const calls = []; let state = 'draft';
  await page.route('**/api/getOrganizationConfigurationWorkspace', route => route.fulfill({ json: { status: 'success',
    items: [{ id: 'source-a', name: 'Meeting', version: 1 }], organizations: [{ id: 'target-org', name: 'Target organization' }] } }));
  await page.route('**/api/listSharedOrganizationConfigurations', route => route.fulfill({ json: { status: 'success',
    items: [{ id: 'share-a', version: 1, payload: { name: 'Meeting' }, sourceOrganizationName: 'Source organization' }] } }));
  await page.route('**/api/receiveOrganizationConfiguration', route => {
    calls.push({ name: 'receive', data: route.request().postDataJSON() });
    return route.fulfill({ json: { status: 'success', id: 'draft-a' } });
  });
  await page.route('**/api/getOrganizationConfigurationDraft', route => route.fulfill({ json: {
    status: 'success', id: 'draft-a', kind: 'venue.activityRules', version: 1, state, shareAvailable: true,
    sourceOrganizationName: 'Source organization', payload: { name: 'Meeting', sourceVenueName: 'Original venue',
      cycleType: 'monthly', cycleValues: { values: [4], periodMode: 'count', periodStartDate: '2026-11-01', repeatCount: 12 },
      timeStart: '16:30', timeEnd: '18:30' }
  } }));
  await page.route('**/api/getOrganizationConfigurationCandidates', route => route.fulfill({ json: { status: 'success',
    references: [{ token: 'venueId', kind: 'venue', label: 'Original venue' }], choices: { venue: [{ id: 'target-venue', name: 'Target venue' }] }
  } }));
  await page.route('**/api/applyOrganizationConfigurationDraft', route => {
    calls.push({ name: 'apply', data: route.request().postDataJSON() }); state = 'applied';
    return route.fulfill({ json: { status: 'success', id: 'draft-a' } });
  });
  return calls;
}

test('receive a draft, explicitly map its venue, cancel then confirm and reread', async ({ page }) => {
  const calls = await setup(page); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/web/admin/organization-copy');
  await page.getByLabel(text.kind, { exact: true }).selectOption('venue.activityRules');
  await page.getByRole('button', { name: text.incoming, exact: true }).click();
  await page.getByRole('button', { name: text.receive, exact: true }).click();
  await expect(page.getByRole('button', { name: text.apply, exact: true })).toBeDisabled();
  await expect(page.getByText(text.periodCount('2026-11-01', '00:00', 12), { exact: true })).toBeVisible();
  await expect(page.getByText(text.sharedNotice, { exact: true })).toBeVisible();
  await page.getByLabel('Original venue', { exact: true }).selectOption('target-venue');
  await page.getByRole('button', { name: text.apply, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(text.mapping('Original venue', 'Target venue'));
  await page.getByRole('dialog').getByRole('button', { name: ui.cancel, exact: true }).click();
  expect(calls.filter(item => item.name === 'apply')).toHaveLength(0);
  await page.getByRole('button', { name: text.apply, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: ui.save, exact: true }).click();
  await expect(page.getByText(text.applied, { exact: true })).toBeVisible();
  expect(calls.find(item => item.name === 'apply').data).toEqual({ id: 'draft-a', version: 1, references: { venueId: 'target-venue' } });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sharing freezes the named source and organization until confirmed', async ({ page }) => {
  await setup(page); const shares = [];
  await page.route('**/api/shareOrganizationConfiguration', route => {
    shares.push(route.request().postDataJSON()); return route.fulfill({ json: { status: 'success', id: 'share-a' } });
  });
  await page.goto('/web/admin/organization-copy');
  await page.getByLabel(text.target, { exact: true }).selectOption('target-org');
  await page.getByRole('button', { name: text.share, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(text.shareConfirm('Meeting', 'Target organization'));
  await expect(page.getByLabel(text.kind, { exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: ui.cancel, exact: true }).click();
  expect(shares).toHaveLength(0);
  await page.getByRole('button', { name: text.share, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: ui.save, exact: true }).click();
  await expect.poll(() => shares.length).toBe(1);
  expect(shares[0]).toEqual({ kind: 'venue.purposes', sourceRecordId: 'source-a', targetOrganizationId: 'target-org' });
});

test('booking time remains a draft until its limits and target are confirmed', async ({ page }) => {
  const calls = await setup(page);
  await page.route('**/api/getOrganizationConfigurationDraft', route => route.fulfill({ json: {
    status: 'success', id: 'draft-a', kind: 'venue.bookingWindows', version: 1, state: 'draft', shareAvailable: true,
    payload: { name: 'Original venue', open: { mode: 'days', days: 7 }, deadline: { mode: 'duration', hours: 1, minutes: 30 } }
  } }));
  await page.goto('/web/admin/organization-copy');
  await page.getByLabel(text.kind, { exact: true }).selectOption('venue.bookingWindows');
  await page.getByRole('button', { name: text.incoming, exact: true }).click();
  await page.getByRole('button', { name: text.receive, exact: true }).click();
  await expect(page.getByText(text.windowNotice, { exact: true })).toBeVisible();
  await expect(page.getByText(text.summaryRow(text.bookingOpen, text.advanceDays(7)), { exact: true })).toBeVisible();
  await expect(page.getByText(text.summaryRow(text.bookingDeadline, text.advanceDuration(1, 30)), { exact: true })).toBeVisible();
  expect(calls.filter(call => call.name === 'apply')).toHaveLength(0);
  await page.getByLabel('Original venue', { exact: true }).selectOption('target-venue');
  await page.getByRole('button', { name: text.apply, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(text.mapping('Original venue', 'Target venue'));
  await page.getByRole('dialog').getByRole('button', { name: ui.cancel, exact: true }).click();
  expect(calls.filter(call => call.name === 'apply')).toHaveLength(0);
});

test('enable an independent shared copy only after target confirmation and reread', async ({ page }) => {
  await setup(page); const writes = []; let enabled = false;
  await page.route('**/api/getOrganizationConfigurationDraft', route => route.fulfill({ json: {
    status: 'success', id: 'draft-a', kind: 'venue.openRules', state: 'applied', payload: { name: 'Original name' },
    activation: { enabled, revision: 'a'.repeat(64), shared: true, venueName: 'Target venue',
      payload: { name: 'Current copy', sourceVenueName: 'Target venue', cycleType: 'daily', cycleValues: [], timeStart: '08:00', timeEnd: '22:00' } }
  } }));
  await page.route('**/api/enableOrganizationConfiguration', route => {
    writes.push(route.request().postDataJSON()); enabled = true;
    return route.fulfill({ json: { status: 'success', id: 'draft-a', enabled: true } });
  });
  await page.goto('/web/admin/organization-copy');
  await page.getByRole('button', { name: text.incoming, exact: true }).click();
  await page.getByRole('button', { name: text.receive, exact: true }).click();
  await page.getByRole('button', { name: text.enable, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(text.enableSharedConfirm('Current copy', 'Target venue'));
  await page.getByRole('dialog').getByRole('button', { name: ui.cancel, exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: text.enable, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: ui.save, exact: true }).click();
  await expect(page.locator('.copy-page .chip').filter({ hasText: text.enabled })).toBeVisible();
  await expect(page.getByRole('button', { name: text.enable, exact: true })).toHaveCount(0);
  expect(writes).toEqual([{ id: 'draft-a', revision: 'a'.repeat(64) }]);
});
