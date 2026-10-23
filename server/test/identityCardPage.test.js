'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const copy = require('../../shared/locales/zh-CN/identityCard');
async function main() {
  let definition, responder, version=0, role='user';
  const timers = new Map();
  const calls=[],writes=[],removed=[];
  const sandbox = { Page(value){definition=value;}, wx:{env:{USER_DATA_PATH:'/private'},getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),getFileSystemManager:()=>({writeFile(options){writes.push(options);options.success();},unlink(options){removed.push(options.filePath);}})},
    require(name){
      if(name.endsWith('/identityCard')) return copy;
      if(name.endsWith('/common')) return {brandName:'brand'};
      if(name.endsWith('/eventBus')) return {on(){},off(){}};
      if(name.endsWith('/navigationBarMetrics')) return {getNavigationBarMetrics:()=>({totalHeight:50})};
      if(name.endsWith('/orgSession')) return {getSnapshot:()=>({token:'session',role}),beginRequest:()=>version,isRequestCurrent:(page,request)=>request===version,invalidateRequests(){version++;}};
      if(name.endsWith('/dateTime')) return {formatDetailTime:value=>String(value)};
      if(name.endsWith('/api')) return {callFunction(options){calls.push(options);return responder(options);}};
      if(name.endsWith('/fileIO')) return {outputFile: async options => options};
      throw new Error(name);
    }, Date, Promise, setInterval(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/subpackages/org/pages/identityCard/identityCard.js'),'utf8'),sandbox);
  const page=Object.assign({},definition,{data:{...definition.data},setData(values){Object.assign(this.data,values);}});
  page.onLoad({});
  responder=async options=>options.name==='getMyIdentityCard'?{status:'success',valid:true,card:{name:'person'}}:{status:'success',valid:true,card:{name:'person'},image:'data:image/jpeg;base64,/9j/'};
  await page.load();
  assert.equal(timers.size,1); assert(page.data.currentTimeText);
  role='admin'; await page.load(); assert.equal(page.data.heroTone,'admin'); assert.equal(timers.size,1);
  assert.equal(calls[1].data.envVersion,'develop'); assert.equal(writes[0].encoding,'base64'); assert.equal(writes[0].data,'/9j/'); assert(page.data.image.endsWith('.jpg'));
  page.switchCode({currentTarget:{dataset:{mode:'miniProgram'}}}); assert.equal(page.data.image,page.data.miniProgramImage);
  page.onHide(); assert.equal(page.data.image,''); assert.equal(removed.length,4); assert.equal(timers.size,0);
  page.onLoad({scene:'a'.repeat(32)}); calls.length=0;
  responder=async()=>({status:'success',valid:true,card:{name:'public'}});
  await page.load(); assert.equal(calls.length,1); assert.equal(calls[0].name,'verifyIdentityCard'); assert.equal(page.data.card.name,'public');
  assert.equal(timers.size,0);
  let release;
  responder=()=>new Promise(resolve=>{release=resolve;});
  const pending=page.load(); page.onHide(); release({status:'success',valid:true,card:{name:'late'}}); await pending; assert.equal(page.data.card,null);
  page.onUnload();
  console.log('PASS 小程序身份卡匿名核验、开发版参数、JPEG本地成图、离页清图、迟到响应及无浏览器宿主运行');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
