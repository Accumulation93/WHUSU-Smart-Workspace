import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import personnel from '../../src/locales/zh-CN/shared/adminPersonnel.js';
import departmentCopy from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/departmentBehavior.js';

async function setup(page, permissions = { 'hr.departments': true, 'hr.work_groups': true, 'hr.identities': true }) {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: {
    status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions
  } }));
}

test('admin portal opens native module tabs and legacy dictionary uses the same editor', async ({ page }) => {
  await setup(page);
  await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'success', departments: [] } }));
  await page.goto('/web/portal');
  await page.getByRole('button', { name: ui.copy_eb65126cfe, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\?subApp=hr$/);
  await expect(page.getByRole('tab')).toHaveText([ui.copy_c15260b37c, ui.copy_303b7a8611, ui.copy_38f7aca35c]);
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toBeVisible();
  const controls = await page.locator('form input, form textarea').evaluateAll(items => items.map(item => {
    const css = getComputedStyle(item);
    return { radius: css.borderRadius, font: css.fontFamily, width: item.getBoundingClientRect().width };
  }));
  expect(controls[0]).toEqual(controls[1]);
  await expect(page.locator('.shell-heading')).toHaveText(ui.copy_eb65126cfe + ui.copy_61386762d9);
  await page.goto('/web/system/dictionary');
  await expect(page).toHaveURL(/subApp=hr&tab=departments/);
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toBeVisible();
});

test('dictionary saves actual parameters, retains a rejected draft and reads back changes', async ({ page }) => {
  await setup(page);
  let departments = [{ id: 'd1', name: 'Existing department', description: 'Existing description' }];
  let reads = 0;
  const writes = [];
  await page.route('**/api/listDepartments', route => { reads++; return route.fulfill({ json: { status: 'success', departments } }); });
  await page.route('**/api/saveDepartment', route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    if (writes.length === 1) return route.fulfill({ json: { status: 'duplicate', message: 'Duplicate department' } });
    departments = [{ ...body, id: body.id || 'd2' }];
    return route.fulfill({ json: { status: 'success', id: 'd2' } });
  });
  await page.goto('/web/admin?subApp=hr&tab=departments');
  await page.getByRole('button', { name: ui.copy_e040ae3016, exact: true }).click();
  await page.getByLabel(ui.copy_ff6a3c2862).fill('Renamed department');
  await page.getByLabel(ui.copy_c0a872bff0).fill('Changed description');
  await page.getByRole('button', { name: ui.copy_9d34006a03, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Duplicate department');
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toHaveValue('Renamed department');
  await page.getByRole('button', { name: ui.copy_9d34006a03, exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  expect(writes[1]).toEqual({ id: 'd1', name: 'Renamed department', description: 'Changed description' });
  await expect(page.locator('article')).toContainText('Renamed department');
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toHaveValue('');
});

test('dictionary deletion freezes target, cancel sends nothing and referenced entries stay visible', async ({ page }) => {
  await setup(page);
  let deletes = 0;
  await page.route('**/api/listIdentities', route => route.fulfill({ json: { status: 'success', identities: [{ id: 'i1', name: 'Protected identity' }] } }));
  await page.route('**/api/deleteIdentity', route => {
    deletes++;
    expect(route.request().postDataJSON()).toEqual({ id: 'i1' });
    return route.fulfill({ json: { status: 'in_use', usages: [{ category: 'positions', count: 3 }] } });
  });
  await page.goto('/web/admin?subApp=hr&tab=identities');
  await page.getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Protected identity');
  await page.getByRole('dialog').getByRole('button', { name: departmentCopy.copy_4b213fd88a, exact: true }).click();
  expect(deletes).toBe(0);
  await page.getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: departmentCopy.copy_7f31eec657, exact: true }).click();
  await expect(page.getByRole('dialog', { name: personnel.dictionaryUsageDialogTitle })).toContainText(personnel.dictionaryUsageCount(3));
  await expect(page.getByRole('dialog')).toContainText(personnel.dictionaryUsageCategories.positions);
  await page.getByRole('button', { name: personnel.dictionaryUsageClose }).click();
  await expect(page.locator('article')).toContainText('Protected identity');
});

test('work group requires a department and preserves data when reread fails', async ({ page }) => {
  await setup(page, { 'hr.work_groups': true });
  let reads = 0;
  let saved;
  await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'success', departments: [{ id: 'd1', name: 'Department' }] } }));
  await page.route('**/api/listWorkGroups', route => {
    reads++;
    return route.fulfill({ json: reads === 2 ? { status: 'unavailable', message: 'Read unavailable' } : {
      status: 'success', workGroups: saved ? [{ ...saved, id: 'g1', departmentName: 'Department' }] : []
    } });
  });
  await page.route('**/api/saveWorkGroup', route => { saved = route.request().postDataJSON(); return route.fulfill({ json: { status: 'success' } }); });
  await page.goto('/web/admin?subApp=hr&tab=workGroups');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.getByLabel(ui.copy_7a4ac1ad99).fill('Group');
  await page.getByRole('button', { name: ui.copy_397a0808d4 }).click();
  expect(saved).toBeUndefined();
  await page.getByLabel(ui.copy_7ee1272d5b).selectOption('d1');
  await page.getByRole('button', { name: ui.copy_397a0808d4 }).click();
  await expect(page.getByText('Read unavailable')).toBeVisible();
  expect(saved).toEqual({ id: '', name: 'Group', description: '', departmentId: 'd1', departmentCode: '' });
  await expect(page.getByLabel(ui.copy_7a4ac1ad99)).toHaveValue('Group');
  await expect(page.getByRole('button', { name: ui.copy_397a0808d4 })).toBeDisabled();
  await page.getByRole('button', { name: personnel.dictionaryRetry }).click();
  await expect(page.locator('article')).toContainText('Group');
  await expect(page.getByRole('button', { name: ui.copy_397a0808d4 })).toBeEnabled();
  await expect(page.getByLabel(ui.copy_7a4ac1ad99)).toHaveValue('');
});

