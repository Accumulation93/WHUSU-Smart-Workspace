'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  let scope = 1, finish;
  const calls = [], opened = [];
  const session = { getSnapshot: () => scope, isCurrent: value => value === scope };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/personLinks.js'), 'utf8'), {
    module: exports, Promise, Map,
    require: name => name === './orgSession' ? session : name === './trustedNavigation' ? { navigateToTrustedRoute: url => opened.push(url) } : {
      callFunction: async input => { calls.push(input); return new Promise(resolve => { finish = () => resolve({status:'success',links:input.data.references.map(ref=>({ref:ref.kind+':'+ref.id,target:{kind:'contact',key:ref.id}}))}); }); }
    }
  });
  const links = exports.exports;
  const pending = Array.from({length:201},(_,index)=>links.resolve({kind:'hr',id:String(index % 150)}));
  await tick(); assert.equal(calls.length,1); assert.equal(calls[0].data.references.length,100);
  finish(); await tick(); assert.equal(calls.length,2); finish(); await tick(); assert.equal(calls.length,3); finish();
  assert((await Promise.all(pending)).every(Boolean));
  const stale = links.resolve({kind:'hr',id:'stale'}); await tick(); scope++; finish(); assert.equal(await stale,null);
  links.open({kind:'contact',key:'trusted'}); links.open({kind:'hr',hrId:'member'});
  assert(opened[0].endsWith('subApp=hr&tab=directory&contactKey=trusted'));
  assert(opened[1].endsWith('subApp=hr&tab=hrInfo&hrId=member'));
  let definition, resolveLookup;
  const lookups = [];
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/components/person-link/person-link.js'),'utf8'), {
    Component: value => { definition=value; },
    require: name => name.endsWith('orgSession') ? session : { resolve: ref=>{lookups.push(ref);return new Promise(resolve=>{resolveLookup=resolve;});}, open: target=>opened.push(target) }
  });
  const component = { properties:{name:'同名',assignmentId:'assignment'},data:{},...definition.methods,setData(patch){Object.assign(this.data,patch);} };
  definition.lifetimes.attached.call(component); component.clear(); resolveLookup({kind:'contact',key:'late'}); await tick(); assert.equal(component.data.available,false);
  definition.pageLifetimes.show.call(component); resolveLookup({kind:'contact',key:'visible'}); await tick(); assert.equal(component.data.available,true);
  const before=opened.length; const click=component.open(); resolveLookup(null); await click; assert.equal(opened.length,before); assert.equal(component.data.available,false);
  assert(lookups.every(ref=>ref.kind==='assignment' && ref.id==='assignment'));
  console.log('PASS 人员跳转批次上限、串行请求、角色变化、离页丢弃、点击撤权及两类目标入口');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
