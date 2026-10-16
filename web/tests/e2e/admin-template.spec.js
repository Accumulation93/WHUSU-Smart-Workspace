import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import messages from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/templateBehavior.js';
import copy from '../../src/locales/zh-CN/index.js';
import personnel from '../../src/locales/zh-CN/shared/adminPersonnel.js';
const q = (question='Question A') => ({question,scoreLabel:'Explanation',minValue:0,startValue:2,maxValue:10,stepValue:0.5});
const initial = () => [{id:'t1',name:'Template A',description:'Description A',questions:[q()],questionCount:1}];
async function setup(page, options={}) {
  const api=await mockApi(page,{activeContextId:'ctx-admin'});
  await page.route('**/api/getMyAdminPermissions',route=>route.fulfill({json:{status:'success',organizationId:'org-1',adminLevel:'admin',permissions:{'scoring.templates':true,'scoring.templates.delete':true,'scoring.activities':true,...options.permissions}}}));
  const state={list:initial(),reads:0,writes:[],reject:false,failRead:false};
  await page.route('**/api/listScoreTemplates',route=>{state.reads++;return route.fulfill({json:state.failRead?{status:'forbidden',message:'Read rejected'}:{status:'success',list:state.list}});});
  await page.route('**/api/saveScoreTemplate',route=>{
    const body=route.request().postDataJSON();state.writes.push(body);
    if(state.reject)return route.fulfill({json:{status:'duplicate',message:'Save rejected'}});
    state.list=[{...body,id:body.id||'t2',questionCount:body.questions.length}];
    return route.fulfill({json:{status:'success',id:body.id||'t2'}});
  });
  return {state,api};
}
async function open(page){await page.goto('/web/admin?subApp=scoring&tab=templates');await expect(page.getByText('Template A',{exact:true})).toBeVisible();}
async function edit(page){await page.getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();await page.locator('.question-expand').click();}

test('template edits preserve exact questions through rejection, tab switching and save reread',async({page})=>{
  const {state}=await setup(page);await open(page);await edit(page);
  await expect(page.getByLabel(ui.copy_6cc2ee6bc8,{exact:true})).toHaveValue('2');
  await page.getByLabel(ui.copy_f7736be7ba).fill('Changed question');state.reject=true;
  await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();await expect(page.getByText('Save rejected')).toBeVisible();
  await expect(page.getByLabel(ui.copy_f7736be7ba)).toHaveValue('Changed question');
  await page.getByRole('tab',{name:ui.copy_5aa4cb13ec,exact:true}).click();await page.getByRole('tab',{name:ui.copy_5a49161fd7,exact:true}).click();
  await expect(page.getByLabel(ui.copy_f7736be7ba)).toHaveValue('Changed question');
  await expect(page.getByLabel(ui.copy_a8f6e57e29,{exact:true})).toHaveValue('Template A');state.reject=false;
  await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();await expect.poll(()=>state.reads).toBe(3);
  expect(state.writes[1]).toMatchObject({id:'t1',name:'Template A',description:'Description A',questions:[{question:'Changed question',scoreLabel:'Explanation',minValue:'0',startValue:'2',maxValue:'10',stepValue:'0.5'}]});
  expect(state.writes[1].questions[0]).not.toHaveProperty('key');await expect(page.getByLabel(ui.copy_a8f6e57e29,{exact:true})).toHaveValue('');
});

