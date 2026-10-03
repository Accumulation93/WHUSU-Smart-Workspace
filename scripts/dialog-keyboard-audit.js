#!/usr/bin/env node
/**
 * 弹窗与键盘契约审计。
 *
 * 两个真实问题的守门规则：
 *   1) 弹窗标志位泄漏 —— page-meta 用弹窗标志位锁页面滚动，标志位必须能被复位；
 *      含弹窗输入控件的页面还必须声明 dialogLockKeys，供页面卸载时统一复位。
 *   2) 键盘把页面顶偏 —— 弹窗外壳内的输入控件必须 adjust-position="{{false}}" 且带
 *      cursor-spacing；这类页面的 page-style 必须带 --kb-height: {{dialogKeyboardHeight}}，
 *      让弹窗按键盘高度收窄、由正文滚动承接遮挡。
 *
 * 用法：node scripts/dialog-keyboard-audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'miniprogram');
const INPUT_TAGS = new Set(['input', 'textarea']);
const VOID_TAGS = new Set([
  'input', 'image', 'icon', 'slot', 'wxs', 'import', 'include', 'checkbox', 'radio',
  'switch', 'progress', 'canvas', 'web-view', 'page-meta', 'navigation-bar', 'match-media'
]);

function walk(dir, suffix, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, suffix, output);
    else if (entry.name.endsWith(suffix)) output.push(full);
  }
  return output;
}

// 逐字符读取标签，尊重引号，避免把属性值里的 > 当成标签结束符。
function readTag(source, start) {
  let index = start;
  let quote = '';
  let text = '';
  while (index < source.length) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    text += char;
    index += 1;
  }
  return { text, end: index };
}

function pageMetaExpression(source) {
  const match = source.match(/<page-meta[^>]*page-style="\{\{([\s\S]*?)\}\}"/);
  return match ? match[1] : '';
}

function lockFlagsOf(expression) {
  // 先去掉字符串字面量（例如 ' --kb-height: ' 这类样式片段），只保留真正的标志位标识符。
  const withoutLiterals = expression
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/dialogKeyboardHeight/g, ' ');
  return Array.from(new Set((withoutLiterals.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?/g) || [])
    .filter((token) => !['overflow', 'hidden', 'true', 'false', 'px'].includes(token))));
}

function hasReset(jsSource, flag) {
  if (flag.includes('.')) {
    const [objectName, property] = flag.split('.');
    return new RegExp(`${objectName}\\s*:\\s*\\{[^}]*${property}\\s*:\\s*false`, 's').test(jsSource);
  }
  return new RegExp(`${flag}\\s*:\\s*(false|0|''|\\[\\])`).test(jsSource);
}

function dialogFields(source) {
  const fields = [];
  let depth = 0;
  let dialogDepth = 0;
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('<', index);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    const tag = readTag(source, start + 1);
    const nameMatch = /^([a-zA-Z-]+)/.exec(tag.text);
    if (!nameMatch) {
      index = start + 1;
      continue;
    }
    const name = nameMatch[1];
    const closing = /^\//.test(tag.text);
    const selfClose = /\/\s*$/.test(tag.text) || VOID_TAGS.has(name);
    if (closing) {
      depth -= 1;
      if (dialogDepth > 0 && depth + 1 === dialogDepth) dialogDepth = 0;
    } else {
      if (/class="[^"]*ui-dialog-shell/.test(tag.text) && !dialogDepth) dialogDepth = depth + 1;
      if (INPUT_TAGS.has(name) && dialogDepth > 0) {
        fields.push({
          line: source.slice(0, start).split('\n').length,
          hasAdjustPosition: /adjust-position="\{\{false\}\}"/.test(tag.text),
          hasCursorSpacing: /cursor-spacing="\d+"/.test(tag.text)
        });
      }
      if (!selfClose) depth += 1;
    }
    index = tag.end + 1;
  }
  return fields;
}

const findings = [];
const wxmlFiles = walk(ROOT, '.wxml');
for (const wxmlFile of wxmlFiles) {
  const source = fs.readFileSync(wxmlFile, 'utf8');
  const relative = path.relative(path.resolve(__dirname, '..'), wxmlFile).replace(/\\/g, '/');
  const expression = pageMetaExpression(source);
  const pageDir = path.dirname(wxmlFile);
  const jsSource = walk(pageDir, '.js').map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  if (expression) {
    lockFlagsOf(expression).forEach((flag) => {
      if (!hasReset(jsSource, flag)) {
        findings.push(`${relative}: 弹窗标志位 ${flag} 在页面脚本里找不到复位赋值，页面可能被永久锁滚动`);
      }
    });
  }

  const fields = dialogFields(source);
  fields.forEach((field) => {
    if (!field.hasAdjustPosition || !field.hasCursorSpacing) {
      findings.push(`${relative}:${field.line} 弹窗内输入控件必须同时带 adjust-position="{{false}}" 与 cursor-spacing`);
    }
  });
  if (fields.length && expression && !/dialogKeyboardHeight/.test(expression)) {
    findings.push(`${relative}: 含弹窗输入控件的页面必须把 dialogKeyboardHeight 写进 page-style（--kb-height）`);
  }
  if (fields.length && expression && !/dialogLockKeys/.test(jsSource)) {
    findings.push(`${relative}: 含弹窗输入控件的页面必须声明 dialogLockKeys，供卸载时统一复位滚动锁`);
  }
}

if (findings.length) {
  console.error(`弹窗键盘契约审计失败：${findings.length} 处`);
  findings.forEach((item) => console.error('  - ' + item));
  process.exit(1);
}
console.log(`弹窗键盘契约审计通过：${wxmlFiles.length} 个页面模板，弹窗输入控件均禁用整页位移并接入键盘高度变量`);
