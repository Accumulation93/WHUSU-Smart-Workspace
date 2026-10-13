import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/settingsBehavior.js';
import personnel from '../../src/locales/zh-CN/shared/adminPersonnel.js';
import copy from '../../src/locales/zh-CN/index.js';

async function setup(page,{superAdmin=true,permissions={'system.settings':true}}={}){
  const api=await mockApi(page,{activeContextId:'ctx-admin'});
  const state={timezone:8,defaultId:'org-a',organizations:[{id:'org-a',name:'Organization A'},{id:'org-b',name:'Organization B'}],writes:[],reads:0,reject:false,failRead:false,failList:false,failDefault:false};
  await page.route('**/api/getMyAdminPermissions',route=>route.fulfill({json:{status:'success',organizationId:'org-1',adminLevel:superAdmin?'super_admin':'admin',permissions}}));
  await page.route('**/api/getSystemConfig',route=>{state.reads++;return route.fulfill({json:state.failRead?{status:'forbidden',message:'Config read failed'}:{status:'success',config:{timezone:state.timezone,currentOrganization:state.defaultId},systemTimezoneOffset:state.timezone,timezoneConfigVersion:String(state.reads)}});});
  await page.route('**/api/listOrganizations',route=>route.fulfill({json:state.failList?{status:'forbidden',message:'Directory read failed'}:{status:'success',list:state.organizations}}));
  await page.route('**/api/saveSystemConfig',route=>{const body=route.request().postDataJSON();state.writes.push({name:'saveSystemConfig',body});if(state.reject)return route.fulfill({json:{status:'forbidden',message:'Settings rejected'}});state.timezone=body.timezone;return route.fulfill({json:{status:'success',systemTimezoneOffset:state.timezone,timezoneConfigVersion:'2'}});});
  await page.route('**/api/saveOrganization',route=>{const body=route.request().postDataJSON();state.writes.push({name:'saveOrganization',body});if(state.reject)return route.fulfill({json:{status:'duplicate',message:'Organization rejected'}});const organization={id:body.id||'org-new',name:body.name};state.organizations=state.organizations.filter(row=>row.id!==organization.id).concat(organization);return route.fulfill({json:{status:'success',organization}});});
  await page.route('**/api/switchOrganization',route=>{const body=route.request().postDataJSON();state.writes.push({name:'switchOrganization',body});if(state.failDefault)return route.fulfill({json:{status:'forbidden',message:'Default rejected'}});state.defaultId=body.organizationId;return route.fulfill({json:{status:'success'}});});
  await page.route('**/api/deleteOrganization',route=>{const body=route.request().postDataJSON();state.writes.push({name:'deleteOrganization',body});if(state.reject)return route.fulfill({json:{status:'organization_not_empty',message:'Organization has business records'}});state.organizations=state.organizations.filter(row=>row.id!==body.organizationId);return route.fulfill({json:{status:'success'}});});
  return {state,api};
}
async function open(page){await page.goto('/web/admin?subApp=system&tab=settings');await expect(page.getByLabel(ui.copy_bed2e70b8f,{exact:true})).toHaveValue('8');}
const orgCard=(page,name)=>page.locator('.organization-row').filter({hasText:name});
const saveButton=page=>page.getByRole('button',{name:ui.copy_71db23a36b,exact:true});

test('settings timezone uses the native options and payload, preserves rejection and rereads without changing role',async({page})=>{
  const {state,api}=await setup(page);await open(page);const picker=page.getByLabel(ui.copy_bed2e70b8f,{exact:true});
  await expect(picker.locator('option')).toHaveCount(25);await picker.selectOption('-12');state.reject=true;await saveButton(page).click();await expect(page.getByText('Settings rejected')).toBeVisible();await expect(picker).toHaveValue('-12');
  state.reject=false;await saveButton(page).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes[1]).toEqual({name:'saveSystemConfig',body:{timezone:-12}});await expect(picker).toHaveValue('-12');
  expect(api.calls.filter(row=>row.name==='auth/contexts/activate')).toHaveLength(0);
});

