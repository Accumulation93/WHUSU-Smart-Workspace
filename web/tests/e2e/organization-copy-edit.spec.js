import {expect,test} from '@playwright/test';
import {mockApi} from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/assignmentNatures.js';

test('copied department opens its original editor and saves the selected record',async({page})=>{
  await mockApi(page,{activeContextId:'ctx-admin'});
  let row={id:'copied-department',name:'Copied department',description:'From another organization'},saved;
  await page.route('**/api/getMyAdminPermissions',route=>route.fulfill({json:{status:'success',organizationId:'org-1',permissions:{'hr.departments':true}}}));
  await page.route('**/api/listDepartments',route=>route.fulfill({json:{status:'success',departments:[row]}}));
  await page.route('**/api/saveDepartment',route=>{saved=route.request().postDataJSON();row={...row,...saved};return route.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=hr&tab=departments&copyKind=hr.departments&copyId=copied-department');
  await expect.poll(()=>page.locator('input').evaluateAll(nodes=>nodes.some(node=>node.value==='Copied department'))).toBe(true);
  await page.locator('form input').fill('Revised department');
  await page.locator('form button[type="submit"]').click();
  await expect.poll(()=>saved?.name).toBe('Revised department');
  expect(saved.id).toBe('copied-department');
  await page.reload();
  await expect(page.locator('form input')).toHaveValue('Revised department');
});

test('assignment nature saves, rereads, and reopens its persisted value',async({page},testInfo)=>{
  await mockApi(page,{activeContextId:'ctx-admin'});
  let rows=[{id:'copied-nature',name:'Copied nature',version:1,canUpdate:true,canDelete:true}],saved;
  await page.route('**/api/listAssignmentNatures',route=>route.fulfill({json:{status:'success',list:rows,canCreate:true}}));
  await page.route('**/api/saveAssignmentNature',route=>{saved=route.request().postDataJSON();rows=[{...saved,version:2,canUpdate:true,canDelete:true}];return route.fulfill({json:{status:'success',nature:rows[0]}});});
  await page.goto('/web/admin/assignment-natures?copyKind=hr.assignmentNatures&copyId=copied-nature');
  const input=page.getByLabel(ui.name,{exact:true});await expect(input).toHaveValue('Copied nature');
  await input.fill('Revised nature');await page.getByLabel(ui.description,{exact:true}).fill('First line\nSecond line');await page.getByRole('button',{name:ui.save,exact:true}).click();
  await expect(input).toHaveValue('');
  expect(saved).toEqual({id:'copied-nature',name:'Revised nature',description:'First line\nSecond line',version:1});
  await page.reload();await expect(input).toHaveValue('Revised nature');
  await expect(page.getByLabel(ui.description,{exact:true})).toHaveValue('First line\nSecond line');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('assignment-natures.png'),fullPage:true,animations:'disabled'});
});
