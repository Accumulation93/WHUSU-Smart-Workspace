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

function scanWxss(file) {
  const source = fs.readFileSync(file, 'utf8');
  const shellActive = [];
  const nativeInputFlex = [];
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
    oversizedTimetable: [...source.matchAll(/\.timetable-scroll\s*\{[^{}]*height\s*:\s*(\d{3,})rpx/gi)]
      .filter(match => Number(match[1]) >= 900)
      .map(match => ({ file: relative(file), line: lineAt(source, match.index), height: match[1] + 'rpx' }))
  };
}

const controls = walk(MINI_ROOT, '.wxml').flatMap(scanWxml);
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
    report.summary.transitionAll || report.summary.willChange || report.summary.illegalColors || report.summary.remoteAssets;
  process.exitCode = failed ? 1 : 0;
}