test('template saved reread failure remains frozen across tabs and retries only the read',async({page})=>{
  const {state}=await setup(page);await open(page);await edit(page);state.failRead=true;
  await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();await expect(page.getByText('Read rejected')).toBeVisible();
  await expect(page.getByRole('button',{name:ui.copy_7e4100d002,exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:ui.copy_5aa4cb13ec,exact:true}).click();await page.getByRole('tab',{name:ui.copy_5a49161fd7,exact:true}).click();
  await expect(page.getByLabel(ui.copy_a8f6e57e29,{exact:true})).toHaveValue('Template A');state.failRead=false;
  await page.getByRole('button',{name:personnel.dictionaryRetry,exact:true}).click();await expect(page.getByLabel(ui.copy_a8f6e57e29,{exact:true})).toHaveValue('');expect(state.writes).toHaveLength(1);
});

test('template copies and confirmed deletes reread while rejected references retain the named target',async({page})=>{
  const {state}=await setup(page);let copies=0,deletes=0;
  await page.route('**/api/duplicateScoreTemplate',route=>{expect(route.request().postDataJSON().id).toBe('t1');copies++;state.list.push({...state.list[0],id:'copy',name:'Template copy'});return route.fulfill({json:{status:'success',id:'copy'}});});
  await page.route('**/api/deleteScoreTemplate',route=>{deletes++;return route.fulfill({json:{status:'forbidden',message:'Template referenced'}});});
  await open(page);await page.getByRole('button',{name:ui.copy_fbf1856932,exact:true}).click();await expect(page.getByText('Template copy',{exact:true})).toBeVisible();expect(copies).toBe(1);
  const target=page.locator('.list-row').filter({has:page.getByText('Template A',{exact:true})});
  await target.getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();const confirm=page.getByRole('dialog',{name:messages.copy_697796da96});await expect(confirm).toContainText('Template A');
  await confirm.getByRole('button',{name:copy.common.cancel,exact:true}).click();expect(deletes).toBe(0);
  await target.getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await confirm.getByRole('button',{name:copy.common.confirm,exact:true}).click();await expect(page.getByText('Template referenced')).toBeVisible();await expect(page.getByText('Template A',{exact:true})).toBeVisible();
});

test('questions reorder, remove and add with stable expansion and native numeric validation',async({page})=>{
  const {state}=await setup(page);state.list[0].questions=[q('First'),q('Second'),q('Third')];state.list[0].questionCount=3;await open(page);
  await page.getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();const cards=page.locator('.question-pane [data-question-key]');
  await cards.nth(1).getByRole('button',{name:'↑',exact:true}).click();await expect(cards.first()).toContainText('Second');
  await cards.first().getByRole('button',{name:ui.copy_acc985cabc,exact:true}).click();await expect(cards).toHaveCount(2);
  await page.getByRole('button',{name:ui.copy_9d31093860,exact:true}).click();await expect(cards).toHaveCount(3);await expect(page.getByLabel(ui.copy_f7736be7ba)).toBeVisible();
  await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();await expect(page.getByText(new RegExp(messages.copy_e6653bb300))).toBeVisible();expect(state.writes).toHaveLength(0);
  await page.getByLabel(ui.copy_f7736be7ba).fill('New');await page.getByLabel(ui.copy_ee368e39ca).fill('0');await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();await expect(page.getByText(new RegExp(messages.copy_17bbfdd98a))).toBeVisible();
  await page.getByLabel(ui.copy_ee368e39ca).fill('20');await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();expect(state.writes[0].questions.map(item=>item.question)).toEqual(['First','Third','New']);
});

test('CSV mapping distinguishes minimum and initial score, preserves multiline labels and appends only after confirmation',async({page})=>{
  const {state}=await setup(page);await open(page);await edit(page);
  await page.locator('input[type=file]').setInputFiles({name:'Imported.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFF问题内容,分值说明,最低分,起始分,最高分,分值间隔\r\nImported,"Two lines\nSecond, line",1,3,12,0.25\r\n')});
  const mapping=page.getByRole('dialog',{name:ui.copy_0601453416});await expect(mapping).toBeVisible();
  await expect(mapping.getByLabel(ui.copy_9c0e348f1b+' · 起始分',{exact:true})).toHaveValue('startValue');
  await expect(mapping.getByLabel(ui.copy_9c0e348f1b+' · 最低分',{exact:true})).toHaveValue('minValue');
  await mapping.getByRole('switch',{name:ui.copy_c1f37f0512,exact:true}).click();
  await mapping.getByRole('button',{name:ui.copy_b35531a5fd,exact:true}).click();await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();
  expect(state.writes[0].questions).toHaveLength(2);expect(state.writes[0].questions[1]).toMatchObject({question:'Imported',scoreLabel:'Two lines\nSecond, line',minValue:'1',startValue:'3',maxValue:'12',stepValue:'0.25'});
});

