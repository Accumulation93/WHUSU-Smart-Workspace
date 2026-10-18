'use strict';

// 按模板结构识别加载展示，保留原条件、事件、循环和容器；不以正则重写标签。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const auditSource = fs.readFileSync(path.join(root, 'scripts/ui-audit.js'), 'utf8');
const tokenizer = {};
vm.runInNewContext(auditSource.slice(auditSource.indexOf('function tokenizeWxml('), auditSource.indexOf('function scanWxml(')), tokenizer);
function files(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'package-resources' ? [] : files(file, extension);
    return file.endsWith(extension) ? [file] : [];
  });
}
const loadingKeys = new Set(['loading', 'loadingDots', 'loadingProfile', 'loadingAccount', 'loadingMore']);
function collect(value) {
  Object.entries(value || {}).forEach(([key, content]) => {
    if (typeof content === 'string' && /^(?:正在(?:加载|读取|查询|检查)|加载中)/.test(content)) loadingKeys.add(key);
    else if (content && typeof content === 'object') collect(content);
  });
}
files(path.join(root, 'shared/locales/zh-CN'), '.js').forEach(file => collect(require(file)));
function attributes(raw) {
  const result = []; let index = 1;
  while (index < raw.length && !/\s|>/.test(raw[index])) index++;
  while (index < raw.length) {
    while (/\s/.test(raw[index] || '')) index++;
    if (!raw[index] || raw[index] === '/' || raw[index] === '>') break;
    const start = index;
    while (index < raw.length && !/[\s=>/]/.test(raw[index])) index++;
    const name = raw.slice(start, index);
    while (/\s/.test(raw[index] || '')) index++;
    let value = '';
    if (raw[index] === '=') {
      index++; while (/\s/.test(raw[index] || '')) index++;
      const quote = raw[index];
      if (quote === '"' || quote === "'") {
        const begin = ++index;
        while (index < raw.length && raw[index] !== quote) index++;
        value = raw.slice(begin, index++);
      } else {
        const begin = index; let expression = 0;
        while (index < raw.length) {
          if (raw.slice(index, index + 2) === '{{') { expression++; index += 2; continue; }
          if (raw.slice(index, index + 2) === '}}') { expression--; index += 2; continue; }
          if (!expression && /\s|>/.test(raw[index])) break;
          index++;
        }
        value = raw.slice(begin, index);
      }
    }
    result.push({ name, value, start, end: index });
  }
  return result;
}
function tree(source) {
  const nodes = []; const stack = [];
  for (const token of tokenizer.tokenizeWxml(source)) {
    if (token.raw.startsWith('<!--') || token.raw.startsWith('<!')) continue;
    const closing = token.raw[1] === '/';
    const name = token.raw.slice(closing ? 2 : 1).match(/^[\w-]+/)[0];
    if (closing) {
      const node = stack.pop();
      if (!node || node.name !== name) throw new Error('模板标签不匹配：' + name);
      node.close = token.index; node.end = token.index + token.raw.length;
    } else {
      const node = { name, start: token.index, openEnd: token.index + token.raw.length, close: token.index + token.raw.length, end: token.index + token.raw.length, attrs: attributes(token.raw), children: [] };
      if (stack.length) stack[stack.length - 1].children.push(node);
      nodes.push(node);
      if (!token.raw.endsWith('/>')) stack.push(node);
    }
  }
  return nodes;
}
function expression(source) {
  const match = source.trim().match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  return match && loadingKeys.has(match[1].split('.').pop()) ? match[1] : '';
}
function edits(source, web) {
  const nodes = tree(source); const changes = [];
  for (const node of nodes) {
    if (changes.some(change => change.start <= node.start && change.end >= node.end)) continue;
    if (['app-loading', 'AppLoading', 'script', 'style', 'wxs'].includes(node.name)) continue;
    const loading = node.attrs.find(attr => attr.name === 'loading');
    if (!web && node.name === 'button' && loading) {
      const disabled = node.attrs.find(attr => attr.name === 'disabled');
      changes.push({ start: node.start + loading.start, end: node.start + loading.end, text: disabled ? '' : 'disabled="' + loading.value + '"', kind: 'nativeButton' });
      changes.push({ start: node.openEnd, end: node.openEnd, text: '<app-loading compact="{{true}}" active="' + loading.value + '" />', kind: 'buttonIndicator' });
      continue;
    }
    if (node.name === 'button') continue;
    const body = source.slice(node.openEnd, node.close);
    if (!web && node.children.length === 2) {
      const [leading, label] = node.children;
      const leadingClass = leading.attrs.find(attr => attr.name === 'class');
      const labelExpression = expression(source.slice(label.openEnd, label.close));
      if (leadingClass && leadingClass.value.endsWith('-loading-spinner') && labelExpression) {
        changes.push({ start: node.openEnd, end: node.close, text: '<app-loading text="{{' + labelExpression + '}}" />', kind: 'privateSpinner' });
        continue;
      }
    }
    const text = expression(body);
    if (text && !node.children.length) {
      changes.push({ start: node.openEnd, end: node.close, text: web ? '<AppLoading :text="' + text + '" />' : '<app-loading text="{{' + text + '}}" />', kind: 'plainText' });
      continue;
    }
    const className = node.attrs.find(attr => attr.name === 'class');
    if (!web && className && className.value.split(/\s+/).some(value => ['card-loading-spinner', 'popup-loading-spinner', 'filter-loading-spinner'].includes(value))) {
      changes.push({ start: node.start, end: node.end, text: '<app-loading compact="{{true}}" />', kind: 'privateSpinner' });
    }
  }
  return changes;
}
if (process.argv.includes('--self-test')) {
  const assert = require('assert');
  const sample = '<view wx:if="{{count > 1}}"><view>{{copy.loading}}</view><wxs module="a">var x = "<view>";</wxs></view>';
  const result = edits(sample, false); assert.equal(result.length, 1); assert.equal(sample.slice(result[0].start, result[0].end), '{{copy.loading}}');
  assert.equal(edits('<button loading="{{busy}}">{{copy.save}}</button>', false).length, 2);
  assert.equal(edits('<view>{{copy.loadingFailed}}</view>', false).length, 0);
  console.log('加载接口模板扫描自测通过');
} else {
  const inventory = [];
  for (const web of [false, true]) {
    for (const file of files(path.join(root, web ? 'web/src' : 'miniprogram'), web ? '.vue' : '.wxml')) {
      if (file.includes(path.sep + 'app-loading' + path.sep) || file.endsWith('AppLoading.vue')) continue;
      const source = fs.readFileSync(file, 'utf8');
      // Vue 只处理 template，脚本和样式不属于模板扫描范围。
      const start = web ? source.indexOf('<template>') : 0;
      const end = web ? source.lastIndexOf('</template>') + 11 : source.length;
      if (start < 0 || end < start) continue;
      const changes = edits(source.slice(start, end), web).map(change => ({ ...change, start: change.start + start, end: change.end + start }));
      if (!changes.length) continue;
      inventory.push({ file: path.relative(root, file).replace(/\\/g, '/'), counts: changes.reduce((map, item) => { if (item.kind !== 'buttonIndicator') map[item.kind] = (map[item.kind] || 0) + 1; return map; }, {}) });
      if (process.argv.includes('--write')) {
        let next = source;
        changes.sort((a, b) => b.start - a.start).forEach(change => { next = next.slice(0, change.start) + change.text + next.slice(change.end); });
        fs.writeFileSync(file, next);
      }
    }
  }
  console.log(JSON.stringify(inventory, null, 2));
  if (inventory.length && !process.argv.includes('--write')) process.exitCode = 1;
}