test('settings drafts and saved read failures survive tabs and retry never repeats the write',async({page})=>{
  const {state}=await setup(page);await open(page);await page.getByLabel(ui.copy_bed2e70b8f,{exact:true}).selectOption('0');
  await page.getByRole('tab',{name:ui.copy_72d3c6f7c2,exact:true}).click();await page.getByRole('tab',{name:ui.copy_a8792b30e7,exact:true}).click();await expect(page.getByLabel(ui.copy_bed2e70b8f,{exact:true})).toHaveValue('0');
  state.failRead=true;await saveButton(page).click();await expect(page.getByText('Config read failed')).toBeVisible();await expect(saveButton(page)).toBeDisabled();
  await page.getByRole('tab',{name:ui.copy_72d3c6f7c2,exact:true}).click();await page.getByRole('tab',{name:ui.copy_a8792b30e7,exact:true}).click();await expect(saveButton(page)).toBeDisabled();state.failRead=false;await page.getByRole('button',{name:personnel.dictionaryRetry}).click();await expect(saveButton(page)).toBeEnabled();expect(state.writes).toHaveLength(1);
});

test('organizations save and edit actual names, keep a rejected form and reread the directory',async({page})=>{
  const {state}=await setup(page);await open(page);await page.getByRole('button',{name:ui.copy_6a843c55ad,exact:true}).click();const dialog=page.getByRole('dialog');
  const geometry=await dialog.evaluate(node=>{const field=node.querySelector('input').getBoundingClientRect(),actions=node.querySelector('.dialog-actions').getBoundingClientRect(),button=node.querySelector('.dialog-actions .btn-secondary'),range=document.createRange();range.selectNodeContents(button);return {fieldWidth:field.width,actionWidth:actions.width,textRows:[...range.getClientRects()].length};});expect(Math.abs(geometry.actionWidth-geometry.fieldWidth)).toBeLessThan(1);expect(geometry.textRows).toBe(1);
  await dialog.getByLabel(ui.copy_2deb5cbfc9).fill(' New Organization ');state.reject=true;await dialog.getByRole('button',{name:ui.copy_0ee803a476,exact:true}).click();await expect(dialog.getByText('Organization rejected')).toBeVisible();await expect(dialog.getByLabel(ui.copy_2deb5cbfc9)).toHaveValue(' New Organization ');
  state.reject=false;await dialog.getByRole('button',{name:ui.copy_0ee803a476,exact:true}).click();await expect(dialog).toHaveCount(0);await expect(orgCard(page,'New Organization')).toBeVisible();expect(state.writes[1].body).toEqual({id:'',name:'New Organization'});
  await orgCard(page,'New Organization').getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();await page.getByRole('dialog').getByLabel(ui.copy_2deb5cbfc9).fill('Renamed Organization');await page.getByRole('dialog').getByRole('button',{name:ui.copy_0ee803a476,exact:true}).click();await expect(orgCard(page,'Renamed Organization')).toBeVisible();expect(state.writes[2].body).toEqual({id:'org-new',name:'Renamed Organization'});
});

test('default organization confirmation names its target and changes only the login default',async({page})=>{
  const {state,api}=await setup(page);await open(page);await orgCard(page,'Organization A').getByRole('button',{name:ui.copy_fda919de66,exact:true}).count().then(count=>expect(count).toBe(0));
  await orgCard(page,'Organization B').getByRole('button',{name:ui.copy_fda919de66,exact:true}).click();await expect(page.getByRole('dialog').getByText(messages.copy_e7e3787584+'Organization B'+'」。')).toBeVisible();await page.getByRole('button',{name:messages.copy_4b213fd88a,exact:true}).click();expect(state.writes).toHaveLength(0);
  await orgCard(page,'Organization B').getByRole('button',{name:ui.copy_fda919de66,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:messages.copy_6616a4de3c,exact:true}).click();await expect(orgCard(page,'Organization B').getByText(ui.copy_e74c96dd07,{exact:true})).toBeVisible();expect(state.writes[0].body).toEqual({organizationId:'org-b',organizationName:'Organization B'});expect(api.calls.filter(row=>row.name==='auth/contexts/activate')).toHaveLength(0);
});

