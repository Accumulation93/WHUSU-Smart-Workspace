'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const copy = require('../../shared/locales/zh-CN/fileIO');
const source = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/fileIO.js'), 'utf8');
function setup(platform = 'windows') {
  const calls = []; let current = true, selection = 0, failShare = false, cancel = false, confirm = true, diskError = null;
  let file = {path:'/tmp/original.pdf',name:'原件.pdf',size:12};
  const wx = { showModal: options => {calls.push(['modal', options.content]);if(options.success)options.success({confirm});}, getDeviceInfo: () => {throw new Error('不得按平台拦截');},
    showActionSheet: options => { calls.push(['menu', options.itemList]); if (cancel) options.fail({errMsg:'cancel'}); else options.success({tapIndex:selection}); },
    chooseMessageFile: options => { calls.push(['chat',options.extension]); options.success({tempFiles:[file]}); },
    chooseImage: options => { calls.push(['image',options.sizeType,options.sourceType]); options.success({tempFiles:[{path:'/tmp/image.png',size:8}]}); },
    openDocument: options => {calls.push(['preview',options.filePath,options.fileType,options.showMenu]);options.success({});},
    shareFileMessage: options => {calls.push(['share',options.filePath]);if(failShare)options.fail({errMsg:'cancel'});else options.success({});},
    saveFileToDisk: options => {calls.push(['save',options.filePath]);if(diskError)options.fail(diskError);else options.success({});} };
  wx.saveImageToPhotosAlbum = options => {calls.push(['album',options.filePath]);options.success({});};
  const module = {exports:{}};
  vm.runInNewContext(source,{module,wx,require:name=>name.includes('fileIO')?copy:{getSnapshot:()=>({}),isCurrent:()=>current}});
  return {api:module.exports,wx,calls,setFile:value=>{file=value;},setConfirm:value=>{confirm=value;},diskError:value=>{diskError=value;},setSelection:value=>{selection=value;},cancel:()=>{cancel=true;},stale:()=>{current=false;},failShare:()=>{failShare=true;}};
}
async function main() {
  const s=setup();const selected=await s.api.inputFile({});assert.equal(selected.value.tempFiles[0].name,'原件.pdf');
  s.setSelection(1);await s.api.inputFile({type:'image'});assert.deepEqual(Array.from(s.calls.find(item=>item[0]==='image')[1]),['original']);
  s.calls.length=0;s.setSelection(1);s.failShare();const cancelled=await s.api.outputFile({filePath:'/tmp/original.pdf'});assert.equal(cancelled.status,'cancelled');assert.deepEqual(s.calls.map(item=>item[0]),['menu','share']);
  const phone=setup('ios');phone.setSelection(2);assert.equal((await phone.api.outputFile({filePath:'/tmp/file.pdf'})).status,'success');assert(phone.calls.some(item=>item[0]==='save'));
  phone.diskError({errMsg:'saveFileToDisk:fail not supported'});
  assert.equal((await phone.api.outputFile({filePath:'/tmp/file.png'})).status,'success');assert.equal(phone.calls.at(-1)[0],'album');
  const stale=setup();stale.stale();assert.equal((await stale.api.inputFile({})).status,'cancelled');assert(!stale.calls.some(item=>item[0]==='chat'));
  const menu=setup();menu.cancel();assert.equal((await menu.api.outputFile({filePath:'/tmp/file.pdf'})).status,'cancelled');assert.equal(menu.calls.length,1);
  const save=setup();save.setSelection(2);assert.equal((await save.api.outputFile({filePath:'/tmp/original.pdf'})).status,'success');assert.equal(save.calls.at(-1)[1],'/tmp/original.pdf');
  for (const ext of ['pdf','doc','docx','xls','xlsx','ppt','pptx']) {
    const doc=setup('android');doc.diskError({errMsg:'saveFileToDisk:fail not supported'});
    let saved=false;const result=await doc.api.outputFile({mode:'save',filePath:'/tmp/opaque',fileName:'原件.'+ext,success:()=>{saved=true;}});
    assert.equal(result.status,'preview_opened');assert.equal(saved,false);assert.deepEqual(doc.calls.at(-1),['preview','/tmp/opaque',ext,true]);
    const load=setup();load.setFile({path:'/tmp/opaque',name:'原件.'+ext,size:12});
    const selected=await load.api.inputFile({mode:'chat',type:'file',extension:[ext]});assert.equal(selected.status,'success');assert.equal(selected.value.tempFiles[0].name,'原件.'+ext);
  }
  const declined=setup();delete declined.wx.saveFileToDisk;declined.setConfirm(false);
  assert.equal((await declined.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'})).status,'cancelled');assert(!declined.calls.some(c=>c[0]==='preview'));
  for (const errMsg of ['saveFileToDisk:fail cancel','saveFileToDisk:fail permission denied','saveFileToDisk:fail disk full']) {
    const bad=setup();bad.diskError({errMsg});const result=await bad.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'});
    assert.equal(result.status,/cancel/.test(errMsg)?'cancelled':'failed');assert(!bad.calls.some(c=>c[0]==='preview'||c[0]==='share'));
  }
  const capability=setup();capability.wx.canIUse=name=>name!=='saveFileToDisk';
  assert.equal((await capability.api.outputFile({mode:'save',filePath:'/tmp/file.docx'})).status,'preview_opened');assert(!capability.calls.some(c=>c[0]==='save'));
  const changed=setup();delete changed.wx.saveFileToDisk;changed.wx.showModal=options=>{changed.stale();options.success({confirm:true});};
  assert.equal((await changed.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'})).status,'cancelled');assert(!changed.calls.some(c=>c[0]==='preview'));
  const input=setup();assert.equal((await input.api.inputFile({mode:'chat',extension:['docx']})).status,'failed');
  const noApi=setup();delete noApi.wx.saveFileToDisk;delete noApi.wx.openDocument;
  assert.equal((await noApi.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'})).status,'unsupported');
  console.log('文件接口：7 类文档加载与菜单、能力检测、原件、取消、权限失败、角色切换与未误报保存检查通过');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