test('five native scoring tabs remain on one line and first and last can be selected', async ({ page }) => {
  await setup(page, Object.fromEntries(['activities', 'templates', 'rules', 'results', 'publications'].map(key => ['scoring.' + key, true])));
  await page.goto('/web/admin?subApp=scoring');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText([ui.copy_5aa4cb13ec, ui.copy_5a49161fd7, ui.copy_9ad6311419, ui.copy_ade4fb64f7, ui.copy_414b7d9da7]);
  const tops = await tabs.evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  const labels = await tabs.evaluateAll(items => items.map(item => {
    const range = document.createRange(); range.selectNodeContents(item);
    return { lines: range.getClientRects().length, width: range.getBoundingClientRect().width, available: item.clientWidth };
  }));
  for (const label of labels) { expect(label.lines).toBe(1); expect(label.width).toBeLessThanOrEqual(label.available); }
  await tabs.last().click();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await tabs.first().click();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 310, height: 780 });
  const narrowLabels = await tabs.evaluateAll(items => items.map(item => {
    const range = document.createRange(); range.selectNodeContents(item);
    return { lines: range.getClientRects().length, width: range.getBoundingClientRect().width, available: item.clientWidth };
  }));
  for (const label of narrowLabels) { expect(label.lines).toBe(1); expect(label.width).toBeLessThanOrEqual(label.available); }
});

