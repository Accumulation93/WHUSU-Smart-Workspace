'use strict';

/**
 * 语言库单一来源检查。
 *
 * 项目的语言系统只有一份：shared/locales/zh-CN/**。小程序与网页各读一份由
 * scripts/sync-shared-modules.js 生成的副本。这个检查保证网页侧不会再悄悄
 * 冒出第二份文案：
 *
 * 1. 网页语言文件里不允许出现任何中文字面量，只能引用共享语言库。
 * 2. 网页语言文件必须由 scripts/locale-align.js 生成，且已登记在它的对照表里。
 * 3. 共享语言库的副本必须与唯一源逐字节一致（委托给 sync-shared-modules）。
 *
 *   node scripts/locale-single-source-audit.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WEB_LOCALE_ROOT = path.join(ROOT, 'web', 'src', 'locales', 'zh-CN');
const MIRROR_DIR = 'shared';
const BANNER = '// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。';
const CJK = /[\u3400-\u9fff]/;

// 只有汇总模块是手写的，它不保存文案，只把各语言文件组装成一个对象。
const AGGREGATORS = ['index.js'];

// 生成器里登记过的网页语言文件；没有登记的网页语言文件一律视为绕过语言库。
const { VIEWS } = loadGeneratorViews();

function loadGeneratorViews() {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'locale-align.js'), 'utf8');
  const start = source.indexOf('const VIEWS = {');
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        // 生成器的对照表是纯字面量对象，直接求值即可，不需要执行整份脚本。
        const literal = source.slice(open, i + 1);
        return { VIEWS: eval('(' + literal + ')') }; // eslint-disable-line no-eval
      }
    }
  }
  throw new Error('无法从 scripts/locale-align.js 里读出网页语言文件对照表');
}

/** 取出 JS 源码里的字符串字面量，用于判断文件自身是否保存了中文文案。 */
function stringLiterals(source) {
  const literals = [];
  let cursor = 0;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '/' && source[cursor + 1] === '/') {
      const end = source.indexOf('\n', cursor + 2);
      cursor = end < 0 ? source.length : end + 1;
      continue;
    }
    if (char === '/' && source[cursor + 1] === '*') {
      const end = source.indexOf('*/', cursor + 2);
      cursor = end < 0 ? source.length : end + 2;
      continue;
    }
    if (char !== '"' && char !== "'" && char !== '`') {
      cursor += 1;
      continue;
    }
    const quote = char;
    cursor += 1;
    let text = '';
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        text += source[cursor + 1] || '';
        cursor += 2;
        continue;
      }
      if (source[cursor] === quote) {
        cursor += 1;
        break;
      }
      text += source[cursor];
      cursor += 1;
    }
    literals.push({ text, offset: cursor });
  }
  return literals;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

const findings = [];
const files = fs.readdirSync(WEB_LOCALE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)
  .sort();

for (const name of files) {
  const absolute = path.join(WEB_LOCALE_ROOT, name);
  const source = fs.readFileSync(absolute, 'utf8');

  if (AGGREGATORS.includes(name)) {
    for (const literal of stringLiterals(source)) {
      if (!CJK.test(literal.text)) continue;
      findings.push({
        rule: 'copy-must-come-from-shared-library',
        file: 'web/src/locales/zh-CN/' + name,
        line: lineAt(source, literal.offset),
        detail: literal.text
      });
    }
    continue;
  }

  if (!source.startsWith(BANNER)) {
    findings.push({
      rule: 'must-be-generated',
      file: 'web/src/locales/zh-CN/' + name,
      detail: '网页语言文件必须由 scripts/locale-align.js 生成'
    });
  }
  if (!Object.prototype.hasOwnProperty.call(VIEWS, name)) {
    findings.push({
      rule: 'unregistered-view',
      file: 'web/src/locales/zh-CN/' + name,
      detail: '该语言文件没有登记在 scripts/locale-align.js 的对照表里'
    });
  }
  for (const literal of stringLiterals(source)) {
    if (!CJK.test(literal.text)) continue;
    findings.push({
      rule: 'copy-must-come-from-shared-library',
      file: 'web/src/locales/zh-CN/' + name,
      line: lineAt(source, literal.offset),
      detail: literal.text
    });
  }
}

// 共享语言库副本必须逐字节一致。
const { syncLocaleMirror } = require('./sync-shared-modules.js');
try {
  syncLocaleMirror(false);
} catch (error) {
  findings.push({ rule: 'mirror-out-of-sync', file: 'shared/locales', detail: error.message });
}

console.log('语言库单一来源检查：网页语言文件 ' + files.length + ' 个，问题 ' + findings.length + ' 个');
if (findings.length) {
  console.table(findings);
  process.exitCode = 1;
}
