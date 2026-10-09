import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';

test('permission directory follows server list shape, retains failed edits and rereads saved grants', async ({ page }) => {
  await mockApi(page, { admin: true });
  const admin = { id: 'admin-target', name: 'Managed administrator', adminLevel: 'admin', adminLevelLabel: 'Administrator', grantedCount: 0, applicableCount: 2 };
  let reads = 0, saves = 0, saved;
  const groups = [{ key: 'system', label: 'System', description: 'Group description', permissions: [
    { key: 'system.admin_accounts.read', label: 'Read accounts', editable: true, granted: false },
    { key: 'system.admin_accounts.write', label: 'Write accounts', editable: true, granted: false },
    { key: 'fixed', label: 'Fixed permission', editable: false, granted: true }
  ] }];
  await page.route('**/api/listPermissionManagedAdmins', route => { reads++; return route.fulfill({ json: { status: 'success', list: [{ ...admin, grantedCount: saved ? 2 : 0 }] } }); });
  await page.route('**/api/getAdminPermissionDetail', route => route.fulfill({ json: { status: 'success', admin, groups } }));
  await page.route('**/api/saveAdminPermissions', route => {
    saves++;
    if (saves === 1) return route.fulfill({ json: { status: 'forbidden', message: 'Save rejected' } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', groups } });
  });
  await page.goto('/web/admin/permissions');
  await page.getByRole('button').filter({ hasText: admin.name }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Write accounts', exact: true }).check();
  await expect(dialog.getByRole('checkbox', { name: 'Read accounts', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Fixed permission', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: copy.admin.permissionsSave, exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Save rejected');
  await expect(dialog.getByRole('checkbox', { name: 'Write accounts', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: copy.admin.permissionsSave, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => reads).toBe(2);
  expect(saved).toEqual({ adminId: admin.id, permissions: { 'system.admin_accounts.read': true, 'system.admin_accounts.write': true } });
  await expect(page.locator('.admin-progress')).toContainText('2 / 2');
  expect(await page.locator('body').evaluate(body => body.style.overflow)).not.toBe('hidden');
});
