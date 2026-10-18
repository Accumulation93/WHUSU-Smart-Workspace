import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/contactDirectory.js';

test('directory only renders granted values and navigates visible positions', async ({ page }, testInfo) => {
  await mockApi(page);
  let reads = 0;
  await page.route('**/api/getContactDirectory', route => {
    reads++;
    return route.fulfill({ json: { status: 'success', groups: [
      { key: 'g1', name: 'Department A', items: [{ key: 'a', name: 'Same name', departmentName: 'Department A', identityCategoryName: 'Member', workGroupName: '', fields: [{ label: 'Phone', type: 'phone', value: '13800138000' }], relatedKeys: ['b'] }] },
      { key: 'g2', name: 'Department B', items: [{ key: 'b', name: 'Same name', departmentName: 'Department B', identityCategoryName: 'Leader', workGroupName: '', fields: [], relatedKeys: ['a'] }] }
    ] } });
  });
  await page.goto('/web/hr/profile');
  await page.getByRole('button', { name: ui.title, exact: true }).click();
  await expect(page.locator('.directory-position')).toHaveCount(2);
  await expect(page.getByRole('link', { name: ui.call })).toHaveAttribute('href', 'tel:13800138000');
  await page.getByRole('searchbox').fill('13800138000');
  await expect(page.locator('.directory-position')).toHaveCount(1);
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Department B · Leader', exact: true }).click();
  await expect(page.locator('#contact-b')).toBeInViewport();
  await expect(page.locator('.directory-position')).toHaveCount(2);
  await page.getByRole('button', { name: ui.profile, exact: true }).click();
  await page.getByRole('button', { name: ui.title, exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.locator('.directory-position')).toHaveCount(2);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath('directory.png'),fullPage:true,animations:'disabled'});
});

test('directory-only admin can configure without loading member records, copy and delete with confirmation', async ({ page }, testInfo) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  let memberReads = 0, writes = 0, saved, rules = [];
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: { status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'hr.directory.manage': true } } }));
  await page.route('**/api/listHrGovernance', route => { memberReads++; return route.fulfill({ json: { status: 'forbidden' } }); });
  await page.route('**/api/getContactDirectoryConfiguration', route => route.fulfill({ json: { status: 'success', rules,
    people: [{ personId: 'person-a', name: 'Visible candidate', assignments: [{ id:'a',departmentId:'d',departmentName:'Department',identityCategoryId:'i',identityCategoryName:'Member',workGroupName:'' }] }],
    departments: [{id:'d',name:'Department'}], identities: [{id:'i',name:'Member'}], workGroups: [], fields: [{id:'phone',label:'Phone',type:'phone'}] } }));
  await page.route('**/api/saveContactDirectoryRule', route => {
    writes++; saved = route.request().postDataJSON();
    const row = {...saved,id:'r'+writes,version:1}; rules.push(row);
    return route.fulfill({json:{status:'success',rule:row}});
  });
  await page.route('**/api/batchContactDirectoryRules', route => { const body=route.request().postDataJSON(); rules=rules.filter(rule=>!body.rules.some(row=>row.id===rule.id)); return route.fulfill({json:{status:'success'}}); });
  await page.goto('/web/admin?subApp=hr');
  await page.getByRole('button', {name:ui.add,exact:true}).click();
  await page.getByPlaceholder(ui.namePlaceholder).fill('Contact policy');
  await page.getByRole('button', {name:ui.choose,exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button').filter({hasText:'Visible candidate'}).click();
  await dialog.getByRole('button',{name:'确认',exact:true}).click();
  await page.getByLabel('Phone',{exact:true}).check();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath('directory-editor.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:ui.save,exact:true}).click();
  await expect.poll(()=>writes).toBe(1);
  expect(saved.audience).toEqual([{type:'people',personIds:['person-a']}]); expect(saved.targets).toEqual([{type:'self'}]); expect(saved.fieldIds).toEqual(['phone']);
  await page.getByRole('button',{name:ui.copy,exact:true}).click(); expect(writes).toBe(1);
  await page.getByRole('button',{name:ui.save,exact:true}).click(); await expect.poll(()=>writes).toBe(2); expect(saved.id).toBe('');
  await page.getByRole('button',{name:ui.selectAll,exact:true}).click();
  await page.getByRole('button',{name:ui.deleteSelected,exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('2');
  await page.getByRole('dialog').getByRole('button',{name:ui.cancel,exact:true}).click(); expect(rules.length).toBe(2);
  await page.getByRole('button',{name:ui.deleteSelected,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:ui.remove,exact:true}).click();
  await expect(page.getByText(ui.noRules,{exact:true})).toBeVisible(); expect(memberReads).toBe(0);
});

test('directory load failure offers retry and never retains previous contacts', async ({page}) => {
  await mockApi(page);
  let reads=0;
  await page.route('**/api/getContactDirectory', route=>route.fulfill({json:++reads===1
    ? {status:'directory_failure',message:ui.loadFailed}
    : {status:'success',groups:[]}}));
  await page.goto('/web/hr/profile');
  await page.getByRole('button',{name:ui.title,exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText(ui.loadFailed);
  await expect(page.locator('.directory-position')).toHaveCount(0);
  await page.getByRole('button',{name:ui.retry,exact:true}).click();
  await expect(page.getByText(ui.empty,{exact:true})).toBeVisible();
  expect(reads).toBe(2);
});
