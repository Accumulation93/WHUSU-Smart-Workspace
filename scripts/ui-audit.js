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
const STANDARD_BUTTON_ROLE = /\b(?:primary-btn|secondary-btn|danger-btn)\b/;
const FULL_SIZE_BUTTON_SELECTOR = /(?:^|[\s,>])button\b|\.(?:primary-btn|secondary-btn|danger-btn|approve-btn|reject-btn|profile-submit-btn|page-submit-btn|template-save-btn|purpose-save-btn|dialog-btn|sigpad-btn|panel-add-btn)\b/;
const FORBIDDEN_EMOJI_ICON = /(?:\u{1F4CE}|\u{1F4C4}|\u{1F4E4}|\u{1F504}|\u{270F}\u{FE0F}?|\u{2705}|\u{274C}|\u{1F4CC}|\u{21A9}\u{FE0F}?|\u{23F3}|\u{1F512}|\u{1F3C6}|\u{1F534}|\u{1F4AC})/gu;
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

function scanStaticInlineStyles(file) {
  const source = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const match of source.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/g)) {
    if (/\{\{/.test(match[2])) continue;
    findings.push({
      file: relative(file),
      line: lineAt(source, match.index),
      style: match[2].replace(/\s+/g, ' ').trim()
    });
  }
  return findings;
}

function scanForbiddenEmojiIcons(file) {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(FORBIDDEN_EMOJI_ICON)].map(match => ({
    file: relative(file),
    line: lineAt(source, match.index),
    icon: match[0]
  }));
}

function scanAdminOrgContextContracts() {
  const pages = [
    {
      name: '评分管理',
      wxml: path.join(MINI_ROOT, 'subpackages', 'scoring', 'pages', 'admin', 'admin.wxml'),
      script: path.join(MINI_ROOT, 'subpackages', 'scoring', 'pages', 'admin', 'admin.js')
    },
    {
      name: '场地管理',
      wxml: path.join(MINI_ROOT, 'subpackages', 'venue', 'pages', 'venueManage', 'venueManage.wxml'),
      script: path.join(MINI_ROOT, 'subpackages', 'venue', 'pages', 'venueManage', 'venueManage.js')
    }
  ];
  const findings = [];
  for (const page of pages) {
    const markup = fs.readFileSync(page.wxml, 'utf8');
    const script = fs.readFileSync(page.script, 'utf8');
    const checks = [
      ['管理端副标题', /hero-subtitle/],
      ['当前组织提示', /hero-org-context/],
      ['切换组织交互', /(?:bindtap|catchtap)="onOrgTap"/],
      ['当前组织名称', /currentOrganizationName/]
    ];
    for (const [label, pattern] of checks) {
      if (!pattern.test(markup)) findings.push({ page: page.name, message: `缺少${label}` });
    }
    if (!/\bonOrgTap\s*\(\)/.test(script)) {
      findings.push({ page: page.name, message: '缺少切换组织处理函数' });
    }
    if (!/\/subpackages\/org\/pages\/identitySwitch\/identitySwitch/.test(script)) {
      findings.push({ page: page.name, message: '组织与身份切换未指向统一入口' });
    }
  }
  return findings;
}

function scanVenueFlowVisibilityContract() {
  const file = path.join(MINI_ROOT, 'subpackages', 'venue', 'pages', 'venueManage', 'venueManage.wxml');
  const source = fs.readFileSync(file, 'utf8');
  const findings = [];
  const checks = [
    ['借用规则页缺少当前组织审批状态卡片', /rule-org-context/],
    ['借用规则页未展示组织专属流程状态', /组织专属审批流程/],
    ['借用规则页未说明无专属流程时的处理方式', /尚未配置专属流程/]
  ];
  for (const [message, pattern] of checks) {
    if (!pattern.test(source)) findings.push({ file: relative(file), message });
  }
  return findings;
}

