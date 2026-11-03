import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures.js';
import copy from '../../src/locales/zh-CN/index.js';
import states from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/adminUtils.js';
import home from '../../src/locales/zh-CN/shared/home.js';
import accountCopy from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';

test('account directory uses account states and never shows server labels or status codes', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: { status: 'success', mode: 'enforced', revision: 1,
    organizationId: 'org-1', contextId: 'ctx-admin', role: 'admin', capabilities: ['auth.accounts.read'], grantedCapabilities: ['auth.accounts.read'] } }));
  await page.route('**/api/listHrGovernance', route => route.fulfill({ json: { status: 'success', rows: [
    { id: 'a', name: 'Frozen member', accountId: 'account-a', auth: { status: 'frozen' } },
    { id: 'b', name: 'Unknown member', accountId: 'account-b', auth: { status: 'private_backend_status' } },
    { id: 'c', name: 'Normal member', accountId: 'account-c', auth: { status: 'verified' } }
  ] } }));
  await page.goto('/web/admin/auth');
  await expect(page).toHaveURL(/\/admin\?subApp=hr&tab=hrInfo/);
  await expect(page.getByText(accountCopy.copy_f6eb285e87, { exact: true })).toBeVisible();
  await expect(page.getByText(accountCopy.accountStateUnknown, { exact: true })).toBeVisible();
  await expect(page.getByText(accountCopy.copy_8e4abe3d58, { exact: true })).toBeVisible();
  await expect(page.getByText('private_backend_status')).toHaveCount(0);
  await expect(page.getByText(copy.audit.statusLabels.withdrawn, { exact: true })).toHaveCount(0);
  await page.route('**/api/listHrGovernance', route => route.fulfill({ json: { status: 'error', message: 'private_backend_failure' } }));
  await page.reload();
  await expect(page.locator('.notice-line')).toBeVisible();
  await expect(page.getByText('private_backend_failure')).toHaveCount(0);
  await expect(page.getByText(copy.admin.memberEmpty, { exact: true })).toHaveCount(0);
});

test('administrator list derives its labels locally from permitted values', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: { status: 'success', mode: 'enforced', revision: 1,
    organizationId: 'org-1', contextId: 'ctx-admin', role: 'admin', capabilities: ['system.adminAccounts.read'], grantedCapabilities: ['system.adminAccounts.read'] } }));
  await page.route('**/api/listAdmins', route => route.fulfill({ json: { status: 'success', canRead: true, canCreate: false,
    list: [{ id: 'a', name: 'Administrator member', adminLevel: 'admin', adminLevelLabel: 'private_role_label', authenticationStatus: 'frozen', authenticationStatusLabel: 'private_status_label' }], creatableLevels: [] } }));
  await page.goto('/web/admin?subApp=system&tab=admins');
  await expect(page.getByText('Administrator member', { exact: true })).toBeVisible();
  await expect(page.getByText(home.text.admin, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(states.hrAccountFrozen, { exact: true })).toBeVisible();
  await expect(page.getByText('private_role_label')).toHaveCount(0);
  await expect(page.getByText('private_status_label')).toHaveCount(0);
});
