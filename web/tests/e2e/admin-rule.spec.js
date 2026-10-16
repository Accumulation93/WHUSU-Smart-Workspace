import { expect,test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/ruleBehavior.js';
import personnel from '../../src/locales/zh-CN/shared/adminPersonnel.js';
import copy from '../../src/locales/zh-CN/index.js';
const config=(id='t1',name='Template A')=>({templateId:id,templateName:name,weight:1,sortOrder:1,calculationMethod:'weighted_average',trimHighCount:0,trimLowCount:0});
const clause=()=>({scopeType:'all_people',targetIdentityId:'',targetIdentity:'',requireAllComplete:false,templateConfigs:[config()]});
const rule=(id='r1',department='Department A',allow=false)=>({id,activityId:'a1',activityName:'Activity A',scorerDepartmentId:id==='r1'?'d1':'d2',scorerDepartment:department,scorerIdentityId:'i1',scorerIdentity:'Identity A',allowSelfAssessment:allow,clauses:[clause()]});
async function setup(page){
  await mockApi(page,{activeContextId:'ctx-admin'});const state={rules:[rule(),rule('r2','Department B',true)],reads:0,writes:[],reject:false,failRead:false,current:true};
  const fulfill=(route,json)=>route.fulfill({json});
  await page.route('**/api/getMyAdminPermissions',route=>fulfill(route,{status:'success',organizationId:'org-1',adminLevel:'admin',permissions:{'scoring.rules':true,'scoring.rules.delete':true,'scoring.templates':true,'scoring.activities':true}}));
  await page.route('**/api/listScoreActivities',route=>fulfill(route,{status:'success',currentActivityId:state.current?'a1':'',list:[{id:'a1',name:'Activity A',isCurrent:state.current}]}));
  await page.route('**/api/listDepartments',route=>fulfill(route,{status:'success',departments:[{id:'d1',name:'Department A'},{id:'d2',name:'Department B'}]}));
  await page.route('**/api/listIdentities',route=>fulfill(route,{status:'success',identities:[{id:'i1',name:'Identity A'}]}));
  await page.route('**/api/listScoreTemplates',route=>fulfill(route,{status:'success',list:[{id:'t1',name:'Template A',questions:[]},{id:'t2',name:'Template B',questions:[]}]}));
  await page.route('**/api/listRateRules',route=>{state.reads++;return fulfill(route,state.failRead?{status:'forbidden',message:'Rule read failed'}:{status:'success',rules:state.rules});});
  for(const name of ['saveRateRule','batchSaveRateRules','generateRateTargetRules','deleteRateRule'])await page.route('**/api/'+name,route=>{
    const body=route.request().postDataJSON();state.writes.push({name,body});if(state.reject)return fulfill(route,{status:'conflict',message:'Rule rejected'});
    if(name==='saveRateRule'){const saved={...body,id:body.id||'r-new'};state.rules=state.rules.filter(row=>row.id!==saved.id).concat(saved);}
    if(name==='batchSaveRateRules')for(const item of body.rules)state.rules=state.rules.map(row=>row.id===item.id?{...row,...item}:row);
    if(name==='deleteRateRule')state.rules=state.rules.filter(row=>row.id!==body.id);
    return fulfill(route,{status:'success',ruleCount:state.rules.length});
  });return state;
}
async function open(page){await page.goto('/web/admin?subApp=scoring&tab=rules');await expect(page.getByRole('checkbox').filter({hasText:'Department A'})).toBeVisible();}
const row=(page,name='Department A')=>page.getByRole('checkbox').filter({hasText:name});
async function newClause(page){await page.getByRole('button',{name:ui.copy_80708ed559,exact:true}).click();await page.getByLabel(ui.copy_4a52d5ce73,{exact:true}).selectOption('all_people');await page.getByRole('button',{name:ui.copy_104a8f33bb,exact:true}).click();await page.locator('.template-editor').getByLabel(ui.copy_5a49161fd7,{exact:true}).selectOption('t1');}
async function storeConfig(page){await page.locator('.template-editor').getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();}
const saveCategory=page=>page.getByRole('button',{name:ui.copy_04d8c1a10d,exact:true});

test('rule editing and save reread preserve disabled self assessment through business rejection',async({page})=>{
 const state=await setup(page);await open(page);await row(page).getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();await expect(page.getByRole('switch',{name:ui.copy_b2c24eb575,exact:true})).not.toBeChecked();state.reject=true;await saveCategory(page).click();await expect(page.getByText('Rule rejected')).toBeVisible();state.reject=false;await saveCategory(page).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes[1]).toMatchObject({name:'saveRateRule',body:{id:'r1',activityId:'a1',scorerDepartmentId:'d1',scorerIdentityId:'i1',allowSelfAssessment:false}});
});