test('CSV export roundtrips and Excel import selects a sheet using the existing server file interfaces',async({page})=>{
  const {state}=await setup(page);await open(page);await edit(page);
  await page.getByRole('button',{name:ui.copy_37b2d47dd4,exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:messages.copy_7ffcbc33aa,exact:true}).click();const download=await downloadPromise;
  const text=await fs.readFile(await download.path(),'utf8');expect(text).toContain('问题内容,分值说明,最低分,起始分,最高分,分值间隔');expect(text).toContain('Question A,Explanation,0,2,10,0.5');
  await page.route('**/api/parseTableFile',route=>{expect(route.request().postDataJSON()).toMatchObject({fileName:'Questions.xlsx',fileBase64:'d29ya2Jvb2s='});return route.fulfill({json:{status:'success',sheets:[{name:'Sheet One',headers:['question'],rows:[['Wrong']]},{name:'Sheet Two',headers:['question','startValue'],rows:[['Correct','4']]}]}});});
  await page.locator('input[type=file]').setInputFiles({name:'Questions.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('workbook')});await page.getByRole('button',{name:'Sheet Two',exact:true}).click();
  await page.getByRole('dialog',{name:ui.copy_0601453416}).getByRole('button',{name:ui.copy_b35531a5fd,exact:true}).click();await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();expect(state.writes[0].questions).toHaveLength(1);expect(state.writes[0].questions[0]).toMatchObject({question:'Correct',startValue:'4'});
});

test('pending template save blocks navigation and narrow numeric fields remain complete',async({page})=>{
  await setup(page);let release;
  await page.route('**/api/saveScoreTemplate',async route=>{await new Promise(resolve=>{release=resolve;});await route.fulfill({json:{status:'success'}});});
  await page.goto('/web/portal');await page.getByRole('button',{name:copy.portal.scoring,exact:true}).click();await page.getByRole('tab',{name:ui.copy_5a49161fd7,exact:true}).click();await edit(page);
  await page.setViewportSize({width:310,height:760});
  const controls=await page.locator('.question-numbers input').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));expect(controls).toHaveLength(4);expect(controls.every(item=>item.width>70 && item.height>30)).toBeTruthy();
  await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();await expect.poll(()=>!!release).toBe(true);await page.goBack();await expect(page).toHaveURL(/tab=templates/);await expect(page.locator('form button[type=submit]')).toBeDisabled();release();await expect(page.getByLabel(ui.copy_a8f6e57e29,{exact:true})).toHaveValue('');
});

test('long press question dragging reorders the actual payload and cancels without losing fields',async({page})=>{
  const {state}=await setup(page);state.list[0].questions=[q('First'),q('Second'),q('Third')];state.list[0].questionCount=3;await open(page);await page.getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();
  const cards=page.locator('.question-pane [data-question-key]');const handle=await cards.first().locator('.drag-handle').boundingBox();const target=await cards.nth(2).boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await expect(page.locator('.question-ghost')).toBeVisible();await page.mouse.move(handle.x+handle.width/2,target.y+target.height-1,{steps:3});await expect(cards.nth(2)).toHaveClass(/question-target/);await page.mouse.up();await expect(page.locator('.question-ghost')).toHaveCount(0);await expect(cards.nth(2)).toContainText('First');
  await page.getByRole('button',{name:ui.copy_7e4100d002,exact:true}).click();expect(state.writes[0].questions.map(item=>item.question)).toEqual(['Second','Third','First']);expect(state.writes[0].questions.every(item=>item.startValue==='2' && item.scoreLabel==='Explanation')).toBeTruthy();
});

test('Excel export uses exact headers, retries failures and corrupt CSV cannot replace the draft',async({page})=>{
  await setup(page);let exports=0;
  await page.route('**/api/buildTableFile',route=>{exports++;const body=route.request().postDataJSON();expect(body.headers.map(item=>item.key)).toEqual(['question','scoreLabel','minValue','startValue','maxValue','stepValue']);expect(body.headers.find(item=>item.key==='startValue').label).toBe('起始分');expect(body.rows[0]).toMatchObject({question:'Question A',startValue:'2'});return route.fulfill({json:exports===1?{status:'forbidden',message:'Export rejected'}:{status:'success',fileBase64:'d29ya2Jvb2s='}});});
  await open(page);await edit(page);await page.getByRole('button',{name:ui.copy_37b2d47dd4,exact:true}).click();await page.getByRole('button',{name:messages.copy_5503123f4c,exact:true}).click();await expect(page.getByText('Export rejected')).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:messages.copy_5503123f4c,exact:true}).click();expect((await download).suggestedFilename()).toBe(messages.copy_44db0286b0+'.xlsx');
  await page.locator('input[type=file]').setInputFiles({name:'Corrupt.csv',mimeType:'text/csv',buffer:Buffer.from('question\n"Unclosed')});await expect(page.getByLabel(ui.copy_f7736be7ba)).toHaveValue('Question A');await expect(page.getByRole('dialog',{name:ui.copy_0601453416})).toHaveCount(0);
});

test('malformed exported bytes show the shared failure inside the dialog and can be retried',async({page})=>{
  await setup(page);let requests=0;
  await page.route('**/api/buildTableFile',route=>route.fulfill({json:{status:'success',fileBase64:++requests===1?'!':'d29ya2Jvb2s='}}));
  await open(page);await edit(page);await page.getByRole('button',{name:ui.copy_37b2d47dd4,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:ui.copy_37b2d47dd4});await dialog.getByRole('button',{name:messages.copy_5503123f4c,exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText(messages.copy_2b61466286);await expect(dialog).not.toContainText(/atob|InvalidCharacterError|encoded/);
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:messages.copy_5503123f4c,exact:true}).click();await download;await expect(dialog).toHaveCount(0);await expect(page.getByLabel(ui.copy_a8f6e57e29,{exact:true})).toHaveValue('Template A');
});
