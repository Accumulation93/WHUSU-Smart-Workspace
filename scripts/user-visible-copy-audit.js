'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const SERVER_ROOT = path.join(ROOT, 'server', 'src');
const VISIBLE_ATTRIBUTES = new Set([
  'placeholder', 'title', 'label', 'aria-label', 'confirm-text', 'cancel-text'
]);
const RULES = [
  { id: 'technical-detail', pattern: /(数据库|服务端|客户端|接口|后台|OpenID|openid|令牌|服务器本地|初始化脚本|上下文|会话|参数|标识|主体|字段|映射|快照|哈希|签名链|配置|校验|统一身份|账号体系|认领请求)/i },
  { id: 'internal-workflow', pattern: /(预检|迁移来源字段|未授权接口|数据异常|不合法|失败|错误|异常)/ },
  { id: 'architecture-slogan', pattern: /(一个账号[，,、 ]*全部身份|都从这里登录|从这里登录)/ },
  { id: 'mechanical-success', pattern: /(?:操作|提交|保存|更新|创建|删除|登录|绑定)成功/ },
  { id: 'redundant-guidance', pattern: /(点击(?:上方|下方|右上角).*?(?:添加|发起)|将显示在这里|欢迎使用.*工作台系统|页面数据将同步更新)/ },
  { id: 'redundant-ui-feedback', pattern: /(已切换页签|页签已切换|切换页签成功)/ },
  { id: 'implementation-detail', pattern: /(互不关联|独立保存|自动创建|服务器日志|服务器返回了)/ },
  { id: 'internal-identifier', pattern: /\b(?:requestId|fileId|hrId|adminId|departmentId|identityId|workGroupId)\b/i },
  { id: 'internal-error-code', pattern: /^(?:[a-z][a-z0-9]*_)+[a-z0-9]+$/i }
];
const HR_VERSION_PATTERN = /(版本|最新版|当前来源|源模板|历史快照)/;
const HR_COPY_FILES = /(?:hrProfile|hrInfoBehavior|subpackages\/scoring\/pages\/admin\/admin\.(?:js|wxml))/;
const EXEMPTIONS = [
  { file: 'server/src/index.js', pattern: /数据库不可用/ }
];

function walk(dir, extensions, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, output);
    else if (extensions.some((extension) => entry.name.endsWith(extension))) output.push(full);
  }
  return output;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
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
        if (char === quote && source[index - 1] !== '\\') quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        end = index;
        break;
      }
    }
    if (end < 0) break;
    tokens.push({ raw: source.slice(start, end + 1), index: start });
    cursor = end + 1;
  }
  return tokens;
}

function visibleWxmlFragments(file) {
  const source = fs.readFileSync(file, 'utf8');
  const fragments = [];
  const tokens = tokenizeWxml(source);
  let cursor = 0;
  let insideWxs = false;
  for (const token of tokens) {
    if (!insideWxs && token.index > cursor) {
      const rawText = source.slice(cursor, token.index);
      const text = rawText.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) fragments.push({ text, offset: cursor });
    }
    if (!insideWxs && !token.raw.startsWith('<!--')) {
      const attrPattern = /([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
      for (const match of token.raw.matchAll(attrPattern)) {
        if (!VISIBLE_ATTRIBUTES.has(match[1])) continue;
        const text = match[3].replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) fragments.push({ text, offset: token.index + match.index });
      }
    }
    if (/^<wxs\b/.test(token.raw)) insideWxs = true;
    if (/^<\/wxs\b/.test(token.raw)) insideWxs = false;
    cursor = token.index + token.raw.length;
  }
  if (!insideWxs && cursor < source.length) {
    const text = source.slice(cursor).replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) fragments.push({ text, offset: cursor });
  }
  return { source, fragments };
}

function jsStringLiterals(source) {
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
    const start = cursor;
    cursor += 1;
    let text = '';
    while (cursor < source.length) {
      const current = source[cursor];
      if (current === '\\') {
        text += current + (source[cursor + 1] || '');
        cursor += 2;
        continue;
      }
      if (current === quote) {
        cursor += 1;
        break;
      }
      text += current;
      cursor += 1;
    }
    literals.push({ text: text.replace(/\$\{[\s\S]*?\}/g, ' ').replace(/\s+/g, ' ').trim(), offset: start, end: cursor });
  }
  return literals;
}

