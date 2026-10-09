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
  await dialog.getByRole('switch', { name: 'Write accounts', exact: true }).check();
  await expect(dialog.getByRole('switch', { name: 'Read accounts', exact: true })).toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Fixed permission', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: copy.admin.permissionsSave, exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Save rejected');
  await expect(dialog.getByRole('switch', { name: 'Write accounts', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: copy.admin.permissionsSave, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => reads).toBe(2);
  expect(saved).toEqual({ adminId: admin.id, permissions: { 'system.admin_accounts.read': true, 'system.admin_accounts.write': true } });
  await expect(page.locator('.admin-progress')).toContainText('2 / 2');
  expect(await page.locator('body').evaluate(body => body.style.overflow)).not.toBe('hidden');
});

test('permission controls keep their shape, group changes respect fixed grants and close restores focus', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  const rows = [1, 2].map(id => ({ id: String(id), name: 'Administrator ' + id, adminLevelLabel: 'Administrator', grantedCount: 0, applicableCount: 1 }));
  await page.route('**/api/listPermissionManagedAdmins', route => route.fulfill({ json: { status: 'success', list: rows } }));
  await page.route('**/api/getAdminPermissionDetail', route => route.fulfill({ json: { status: 'success', admin: rows[0], groups: [{ key: 'group', label: 'Permission group', permissions: [
    { key: 'editable', label: 'Editable permission', description: 'Long description '.repeat(12), editable: true, granted: false },
    { key: 'fixed', label: 'Fixed permission', editable: false, granted: true }
  ] }] } }));
  await page.goto('/web/admin/permissions');
  const cards = page.locator('.admin-row');
  await expect(cards).toHaveCount(2);
  const positions = await cards.evaluateAll(nodes => nodes.map(n => ({ y: n.getBoundingClientRect().y, x: n.getBoundingClientRect().x })));
  if (page.viewportSize().width >= 900) expect(Math.abs(positions[0].y - positions[1].y)).toBeLessThan(1);
  else expect(positions[1].y).toBeGreaterThan(positions[0].y);
  await cards.first().click();
  const dialog = page.getByRole('dialog');
  const group = dialog.getByRole('switch', { name: 'Permission group · ' + copy.admin.permissionsAll });
  await group.check();
  await expect(dialog.getByRole('switch', { name: 'Editable permission', exact: true })).toBeChecked();
  await group.uncheck();
  await expect(dialog.getByRole('switch', { name: 'Editable permission', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Fixed permission', exact: true })).toBeChecked();
  const size = await group.boundingBox();
  expect(size.width).toBe(52); expect(size.height).toBe(32);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(cards.first()).toBeFocused();
});

test('saving permissions blocks browser back until the result has been reread', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  const admin = { id: 'admin', name: 'Administrator', adminLevelLabel: 'Administrator' };
  await page.route('**/api/listPermissionManagedAdmins', route => route.fulfill({ json: { status: 'success', list: [admin] } }));
  await page.route('**/api/getAdminPermissionDetail', route => route.fulfill({ json: { status: 'success', admin, groups: [] } }));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/saveAdminPermissions', async route => { await pending; await route.fulfill({ json: { status: 'success', groups: [] } }); });
  await page.goto('/web/portal');
  await page.getByRole('button', { name: copy.portal.permissions, exact: true }).click();
  await page.locator('.admin-row').click();
  await page.getByRole('dialog').getByRole('button', { name: copy.admin.permissionsSave, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: copy.admin.permissionsSaving })).toBeDisabled();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/permissions$/);
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.shell-back').click();
  await expect(page).toHaveURL(/\/portal$/);
});