test('new category includes pending clause and template drafts with native weight and trim fields',async({page})=>{
 const state=await setup(page);await open(page);await page.getByLabel(ui.copy_2c2a412327,{exact:true}).selectOption('d2');await page.getByLabel(ui.copy_bf4cf396ad,{exact:true}).selectOption('i1');await newClause(page);await page.getByLabel(ui.copy_30e235fb56,{exact:true}).fill('2.5');await page.getByLabel(ui.copy_02151fbb6a,{exact:true}).selectOption('trim_extremes');await page.getByLabel(ui.copy_413624a39e,{exact:true}).fill('1');await page.getByLabel(ui.copy_061e85a1bb,{exact:true}).fill('2');await saveCategory(page).click();await expect.poll(()=>state.reads).toBe(2);
 expect(state.writes[0].body.clauses[0]).toMatchObject({scopeType:'all_people',targetIdentityId:'',requireAllComplete:false,templateConfigs:[{templateId:'t1',weight:'2.5',sortOrder:'1',calculationMethod:'trim_extremes',trimHighCount:1,trimLowCount:2}]});expect(JSON.stringify(state.writes[0].body)).not.toContain('"key"');
});

test('clause editor validates scope and weights, confirms explicitly and cancels without changing saved clauses',async({page})=>{
 await setup(page);await open(page);await page.getByRole('button',{name:ui.copy_80708ed559,exact:true}).click();await page.getByRole('button',{name:ui.copy_8d32562588,exact:true}).click();await expect(page.getByText(messages.copy_7151fd51a0)).toBeVisible();await page.getByRole('button',{name:ui.copy_6dd2900f2a,exact:true}).click();await expect(page.getByLabel(ui.copy_4a52d5ce73,{exact:true})).toHaveCount(0);
 await newClause(page);await page.getByLabel(ui.copy_30e235fb56,{exact:true}).fill('0');await storeConfig(page);await expect(page.getByText(messages.copy_ba359df757)).toBeVisible();await page.getByLabel(ui.copy_30e235fb56,{exact:true}).fill('1');await storeConfig(page);await page.getByRole('button',{name:ui.copy_8d32562588,exact:true}).click();await expect(page.getByLabel(ui.copy_4a52d5ce73,{exact:true})).toHaveCount(0);await expect(page.getByText('Template A',{exact:true})).toBeVisible();
});

test('whole-card filtered selection batches one request while retaining each self assessment setting',async({page})=>{
 const state=await setup(page);await open(page);await row(page).getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();await page.getByLabel(ui.copy_1a978b0d52,{exact:true}).selectOption('Department A');await page.getByRole('button',{name:ui.copy_e1d94e445d,exact:true}).click();await expect(row(page)).toBeChecked();await page.getByRole('button',{name:ui.copy_cec32bdb96,exact:true}).click();await row(page,'Department B').click();await page.getByRole('button',{name:ui.copy_08b30a529d,exact:true}).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes).toHaveLength(1);expect(state.writes[0].name).toBe('batchSaveRateRules');expect(state.writes[0].body.rules.map(item=>item.allowSelfAssessment)).toEqual([false,true]);expect(state.writes[0].body.rules.every(item=>item.mode==='replace')).toBe(true);
});

test('saved category read failure survives tabs and retries only the read',async({page})=>{
 const state=await setup(page);await open(page);await row(page).getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();state.failRead=true;await saveCategory(page).click();await expect(page.getByText('Rule read failed')).toBeVisible();await expect(saveCategory(page)).toBeDisabled();await page.getByRole('tab',{name:ui.copy_5aa4cb13ec,exact:true}).click();await page.getByRole('tab',{name:ui.copy_9ad6311419,exact:true}).click();await expect(saveCategory(page)).toBeDisabled();await expect(page.getByText('Rule read failed')).toBeVisible();state.failRead=false;await page.getByRole('button',{name:personnel.dictionaryRetry}).click();await expect(saveCategory(page)).toBeEnabled();expect(state.writes).toHaveLength(1);
});

