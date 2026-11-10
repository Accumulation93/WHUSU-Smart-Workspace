import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/authorization.js';
import nature from '../../src/locales/zh-CN/shared/assignmentNatures.js';

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
  await page.getByRole('tab', { name: ui.nature, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\?subApp=hr/);
  await expect(page.getByText('Current nature', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await expect(page.getByRole('button', { name: ui.save, exact: true })).toHaveCount(0);
});

test('inline nature editor saves and rereads and blocks duplicate writes after read failure', async ({page}) => {
  await setup(page,['hr.assignmentNatures.read','hr.assignmentNatures.create','hr.assignmentNatures.update','hr.departments.read']);
  let rows=[{id:'custom',name:'Before',version:1,canUpdate:true,canDelete:true}],writes=0,fail=false;
  await page.route('**/api/listAssignmentNatures',r=>r.fulfill({json:fail?{status:'error'}:{status:'success',list:rows,canCreate:true}}));
  await page.route('**/api/saveAssignmentNature',r=>{writes++; rows=[{...rows[0],...r.request().postDataJSON(),version:2}];fail=true;return r.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=hr&tab=assignmentNatures');
  await page.getByRole('button',{name:nature.edit,exact:true}).click();
  await page.getByLabel(nature.name,{exact:true}).fill('After');
  await page.getByRole('button',{name:nature.save,exact:true}).click();
  await expect(page.getByRole('button',{name:nature.save,exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:nature.retry,exact:true})).toBeVisible();
  expect(writes).toBe(1);fail=false;
  await page.getByRole('button',{name:nature.retry,exact:true}).click();
  await expect(page.getByLabel(nature.name,{exact:true})).toHaveValue('');
  await expect(page.getByText('After',{exact:true})).toBeVisible();
  const tabs=page.getByRole('tab');await tabs.filter({hasText:'部门'}).click();
  await page.getByRole('tab',{name:ui.nature,exact:true}).click();
  await expect(page.getByText('After',{exact:true})).toBeVisible();expect(writes).toBe(1);
});

test('nature create permission alone does not imply dictionary read access', async ({ page }) => {
  await setup(page, ['hr.assignmentNatures.create']);
  await page.goto('/web/admin?subApp=hr');
  await expect(page.getByRole('tab', { name: ui.nature, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: ui.nature, exact: true })).toHaveCount(0);
});

test('reserved nature exposes deletion explanation without issuing a delete request', async ({page}) => {
  await setup(page,['hr.assignmentNatures.read','hr.assignmentNatures.delete']);
  let deletions=0;
  await page.route('**/api/listAssignmentNatures',r=>r.fulfill({json:{status:'success',list:[{id:'staff',name:'Reserved nature',description:'Description',version:1,canUpdate:false,canDelete:true,deleteRestrictionCode:'legacy_required'}],canCreate:false}}));
  await page.route('**/api/deleteAssignmentNature',r=>{deletions++;return r.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=hr&tab=assignmentNatures');
  const row=page.locator('.dictionary-row');
  await expect(row.getByText(nature.reserved,{exact:true})).toBeVisible();
  await expect(row.getByRole('button',{name:nature.edit,exact:true})).toHaveCount(0);
  await row.getByRole('button',{name:nature.remove,exact:true}).click();
  expect(deletions).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