test('identity creation and successful deletion both reread the authoritative list', async ({ page }) => {
  await setup(page, { 'hr.identities': true });
  let rows = [];
  let reads = 0;
  await page.route('**/api/listIdentities', route => { reads++; return route.fulfill({ json: { status: 'success', identities: rows } }); });
  await page.route('**/api/saveIdentity', route => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({ id: '', name: 'Created identity', description: 'Description' });
    rows = [{ ...body, id: 'identity-new' }];
    return route.fulfill({ json: { status: 'success', id: 'identity-new' } });
  });
  await page.route('**/api/deleteIdentity', route => {
    expect(route.request().postDataJSON()).toEqual({ id: 'identity-new' });
    rows = [];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=hr&tab=identities');
  await page.getByLabel(ui.copy_827d50f428).fill('Created identity');
  await page.getByLabel(ui.copy_07d8551536).fill('Description');
  await page.getByRole('button', { name: ui.copy_637d8a9907 }).click();
  await expect(page.locator('article')).toContainText('Created identity');
  await page.getByRole('button', { name: ui.copy_acc985cabc, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: departmentCopy.copy_7f31eec657, exact: true }).click();
  await expect(page.getByText(ui.copy_177c107dbc, { exact: true })).toBeVisible();
  expect(reads).toBe(3);
});

test('permission read failure remains retryable and does not request an unauthorized directory', async ({ page }) => {
  await setup(page);
  let attempts = 0;
  let directoryReads = 0;
  await page.route('**/api/getMyAdminPermissions', route => {
    attempts++;
    return route.fulfill({ json: attempts === 1 ? { status: 'unavailable', message: 'Permission read failed' }
      : { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'hr.identities': true } } });
  });
  await page.route('**/api/listIdentities', route => { directoryReads++; return route.fulfill({ json: { status: 'success', identities: [] } }); });
  await page.goto('/web/admin?subApp=hr&tab=departments');
  await expect(page.getByText('Permission read failed')).toBeVisible();
  expect(directoryReads).toBe(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('button', { name: personnel.dictionaryRetry }).click();
  await expect(page.getByRole('tab')).toHaveText([ui.copy_38f7aca35c]);
  await expect(page.getByLabel(ui.copy_827d50f428)).toBeVisible();
  expect(directoryReads).toBe(1);
});

test('three dictionary drafts survive tab changes and are discarded when leaving the module', async ({ page }) => {
  await setup(page);
  await page.route('**/api/listDepartments', route => route.fulfill({ json: { status: 'success', departments: [{ id: 'd1', name: 'Department' }] } }));
  await page.route('**/api/listWorkGroups', route => route.fulfill({ json: { status: 'success', workGroups: [] } }));
  await page.route('**/api/listIdentities', route => route.fulfill({ json: { status: 'success', identities: [] } }));
  await page.goto('/web/admin?subApp=hr&tab=departments');
  await page.getByRole('button', { name: ui.copy_e040ae3016, exact: true }).click();
  await page.getByLabel(ui.copy_ff6a3c2862).fill('Department draft');
  await page.getByRole('tab', { name: ui.copy_303b7a8611, exact: true }).click();
  await page.getByLabel(ui.copy_7a4ac1ad99).fill('Group draft');
  await page.getByLabel(ui.copy_7ee1272d5b).selectOption('d1');
  await page.getByRole('tab', { name: ui.copy_38f7aca35c, exact: true }).click();
  await page.getByLabel(ui.copy_827d50f428).fill('Identity draft');
  await page.getByRole('tab', { name: ui.copy_c15260b37c, exact: true }).click();
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toHaveValue('Department draft');
  await expect(page.getByText(ui.copy_c97f4e1c21, { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: ui.copy_303b7a8611, exact: true }).click();
  await expect(page.getByLabel(ui.copy_7a4ac1ad99)).toHaveValue('Group draft');
  await expect(page.getByLabel(ui.copy_7ee1272d5b)).toHaveValue('d1');
  await page.getByRole('tab', { name: ui.copy_38f7aca35c, exact: true }).click();
  await expect(page.getByLabel(ui.copy_827d50f428)).toHaveValue('Identity draft');
  await page.goto('/web/portal');
  await page.goto('/web/admin?subApp=hr&tab=identities');
  await expect(page.getByLabel(ui.copy_827d50f428)).toHaveValue('');
});

test('successful dictionary save survives failed rereads across tabs without a duplicate write', async ({ page }) => {
  await setup(page);
  let saved;
  let reads = 0;
  let writes = 0;
  await page.route('**/api/listDepartments', route => {
    reads++;
    return route.fulfill({ json: reads === 2 || reads === 3 ? { status: 'unavailable', message: 'Read unavailable' }
      : { status: 'success', departments: saved ? [{ ...saved, id: 'd1' }] : [] } });
  });
  await page.route('**/api/listIdentities', route => route.fulfill({ json: { status: 'success', identities: [] } }));
  await page.route('**/api/saveDepartment', route => {
    writes++; saved = route.request().postDataJSON();
    return route.fulfill({ json: { status: 'success', id: 'd1' } });
  });
  await page.goto('/web/admin?subApp=hr&tab=departments');
  await page.getByLabel(ui.copy_ff6a3c2862).fill('Saved department');
  await page.getByRole('button', { name: ui.copy_9d34006a03, exact: true }).click();
  await expect(page.getByText('Read unavailable')).toBeVisible();
  await page.getByRole('tab', { name: ui.copy_38f7aca35c, exact: true }).click();
  await page.getByRole('tab', { name: ui.copy_c15260b37c, exact: true }).click();
  await expect(page.getByText('Read unavailable')).toBeVisible();
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toHaveValue('Saved department');
  await expect(page.getByRole('button', { name: ui.copy_9d34006a03, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: personnel.dictionaryRetry }).click();
  await expect(page.locator('article')).toContainText('Saved department');
  await expect(page.getByLabel(ui.copy_ff6a3c2862)).toHaveValue('');
  expect(writes).toBe(1);
  expect(saved).toEqual({ id: '', name: 'Saved department', description: '' });
});
