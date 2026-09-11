'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const auditSource = fs.readFileSync(path.join(__dirname, 'ui-audit.js'), 'utf8');
const tokenizer = {};
// 复用识别引号及 WXS 的扫描器，不能把 Mustache 中的 > 当作标签结束。
vm.runInNewContext(auditSource.slice(auditSource.indexOf('function tokenizeWxml('), auditSource.indexOf('function scanWxml(')), tokenizer);

function inventory(source) {
  return tokenizer.tokenizeWxml(source).filter(token => /^<(?:button|view|text)\b/.test(token.raw)).map(token => {
    const classMatch = token.raw.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/);
    const classes = new Set(classMatch ? classMatch[2].split(/\s+/).filter(value => /^[\w-]+$/.test(value)) : []);
    const native = /^<button\b/.test(token.raw);
    const action = classes.has('ui-motion-button') || ['primary-btn', 'secondary-btn', 'danger-btn', 'approve-btn', 'reject-btn', 'dialog-btn', 'sigpad-btn'].some(name => classes.has(name));
    return native || action ? { classes, native, tag: token.raw.match(/^<(\w+)/)[1] } : null;
  }).filter(Boolean);
}

function applies(selector, buttons) {
  if (selector.includes('::') || /:(?:before|after)\b/.test(selector)) return false;
  const parts = selector.trim().split(/[\s>+~]+/).filter(Boolean);
  const target = parts.pop().replace(/\[[^\]]*\]/g, '').replace(/:[\w-]+(?:\([^)]*\))?/g, '');
  if (target === 'text' && parts.length) return applies(parts.join(' '), buttons);
  if (/^(?:input|textarea|picker|scroll-view)(?:\b|\.)/.test(target)) return false;
  const tag = target.match(/^[\w-]+/);
  const classes = Array.from(target.matchAll(/\.([\w-]+)/g), item => item[1]);
  return (tag || classes.length) && buttons.some(button => (!tag || tag[0] === button.tag) && classes.every(name => button.classes.has(name)));
}

function inspect(source, buttons) {
  const issues = [];
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
  for (const rule of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim().split(',').map(value => value.trim()).filter(selector => applies(selector, buttons));
    if (!selectors.length) continue;
    const declarations = {};
    for (const entry of rule[2].split(';')) {
      const colon = entry.indexOf(':');
      if (colon < 0) continue;
      declarations[entry.slice(0, colon).trim().toLowerCase()] = entry.slice(colon + 1).replace(/!important/g, '').trim().toLowerCase();
    }
    const fixed = value => /^\d+(?:\.\d+)?(?:r?px)$/.test(value || '');
    const reasons = [];
    if (/^(block|inline-block)$/.test(declarations.display || '')) reasons.push('按钮不得退回依赖行高居中的 block');
    if (/^(left|right|start|end)$/.test(declarations['text-align'] || '')) reasons.push('按钮文字须水平居中');
    if (/^(flex-start|flex-end|start|end|space-between|space-around|space-evenly)$/.test(declarations['justify-content'] || '')) reasons.push('按钮主轴须居中');
    if (/^(flex-start|flex-end|start|end)$/.test(declarations['align-items'] || '')) reasons.push('按钮交叉轴须居中');
    if (fixed(declarations.height) && declarations.height === declarations['line-height']) reasons.push('禁止用整控件高度作为文字行高');
    if (declarations['text-overflow'] === 'ellipsis' || declarations['-webkit-line-clamp']) reasons.push('动作文字不得截断');
    if (reasons.length) issues.push({ line: cleaned.slice(0, rule.index).split('\n').length, selectors, reasons });
  }
  return issues;
}

function undefinedActionTokens(source, buttons, tokens) {
  const missing = [];
  for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(',').some(selector => applies(selector, buttons))) continue;
    for (const match of rule[2].matchAll(/var\(\s*(--[\w-]+)/g)) if (!tokens.has(match[1])) missing.push(match[1]);
  }
  return missing;
}

const fixture = inventory('<button class="novel-action" disabled="{{count > 0}}">{{label}}</button><view class="novel-view ui-motion-button"></view><view class="left-field"></view>');
assert.strictEqual(fixture.length, 2);
for (const declarations of ['display:block;', 'height:44px;line-height:44px;padding:10px;', 'text-align:left;', 'justify-content:flex-end;', 'align-items:flex-start;', 'text-overflow:ellipsis;', '-webkit-line-clamp:2;']) {
  assert(inspect('.novel-action {' + declarations + '}', fixture).length, '应拒绝新按钮类反模式：' + declarations);
}
assert.strictEqual(inspect('.novel-action {display:flex;align-items:center;justify-content:center;text-align:center;height:auto;line-height:1.4;}', fixture).length, 0);
assert.strictEqual(inspect('.left-field {display:block;text-align:left;} .novel-action::after {display:block;}', fixture).length, 0);
assert(inspect('.novel-action text {text-align:left;}', fixture).length, '按钮内部文字不得独立偏左');
assert(inspect('.novel-view {display:block;}', fixture).length, 'view 语义动作按钮同样必须居中');
assert.deepStrictEqual(undefinedActionTokens('.novel-action {padding:var(--typo, 10px);}', fixture, new Set()), ['--typo']);
assert.strictEqual(undefinedActionTokens('.novel-action {padding:var(--space);}', fixture, new Set(['--space'])).length, 0);
// 正方形键盘、图标按钮等固定几何本身不违规，但不能靠整块高度充当文本行高。
assert.strictEqual(inspect('.novel-action {display:flex;align-items:center;justify-content:center;height:44px;line-height:1.4;padding:0;}', fixture).length, 0);

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const allFiles = files(path.join(root, 'miniprogram'));
const buttons = allFiles.filter(file => file.endsWith('.wxml')).flatMap(file => inventory(fs.readFileSync(file, 'utf8')));
const issues = allFiles.filter(file => file.endsWith('.wxss')).flatMap(file => inspect(fs.readFileSync(file, 'utf8'), buttons)
  .map(issue => Object.assign({ file: path.relative(root, file) }, issue)));
// 仅检查命中动作按钮规则中的令牌引用；缺省回退不能掩盖拼错的共享令牌。
const styleSources = allFiles.filter(file => file.endsWith('.wxss')).map(file => fs.readFileSync(file, 'utf8'));
const tokens = new Set(styleSources.flatMap(source => Array.from(source.matchAll(/(--[\w-]+)\s*:/g), match => match[1])));
for (const source of styleSources) {
  assert.deepStrictEqual(undefinedActionTokens(source, buttons, tokens), [], '动作按钮引用未定义令牌');
}
const appStyles = fs.readFileSync(path.join(root, 'miniprogram/app.wxss'), 'utf8');
const base = appStyles.match(/(?:^|\n)button\s*\{([^}]+)\}/);
assert(base, '必须保留原生按钮共享布局');
for (const contract of [/display:\s*flex;/, /align-items:\s*center;/, /justify-content:\s*center;/, /text-align:\s*center;/, /height:\s*auto;/]) {
  assert(contract.test(base[1]), '共享按钮缺少居中与完整显示契约：' + contract);
}
if (issues.length) console.error(JSON.stringify(issues, null, 2));
assert.strictEqual(issues.length, 0, '原生按钮声明级反模式审计失败；不能以局部正常代替全局检查');
console.log('动作按钮居中审计通过：' + buttons.length + ' 个原生及语义动作按钮，正反例与令牌检查通过（非渲染验收）');
