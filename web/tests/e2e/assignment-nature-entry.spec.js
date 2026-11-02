import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';

async function setup(page, capabilities) {
  await mockApi(page);
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', revision: 1, organizationId: 'org-1',
    contextId: 'ctx-assignment', role: 'user', capabilities, grantedCapabilities: capabilities
  } }));
}

test('nature read permission exposes the personnel dictionary entry and reaches its authorized list', async ({ page }) => {
  await setup(page, ['hr.assignmentNatures.read']);
  let reads = 0;
  await page.route('**/api/listAssignmentNatures', route => { reads++; return route.fulfill({ json: {
    status: 'success', list: [{ id: 'staff', name: 'Current nature', canUpdate: false, canDelete: false }], canCreate: false
  } }); });
  await page.goto('/web/admin?subApp=hr');
  await expect(page.getByRole('tab', { name: ui.nature, exact: true })).toBeVisible();
  await page.getByRole('button', { name: ui.nature, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/assignment-natures$/);
  await expect(page.getByText('Current nature', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await expect(page.getByRole('button', { name: ui.save, exact: true })).toHaveCount(0);
});

test('nature create permission alone does not imply dictionary read access', async ({ page }) => {
  await setup(page, ['hr.assignmentNatures.create']);
  await page.goto('/web/admin?subApp=hr');
  await expect(page.getByRole('tab', { name: ui.nature, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.nature, exact: true })).toHaveCount(0);
});
