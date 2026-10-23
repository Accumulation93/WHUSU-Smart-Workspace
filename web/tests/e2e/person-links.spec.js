import { test, expect } from '@playwright/test';
import { mockApi, PENDING_STEP } from './fixtures.js';
import copy from '../../src/locales/zh-CN/shared/contactDirectory.js';

const key = 'a'.repeat(96), other = 'b'.repeat(96);
test('authorized person opens only that contact, related positions reauthorize, parent action stays idle', async ({page}) => {
  await mockApi(page);
  let lookups=0, lists=0, submissionReads=0;
  await page.route('**/api/resolvePersonLinks', route=>{
    lookups++;
    const references=route.request().postDataJSON().references;
    return route.fulfill({json:{status:'success',links:references.map(ref=>({ref:ref.kind+':'+ref.id,target:ref.id===PENDING_STEP.submittedBy?{kind:'contact',key}:null}))}});
  });
  await page.route('**/api/getSubmissionDetail', route=>{submissionReads++;return route.fulfill({json:{status:'forbidden'}});});
  await page.route('**/api/getContactDirectory', route=>{
    const request=route.request().postDataJSON();
    if(!request.key){lists++;return route.fulfill({json:{status:'success',groups:[]}});}
    expect([key,other]).toContain(request.key);
    return route.fulfill({json:{status:'success',contact:{key:request.key,name:'Authorized person',departmentName:request.key===key?'Department A':'Department B',identityCategoryName:'Member',fields:[{label:'Phone',type:'phone',value:'13800138000'}],relatedPositions:request.key===key?[{key:other,label:'Department B · Member'}]:[]}}});
  });
  await page.goto('/web/audit/pending');
  const link=page.getByRole('link',{name:PENDING_STEP.submitterName,exact:true});
  await expect(link).toBeVisible();
  expect(await link.evaluate(el=>Boolean(el.closest('button')))).toBe(false);
  await link.click();
  await expect(page).toHaveURL(/contactKey=/);
  await expect(page.locator('.directory-identity')).toContainText('Authorized person');
  await expect(page.getByRole('link',{name:copy.call})).toHaveAttribute('href','tel:13800138000');
  expect(lookups).toBeGreaterThanOrEqual(2);expect(lists).toBe(0);expect(submissionReads).toBe(0);
  await page.locator('summary').click();
  await page.getByRole('button',{name:'Department B · Member',exact:true}).click();
  await expect(page.locator('.directory-identity')).toContainText('Department B');
  expect(lists).toBe(0);
});

test('missing authorization stays plain, authorization revoked before click never navigates',async({page})=>{
  await mockApi(page);
  let allowed=false;
  await page.route('**/api/resolvePersonLinks',route=>route.fulfill({json:{status:'success',links:route.request().postDataJSON().references.map(ref=>({ref:ref.kind+':'+ref.id,target:allowed?{kind:'contact',key}:null}))}}));
  await page.goto('/web/audit/pending');
  await expect(page.getByText(PENDING_STEP.submitterName,{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:PENDING_STEP.submitterName,exact:true})).toHaveCount(0);
  allowed=true;await page.reload();
  const link=page.getByRole('link',{name:PENDING_STEP.submitterName,exact:true});await expect(link).toBeVisible();
  allowed=false;await link.click();
  await expect(link).toHaveCount(0);await expect(page).toHaveURL(/audit\/pending$/);
});

test('admin person navigation opens existing HR detail API with the authorized member id',async({page})=>{
  await mockApi(page,{activeContextId:'ctx-admin'});
  await page.route('**/api/getMyAdminPermissions',route=>route.fulfill({json:{status:'success',organizationId:'org-1',adminLevel:'admin',permissions:{'hr.people':true}}}));
  await page.route('**/api/resolvePersonLinks',route=>route.fulfill({json:{status:'success',links:route.request().postDataJSON().references.map(ref=>({ref:ref.kind+':'+ref.id,target:{kind:'hr',hrId:'hr-2'}}))}}));
  let reads=0;
  await page.route('**/api/getHrPersonDetail',route=>{expect(route.request().postDataJSON()).toEqual({hrId:'hr-2'});reads++;return route.fulfill({json:{status:'success',profile:{name:'HR person',studentId:'20260002'},auditStatusText:'Active',values:{phone:'13800138000'},template:{fields:[{id:'phone',label:'Phone',type:'phone'}]}}});});
  await page.goto('/web/audit/pending');await page.getByRole('link',{name:PENDING_STEP.submitterName,exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('HR person');await expect(page.getByRole('dialog')).toContainText('13800138000');expect(reads).toBe(1);
});
