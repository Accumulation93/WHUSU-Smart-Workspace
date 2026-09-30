/**
 * 弹窗滚动契约审计。
 *
 * 微信原生 scroll-view 只有在拿到「确定高度」时才会启用滚动：正文高度由
 * flex 收缩或 auto 推导时，组件内部滚动量为 0，表现为「拖不动」且最后一行
 * 被外壳 overflow 裁掉。长列表弹窗因此必须走
 * `.ui-dialog-shell--complex.ui-dialog-shell--grid`（外壳为确定视口高度，
 * 正文落在 minmax(0, 1fr) 轨道并获得 height: 100%）。
 *
 * 本脚本做两件硬校验：
 * 1. 任何使用 ui-dialog-shell--grid 的弹窗，直接子级必须恰好是
 *    标题 / 滚动正文 / 底栏三段，多一段会让网格轨道错位。
 * 2. 登记在册的长列表弹窗必须保留 ui-dialog-shell--grid。
 * 另外打印仍未使用网格契约的同类弹窗，便于后续按需收敛。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'miniprogram');

// 人事与考核模块的长列表弹窗：正文长度随数据增长，必须保留确定高度。
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
const pending = [];

for (const dialog of dialogs) {
  const relative = path.relative(path.resolve(__dirname, '..'), dialog.file).replace(/\\/g, '/');
  const usesGrid = hasClass(dialog.classes, 'ui-dialog-shell--grid');
  const scrollBodyCount = dialog.children.filter(isScrollBody).length;
  const footerCount = dialog.children.filter(isFooter).length;

  if (usesGrid) {
    if (dialog.children.length !== 3 || scrollBodyCount !== 1 || footerCount !== 1) {
      failures.push(
        `${relative}:${dialog.line} 使用 grid 外壳但直接子级不是标题/正文/底栏三段，`
        + `实际 ${dialog.children.length} 段（正文 ${scrollBodyCount}、底栏 ${footerCount}）`
      );
    }
  }

  const longList = LONG_LIST_DIALOG_CLASSES.some((name) => hasClass(dialog.classes, name));
  if (longList && !usesGrid) {
    failures.push(`${relative}:${dialog.line} 长列表弹窗缺少 ui-dialog-shell--grid，正文会退回 height:auto 导致拖不动`);
  }
  if (!usesGrid && scrollBodyCount === 1 && footerCount === 1) {
    pending.push(`${relative}:${dialog.line} [${dialog.classes.filter((name) => name.startsWith('ui-dialog-shell--') || /-card$|-dialog$|-modal$|popup-card/.test(name)).join(' ')}]`);
  }
}

console.log('=== 长列表弹窗网格契约 ===');
console.log(`检查弹窗 ${dialogs.length} 个`);

if (pending.length) {
  console.log(`\n[提示] 仍未使用网格契约的滚动正文弹窗 ${pending.length} 个（正文为有界表单时可保持现状）：`);
  for (const item of pending) console.log(`  - ${item}`);
}

if (failures.length) {
  console.error(`\n[失败] ${failures.length} 项弹窗滚动契约问题：`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exitCode = 1;
} else {
  console.log('\n弹窗滚动契约通过。');
}
