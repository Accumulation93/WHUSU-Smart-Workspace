'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const INTERACTIVE_ATTR = /\b(bindtap|catchtap|bindlongpress|catchlongpress)\s*=/;
const INPUT_TAGS = new Set(['input', 'textarea', 'picker', 'slider', 'switch', 'checkbox', 'radio']);
const VOID_TAGS = new Set(['input', 'textarea', 'image', 'icon', 'progress', 'slider', 'switch']);
const SHELL_NAMES = ['card', 'section', 'edit-box', 'list-card', 'popup-card', 'modal-card', 'sheet-panel'];
const NON_VISUAL_TARGET = /(mask|canvas|ghost|drag|handle|hit-area|physical-keyboard-capture)/;
const BANNED_COLORS = /#(?:1d4ed8|1e40af|172554)\b/gi;
const LEGACY_OVERLAYS = new Set(['popup-mask', 'modal-mask', 'dialog-layer', 'sheet-layer']);
const LEGACY_DIALOG_SHELLS = new Set(['popup-card', 'modal-card', 'dialog-panel', 'sheet-panel']);
const LEGACY_COMPLEX_GRIDS = new Set(['task-table', 'result-table', 'popup-table']);
const GLOBAL_STYLE = fs.readFileSync(path.join(MINI_ROOT, 'app.wxss'), 'utf8');
const GLOBAL_MEDIA_520 = /@media\s*\(min-width:\s*520px\)/.test(GLOBAL_STYLE);
const GLOBAL_MEDIA_900 = /@media\s*\(min-width:\s*900px\)/.test(GLOBAL_STYLE);

