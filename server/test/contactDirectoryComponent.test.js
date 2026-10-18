'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../../miniprogram/components/contact-directory/contact-directory.js');
const baseRequire = createRequire(filename);
function fixture(api) {
  let definition, snapshot = 1;
  const listeners = new Map(), events = [], scrolls = [];
  const mocks = {
    '../../utils/api': { callFunction: api, getErrorText: (error, fallback) => error.message || fallback, showShortToast() {} },
    '../../utils/orgSession': { beginRequest: () => snapshot, isRequestCurrent: (page, request) => request === snapshot, invalidateRequests: () => snapshot++ },
    '../../utils/eventBus': { on: (key, callback) => listeners.set(key, callback), off: (key, callback) => { if (listeners.get(key) === callback) listeners.delete(key); } }
  };
  vm.runInNewContext(fs.readFileSync(filename,'utf8'), { Component: value => {definition=value;}, require: name => mocks[name] || baseRequire(name),
    wx: { pageScrollTo: value=>scrolls.push(value), setClipboardData() {}, makePhoneCall() {} }, Map, Set, Promise, console });
  const component = { data: {...JSON.parse(JSON.stringify(definition.data)),admin:true}, ...definition.methods,
    setData(patch, callback) {
      for (const [key,value] of Object.entries(patch)) {
        const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.'); let target=this.data;
        parts.slice(0,-1).forEach(part=>{target=target[part];}); target[parts.at(-1)]=value;
      }
      if(callback) callback();
    }, triggerEvent(name, detail) { events.push({name,detail}); },
    createSelectorQuery() { return { select(){return this;}, boundingClientRect(){return this;},selectViewport(){return this;},scrollOffset(){return this;},exec(callback){callback([{top:100},{scrollTop:200}]);} }; }
  };
  return { component, events, listeners, scrolls };
}
async function main() {
  const calls=[];
  const config={status:'success',rules:[],people:[{personId:'p',name:'人员',assignments:[]}],fields:[{id:'phone',label:'电话',type:'phone'}],departments:[{id:'d',name:'部门'}],identities:[],workGroups:[]};
  const f=fixture(async input=>{calls.push(input);return input.name==='getContactDirectoryConfiguration'?config:{status:'success'};});
  const c=f.component;c.activate();await new Promise(resolve=>setImmediate(resolve));
  c.edit({currentTarget:{dataset:{}}}); c.nameInput({detail:{value:'测试规则'}});
  c.openPeople({currentTarget:{dataset:{section:'audience',index:0}}}); c.confirmPeople({detail:{keys:['p']}});
  c.toggleChoice({currentTarget:{dataset:{id:'phone'}}});
  c.save();await new Promise(resolve=>setImmediate(resolve));
  const submitted=calls.find(call=>call.name==='saveContactDirectoryRule').data;
  assert.deepEqual(JSON.parse(JSON.stringify(submitted)),{id:'',version:0,name:'测试规则',enabled:true,audience:[{type:'people',personIds:['p']}],targets:[{type:'self'}],fieldIds:['phone']});
  assert(f.events.some(event=>event.name==='busychange'&&event.detail.busy));assert.equal(c.data.busy,false);assert.equal(c.data.draft,null);
  c.setData({rules:[{id:'r',version:1,name:'规则',enabled:true}],selected:['r']});c.deleteSelected();
  assert.equal(c.data.deleteTargets.length,1);c.cancelDelete();assert(!calls.some(call=>call.name==='batchContactDirectoryRules'));
  c.deleteSelected();c.confirmDelete();await new Promise(resolve=>setImmediate(resolve));
  assert(calls.some(call=>call.name==='batchContactDirectoryRules'));assert.equal(c.data.deleteTargets,null);
  c.clearPrivate();assert.equal(f.listeners.size,0);assert.equal(c.data.people.length,0);
  let resolveRead;const late=fixture(()=>new Promise(resolve=>{resolveRead=resolve;}));late.component.activate();late.component.clearPrivate();resolveRead(config);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(late.component.data.people.length,0);
  console.log('PASS 小程序真实保存参数、人员确认、删除取消/确认、处理提示、隐藏清理和迟到响应丢弃');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
