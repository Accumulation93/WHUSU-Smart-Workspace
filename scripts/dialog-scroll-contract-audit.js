/**
 * 弹窗滚动契约审计。
 *
 * 普通弹窗按内容自然生长并受共享视口上限约束，网格只分配三段结构。
 * 原生滚动宿主不承担纵向内边距，实际内容容器承担留白，避免末项被裁。
 * 结构检查不能替代微信中实际滚动到底、键盘收起及非零高度的现场验证。
 *
 * 本脚本做两件硬校验：
 * 1. 任何使用 ui-dialog-shell--grid 的弹窗，直接子级必须恰好是
 *    标题 / 滚动正文 / 底栏三段，多一段会让网格轨道错位。
 * 2. 登记在册的长列表弹窗必须保留 ui-dialog-shell--grid。
 * 普通原生滚动正文禁止回退Flex压缩；两段窗口使用对应两轨结构。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'miniprogram');

// 人事与考核模块的长列表弹窗：保留三段结构，长度随数据增长。
const LONG_LIST_DIALOG_CLASSES = [
  'csv-mapping-card',
  'hr-import-preview-card',
  'validation-errors-card',
  'hr-profile-export-modal',
  'hr-template-switch-modal',
  'hr-template-switch-block-modal',
  'hr-person-editor-shell',
  'auth-code-dialog',
  'desig-popup-card'
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.wxml')) out.push(full);
  }
  return out;
}

// 逐字符读取标签，避免把属性值里的 '>' 当成标签结束符。
function readTag(source, start) {
  const nameMatch = /^<([a-zA-Z-]+)/.exec(source.slice(start, start + 40));
  if (!nameMatch) return null;
  let index = start + nameMatch[0].length;
  let quote = '';
  while (index < source.length) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    index += 1;
  }
  return {
    tag: nameMatch[1],
    header: source.slice(start, index),
    end: index,
    selfClosing: /\/\s*$/.test(source.slice(start, index))
  };
}

function directChildren(source, parent) {
  const children = [];
  let cursor = parent.end + 1;
  let depth = 0;
  while (cursor < source.length && children.length < 16) {
    const nextOpen = source.indexOf('<', cursor);
    if (nextOpen === -1) break;
    const closeMatch = /^<\/([a-zA-Z-]+)\s*>/.exec(source.slice(nextOpen, nextOpen + 40));
    if (closeMatch) {
      if (depth === 0 && closeMatch[1] === parent.tag) break;
      depth -= 1;
      cursor = nextOpen + closeMatch[0].length;
      continue;
    }
    const child = readTag(source, nextOpen);
    if (!child) {
      cursor = nextOpen + 1;
      continue;
    }
    if (depth === 0) children.push(child);
    if (!child.selfClosing) depth += 1;
    cursor = child.end + 1;
  }
  return children;
}

function collectDialogs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const dialogs = [];
  const pattern = /<([a-zA-Z-]+)\b/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const element = readTag(source, match.index);
    if (!element || element.selfClosing) continue;
    const classMatch = /class="([^"]*)"/.exec(element.header);
    const classes = classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [];
    if (classes.indexOf('ui-dialog-shell') === -1) continue;
    dialogs.push({
      file,
      line: source.slice(0, match.index).split('\n').length,
      classes,
      source,
      children: directChildren(source, element)
    });
  }
  return dialogs;
}

function hasClass(classes, name) {
  return classes.indexOf(name) !== -1;
}

function isScrollBody(child) {
  return child.tag === 'scroll-view' && /class="[^"]*ui-dialog-body/.test(child.header);
}

function isFooter(child) {
  return /class="[^"]*ui-dialog-footer/.test(child.header);
}

function isHeader(child) {
  return /class="[^"]*ui-dialog-header/.test(child.header);
}

const files = walk(ROOT, []);
const dialogs = [];
for (const file of files) dialogs.push(...collectDialogs(file));

const failures = [];

for (const dialog of dialogs) {
  const relative = path.relative(path.resolve(__dirname, '..'), dialog.file).replace(/\\/g, '/');
  const usesGrid = hasClass(dialog.classes, 'ui-dialog-shell--grid');
  const bodyGrid = hasClass(dialog.classes, 'ui-dialog-shell--grid-body');
  const actionsGrid = hasClass(dialog.classes, 'ui-dialog-shell--grid-actions');
  const scrollBodyCount = dialog.children.filter(isScrollBody).length;
  const footerCount = dialog.children.filter(isFooter).length;

  if (usesGrid) {
    if (dialog.children.length !== 3 || !isHeader(dialog.children[0]) || !isScrollBody(dialog.children[1]) || !isFooter(dialog.children[2])) {
      failures.push(
        `${relative}:${dialog.line} 使用 grid 外壳但直接子级不是标题/正文/底栏三段，`
        + `实际 ${dialog.children.length} 段（正文 ${scrollBodyCount}、底栏 ${footerCount}）`
      );
    }
  }

  if (bodyGrid && (dialog.children.length !== 2 || !isHeader(dialog.children[0]) || !isScrollBody(dialog.children[1]))) {
    failures.push(`${relative}:${dialog.line} grid-body 必须恰好为标题和滚动正文`);
  }
  if (actionsGrid && (dialog.children.length !== 2 || !isScrollBody(dialog.children[0]) || !isFooter(dialog.children[1]))) {
    failures.push(`${relative}:${dialog.line} grid-actions 必须恰好为滚动正文和底栏`);
  }

  const longList = LONG_LIST_DIALOG_CLASSES.some((name) => hasClass(dialog.classes, name));
  if (longList && !usesGrid) {
    failures.push(`${relative}:${dialog.line} 长列表弹窗缺少 ui-dialog-shell--grid 三段结构`);
  }
  const professional = hasClass(dialog.classes, 'ui-dialog-shell--wide') || hasClass(dialog.classes, 'ui-dialog-shell--viewport');
  for (const body of dialog.children.filter(isScrollBody)) {
    if (professional) continue;
    if (!/\bui-dialog-scroll--natural\b/.test(body.header)) {
      failures.push(`${relative}:${dialog.line} 普通正文未声明自然滚动布局`);
      continue;
    }
    const contents = directChildren(dialog.source, body);
    if (contents.length !== 1 || contents[0].tag !== 'view' || !/\bui-dialog-scroll-content\b/.test(contents[0].header)) {
      failures.push(`${relative}:${dialog.line} 自然滚动正文必须有唯一的显式内容容器`);
    }
    if (/\bstyle="[^\"]*\bheight\s*:\s*0(?:px|rpx|vh|%)?\s*(?:!important)?\s*(?:;|\")/.test(body.header)) {
      failures.push(`${relative}:${dialog.line} 正文禁止初始化为零高度等待测量恢复`);
    }
  }
  if (!usesGrid && !bodyGrid && !actionsGrid && !professional && scrollBodyCount === 1) {
    failures.push(`${relative}:${dialog.line} 普通原生滚动正文必须按真实结构使用自然网格，禁止Flex压缩造成内部视口错配`);
  }
}

console.log('=== 长列表弹窗网格契约 ===');
console.log(`检查弹窗 ${dialogs.length} 个`);

if (failures.length) {
  console.error(`\n[失败] ${failures.length} 项弹窗滚动契约问题：`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exitCode = 1;
} else {
  console.log('\n弹窗滚动契约通过。');
}