function visibleJsFragments(file) {
  const source = fs.readFileSync(file, 'utf8');
  const isServer = file.startsWith(SERVER_ROOT);
  const contextPattern = isServer
    ? /(?:(?:message|label|description)\s*:\s*|throw new Error\s*\(|new \w+Error\s*\()$/
    : /(?:showToast|showModal|showShortToast|title|content|subtitle|description|placeholder|emptyText|hintText)\s*(?:\(|:)\s*$/;
  const fragments = jsStringLiterals(source).filter((literal) => {
    const context = source.slice(Math.max(0, literal.offset - 180), literal.offset);
    if (!contextPattern.test(context.replace(/\s+/g, ' '))) return false;
    if (isServer && /^(?:[a-z][a-z0-9]*_)+[a-z0-9]+$/i.test(literal.text)
      && source.slice(literal.end, literal.end + 12).trimStart().startsWith(',')) return false;
    return true;
  });
  return { source, fragments };
}

function isExempt(file, text) {
  return EXEMPTIONS.some((entry) => entry.file === file && entry.pattern.test(text));
}

const findings = [];
const inventory = [];
const inventoryPrefixArg = process.argv.find((arg) => arg.startsWith('--inventory-prefix='));
const inventoryPrefix = inventoryPrefixArg ? inventoryPrefixArg.slice('--inventory-prefix='.length) : '';
const inventoryMinLengthArg = process.argv.find((arg) => arg.startsWith('--inventory-min-length='));
const inventoryMinLength = inventoryMinLengthArg ? Number(inventoryMinLengthArg.slice('--inventory-min-length='.length)) : 0;
const localizationPrefixArg = process.argv.find((arg) => arg.startsWith('--localization-prefix='));
const localizationPrefix = localizationPrefixArg ? localizationPrefixArg.slice('--localization-prefix='.length) : '';
const localizationFindings = [];
const files = walk(MINI_ROOT, ['.wxml', '.js']).concat(
  walk(SERVER_ROOT, ['.js']).filter((file) => !file.includes(`${path.sep}config${path.sep}`)
    && relative(file) !== 'server/src/utils/schemaContract.js')
);
for (const file of files) {
  const fileName = relative(file);
  if (fileName.includes('/locales/')) continue;
  const result = file.endsWith('.wxml') ? visibleWxmlFragments(file) : visibleJsFragments(file);
  for (const fragment of result.fragments) {
    if (!fragment.text || isExempt(fileName, fragment.text)) continue;
    inventory.push({ file: fileName, line: lineAt(result.source, fragment.offset), text: fragment.text });
    if (localizationPrefix && fileName.startsWith(localizationPrefix) && /[\u4e00-\u9fff]/.test(fragment.text)) {
      localizationFindings.push({
        rule: 'hardcoded-visible-copy',
        file: fileName,
        line: lineAt(result.source, fragment.offset),
        text: fragment.text
      });
    }
    for (const rule of RULES) {
      if (!rule.pattern.test(fragment.text)) continue;
      findings.push({ rule: rule.id, file: fileName, line: lineAt(result.source, fragment.offset), text: fragment.text });
    }
    if (HR_COPY_FILES.test(fileName) && HR_VERSION_PATTERN.test(fragment.text)) {
      findings.push({ rule: 'hr-version-language', file: fileName, line: lineAt(result.source, fragment.offset), text: fragment.text });
    }
  }
}

console.log(`用户可见文案审计：${files.length} 个文件，问题 ${findings.length} 个`);
if (findings.length) console.table(findings);
if (process.argv.includes('--inventory')) {
  const selected = inventory.filter((item) => (!inventoryPrefix || item.file.startsWith(inventoryPrefix))
    && item.text.length >= inventoryMinLength);
  for (const item of selected) console.log(`${item.file}:${item.line}\t${item.text}`);
  console.log(`文案清单：${selected.length} 条`);
}
if (localizationPrefix) {
  console.log(`语言资源审计：${localizationPrefix}，硬编码文案 ${localizationFindings.length} 条`);
  if (localizationFindings.length) console.table(localizationFindings);
}
if (process.argv.includes('--strict') && findings.length) process.exitCode = 1;
if (process.argv.includes('--strict-localization') && localizationFindings.length) process.exitCode = 1;
