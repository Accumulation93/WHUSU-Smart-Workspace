'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const express=require('express');
const ExcelJS=require('exceljs');
const privacy=require('../src/modules/scoring/utils/scoringPrivacy');
const secret='PRIVATE-STUDENT-001';
const now=new Date('2026-10-13T01:02:03.004Z');
const original={name:'成员 A',student_id:secret,nested:[{scorerStudentId:secret,targetStudentId:secret,studentIdHash:'PRIVATE-HASH',score:8}],submittedAt:now};
const clean=privacy.removeStudentIds(original);
assert.deepEqual(clean,{name:'成员 A',nested:[{score:8}],submittedAt:now});
assert.equal(original.student_id,secret,'不得修改计算或历史源对象');
assert.equal(privacy.publicScoringHeaders([{key:'name'},{key:'studentId'},{key:'scorerStudentId'},{key:'score'}]).length,2);

// 前端发布必须同时取消评分学号绑定，避免旧缓存或空值留下身份信息表面。
const adminWxml=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/subpackages/scoring/pages/admin/admin.wxml'),'utf8');
const tasksWxml=fs.readFileSync(path.resolve(__dirname,'../../miniprogram/subpackages/scoring/pages/scorerTasks/scorerTasks.wxml'),'utf8');
assert.equal(/\bitem\.(?:scorerStudentId|targetStudentId)|\bm\.studentId/.test(adminWxml),false,'评分与评优展示不得绑定学号');
assert.equal(/studentId|StudentId/.test(tasksWxml),false,'未完成任务展示不得绑定学号');
assert(adminWxml.includes('hrForm.studentId'),'本人及人事管理的合法输入仍须保留');

let organization='org-a';
const activity={id:'activity-a',name:'活动 A',org_id:'org-a'};
const cache={historicalIntegrityVerified:true,activity,overviewRows:[{id:'assignment-a',name:'成员 A',studentId:secret,nested:{targetStudentId:secret},finalScore:8}],stats:{totalMembers:1},filterOptions:{}};
const participants=[{id:'assignment-a',person_id:'person-a',name:'成员 A',student_id:secret,department_id:'',identity_id:'',work_group_id:''}];
const emptyModel={async getAll(){return [];}};
const computation={finalScoreMap:new Map([['assignment-a',{finalScore:8}]]),submittedByTarget:new Map(),expectedByCount:new Map(),scorerExpectedCount:new Map(),targetSnapshots:new Map(),diagnostics:{acceptedRecords:0,totalRecords:0,skippedRecords:0,reasons:{},records:[]}};
const mocks={
 '../../../core/services/adminRequestContext':{async resolveRequestAdmin(req){return req.admin;}},
 '../../../utils/orgContext':{async getCurrentOrgId(){return organization;}},
 '../../../config/db':{},
 '../models/scoreActivity':{async getById(id){return organization==='org-a' && id===activity.id?activity:null;}},
 '../../../core/models/department':emptyModel,'../../../core/models/identity':emptyModel,'../../../core/models/workGroup':emptyModel,
 '../models/scoreTemplate':emptyModel,'../models/scoreQuestion':{},'../models/rateRule':{},'../models/rateRuleClause':{},'../models/clauseTemplateConfig':{},
 '../models/scoreRecord':{async getByActivity(){return [];}},'../models/scoreAnswer':{},
 '../services/participants':{normalizeGranularity(){return 'assignment';},async listParticipants(){return participants;},buildAssignmentLabel(){return '';}},
 '../utils/sharedCache':{async versionedKey(key){return key;},async get(key){return key.startsWith('resultLookups:')?null:cache;},async set(){},async invalidateKey(){}},
 '../utils/scoreCalc':{validateCalculationSnapshot(){return {valid:true};},getHistoricalSnapshotFailure(){return null;},async computeActivityScoreMap(){return computation;},async computeValidScoreMap(){return computation;},listScoreCalculationGroups(){return [];}}
};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){return Object.hasOwn(mocks,request)?mocks[request]:originalLoad.call(this,request,parent,isMain);};
const router=require('../src/modules/scoring/routes/results');
const computationModuleId=require.resolve('../src/modules/scoring/utils/scoreCalc');
require.cache[computationModuleId]={id:computationModuleId,filename:computationModuleId,loaded:true,exports:mocks['../utils/scoreCalc']};
Module._load=originalLoad;
const app=express();app.use(express.json());
// 测试明确提供已认证管理员；不模拟微信或以学号识别当前操作者。
app.use((req,res,next)=>{organization=req.get('x-test-org')||'org-a';req.admin=req.get('x-test-role')==='none'?null:{id:'admin-a',admin_level:req.get('x-test-role')||'admin',org_id:organization};next();});
app.use('/api',router);
let server;
async function request(endpoint,body,role='admin',org='org-a'){
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+endpoint,{method:'POST',headers:{'content-type':'application/json','x-test-role':role,'x-test-org':org},body:JSON.stringify(body)});return response.json();
}
(async()=>{
 server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
 try{
  for(const role of ['admin','super_admin']){
   const response=await request('getScoreResults',{activityId:activity.id,dataType:'overview'},role);
   assert.equal(response.status,'success');assert.equal(response.overviewRows[0].finalScore,8);assert(!JSON.stringify(response).includes(secret));assert(!Object.hasOwn(response.overviewRows[0],'studentId'));
   for(const reportType of ['overview','detail','completion']){
    const exported=await request('exportScoreResults',{activityId:activity.id,reportType,format:'excel'},role);
    assert.equal(exported.status,'success',exported.message);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(exported.fileContent,'base64'));
    const rows=[];workbook.worksheets[0].eachRow(row=>rows.push(row.values));const text=JSON.stringify(rows);assert(!text.includes(secret));assert(!text.includes('学号'));if(reportType==='overview')assert(text.includes('成员 A'));
   }
  }
  assert.equal(cache.overviewRows[0].studentId,secret,'不得通过修改缓存假装完成响应保护');
  assert.equal((await request('getScoreResults',{activityId:activity.id},'none')).status,'forbidden');
  assert.equal((await request('getScoreResults',{activityId:activity.id},'admin','org-b')).status,'activity_not_found');
  for(const name of ['results','scoring','publications']){
   const source=fs.readFileSync(path.resolve(__dirname,'../src/modules/scoring/routes/'+name+'.js'),'utf8');assert(!source.includes('res.json('),'评分路由必须经过同一响应保护：'+name);assert(source.includes('publicScoringHeaders'));
  }
  console.log('两类管理员的真实评分 HTTP 响应和三种 XLSX 导出不含学号，源数据与缓存不被修改，通过');
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
