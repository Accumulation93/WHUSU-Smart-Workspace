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
  const wx = { showModal: options => {calls.push(['modal', options.content]);if(options.success)options.success({confirm});}, getDeviceInfo: () => ({platform}),
    showActionSheet: options => { calls.push(['menu', options.itemList]); if (cancel) options.fail({errMsg:'cancel'}); else options.success({tapIndex:selection}); },
    chooseMessageFile: options => { calls.push(['chat',options.extension]); options.success({tempFiles:[file]}); },
    chooseImage: options => { calls.push(['image',options.sizeType,options.sourceType]); options.success({tempFiles:[{path:'/tmp/image.png',size:8}]}); },
    openDocument: options => {calls.push(['preview',options.filePath,options.fileType,options.showMenu]);options.success({});},
    previewImage: options => {calls.push(['previewImage']);options.success({});},
    shareFileMessage: options => {calls.push(['share',options.filePath]);if(failShare)options.fail({errMsg:'cancel'});else options.success({});},
    saveFileToDisk: options => {calls.push(['save',options.filePath]);if(diskError)options.fail(diskError);else options.success({});} };
  wx.saveImageToPhotosAlbum = options => {calls.push(['album',options.filePath]);options.success({});};
  const stored = new Map();const directories = new Set();
  wx.env = {USER_DATA_PATH:'/user'};
  wx.getFileSystemManager = () => ({
    readdir: options => options.success({files:Array.from(directories).map(dir=>dir.slice(6))}),
    mkdir: options => {directories.add(options.dirPath);options.success({});},
    rmdir: options => {directories.delete(options.dirPath);for(const key of stored.keys())if(key.startsWith(options.dirPath+'/'))stored.delete(key);options.success({});},
    copyFile: options => {stored.set(options.destPath,stored.get(options.srcPath)||'original bytes');calls.push(['copy',options.srcPath,options.destPath]);options.success({});}
  });
  const module = {exports:{}};
  vm.runInNewContext(source,{module,wx,require:name=>name.includes('fileIO')?copy:{getSnapshot:()=>({}),isCurrent:()=>current}});
  return {api:module.exports,wx,calls,stored,directories,setFile:value=>{file=value;},setConfirm:value=>{confirm=value;},diskError:value=>{diskError=value;},setSelection:value=>{selection=value;},cancel:()=>{cancel=true;},stale:()=>{current=false;},failShare:()=>{failShare=true;}};
}
async function main() {
  const s=setup();const selected=await s.api.inputFile({});assert.equal(selected.value.tempFiles[0].name,'原件.pdf');
  s.setSelection(1);await s.api.inputFile({type:'image'});assert.deepEqual(Array.from(s.calls.find(item=>item[0]==='image')[1]),['original']);
  s.calls.length=0;s.setSelection(1);s.failShare();const cancelled=await s.api.outputFile({filePath:'/tmp/original.pdf'});assert.equal(cancelled.status,'cancelled');assert.deepEqual(s.calls.map(item=>item[0]),['menu','share']);
  const phone=setup('ios');await phone.api.outputFile({filePath:'/tmp/file.pdf'});
  assert.deepEqual(Array.from(phone.calls[0][1]),[copy.preview,copy.share]);assert(!phone.calls.some(item=>item[0]==='save'));
  phone.setSelection(2);
  assert.equal((await phone.api.outputFile({filePath:'/tmp/file.png'})).status,'success');assert.equal(phone.calls.at(-1)[0],'album');
  const stale=setup();stale.stale();assert.equal((await stale.api.inputFile({})).status,'cancelled');assert(!stale.calls.some(item=>item[0]==='chat'));
  const menu=setup();menu.cancel();assert.equal((await menu.api.outputFile({filePath:'/tmp/file.pdf'})).status,'cancelled');assert.equal(menu.calls.length,1);
  const save=setup();save.setSelection(2);assert.equal((await save.api.outputFile({filePath:'/tmp/original.pdf'})).status,'success');assert.equal(save.calls.at(-1)[1],'/tmp/original.pdf');
  for (const ext of ['pdf','doc','docx','xls','xlsx','ppt','pptx']) {
    const doc=setup('android');const result=await doc.api.outputFile({filePath:'/tmp/opaque',fileName:'原件.'+ext});
    assert.equal(result.status,'success');assert.deepEqual(Array.from(doc.calls[0][1]),[copy.preview,copy.share]);assert(doc.calls.at(-1)[1].endsWith('/原件.'+ext));assert.equal(doc.calls.at(-1)[2],ext);assert.equal(doc.calls.at(-1)[3],true);
    const load=setup();load.setFile({path:'/tmp/opaque',name:'原件.'+ext,size:12});
    const selected=await load.api.inputFile({mode:'chat',type:'file',extension:[ext]});assert.equal(selected.status,'success');assert.equal(selected.value.tempFiles[0].name,'原件.'+ext);
  }
  const declined=setup('ios');
  assert.equal((await declined.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'})).status,'unsupported');assert(!declined.calls.some(c=>c[0]==='preview'));
  for (const errMsg of ['saveFileToDisk:fail cancel','saveFileToDisk:fail permission denied','saveFileToDisk:fail disk full']) {
    const bad=setup();bad.diskError({errMsg});const result=await bad.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'});
    assert.equal(result.status,/cancel/.test(errMsg)?'cancelled':'failed');assert(!bad.calls.some(c=>c[0]==='preview'||c[0]==='share'));
  }
  const capability=setup();capability.wx.canIUse=name=>name!=='saveFileToDisk';
  await capability.api.outputFile({filePath:'/tmp/file.docx'});assert.deepEqual(Array.from(capability.calls[0][1]),[copy.preview,copy.share]);assert(!capability.calls.some(c=>c[0]==='save'));
  const changed=setup();changed.wx.showActionSheet=options=>{changed.stale();options.success({tapIndex:0});};
  assert.equal((await changed.api.outputFile({filePath:'/tmp/file.pdf'})).status,'cancelled');assert(!changed.calls.some(c=>c[0]==='preview'));
  const input=setup();assert.equal((await input.api.inputFile({mode:'chat',extension:['docx']})).status,'failed');
  const noApi=setup();delete noApi.wx.saveFileToDisk;delete noApi.wx.openDocument;delete noApi.wx.shareFileMessage;
  assert.equal((await noApi.api.outputFile({filePath:'/tmp/file.pdf'})).status,'unsupported');assert(!noApi.calls.some(c=>c[0]==='menu'));
  const inputOnly=setup();delete inputOnly.wx.chooseImage;await inputOnly.api.inputFile({});assert.deepEqual(Array.from(inputOnly.calls[0][1]),[copy.chat]);
  const imageOnly=setup();delete imageOnly.wx.chooseMessageFile;await imageOnly.api.inputFile({type:'image'});assert.deepEqual(Array.from(imageOnly.calls[0][1]),[copy.album,copy.camera]);
  const noCamera=setup();noCamera.wx.canIUse=name=>name!=='chooseImage.object.sourceType.camera';await noCamera.api.inputFile({type:'image'});assert.deepEqual(Array.from(noCamera.calls[0][1]),[copy.chat,copy.album]);
  const noInput=setup();noInput.wx.canIUse=name=>!['chooseMessageFile','chooseImage'].includes(name);assert.equal((await noInput.api.inputFile({})).status,'unsupported');assert(!noInput.calls.some(c=>c[0]==='menu'));
  const csv=setup('android');await csv.api.outputFile({filePath:'/tmp/file.csv'});assert.deepEqual(Array.from(csv.calls[0][1]),[copy.share]);
  const runtime=setup();runtime.diskError({errMsg:'saveFileToDisk:fail not supported'});await runtime.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'});runtime.calls.length=0;
  await runtime.api.outputFile({filePath:'/tmp/file.pdf'});assert.deepEqual(Array.from(runtime.calls[0][1]),[copy.preview,copy.share]);
  const permission=setup();permission.diskError({errMsg:'saveFileToDisk:fail permission denied'});await permission.api.outputFile({mode:'save',filePath:'/tmp/file.pdf'});permission.calls.length=0;
  await permission.api.outputFile({filePath:'/tmp/file.pdf'});assert(permission.calls[0][1].includes(copy.save));
  const camera=setup();camera.wx.chooseImage=options=>options.fail({errMsg:'not supported'});await camera.api.inputFile({mode:'camera',type:'image'});camera.calls.length=0;await camera.api.inputFile({type:'image'});assert.deepEqual(Array.from(camera.calls[0][1]),[copy.chat,copy.album]);
  const named=setup();named.stored.set('/tmp/tmp_a.pdf','first bytes');named.stored.set('/tmp/tmp_b.pdf','second bytes');
  await named.api.outputFile({mode:'preview',filePath:'/tmp/tmp_a.pdf',fileName:'活动申请.pdf'});const first=named.calls.at(-1)[1];
  await named.api.outputFile({mode:'preview',filePath:'/tmp/tmp_b.pdf',fileName:'活动申请.pdf'});const second=named.calls.at(-1)[1];
  assert.notEqual(first,second);assert(first.endsWith('/活动申请.pdf'));assert(second.endsWith('/活动申请.pdf'));assert.equal(named.stored.get(first),'first bytes');assert.equal(named.stored.get(second),'second bytes');
  for(let i=0;i<5;i++)await named.api.outputFile({mode:'preview',filePath:'/tmp/tmp_a.pdf',fileName:'../活动/申请.pdf'});
  assert.equal(named.directories.size,3);assert(!named.calls.at(-1)[1].includes('/../'));assert.equal(named.stored.get('/tmp/tmp_a.pdf'),'first bytes');
  const failedCopy=setup();failedCopy.wx.getFileSystemManager=()=>({readdir:options=>options.success({files:[]}),mkdir:options=>options.success({}),rmdir:options=>options.success({}),copyFile:options=>options.fail({errMsg:'disk full'})});
  assert.equal((await failedCopy.api.outputFile({mode:'preview',filePath:'/tmp/tmp_a.pdf',fileName:'原件.pdf'})).status,'failed');assert(!failedCopy.calls.some(c=>c[0]==='preview'));
  console.log('文件接口：输入输出能力过滤、7 类文档、空菜单、运行时不支持记忆、权限拒绝重试和签署隔离检查通过');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
