import { test,expect } from '@playwright/test';
import { mockApi } from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import text from '../../src/locales/zh-CN/shared/auditSigning.js';
import personnel from '../../src/locales/zh-CN/shared/personnelPicker.js';
import stampCopy from '../../src/locales/zh-CN/shared/stampAuthorization.js';
import copy from '../../src/locales/zh-CN/index.js';
import governance from '../../src/locales/zh-CN/shared/adminGovernance.js';
async function setup(page){
  await mockApi(page,{activeContextId:'ctx-admin'});
  const state={templates:[],stamps:[],permissions:[],calls:[],reject:false,failRead:false};
  const assignment={assignmentId:'a-1',assignmentLabel:'Member · Office',departmentId:'d-1',department:'Office',identityCategoryId:'i-1',identity:'Member',workGroupId:'w-1',workGroup:'Group'};
  const data={people:[{id:'hr-1',name:'Person A',assignments:[assignment]},{id:'hr-2',name:'Person B',assignments:[]}],departments:[{id:'d-1',name:'Office'}],identities:[{id:'i-1',name:'Member'}],workGroups:[{id:'w-1',name:'Group',departmentId:'d-1'}]};
  await page.route('**/api/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(5),body=route.request().postDataJSON();
    if(!['getMyAdminPermissions','listAuditFlowTemplates','getAuditTemplateEditorData','saveAuditFlowTemplate','deleteAuditFlowTemplate','listStamps','saveStamp','deleteStamp','listStampCandidates','saveStampGrants','listVerificationPermissions','listAuditVerificationCandidates','saveVerificationPermission','listAllAuditSubmissions'].includes(name))return route.fallback();
    state.calls.push({name,body});let result;
    if(name==='getMyAdminPermissions')result={status:'success',organizationId:'org-1',adminLevel:'admin',permissions:Object.fromEntries(['audit.templates','audit.templates.delete','audit.stamps','audit.stamps.delete','audit.submissions','audit.verification'].map(value=>[value,true]))};
    if(name==='getAuditTemplateEditorData')result={status:'success',data};
    if(name==='listAuditFlowTemplates')result=state.failRead?{status:'error',message:'Directory failed'}:{status:'success',templates:state.templates};
    if(name==='listStamps')result=state.failRead?{status:'error',message:'Directory failed'}:{status:'success',stamps:state.stamps};
    if(name==='listVerificationPermissions')result=state.failRead?{status:'error',message:'Directory failed'}:{status:'success',permissions:state.permissions};
    if(name==='listStampCandidates')result={status:'success',candidates:[{...assignment,departmentName:'Office',identityCategoryName:'Member',workGroupName:'Group',name:'Person A',personId:'person-a'}]};
    if(name==='listAuditVerificationCandidates')result={status:'success',candidates:data.people};
    if(name==='listAllAuditSubmissions')result={status:'success',submissions:[]};
    if(name==='saveAuditFlowTemplate'){result=state.reject?{status:'forbidden',message:'Save rejected'}:{status:'success',id:'template-new'};if(!state.reject)state.templates=[{...body,resubmitMode:'fresh',id:body.id||'template-new',steps:body.steps.map((step,index)=>({...step,id:'step-'+index}))}];}
    if(name==='deleteAuditFlowTemplate'){result={status:'success'};state.templates=state.templates.filter(row=>row.id!==body.id);}
    if(name==='saveStamp'){result=state.reject?{status:'forbidden',message:'Save rejected'}:{status:'success',id:'stamp-new'};if(!state.reject)state.stamps=[{...body,id:body.id||'stamp-new',assignedPeople:[]}];}
    if(name==='deleteStamp'){result={status:'success'};state.stamps=[];}
    if(name==='saveStampGrants'){result=state.reject?{status:'forbidden',message:'Grant rejected'}:{status:'success'};if(!state.reject)state.stamps[0].assignedPeople=body.assignmentIds.map(id=>({...assignment,assignmentId:id,name:'Person A',available:true}));}
    if(name==='saveVerificationPermission'){result={status:'success'};state.permissions=body.action==='revoke'?[]:[{id:'grant-a',granteeHrId:body.granteeHrId,granteeName:'Person B'}];}
    await route.fulfill({json:result});
  });return state;
}
async function open(page,tab){await page.goto('/web/admin?subApp=audit&tab='+tab);await expect(page.getByRole('tab',{name:ui.copy_7312ee863e,exact:true})).toBeVisible();}
async function createTemplate(page,self=false){
  await page.getByLabel(ui.copy_53adcabdff,{exact:true}).fill('New Flow');
  await page.getByRole('button',{name:ui.copy_a59dd7ae8d,exact:true}).click();
  await expect(page.getByRole('dialog').locator('option[value="submitter"]')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button',{name:personnel.confirm,exact:true}).click();
  await page.getByRole('button',{name:ui.copy_b79428bf57,exact:true}).click();
  await page.getByRole('dialog').getByLabel(ui.copy_c5dd070c37).fill('Sign Step');
  await page.getByRole('dialog').getByRole('button',{name:ui.copy_d3da0e164a,exact:true}).click();
  if(self){
    await page.getByRole('dialog').locator('select').first().selectOption('submitter');
    await expect(page.getByRole('dialog').getByLabel(personnel.department,{exact:true})).toHaveCount(0);
  }
  await page.getByRole('dialog').getByRole('button',{name:personnel.confirm,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:ui.copy_bb0ad94473,exact:true}).click();
}
test('发起人本人作为独立步骤条件保存并回读',async({page})=>{
  const state=await setup(page);await open(page,'auditTemplates');await createTemplate(page,true);
  await expect(page.getByText(governance.auditSubmitter,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true}).click();
  await expect(page.locator('.audit-row').filter({hasText:'New Flow'})).toBeVisible();
  expect(state.calls.filter(row=>row.name==='saveAuditFlowTemplate').at(-1).body.steps[0].conditions).toEqual([{conditionType:'submitter'}]);
});
test('审核模板按原步骤参数保存，失败保留表单，成功后回读',async({page})=>{
  const state=await setup(page);await open(page,'auditTemplates');await createTemplate(page);
  state.reject=true;await page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true}).click();await expect(page.getByText('Save rejected')).toBeVisible();await expect(page.getByLabel(ui.copy_53adcabdff,{exact:true})).toHaveValue('New Flow');
  state.reject=false;await page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true}).click();await expect(page.locator('.audit-row').filter({hasText:'New Flow'})).toBeVisible();
  const saved=state.calls.filter(row=>row.name==='saveAuditFlowTemplate').at(-1).body;
  expect(saved).not.toHaveProperty('resubmitMode');
  expect(saved.starterType).toBe('conditions');expect(saved.starterConditions[0].identityScope).toBe('all');expect(saved.steps[0]).toMatchObject({name:'Sign Step',actionType:'sign',allowApproverDesignation:false});
  await expect(page.getByLabel(ui.copy_53adcabdff,{exact:true})).toHaveValue('');
  await page.locator('.audit-row').filter({hasText:'New Flow'}).getByRole('button',{name:ui.copy_e040ae3016,exact:true}).click();
  await page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true}).click();
  await expect(page.getByLabel(ui.copy_53adcabdff,{exact:true})).toHaveValue('');
  expect(state.calls.filter(row=>row.name==='saveAuditFlowTemplate').at(-1).body).not.toHaveProperty('resubmitMode');
});
test('步骤窗口短内容自然高度，条件编辑互斥，指定条件显示真实名称',async({page})=>{
  await setup(page);await open(page,'auditTemplates');await page.getByRole('button',{name:ui.copy_b79428bf57,exact:true}).click();
  const dialog=page.getByRole('dialog');const geometry=await dialog.evaluate(node=>{const body=node.querySelector('.dialog-body'),footer=node.querySelector('.dialog-footer');return{scroll:body.scrollHeight,height:body.clientHeight,gap:footer.getBoundingClientRect().top-body.getBoundingClientRect().bottom};});expect(geometry.scroll-geometry.height).toBeLessThan(2);expect(geometry.gap).toBeLessThan(30);
  await dialog.getByRole('button',{name:ui.copy_d3da0e164a,exact:true}).click();await expect(dialog.getByLabel(ui.copy_c5dd070c37)).toHaveCount(0);
  await dialog.getByLabel(personnel.department,{exact:true}).selectOption('specific');await dialog.getByRole('button',{name:personnel.choose,exact:true}).click();
  const picker=page.getByRole('dialog').last();await picker.getByRole('button',{name:'Office',exact:true}).click();await picker.getByRole('button',{name:personnel.confirm,exact:true}).click();
  await dialog.getByRole('button',{name:personnel.confirm,exact:true}).click();await expect(dialog.getByText('Office',{exact:true})).toBeVisible();await expect(dialog.getByLabel(ui.copy_c5dd070c37)).toBeVisible();
  await dialog.getByRole('button',{name:copy.common.cancel,exact:true}).click();await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});
