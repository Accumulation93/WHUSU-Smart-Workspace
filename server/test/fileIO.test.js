'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const copy = require('../../shared/locales/zh-CN/fileIO');
const source = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/fileIO.js'), 'utf8');
function setup(platform = 'windows') {
  const calls = []; let current = true, selection = 0, failShare = false, cancel = false;
  const wx = { showModal: options => calls.push(['modal', options.content]), getDeviceInfo: () => ({ platform }),
    showActionSheet: options => { calls.push(['menu', options.itemList]); if (cancel) options.fail({errMsg:'cancel'}); else options.success({tapIndex:selection}); },
    chooseMessageFile: options => { calls.push(['chat']); options.success({tempFiles:[{path:'/tmp/original.pdf',name:'原件.pdf',size:12}]}); },
    chooseImage: options => { calls.push(['image',options.sizeType,options.sourceType]); options.success({tempFiles:[{path:'/tmp/image.png',size:8}]}); },
    openDocument: options => {calls.push(['preview',options.filePath]);options.success({});},
    shareFileMessage: options => {calls.push(['share',options.filePath]);if(failShare)options.fail({errMsg:'cancel'});else options.success({});},
    saveFileToDisk: options => {calls.push(['save',options.filePath]);options.success({});} };
  wx.saveImageToPhotosAlbum = options => {calls.push(['album',options.filePath]);options.success({});};
  const module = {exports:{}};
  vm.runInNewContext(source,{module,wx,require:name=>name.includes('fileIO')?copy:{getSnapshot:()=>({}),isCurrent:()=>current}});
  return {api:module.exports,calls,setSelection:value=>{selection=value;},cancel:()=>{cancel=true;},stale:()=>{current=false;},failShare:()=>{failShare=true;}};
}
async function main() {
  const s=setup();const selected=await s.api.inputFile({});assert.equal(selected.value.tempFiles[0].name,'原件.pdf');
  s.setSelection(1);await s.api.inputFile({type:'image'});assert.deepEqual(Array.from(s.calls.find(item=>item[0]==='image')[1]),['original']);
  s.calls.length=0;s.setSelection(1);s.failShare();const cancelled=await s.api.outputFile({filePath:'/tmp/original.pdf'});assert.equal(cancelled.status,'cancelled');assert.deepEqual(s.calls.map(item=>item[0]),['menu','share']);
  const phone=setup('ios');phone.setSelection(2);assert.equal((await phone.api.outputFile({filePath:'/tmp/file.pdf'})).status,'unsupported');assert(!phone.calls.some(item=>item[0]==='save'));
  assert.equal((await phone.api.outputFile({filePath:'/tmp/file.png'})).status,'success');assert.equal(phone.calls.at(-1)[0],'album');
  const stale=setup();stale.stale();assert.equal((await stale.api.inputFile({})).status,'cancelled');assert(!stale.calls.some(item=>item[0]==='chat'));
  const menu=setup();menu.cancel();assert.equal((await menu.api.outputFile({filePath:'/tmp/file.pdf'})).status,'cancelled');assert.equal(menu.calls.length,1);
  const save=setup();save.setSelection(2);assert.equal((await save.api.outputFile({filePath:'/tmp/original.pdf'})).status,'success');assert.equal(save.calls.at(-1)[1],'/tmp/original.pdf');
  console.log('文件接口：原图、原文件、明确模式、取消不转发、不支持设备、角色失效检查通过');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