function walk(dir, extension, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extension, out);
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`));
  return match ? match[2] : '';
}

function classify(tag, className, hoverClass) {
  if (tag === 'button') return 'button';
  if (INPUT_TAGS.has(tag)) return 'field';
  if (/(ui-press-button|button-pressing)/.test(hoverClass)) return 'button';
  if (/(ui-press-card|control-pressing)/.test(hoverClass)) return 'card';
  if (/(ui-press-chip|chip-pressing)/.test(hoverClass)) return 'chip';
  if (/(chip|tab|pill|tag)/.test(className)) return 'chip';
  if (/(card|item|row|entry|tile)/.test(className)) return 'card';
  if (/(link|action|close|clear|btn|button)/.test(className)) return 'inline-action';
  return 'unclassified';
}

function tokenizeWxml(source) {
  const tokens = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      if (end < 0) break;
      tokens.push({ raw: source.slice(start, end + 3), index: start });
      cursor = end + 3;
      continue;
    }
    if (!/[A-Za-z/!]/.test(source[start + 1] || '')) {
      cursor = start + 1;
      continue;
    }
    let quote = '';
    let end = -1;
    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        end = index;
        break;
      }
    }
    if (end < 0) break;
    const raw = source.slice(start, end + 1);
    tokens.push({ raw, index: start });
    if (/^<wxs\b/.test(raw)) {
      const wxsEnd = source.indexOf('</wxs>', end + 1);
      cursor = wxsEnd >= 0 ? wxsEnd : end + 1;
    } else {
      cursor = end + 1;
    }
  }
  return tokens;
}

function scanWxml(file) {
  const source = fs.readFileSync(file, 'utf8');
  const stack = [];
  const controls = [];
  for (const token of tokenizeWxml(source)) {
    const raw = token.raw;
    if (raw.startsWith('<!--')) continue;
    const close = raw.match(/^<\/([\w-]+)/);
    if (close) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === close[1]) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    const start = raw.match(/^<([\w-]+)([\s\S]*?)\/?>(?:\s*)$/);
    if (!start) continue;
    const tag = start[1];
    const attrs = start[2] || '';
    const className = attrValue(attrs, 'class');
    const eventMatch = attrs.match(INTERACTIVE_ATTR);
    const nativeField = INPUT_TAGS.has(tag);
    const interactive = Boolean(eventMatch || nativeField || tag === 'button');
    const ancestor = [...stack].reverse().find(item => item.interactive);

    if (interactive) {
      const hoverClass = attrValue(attrs, 'hover-class');
      const eventType = eventMatch ? eventMatch[1] : tag === 'button' ? 'button' : 'native';
      const hoverStart = attrValue(attrs, 'hover-start-time');
      const hoverStay = attrValue(attrs, 'hover-stay-time');
      controls.push({
        file: relative(file),
        line: lineAt(source, token.index),
        tag,
        className,
        type: classify(tag, className, hoverClass),
        eventType,
        hoverClass,
        hoverStart,
        hoverStay,
        hoverStop: /\bhover-stop-propagation\s*=/.test(attrs),
        nonVisual: NON_VISUAL_TARGET.test(className),
        nestedIn: ancestor ? `${ancestor.tag}.${ancestor.className || '(no-class)'}` : '',
        nestedRisk: Boolean(ancestor && eventType === 'bindtap' && !/\bhover-stop-propagation\s*=/.test(attrs))
      });
    }

    const selfClosing = raw.endsWith('/>') || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push({ tag, className, interactive });
  }
  return controls;
}

function scanVisibleInternalIds(file) {
  const source = fs.readFileSync(file, 'utf8');
  const tokens = tokenizeWxml(source);
  const findings = [];
  const directInternalIdPattern = /^\s*(?:[\w$]+\.)*(?:openid|hrId|fileId|adminId|departmentId|identityId|workGroupId|submissionId|bookingId|activityId)\s*$/;
  let cursor = 0;
  let insideWxs = false;

  for (const token of tokens) {
    if (!insideWxs && token.index > cursor) {
      const text = source.slice(cursor, token.index);
      for (const expression of text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
        if (!directInternalIdPattern.test(expression[1])) continue;
        const offset = cursor + expression.index;
        findings.push({
          file: relative(file),
          line: lineAt(source, offset),
          expression: expression[0].replace(/\s+/g, ' ').trim()
        });
      }
    }

    if (/^<wxs\b/.test(token.raw)) insideWxs = true;
    if (/^<\/wxs\b/.test(token.raw)) insideWxs = false;
    cursor = token.index + token.raw.length;
  }

  return findings;
}

function classList(raw) {
  const match = raw.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/);
  return match ? match[2].split(/\s+/).filter(Boolean) : [];
}

function scanLayoutContracts(file) {
  const source = fs.readFileSync(file, 'utf8');
  const stack = [];
  const dialogs = [];
  const dialogIssues = [];
  const dataLayoutIssues = [];
  const scrollContractIssues = [];

  for (const token of tokenizeWxml(source)) {
    const raw = token.raw;
    if (raw.startsWith('<!--')) continue;
    const close = raw.match(/^<\/([\w-]+)/);
    if (close) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag !== close[1]) continue;
        const item = stack[index];
        if (item.dialog) {
          const dialog = item.dialog;
          const modifiers = ['ui-dialog-shell--compact', 'ui-dialog-shell--complex', 'ui-dialog-shell--wide']
            .filter(name => dialog.classes.has(name));
          if (modifiers.length !== 1) dialog.issues.push('弹窗必须且只能声明一个尺寸修饰符');
          const requiresStructure = dialog.classes.has('ui-dialog-shell--complex') || dialog.classes.has('ui-dialog-shell--wide');
          if (requiresStructure && !dialog.hasHeader) dialog.issues.push('复杂弹窗缺少 ui-dialog-header');
          if (requiresStructure && !dialog.hasBody) dialog.issues.push('复杂弹窗缺少 ui-dialog-body');
          for (const message of dialog.issues) {
            dialogIssues.push({ file: relative(file), line: dialog.line, message, className: [...dialog.classes].join(' ') });
          }
          dialogs.push({
            file: relative(file),
            line: dialog.line,
            className: [...dialog.classes].join(' '),
            hasHeader: dialog.hasHeader,
            hasBody: dialog.hasBody,
            hasFooter: dialog.hasFooter
          });
        }
        stack.length = index;
        break;
      }
      continue;
    }

    const open = raw.match(/^<([\w-]+)/);
    if (!open || raw.startsWith('<!')) continue;
    const tag = open[1];
    const classes = new Set(classList(raw));
    const line = lineAt(source, token.index);
    const dialogAncestor = [...stack].reverse().find(item => item.dialog);
    const scrollAncestor = [...stack].reverse().find(item => item.tag === 'scroll-view');

    if ([...classes].some(name => LEGACY_OVERLAYS.has(name)) && !classes.has('ui-overlay')) {
      dialogIssues.push({ file: relative(file), line, message: '弹窗遮罩缺少 ui-overlay', className: [...classes].join(' ') });
    }

    let dialog = null;
    if ([...classes].some(name => LEGACY_DIALOG_SHELLS.has(name))) {
      dialog = {
        line,
        classes,
        hasHeader: false,
        hasBody: false,
        hasFooter: false,
        issues: classes.has('ui-dialog-shell') ? [] : ['弹窗壳缺少 ui-dialog-shell']
      };
    } else if (dialogAncestor) {
      const current = dialogAncestor.dialog;
      if (classes.has('ui-dialog-header')) current.hasHeader = true;
      if (classes.has('ui-dialog-body')) current.hasBody = true;
      if (classes.has('ui-dialog-footer')) {
        current.hasFooter = true;
        if (scrollAncestor) current.issues.push(`第 ${line} 行操作栏位于 scroll-view 内`);
      }
    }

    if ([...classes].some(name => LEGACY_COMPLEX_GRIDS.has(name)) && !classes.has('ui-data-grid--complex')) {
      dataLayoutIssues.push({ file: relative(file), line, message: '复杂数据表缺少 ui-data-grid--complex' });
    }
    if (classes.has('timetable-scroll') && !classes.has('ui-data-grid--specialized')) {
      dataLayoutIssues.push({ file: relative(file), line, message: '专业时间网格缺少 ui-data-grid--specialized' });
    }

    if ((classes.has('ui-overlay') || classes.has('ui-dialog-shell')) &&
      /\bcatchtouchmove\s*=/.test(raw) && !classes.has('ui-dialog-touch-lock')) {
      scrollContractIssues.push({ file: relative(file), line, message: '弹窗遮罩或外壳不得拦截主体触摸移动' });
    }

    if (tag === 'scroll-view' && classes.has('ui-dialog-body')) {
      const modifiers = ['ui-dialog-scroll--fill', 'ui-dialog-scroll--pane', 'ui-dialog-scroll--x', 'ui-dialog-scroll--both']
        .filter(name => classes.has(name));
      const hasScrollX = /\sscroll-x(?:\s*=|\s|\/?\>)/.test(raw);
      const hasScrollY = /\sscroll-y(?:\s*=|\s|\/?\>)/.test(raw);
      if (modifiers.length !== 1) {
        scrollContractIssues.push({ file: relative(file), line, message: '弹窗 scroll-view 必须且只能声明一种滚动视口类型' });
      } else if (modifiers[0] === 'ui-dialog-scroll--x' && (!hasScrollX || hasScrollY)) {
        scrollContractIssues.push({ file: relative(file), line, message: '横向滚动视口必须只启用 scroll-x' });
      } else if (modifiers[0] === 'ui-dialog-scroll--both' && (!hasScrollX || !hasScrollY)) {
        scrollContractIssues.push({ file: relative(file), line, message: '专业双向滚动视口必须同时启用 scroll-x 和 scroll-y' });
      } else if (['ui-dialog-scroll--fill', 'ui-dialog-scroll--pane'].includes(modifiers[0]) && !hasScrollY) {
        scrollContractIssues.push({ file: relative(file), line, message: '纵向滚动视口必须启用 scroll-y' });
      }
    }

    const selfClosing = raw.endsWith('/>') || VOID_TAGS.has(tag);
    if (!selfClosing) stack.push({ tag, dialog });
  }

  return { dialogs, dialogIssues, dataLayoutIssues, scrollContractIssues };
}

function scanWxss(file) {
  const source = fs.readFileSync(file, 'utf8');
  const shellActive = [];
  const nativeInputFlex = [];
  const unsafeControlEllipsis = [];
  const fixedDataColumns = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let ruleMatch;
  while ((ruleMatch = rulePattern.exec(source))) {
    const selector = ruleMatch[1];
    const declarations = ruleMatch[2];
    if (/\.field-input\b/.test(selector) && /display\s*:\s*flex\b/i.test(declarations)) {
      nativeInputFlex.push({
        file: relative(file),
        line: lineAt(source, ruleMatch.index),
        selector: selector.trim().replace(/\s+/g, ' ')
      });
    }
    if (/text-overflow\s*:\s*ellipsis\b/i.test(declarations) &&
      /(button|\bbtn\b|picker|action|\btab\b|title|name|result-group-label|app-grid-label|primary-btn|secondary-btn|danger-btn|ui-data-cell--primary|ui-data-cell--action|csv-mapping-primary-text|csv-mapping-picker-value)/i.test(selector)) {
      unsafeControlEllipsis.push({
        file: relative(file),
        line: lineAt(source, ruleMatch.index),
        selector: selector.trim().replace(/\s+/g, ' ')
      });
    }
    if (/(csv-mapping-col|task-col|result-col|popup-col)/i.test(selector) &&
      /flex\s*:\s*0\s+0\s+(?:\d+(?:\.\d+)?)(?:r?px)\b/i.test(declarations)) {
      fixedDataColumns.push({
        file: relative(file),
        line: lineAt(source, ruleMatch.index),
        selector: selector.trim().replace(/\s+/g, ' ')
      });
    }
    const transformValue = declarations.match(/transform\s*:\s*([^;]+)/i);
    const animationValue = declarations.match(/animation(?:-name)?\s*:\s*([^;]+)/i);
    const hasMotion = Boolean(
      (transformValue && !/^none\b/i.test(transformValue[1].trim())) ||
      (animationValue && !/^none\b/i.test(animationValue[1].trim()))
    );
    if (!hasMotion) continue;
    for (const shell of SHELL_NAMES) {
      const pattern = new RegExp(`\\.${shell.replace('-', '\\-')}:active`);
      if (pattern.test(selector)) {
        shellActive.push({
          file: relative(file),
          line: lineAt(source, ruleMatch.index),
          selector: `.${shell}:active`
        });
      }
    }
  }
  return {
    file: relative(file),
    important: (source.match(/!important/g) || []).length,
    transitionAll: (source.match(/transition\s*:\s*all/g) || []).length,
    willChange: (source.match(/will-change\s*:/g) || []).length,
    illegalColors: [...source.matchAll(BANNED_COLORS)].map(match => ({
      file: relative(file),
      line: lineAt(source, match.index),
      color: match[0].toLowerCase()
    })),
    media520: GLOBAL_MEDIA_520 || /@media\s*\(min-width:\s*520px\)/.test(source),
    media900: GLOBAL_MEDIA_900 || /@media\s*\(min-width:\s*900px\)/.test(source),
    shellActive,
    nativeInputFlex,
    unsafeControlEllipsis,
    fixedDataColumns,
    oversizedTimetable: [...source.matchAll(/\.timetable-scroll\s*\{[^{}]*height\s*:\s*(\d{3,})rpx/gi)]
      .filter(match => Number(match[1]) >= 900)
      .map(match => ({ file: relative(file), line: lineAt(source, match.index), height: match[1] + 'rpx' }))
  };
}

const controls = walk(MINI_ROOT, '.wxml').flatMap(scanWxml);
const visibleInternalIds = walk(MINI_ROOT, '.wxml').flatMap(scanVisibleInternalIds);
const layoutContracts = walk(MINI_ROOT, '.wxml').map(scanLayoutContracts);
const styles = walk(MINI_ROOT, '.wxss').map(scanWxss);
const missingFeedback = controls.filter(item => (
  !['field'].includes(item.type) &&
  !item.nonVisual &&
  !item.hoverClass &&
  item.eventType !== 'catchtap'
));
const nestedRisks = controls.filter(item => item.nestedRisk && !item.nonVisual);
const unclassified = controls.filter(item => item.type === 'unclassified' && !item.nonVisual);
const timingMismatches = controls.filter(item => (
  !item.nonVisual && item.hoverClass && (item.hoverStart !== '0' || item.hoverStay !== '160')
));
const shellActive = styles.flatMap(item => item.shellActive);
const nativeInputFlex = styles.flatMap(item => item.nativeInputFlex);
const oversizedTimetable = styles.flatMap(item => item.oversizedTimetable);
const illegalColors = styles.flatMap(item => item.illegalColors);
const dialogs = layoutContracts.flatMap(item => item.dialogs);
const dialogIssues = layoutContracts.flatMap(item => item.dialogIssues);
const dataLayoutIssues = layoutContracts.flatMap(item => item.dataLayoutIssues);
const scrollContractIssues = layoutContracts.flatMap(item => item.scrollContractIssues);
const unsafeControlEllipsis = styles.flatMap(item => item.unsafeControlEllipsis);
const fixedDataColumns = styles.flatMap(item => item.fixedDataColumns);
const missingStableDialogSystem = !(
  /\.ui-dialog-body\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?min-height:\s*0;/m.test(GLOBAL_STYLE) &&
  /\.ui-dialog-footer\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;/m.test(GLOBAL_STYLE)
);
const missingDialogScrollSystem = !(
  /scroll-view\.ui-dialog-scroll--fill\s*\{[^}]*height:\s*56vh;[^}]*max-height:\s*calc\(100vh\s*-\s*360rpx/m.test(GLOBAL_STYLE) &&
  /scroll-view\.ui-dialog-scroll--pane\s*\{[^}]*min-height:\s*120rpx;/m.test(GLOBAL_STYLE) &&
  /scroll-view\.ui-dialog-scroll--x\s*\{[^}]*height:\s*auto;/m.test(GLOBAL_STYLE) &&
  /scroll-view\.ui-dialog-scroll--both\s*\{[^}]*height:\s*64vh;/m.test(GLOBAL_STYLE) &&
  !/scroll-view\.ui-dialog-scroll--(?:fill|both)\s*\{[^}]*height:\s*0\s*;/m.test(GLOBAL_STYLE)
);
const adminStyle = fs.readFileSync(path.join(MINI_ROOT, 'subpackages', 'scoring', 'pages', 'admin', 'admin.wxss'), 'utf8');
const missingResponsiveDataSystem = !(
  /\.csv-mapping-row\s*\{[\s\S]*?display:\s*grid;/m.test(adminStyle) &&
  /\.csv-mapping-row-header\s*\{[\s\S]*?display:\s*none;/m.test(adminStyle) &&
  /@media\s*\(min-width:\s*520px\)[\s\S]*?grid-template-columns:[\s\S]*?minmax\(180px,\s*1\.35fr\)/m.test(adminStyle) &&
  /\.task-table\.ui-data-grid--complex\s*>\s*\.ui-data-row--header/.test(GLOBAL_STYLE)
);
const missingDeviceSystem = !(
  /--ui-control-height:\s*48px/.test(GLOBAL_STYLE) &&
  /--ui-font-md:\s*15px/.test(GLOBAL_STYLE) &&
  /input\.field-input[\s\S]*display:\s*block\s*!important/.test(GLOBAL_STYLE)
);
const remoteAssets = walk(MINI_ROOT, '.wxml').flatMap(file => {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/\bsrc\s*=\s*(["'])https?:\/\/[^"']+\1/g)].map(match => ({
    file: relative(file),
    line: lineAt(source, match.index),
    source: match[0]
  }));
});

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    wxmlFiles: new Set(controls.map(item => item.file)).size,
    wxssFiles: styles.length,
    controls: controls.length,
    missingFeedback: missingFeedback.length,
    nestedRisks: nestedRisks.length,
    unclassified: unclassified.length,
    timingMismatches: timingMismatches.length,
    shellActive: shellActive.length,
    nativeInputFlex: nativeInputFlex.length,
    oversizedTimetable: oversizedTimetable.length,
    missingDeviceSystem: missingDeviceSystem ? 1 : 0,
    transitionAll: styles.reduce((sum, item) => sum + item.transitionAll, 0),
    willChange: styles.reduce((sum, item) => sum + item.willChange, 0),
    illegalColors: illegalColors.length,
    remoteAssets: remoteAssets.length,
    visibleInternalIds: visibleInternalIds.length,
    dialogs: dialogs.length,
    dialogIssues: dialogIssues.length,
    dataLayoutIssues: dataLayoutIssues.length,
    scrollContractIssues: scrollContractIssues.length,
    unsafeControlEllipsis: unsafeControlEllipsis.length,
    fixedDataColumns: fixedDataColumns.length,
    missingStableDialogSystem: missingStableDialogSystem ? 1 : 0,
    missingDialogScrollSystem: missingDialogScrollSystem ? 1 : 0,
    missingResponsiveDataSystem: missingResponsiveDataSystem ? 1 : 0,
    important: styles.reduce((sum, item) => sum + item.important, 0),
    missingTabletPortrait: styles.filter(item => !item.media520).length,
    missingTabletLandscape: styles.filter(item => !item.media900).length
  },
  controls,
  missingFeedback,
  nestedRisks,
  unclassified,
  timingMismatches,
  shellActive,
  nativeInputFlex,
  oversizedTimetable,
  illegalColors,
  remoteAssets,
  visibleInternalIds,
  dialogs,
  dialogIssues,
  dataLayoutIssues,
  scrollContractIssues,
  unsafeControlEllipsis,
  fixedDataColumns,
  styles
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('REDSU UI audit');
  console.table(report.summary);
  console.log('\nHighest-risk files:');
  const riskByFile = new Map();
  for (const item of [...missingFeedback, ...nestedRisks, ...unclassified]) {
    riskByFile.set(item.file, (riskByFile.get(item.file) || 0) + 1);
  }
  console.table([...riskByFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([file, risks]) => ({ file, risks })));
}

if (process.argv.includes('--strict')) {
  const failed = report.summary.missingFeedback || report.summary.nestedRisks || report.summary.timingMismatches || report.summary.shellActive ||
    report.summary.nativeInputFlex || report.summary.oversizedTimetable || report.summary.missingDeviceSystem ||
    report.summary.transitionAll || report.summary.willChange || report.summary.illegalColors || report.summary.remoteAssets ||
    report.summary.visibleInternalIds ||
    report.summary.dialogIssues || report.summary.dataLayoutIssues || report.summary.scrollContractIssues || report.summary.unsafeControlEllipsis ||
    report.summary.fixedDataColumns || report.summary.missingStableDialogSystem || report.summary.missingDialogScrollSystem ||
    report.summary.missingResponsiveDataSystem;
  process.exitCode = failed ? 1 : 0;
}