test('保存后目录失败跨页签保持，重试只读取不重复创建',async({page})=>{
  const state=await setup(page);await open(page,'auditTemplates');await createTemplate(page);state.failRead=true;await page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true}).click();await expect(page.getByText('Directory failed',{exact:false})).toBeVisible();
  await page.getByRole('tab',{name:ui.copy_8ef1f4695c,exact:true}).click();await page.getByRole('tab',{name:ui.copy_7312ee863e,exact:true}).click();await expect(page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true})).toBeDisabled();
  state.failRead=false;await page.getByRole('button',{name:text.retry,exact:true}).click();await expect(page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true})).toBeEnabled();expect(state.calls.filter(row=>row.name==='saveAuditFlowTemplate')).toHaveLength(1);
});
test('印章上传使用同一图片字段，岗位整卡授权和确认清空均回读',async({page})=>{
  const state=await setup(page);await open(page,'auditStamps');await page.getByLabel(ui.copy_9395b8661f).fill('Stamp A');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X5W2GQAAAABJRU5ErkJggg==','base64');await page.setInputFiles('input[type=file]',{name:'stamp.png',mimeType:'image/png',buffer:bytes});await page.getByRole('button',{name:ui.copy_2278d2da18,exact:true}).click();await expect(page.locator('.stamp-row')).toHaveCount(1);
  expect(state.calls.find(row=>row.name==='saveStamp').body.imageData).toMatch(/^data:image\/png;base64,/);
  await page.getByRole('button',{name:stampCopy.configure,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Person A/}).click();await page.getByRole('dialog').getByRole('button',{name:personnel.confirm,exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(state.calls.filter(row=>row.name==='saveStampGrants').at(-1).body).toMatchObject({stampId:'stamp-new',assignmentIds:['a-1']});
  await page.getByRole('button',{name:stampCopy.configure,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Person A/}).click();await page.getByRole('dialog').getByRole('button',{name:personnel.confirm,exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(state.calls.filter(row=>row.name==='saveStampGrants').at(-1).body.assignmentIds).toEqual([]);
});
test('验签授权按自然人选择，无岗位人员仍可选；撤销须确认',async({page})=>{
  const state=await setup(page);await open(page,'auditVerification');await page.getByRole('button',{name:ui.copy_0afb532e6f,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Person B',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:personnel.confirm,exact:true}).click();
  await page.getByRole('button',{name:ui.copy_0d4cc3a70e,exact:true}).click();await expect(page.getByText('Person B',{exact:true})).toBeVisible();expect(state.calls.find(row=>row.name==='saveVerificationPermission').body).toMatchObject({granteeHrId:'hr-2',action:'grant'});
  await page.getByRole('button',{name:ui.copy_3f75d366b0,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:copy.common.cancel,exact:true}).click();expect(state.calls.filter(row=>row.name==='saveVerificationPermission')).toHaveLength(1);
});
test('审核四页签保留单行和长值，目录失败不显示空列表',async({page})=>{
  const state=await setup(page);await page.setViewportSize({width:310,height:800});await open(page,'auditTemplates');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await expect(page.getByRole('tab')).toHaveCount(4);
  state.failRead=true;await page.getByRole('tab',{name:ui.copy_8ef1f4695c,exact:true}).click();await expect(page.getByText('Directory failed',{exact:false})).toBeVisible();await expect(page.getByText(ui.copy_0596fc0dc8,{exact:true})).toHaveCount(0);
});

test('步骤提供五种动作并保存签名或盖章，移除驳回续审设置',async({page})=>{
  const state=await setup(page);await open(page,'auditTemplates');await createTemplate(page);
  await expect(page.getByLabel(ui.copy_a8c395216d,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:ui.copy_16fc906860,exact:true}).click();
  const action=page.getByRole('dialog').getByRole('combobox',{name:ui.copy_6ce8bf8393,exact:true});
  await expect(action.locator('option')).toHaveCount(5);await action.selectOption('either');
  await page.getByRole('dialog').getByRole('button',{name:ui.copy_bb0ad94473,exact:true}).click();
  await page.getByRole('button',{name:ui.copy_c34e8a16c0,exact:true}).click();
  expect(state.calls.filter(row=>row.name==='saveAuditFlowTemplate').at(-1).body.steps[0].actionType).toBe('either');
  await page.locator('.audit-row').filter({hasText:'New Flow'}).locator('summary').click();
  await expect(page.getByText(text.either,{exact:true})).toBeVisible();
});
