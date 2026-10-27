'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
// 按字符识别标签、引号和模板表达式；注释与 WXS 正文不是组件实例。
function roles(source) {
  const result=[];let i=0;
  while(i<source.length) {
    if(source.startsWith('<!--',i)){const end=source.indexOf('-->',i+4);i=end<0?source.length:end+3;continue;}
    if(source[i]!=='<'){i++;continue;}
    const start=i;let quote='',mustache=false;i++;
    for(;i<source.length;i++) {
      if(source.startsWith('{{',i)){mustache=true;i++;continue;}
      if(mustache){if(source.startsWith('}}',i)){mustache=false;i++;}continue;}
      if(quote){if(source[i]===quote)quote='';continue;}
      if(source[i]==='"'||source[i]==="'"){quote=source[i];continue;}
      if(source[i]==='>')break;
    }
    const header=source.slice(start,i+1);i++;
    if(/^<wxs\b/.test(header)){const end=source.indexOf('</wxs>',i);i=end<0?source.length:end+6;continue;}
    if(!/^<ui-icon\b/.test(header))continue;
    const role=/\b(?:sizeRole|size-role)\s*=\s*(["'])(.*?)\1/.exec(header);
    if(role)result.push(role[2]);
  }
  return result;
}
function audit(files) {
  const css=fs.readFileSync(path.join(root,'miniprogram/components/ui-icon/ui-icon.wxss'),'utf8');
  const supported=new Set(Array.from(css.matchAll(/\.ui-icon-size-([\w-]+)\s*\{/g),m=>m[1]));
  return files.filter(f=>f.endsWith('.wxml')).flatMap(file=>roles(fs.readFileSync(file,'utf8')).filter(role=>!supported.has(role)).map(role=>path.relative(root,file)+': 未定义的 ui-icon 尺寸 '+role));
}
if(require.main===module) {
  assert.deepEqual(roles('<!-- <ui-icon sizeRole="bad" /> --><wxs>var s="<ui-icon sizeRole=\'bad\'/>";</wxs><ui-icon wx:if="{{a > 0}}" sizeRole="inline" />'),['inline']);
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  const issues=audit(walk(path.join(root,'miniprogram')));
  if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log('图标尺寸及扫描器反例检查通过');
}
module.exports={audit,roles};
