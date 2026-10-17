'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = {};
vm.runInNewContext(process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'], { exports: parser, module: { exports: parser } });
const root = path.resolve(__dirname, '..');
const forbidden = new Set(['chooseMessageFile','chooseImage','chooseMedia','shareFileMessage','saveFileToDisk','saveImageToPhotosAlbum','openDocument','previewImage','showOpenFilePicker','showSaveFilePicker','createObjectURL']);
const errors = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    if (['package-resources','locales','tests','node_modules'].includes(entry.name)) continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(file);continue;}
    if(!/\.(js|vue)$/.test(file))continue;
    const relative=path.relative(root,file).replace(/\\/g,'/');
    if(relative.endsWith('/fileIO.js'))continue;
    let source=fs.readFileSync(file,'utf8');
    if(file.endsWith('.vue')) {
      if(/type\s*=\s*["']file["']/.test(source)&&!relative.endsWith('/FileInput.vue'))errors.push(relative+': 独立文件输入');
      source=Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),match=>match[1]).join('\n');
    }
    function visit(node) {
      if(!node||typeof node!=='object')return;
      if(node.type==='CallExpression'&&node.callee.type==='MemberExpression') {
        const member=node.callee, name=member.computed?member.property.value:member.property.name;
        if(forbidden.has(name))errors.push(relative+': '+name);
      }
      for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
    }
    visit(parser.parse(source,{ecmaVersion:'latest',sourceType:'module'}));
    if(/(?:\/signing\/|\/signaturePad\/|AuditSigningWorkspace|\/signingAssets|\/signingDrafts|\/auditSigningAssets)/.test(relative)&&/\b(?:inputFile|outputFile)\b|[/'"]fileIO/.test(source))errors.push(relative+': 签署工作区不得依赖文件交互接口');
  }
}
walk(path.join(root,'miniprogram'));walk(path.join(root,'web/src'));
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('两端文件交互统一入口及签署工作区隔离检查通过');