function scanLegacyRedirectUi() {
  const directory = path.join(MINI_ROOT, 'subpackages', 'venue', 'pages', 'venueBookings');
  const scriptFile = path.join(directory, 'venueBookings.js');
  const markupFile = path.join(directory, 'venueBookings.wxml');
  const script = fs.readFileSync(scriptFile, 'utf8');
  const markup = fs.readFileSync(markupFile, 'utf8');
  const significantLines = markup.split(/\r?\n/).filter(line => line.trim()).length;
  const findings = [];
  if (!/wx\.redirectTo\(\{\s*url:\s*['"]\/subpackages\/venue\/pages\/venueManage\/venueManage\?tab=bookings['"]/.test(script)) {
    findings.push({ file: relative(scriptFile), message: '旧借用管理入口未跳转到统一管理页' });
  }
  if (significantLines > 12 || /\bwx:for\b/.test(markup) || /\b(?:approve|reject|loadBookings)\b/.test(markup)) {
    findings.push({ file: relative(markupFile), message: '纯跳转页仍残留旧管理界面' });
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
  const pillButtonRadius = [];
  const stackedButtonMetrics = [];
  const forcedDialogViewport = [];
  const miscenteredDialogShell = [];
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
    if (FULL_SIZE_BUTTON_SELECTOR.test(selector) &&
      /border-radius\s*:\s*(?:999(?:r?px)|50%)\b/i.test(declarations)) {
      pillButtonRadius.push({
        file: relative(file),
        line: lineAt(source, ruleMatch.index),
        selector: selector.trim().replace(/\s+/g, ' '),
        message: '原生文字按钮禁止使用胶囊/圆形半径，请改为 16–24rpx 紧凑圆角矩形'
      });
    }
    if (FULL_SIZE_BUTTON_SELECTOR.test(selector)) {
      const minHeight = declarations.match(/min-height\s*:\s*(\d+(?:\.\d+)?)(r?px)\b/i);
      const lineHeight = declarations.match(/line-height\s*:\s*(\d+(?:\.\d+)?)(r?px)\b/i);
      const fixedHeight = declarations.match(/(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)(r?px)\b/i);
      if (minHeight && lineHeight && !fixedHeight && minHeight[2] === lineHeight[2]) {
        const minimum = Number(minHeight[1]);
        const line = Number(lineHeight[1]);
        const absoluteFloor = minHeight[2] === 'px' ? 28 : 44;
        if (line >= absoluteFloor && line >= minimum * 0.75) {
          stackedButtonMetrics.push({
            file: relative(file),
            line: lineAt(source, ruleMatch.index),
            selector: selector.trim().replace(/\s+/g, ' '),
            message: '文字按钮不得用接近最小高度的固定行高；它会与继承的上下内边距叠加并形成异常高按钮'
          });
        }
      }
    }
    if (/(popup|modal|dialog|sheet)/i.test(selector) &&
      /(?:^|;)\s*height\s*:\s*(?:\d+(?:\.\d+)?vh|calc\(\s*100vh\b)/i.test(declarations) &&
      !/(timetable|placement|signature|canvas|keyboard|ui-dialog-shell--wide|ui-dialog-scroll--both)/i.test(selector)) {
      forcedDialogViewport.push({
        file: relative(file),
        line: lineAt(source, ruleMatch.index),
        selector: selector.trim().replace(/\s+/g, ' '),
        message: '普通内容弹窗不得强制占据固定视口高度；应按内容生长并只在溢出时滚动'
      });
    }
    if (/(?:\.ui-dialog-shell\b|\.dialog-panel\b|\.message-switch-dialog\b|\.permission-dialog\b|\.popup-card\b|\.modal-card\b)/i.test(selector) &&
      /position\s*:\s*(?:absolute|fixed)\b/i.test(declarations) &&
      /(?:left|right|inset|transform)\s*:/i.test(declarations) &&
      !/(sheet-panel|timetable|placement|signature|canvas|keyboard)/i.test(selector)) {
      miscenteredDialogShell.push({
        file: relative(file),
        line: lineAt(source, ruleMatch.index),
        selector: selector.trim().replace(/\s+/g, ' '),
        message: '居中弹窗壳不得自行使用绝对定位或横向锚点；水平和垂直居中必须只由 ui-overlay 负责'
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
    pillButtonRadius,
    stackedButtonMetrics,
    forcedDialogViewport,
    miscenteredDialogShell,
    oversizedTimetable: [...source.matchAll(/\.timetable-scroll\s*\{[^{}]*height\s*:\s*(\d{3,})rpx/gi)]
      .filter(match => Number(match[1]) >= 900)
      .map(match => ({ file: relative(file), line: lineAt(source, match.index), height: match[1] + 'rpx' }))
  };
}

const wxmlFiles = walk(MINI_ROOT, '.wxml');
const controls = wxmlFiles.flatMap(scanWxml);
const visibleInternalIds = wxmlFiles.flatMap(scanVisibleInternalIds);
const staticInlineStyles = wxmlFiles.flatMap(scanStaticInlineStyles);
const layoutContracts = wxmlFiles.map(scanLayoutContracts);
const styles = walk(MINI_ROOT, '.wxss').map(scanWxss);
const nativeButtonRoleIssues = controls.filter(item => item.tag === 'button' && !STANDARD_BUTTON_ROLE.test(item.className));
const forbiddenEmojiIcons = [
  ...wxmlFiles,
  ...walk(MINI_ROOT, '.wxss'),
  ...walk(MINI_ROOT, '.js')
].flatMap(scanForbiddenEmojiIcons);
const adminOrgContextIssues = scanAdminOrgContextContracts();
const venueFlowVisibilityIssues = scanVenueFlowVisibilityContract();
const legacyRedirectUiIssues = scanLegacyRedirectUi();
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
const pillButtonRadius = styles.flatMap(item => item.pillButtonRadius);
const stackedButtonMetrics = styles.flatMap(item => item.stackedButtonMetrics);
const forcedDialogViewport = styles.flatMap(item => item.forcedDialogViewport);
const miscenteredDialogShell = styles.flatMap(item => item.miscenteredDialogShell);
const missingStableDialogSystem = !(
  /\.ui-dialog-body\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?min-height:\s*0;/m.test(GLOBAL_STYLE) &&
  /\.ui-dialog-footer\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;[\s\S]*?padding-bottom:\s*0;/m.test(GLOBAL_STYLE) &&
  /\.ui-overlay\s+\.ui-dialog-shell--complex\s*\{[^}]*height:\s*auto;/m.test(GLOBAL_STYLE)
);
const missingDialogCenteringSystem = !(
  /\.ui-overlay\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/m.test(GLOBAL_STYLE) &&
  /\.ui-overlay\s+\.ui-dialog-shell\s*\{[\s\S]*?position:\s*relative;[\s\S]*?align-self:\s*center;[\s\S]*?margin-left:\s*auto;[\s\S]*?margin-right:\s*auto;/m.test(GLOBAL_STYLE)
);
const missingDialogScrollSystem = !(
  /scroll-view\.ui-dialog-scroll--fill\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*max-height:\s*56vh;/m.test(GLOBAL_STYLE) &&
  /scroll-view\.ui-dialog-scroll--pane\s*\{[^}]*min-height:\s*120rpx;/m.test(GLOBAL_STYLE) &&
  /scroll-view\.ui-dialog-scroll--x\s*\{[^}]*height:\s*auto;/m.test(GLOBAL_STYLE) &&
  /scroll-view\.ui-dialog-scroll--both\s*\{[^}]*height:\s*64vh;/m.test(GLOBAL_STYLE) &&
  !/scroll-view\.ui-dialog-scroll--(?:fill|both)\s*\{[^}]*(?:^|;)\s*height:\s*0\s*;/m.test(GLOBAL_STYLE)
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
  /--ui-type-body:\s*15px/.test(GLOBAL_STYLE) &&
  /--ui-font-md:\s*var\(--ui-type-body\)/.test(GLOBAL_STYLE) &&
  /input\.field-input[\s\S]*display:\s*block\s*!important/.test(GLOBAL_STYLE)
);
const typeScale = [
  ['micro', '18rpx', '10.8px'],
  ['caption', '20rpx', '12px'],
  ['meta', '22rpx', '13.2px'],
  ['label', '23rpx', '13.8px'],
  ['control', '24rpx', '14.4px'],
  ['body', '25rpx', '15px'],
  ['emphasis', '26rpx', '15.6px'],
  ['value', '28rpx', '16.8px'],
  ['section', '30rpx', '18px'],
  ['dialog', '32rpx', '19.2px'],
  ['page', '46rpx', '27.6px']
];
const missingTypographySystem = typeScale.some(([name, phone, pad]) => {
  const phoneIndex = GLOBAL_STYLE.indexOf(`--ui-type-${name}: ${phone};`);
  const padIndex = GLOBAL_STYLE.indexOf(`--ui-type-${name}: ${pad};`);
  return phoneIndex < 0 || padIndex < 0 || padIndex <= phoneIndex;
}) || !(
  /page \.hero-title,[\s\S]*?font-size:\s*var\(--ui-type-page\)\s*!important/.test(GLOBAL_STYLE) &&
  /page \.section-title,[\s\S]*?font-size:\s*var\(--ui-type-section\)\s*!important/.test(GLOBAL_STYLE) &&
  /page \.list-title,[\s\S]*?font-size:\s*var\(--ui-type-value\)\s*!important/.test(GLOBAL_STYLE) &&
  /page \.list-desc,[\s\S]*?font-size:\s*var\(--ui-type-meta\)\s*!important/.test(GLOBAL_STYLE)
);
const missingTabSizeSystem = !(
  /--ui-tab-font-size:\s*var\(--ui-type-control\)/.test(GLOBAL_STYLE) &&
  /--ui-tab-min-height:\s*66rpx/.test(GLOBAL_STYLE) &&
  /--ui-tab-min-height:\s*39\.6px/.test(GLOBAL_STYLE) &&
  /--ui-tab-sidebar-min-height:\s*44\.4px/.test(GLOBAL_STYLE) &&
  /\.message-tab\s*\{[\s\S]*?min-height:\s*var\(--ui-tab-min-height/.test(GLOBAL_STYLE)
);
const homeStyle = fs.readFileSync(path.join(MINI_ROOT, 'pages', 'home', 'home.wxss'), 'utf8');
const portalStyle = fs.readFileSync(path.join(MINI_ROOT, 'pages', 'portal', 'portal.wxss'), 'utf8');
const adminPermissionsStyle = fs.readFileSync(
  path.join(MINI_ROOT, 'subpackages', 'org', 'pages', 'adminPermissions', 'adminPermissions.wxss'),
  'utf8'
);
const unstableSummaryGrid = !(
  /\.info-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/m.test(homeStyle) &&
  /\.info-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/m.test(portalStyle) &&
  !/@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*?\.info-block\s*\{[^}]*width:\s*100%/m.test(homeStyle)
);
const typographyRoleDrift = !(
  /\.popup-title,[\s\S]*?\.message-switch-title\s*\{[\s\S]*?font-size:\s*var\(--ui-type-dialog\)\s*!important/m.test(GLOBAL_STYLE) &&
  /\.permission-hero-title\s*\{[^}]*font-size:\s*var\(--ui-type-page/m.test(adminPermissionsStyle) &&
  /\.permission-dialog-title\s*\{[^}]*font-size:\s*var\(--ui-type-dialog/m.test(adminPermissionsStyle) &&
  !/\.permission-hero-title\s*\{\s*font-size:\s*38px/m.test(adminPermissionsStyle)
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
    wxmlFiles: wxmlFiles.length,
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
    missingTypographySystem: missingTypographySystem ? 1 : 0,
    missingTabSizeSystem: missingTabSizeSystem ? 1 : 0,
    unstableSummaryGrid: unstableSummaryGrid ? 1 : 0,
    typographyRoleDrift: typographyRoleDrift ? 1 : 0,
    transitionAll: styles.reduce((sum, item) => sum + item.transitionAll, 0),
    willChange: styles.reduce((sum, item) => sum + item.willChange, 0),
    illegalColors: illegalColors.length,
    remoteAssets: remoteAssets.length,
    visibleInternalIds: visibleInternalIds.length,
    nativeButtonRoleIssues: nativeButtonRoleIssues.length,
    forbiddenEmojiIcons: forbiddenEmojiIcons.length,
    adminOrgContextIssues: adminOrgContextIssues.length,
    venueFlowVisibilityIssues: venueFlowVisibilityIssues.length,
    legacyRedirectUiIssues: legacyRedirectUiIssues.length,
    staticInlineStyles: staticInlineStyles.length,
    dialogs: dialogs.length,
    dialogIssues: dialogIssues.length,
    dataLayoutIssues: dataLayoutIssues.length,
    scrollContractIssues: scrollContractIssues.length,
    unsafeControlEllipsis: unsafeControlEllipsis.length,
    fixedDataColumns: fixedDataColumns.length,
    pillButtonRadius: pillButtonRadius.length,
    stackedButtonMetrics: stackedButtonMetrics.length,
    forcedDialogViewport: forcedDialogViewport.length,
    miscenteredDialogShell: miscenteredDialogShell.length,
    missingStableDialogSystem: missingStableDialogSystem ? 1 : 0,
    missingDialogCenteringSystem: missingDialogCenteringSystem ? 1 : 0,
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
  nativeButtonRoleIssues,
  forbiddenEmojiIcons,
  adminOrgContextIssues,
  venueFlowVisibilityIssues,
  legacyRedirectUiIssues,
  staticInlineStyles,
  dialogs,
  dialogIssues,
  dataLayoutIssues,
  scrollContractIssues,
  unsafeControlEllipsis,
  fixedDataColumns,
  pillButtonRadius,
  stackedButtonMetrics,
  forcedDialogViewport,
  miscenteredDialogShell,
  missingTypographySystem,
  missingTabSizeSystem,
  unstableSummaryGrid,
  typographyRoleDrift,
  styles
};

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('WHUSU Smart Workspace UI audit');
  console.table(report.summary);
  console.log('\nHighest-risk files:');
  const riskByFile = new Map();
  for (const item of [...missingFeedback, ...nestedRisks, ...unclassified, ...nativeButtonRoleIssues, ...forbiddenEmojiIcons, ...pillButtonRadius, ...stackedButtonMetrics, ...forcedDialogViewport, ...miscenteredDialogShell]) {
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
    report.summary.missingTypographySystem || report.summary.missingTabSizeSystem || report.summary.unstableSummaryGrid || report.summary.typographyRoleDrift ||
    report.summary.transitionAll || report.summary.willChange || report.summary.illegalColors || report.summary.remoteAssets ||
    report.summary.visibleInternalIds ||
    report.summary.nativeButtonRoleIssues || report.summary.forbiddenEmojiIcons ||
    report.summary.adminOrgContextIssues || report.summary.venueFlowVisibilityIssues || report.summary.legacyRedirectUiIssues ||
    report.summary.dialogIssues || report.summary.dataLayoutIssues || report.summary.scrollContractIssues || report.summary.unsafeControlEllipsis ||
    report.summary.fixedDataColumns || report.summary.pillButtonRadius || report.summary.stackedButtonMetrics || report.summary.forcedDialogViewport || report.summary.miscenteredDialogShell || report.summary.missingStableDialogSystem || report.summary.missingDialogCenteringSystem || report.summary.missingDialogScrollSystem ||
    report.summary.missingResponsiveDataSystem;
  process.exitCode = failed ? 1 : 0;
}