test('deletion identifies the category and cancellation, references and success preserve correct records',async({page})=>{
 const state=await setup(page);await open(page);await row(page).getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await expect(page.getByRole('dialog').getByText('Department A / Identity A\n'+messages.copy_06219d4706)).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:copy.common.cancel,exact:true}).click();expect(state.writes).toHaveLength(0);state.reject=true;await row(page).getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:copy.common.confirm,exact:true}).click();await expect(page.getByText('Rule rejected')).toBeVisible();await expect(row(page)).toBeVisible();state.reject=false;await row(page).getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:copy.common.confirm,exact:true}).click();await expect(row(page)).toHaveCount(0);expect(state.writes[1].body).toEqual({id:'r1'});
});

test('native template ordering retains fields and uses stable question order values',async({page})=>{
 const state=await setup(page);await open(page);await page.getByLabel(ui.copy_2c2a412327,{exact:true}).selectOption('d1');await page.getByLabel(ui.copy_bf4cf396ad,{exact:true}).selectOption('i1');await newClause(page);await storeConfig(page);await page.getByRole('button',{name:ui.copy_104a8f33bb,exact:true}).click();await page.locator('.template-editor').getByLabel(ui.copy_5a49161fd7,{exact:true}).selectOption('t2');await storeConfig(page);await page.locator('.config-pane > div').nth(1).getByRole('button',{name:'↑',exact:true}).click();await page.getByRole('button',{name:ui.copy_8d32562588,exact:true}).click();await saveCategory(page).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes[0].body.clauses[0].templateConfigs.map(item=>[item.templateId,item.sortOrder])).toEqual([['t2','1'],['t1','2']]);
});

test('generation rereads categories and no current activity cannot write rules',async({page})=>{
 const state=await setup(page);await open(page);await page.getByRole('button',{name:ui.copy_40f8a2873c,exact:true}).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes[0]).toEqual({name:'generateRateTargetRules',body:{activityId:'a1'}});state.current=false;await page.reload();await expect(page.getByText(messages.copy_4e36c10a9e)).toBeVisible();await expect(saveCategory(page)).toBeDisabled();
});

test('keyboard edit is isolated from whole-card selection and long press reorders template payloads',async({page})=>{
 const state=await setup(page);await open(page);await row(page).getByRole('button',{name:ui.copy_e040ae3016,exact:true}).press('Enter');await expect(row(page)).not.toBeChecked();
 await newClause(page);await page.getByLabel(ui.copy_4a52d5ce73,{exact:true}).selectOption('identity_only');await page.getByLabel(ui.copy_ca92a29121,{exact:true}).selectOption('i1');await storeConfig(page);await page.getByRole('button',{name:ui.copy_104a8f33bb,exact:true}).click();await page.locator('.template-editor').getByLabel(ui.copy_5a49161fd7,{exact:true}).selectOption('t2');await storeConfig(page);
 const handle=await page.locator('.config-pane .drag-handle').first().boundingBox(),target=await page.locator('.config-pane > div').nth(1).boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.waitForTimeout(380);await expect(page.locator('.question-ghost')).toBeVisible();await page.mouse.move(target.x+target.width/2,target.y+target.height-2);await page.mouse.up();await expect(page.locator('.question-ghost')).toHaveCount(0);
 await page.getByRole('button',{name:ui.copy_8d32562588,exact:true}).click();await saveCategory(page).click();await expect.poll(()=>state.reads).toBe(2);expect(state.writes[0].body.clauses.at(-1).templateConfigs.map(item=>item.templateId)).toEqual(['t2','t1']);
});

test('pending category save disables controls and browser return with complete narrow fields',async({page})=>{
 await setup(page);await page.setViewportSize({width:310,height:800});await page.goto('/web/portal');await page.getByRole('button',{name:ui.copy_33a502217d,exact:true}).click();await page.getByRole('tab',{name:ui.copy_9ad6311419,exact:true}).click();await row(page).getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();
 let release;const held=new Promise(resolve=>{release=resolve;});await page.route('**/api/saveRateRule',async route=>{await held;await route.fulfill({json:{status:'success'}});});await saveCategory(page).click();await expect(page.getByLabel(ui.copy_1a978b0d52,{exact:true})).toBeDisabled();await expect(page.getByRole('tab',{name:ui.copy_5aa4cb13ec,exact:true})).toBeDisabled();await page.goBack();await expect(page).toHaveURL(/admin/);release();await expect(saveCategory(page)).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
