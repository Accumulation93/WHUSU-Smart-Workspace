'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');

// 按字符读取标签；原生 text 不能作为自定义人员组件的容器。
function invalidParents(source) {
  const stack = [], issues = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    let end = start + 1, quote = '', expression = false;
    for (; end < source.length; end++) {
      if (source.startsWith('{{', end)) { expression = true; end++; continue; }
      if (expression) { if (source.startsWith('}}', end)) { expression = false; end++; } continue; }
      if (quote) { if (source[end] === quote) quote = ''; continue; }
      if (source[end] === '"' || source[end] === "'") { quote = source[end]; continue; }
      if (source[end] === '>') break;
    }
    cursor = end + 1;
    const raw = source.slice(start, cursor), tag = /^<\s*(\/?)\s*([\w-]+)/.exec(raw);
    if (!tag) continue;
    if (tag[1]) {
      const index = stack.lastIndexOf(tag[2]);
      if (index >= 0) stack.length = index;
      continue;
    }
    if (tag[2] === 'wxs') {
      if (!raw.endsWith('/>')) { const close = source.indexOf('</wxs>', cursor); cursor = close < 0 ? source.length : close + 6; }
      continue;
    }
    if (tag[2] === 'person-link' && stack.includes('text')) issues.push(source.slice(0, start).split('\n').length);
    if (!raw.endsWith('/>')) stack.push(tag[2]);
  }
  return issues;
}
function audit(files) {
  return files.filter(file => file.endsWith('.wxml')).flatMap(file => invalidParents(fs.readFileSync(file, 'utf8'))
    .map(line => path.relative(root, file) + ':' + line + '：人员组件必须放在 view 中，不能嵌入原生 text'));
}
if (require.main === module) {
  assert.deepEqual(invalidParents('<text><person-link /></text>'), [1]);
  assert.deepEqual(invalidParents('<text><block wx:if="{{a > 0}}">\n<person-link /></block></text>'), [2]);
  assert.deepEqual(invalidParents('<view><text>标签</text><person-link name="{{a > 0 ? \'甲\' : \'乙\'}}" /></view>'), []);
  assert.deepEqual(invalidParents('<!-- <text><person-link /></text> --><wxs>var x="<text><person-link/>";</wxs><view><person-link /></view>'), []);
  const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const issues = audit(walk(path.join(root, 'miniprogram')));
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('人员组件容器检查通过：全仓模板及4组扫描器正反例');
}
module.exports = { audit, invalidParents };