test('create and default partial failure retries the default without creating another organization',async({page})=>{
  const {state}=await setup(page);await open(page);await page.getByRole('button',{name:ui.copy_6a843c55ad,exact:true}).click();await page.getByRole('dialog').getByLabel(ui.copy_2deb5cbfc9).fill('New default');state.failDefault=true;
  await page.getByRole('button',{name:ui.copy_f489226f00,exact:true}).click();await page.getByRole('button',{name:messages.copy_d5f0842283,exact:true}).click();await expect(page.getByText('Default rejected')).toBeVisible();await expect(page.getByRole('dialog').getByLabel(ui.copy_2deb5cbfc9)).toBeDisabled();
  state.failDefault=false;await page.getByRole('button',{name:ui.copy_f489226f00,exact:true}).click();await page.getByRole('button',{name:messages.copy_d5f0842283,exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(state.writes.map(row=>row.name)).toEqual(['saveOrganization','switchOrganization','switchOrganization']);await expect(orgCard(page,'New default').getByText(ui.copy_e74c96dd07,{exact:true})).toBeVisible();
});

test('organization read failure after save has an accessible retry inside the locked editor',async({page})=>{
  const {state}=await setup(page);await open(page);await page.getByRole('button',{name:ui.copy_6a843c55ad,exact:true}).click();await page.getByRole('dialog').getByLabel(ui.copy_2deb5cbfc9).fill('Read pending');state.failList=true;await page.getByRole('dialog').getByRole('button',{name:ui.copy_0ee803a476,exact:true}).click();
  await expect(page.getByRole('dialog').getByText('Directory read failed')).toBeVisible();await expect(page.getByRole('dialog').getByRole('button',{name:ui.copy_0ee803a476,exact:true})).toBeDisabled();state.failList=false;await page.getByRole('dialog').getByRole('button',{name:personnel.dictionaryRetry}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(state.writes).toHaveLength(1);await expect(orgCard(page,'Read pending')).toBeVisible();
});

test('organization deletion confirms an exact target, respects references and rereads a successful deletion',async({page})=>{
  const {state}=await setup(page);await open(page);const target=orgCard(page,'Organization B');await target.getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await expect(page.getByRole('dialog').getByText('Organization B\n'+messages.copy_c1360f875d)).toBeVisible();await page.getByRole('button',{name:messages.copy_4b213fd88a,exact:true}).click();expect(state.writes).toHaveLength(0);
  state.reject=true;await target.getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:messages.copy_292043f789,exact:true}).click();await expect(page.getByText('Organization has business records')).toBeVisible();await expect(target).toBeVisible();state.reject=false;
  await target.getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:messages.copy_292043f789,exact:true}).click();await expect(target).toHaveCount(0);expect(state.writes[1].body).toEqual({organizationId:'org-b'});
});

test('ordinary administrators cannot see organization actions and the old config address enters native settings',async({page})=>{
  await setup(page,{superAdmin:false});await page.goto('/web/system/config');await expect(page).toHaveURL(/admin\?subApp=system&tab=settings/);await expect(page.getByLabel(ui.copy_bed2e70b8f,{exact:true})).toHaveValue('8');await expect(page.getByRole('button',{name:ui.copy_6a843c55ad,exact:true})).toHaveCount(0);await expect(page.locator('.organization-row')).toHaveCount(0);
});

test('pending settings writes prevent navigation and preserve full controls at narrow width',async({page})=>{
  await setup(page);await page.setViewportSize({width:310,height:800});await page.goto('/web/portal');await page.getByRole('button',{name:ui.copy_5b4cf5d1bf,exact:true}).click();await page.getByRole('tab',{name:ui.copy_a8792b30e7,exact:true}).click();await expect(saveButton(page)).toBeEnabled();
  let release;const pending=new Promise(resolve=>{release=resolve;});await page.route('**/api/saveSystemConfig',async route=>{await pending;await route.fulfill({json:{status:'success'}});});await saveButton(page).click();await expect(page.getByRole('tab',{name:ui.copy_72d3c6f7c2,exact:true})).toBeDisabled();await page.goBack();await expect(page).toHaveURL(/admin/);release();await expect(saveButton(page)).toBeEnabled();
  const size=await page.getByLabel(ui.copy_bed2e70b8f,{exact:true}).boundingBox();expect(size.height).toBeGreaterThanOrEqual(40);expect(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('an existing server timezone beyond the native choice list stays intact until explicitly changed',async({page})=>{
  const {state}=await setup(page);state.timezone=14;await page.goto('/web/admin?subApp=system&tab=settings');await expect(page.getByLabel(ui.copy_bed2e70b8f,{exact:true})).toHaveValue('14');await saveButton(page).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes[0].body).toEqual({timezone:14});
});
