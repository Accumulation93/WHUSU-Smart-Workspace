'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

let acorn;
try {
  acorn = require('internal/deps/acorn/acorn/dist/acorn');
} catch (_) {
  if (process.env.WHUSU_LOCALE_ACORN_CHILD === '1') {
    throw new Error('无法加载 Node.js 内置 Acorn 解析器');
  }
  const child = childProcess.spawnSync(
    process.execPath,
    ['--expose-internals', __filename].concat(process.argv.slice(2)),
    {
      stdio: 'inherit',
      env: Object.assign({}, process.env, { WHUSU_LOCALE_ACORN_CHILD: '1' })
    }
  );
  process.exit(child.status == null ? 1 : child.status);
}

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const SERVER_ROOT = path.join(ROOT, 'server', 'src');
const TARGET_ARG = process.argv.find((arg) => arg.startsWith('--target='));
const TARGET = TARGET_ARG ? TARGET_ARG.slice('--target='.length).replace(/\\/g, '/') : '';
const WRITE = process.argv.includes('--write');
const HAN = /[\u3400-\u9fff]/;
const SERVER_MODE = TARGET === 'server/src' || TARGET.startsWith('server/src/');
const SOURCE_ROOT = SERVER_MODE ? SERVER_ROOT : MINI_ROOT;
const LOCALE_ROOT = path.join(SOURCE_ROOT, 'locales', 'zh-CN', 'generated');
const RUNTIME_FILE = path.join(SOURCE_ROOT, 'locales', 'runtime.js');

if (!TARGET || (!TARGET.startsWith('miniprogram/') && !SERVER_MODE)) {
  throw new Error('必须使用 --target=miniprogram/... 或 --target=server/src/... 指定迁移范围');
}

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'locales') walk(full, output);
    else if (/\.(?:js|json|wxml)$/.test(entry.name)) output.push(full);
  }
  return output;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function stableKey(value, entries) {
  let length = 10;
  while (true) {
    const key = `copy_${crypto.createHash('sha1').update(value).digest('hex').slice(0, length)}`;
    if (!entries.has(key) || entries.get(key) === value) return key;
    length += 2;
  }
}

function skipQuoted(source, start, quote) {
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') cursor += 2;
    else if (source[cursor] === quote) return cursor + 1;
    else cursor += 1;
  }
  return source.length;
}

function skipLineComment(source, start) {
  const end = source.indexOf('\n', start + 2);
  return end < 0 ? source.length : end;
}

function skipBlockComment(source, start) {
  const end = source.indexOf('*/', start + 2);
  return end < 0 ? source.length : end + 2;
}

function readTemplate(source, start) {
  let cursor = start + 1;
  let chunkStart = cursor;
  const chunks = [];
  const expressions = [];
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '`') {
      chunks.push(source.slice(chunkStart, cursor));
      return { end: cursor + 1, chunks, expressions };
    }
    if (source[cursor] !== '$' || source[cursor + 1] !== '{') {
      cursor += 1;
      continue;
    }
    chunks.push(source.slice(chunkStart, cursor));
    const expressionStart = cursor + 2;
    cursor = expressionStart;
    let depth = 1;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === '/' && source[cursor + 1] === '/') cursor = skipLineComment(source, cursor);
      else if (char === '/' && source[cursor + 1] === '*') cursor = skipBlockComment(source, cursor);
      else if (char === '"' || char === "'") cursor = skipQuoted(source, cursor, char);
      else if (char === '`') cursor = readTemplate(source, cursor).end;
      else {
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        cursor += 1;
      }
    }
    expressions.push(source.slice(expressionStart, cursor - 1));
    chunkStart = cursor;
  }
  return { end: source.length, chunks: [source.slice(start + 1)], expressions: [] };
}

function addLiteral(entries, sourceLiteral) {
  const key = stableKey(sourceLiteral, entries);
  entries.set(key, sourceLiteral);
  return key;
}

function isServerVisibleNode(source, node) {
  if (!SERVER_MODE) return true;
  const context = source.slice(Math.max(0, node.start - 220), node.start).replace(/\s+/g, ' ');
  return /(?:(?:message|label|description|title|content|placeholder|statusText|reason)\s*:\s*|throw new Error\s*\(|new \w+Error\s*\(|return\s+|\|\|\s*|\+\s*)$/.test(context);
}

function transformAstNode(source, node, entries, force) {
  const replacements = [];
  collectAstReplacements(source, node, null, entries, replacements, node.start, force);
  return applyReplacements(source.slice(node.start, node.end), replacements);
}

function collectAstReplacements(source, node, parent, entries, replacements, baseOffset, force) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'Literal' && typeof node.value === 'string' && HAN.test(node.value)
    && (force || isServerVisibleNode(source, node))) {
    const raw = source.slice(node.start, node.end);
    const key = addLiteral(entries, raw);
    const isObjectKey = parent && parent.type === 'Property'
      && parent.key === node && !parent.computed && !parent.shorthand;
    replacements.push({
      start: node.start - baseOffset,
      end: node.end - baseOffset,
      value: isObjectKey ? `[localeCopy.${key}]` : `localeCopy.${key}`
    });
    return;
  }
  if (node.type === 'TemplateLiteral') {
    const hasChineseText = node.quasis.some((quasi) => HAN.test(quasi.value.cooked || quasi.value.raw));
    if (hasChineseText && (force || isServerVisibleNode(source, node))) {
      const templateValue = node.quasis.map((quasi, index) => (
        `${quasi.value.raw}${index < node.expressions.length ? `{${index}}` : ''}`
      )).join('');
      const expressions = node.expressions.map((expression) => (
        transformAstNode(source, expression, entries, true)
      ));
      const key = addLiteral(entries, `\`${templateValue}\``);
      replacements.push({
        start: node.start - baseOffset,
        end: node.end - baseOffset,
        value: node.expressions.length
          ? `localeFormat(localeCopy.${key}, [${expressions.join(', ')}])`
          : `localeCopy.${key}`
      });
      return;
    }
  }
  for (const [property, value] of Object.entries(node)) {
    if (property === 'start' || property === 'end' || property === 'loc') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') {
          collectAstReplacements(source, child, node, entries, replacements, baseOffset, force);
        }
      }
    } else if (value && typeof value.type === 'string') {
      collectAstReplacements(source, value, node, entries, replacements, baseOffset, force);
    }
  }
}

function transformJavascript(source, entries) {
  const program = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true
  });
  const replacements = [];
  collectAstReplacements(source, program, null, entries, replacements, 0, false);
  return applyReplacements(source, replacements);
}

function tokenizeWxml(source) {
  const tokens = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const commentEnd = source.indexOf('-->', start + 4);
      const end = commentEnd < 0 ? source.length : commentEnd + 3;
      tokens.push({ start, end, comment: true });
      cursor = end;
      continue;
    }
    if (!/[A-Za-z/!]/.test(source[start + 1] || '')) {
      cursor = start + 1;
      continue;
    }
    let quote = '';
    let end = source.length;
    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === quote && source[index - 1] !== '\\') quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') {
        end = index + 1;
        break;
      }
    }
    tokens.push({ start, end, comment: false });
    cursor = end;
  }
  return tokens;
}

function transformMustacheExpression(expression, entries) {
  return transformJavascript(expression, entries)
    .replace(/localeFormat\(/g, 'localeFormat(');
}

function transformWxmlText(value, entries) {
  let output = '';
  let cursor = 0;
  while (cursor < value.length) {
    const mustacheStart = value.indexOf('{{', cursor);
    const staticEnd = mustacheStart < 0 ? value.length : mustacheStart;
    const staticText = value.slice(cursor, staticEnd);
    output += staticText.replace(/([^\s]*[\u3400-\u9fff][^\s]*)/g, function(raw) {
      const key = addLiteral(entries, JSON.stringify(raw));
      return `{{localeCopy.${key}}}`;
    });
    if (mustacheStart < 0) break;
    const mustacheEnd = value.indexOf('}}', mustacheStart + 2);
    if (mustacheEnd < 0) {
      output += value.slice(mustacheStart);
      break;
    }
    const expression = value.slice(mustacheStart + 2, mustacheEnd);
    output += `{{${transformMustacheExpression(expression, entries)}}}`;
    cursor = mustacheEnd + 2;
  }
  return output;
}

function transformWxml(source, entries) {
  const replacements = [];
  const tokens = tokenizeWxml(source);
  let cursor = 0;
  let insideWxs = false;
  for (const token of tokens) {
    if (!insideWxs && token.start > cursor) {
      const raw = source.slice(cursor, token.start);
      const value = transformWxmlText(raw, entries);
      if (value !== raw) replacements.push({ start: cursor, end: token.start, value });
    }
    const rawToken = source.slice(token.start, token.end);
    if (!insideWxs && !token.comment && HAN.test(rawToken)) {
      let value = '';
      let tokenCursor = 0;
      while (tokenCursor < rawToken.length) {
        const quoteStart = rawToken.slice(tokenCursor).search(/["']/);
        if (quoteStart < 0) {
          value += rawToken.slice(tokenCursor);
          break;
        }
        const absoluteQuoteStart = tokenCursor + quoteStart;
        const quote = rawToken[absoluteQuoteStart];
        const quoteEnd = skipQuoted(rawToken, absoluteQuoteStart, quote);
        value += rawToken.slice(tokenCursor, absoluteQuoteStart + 1);
        value += transformWxmlText(rawToken.slice(absoluteQuoteStart + 1, quoteEnd - 1), entries);
        value += quote;
        tokenCursor = quoteEnd;
      }
      if (value !== rawToken) replacements.push({ start: token.start, end: token.end, value });
    }
    if (/^<wxs\b/.test(rawToken)) insideWxs = true;
    if (/^<\/wxs\b/.test(rawToken)) insideWxs = false;
    cursor = token.end;
  }
  if (!insideWxs && cursor < source.length) {
    const raw = source.slice(cursor);
    const value = transformWxmlText(raw, entries);
    if (value !== raw) replacements.push({ start: cursor, end: source.length, value });
  }
  return applyReplacements(source, replacements);
}

function applyReplacements(source, replacements) {
  return replacements.sort((a, b) => b.start - a.start).reduce((result, replacement) => (
    result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end)
  ), source);
}

function importPath(fromFile, targetFile) {
  let result = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, '/').replace(/\.js$/, '');
  if (!result.startsWith('.')) result = `./${result}`;
  return result;
}

function injectJavascriptBindings(source, jsFile, localeFile, needsViewData) {
  const hasLocaleBinding = /\bconst\s+localeCopy\s*=\s*require\s*\(/.test(source);
  const needsLocaleBinding = !hasLocaleBinding;
  const resourcePath = importPath(jsFile, localeFile);
  const runtimePath = importPath(jsFile, RUNTIME_FILE);
  const hasRuntimeBinding = /\bconst\s*\{\s*format\s*:\s*localeFormat\s*\}\s*=\s*require\s*\(/.test(source);
  const runtimeBinding = source.includes('localeFormat(') && !hasRuntimeBinding
    ? `const { format: localeFormat } = require('${runtimePath}');\n`
    : '';
  if (!needsLocaleBinding && !runtimeBinding && !needsViewData) return source;
  const bindings = `${needsLocaleBinding ? `const localeCopy = require('${resourcePath}');\n` : ''}${runtimeBinding}`;
  const directive = source.match(/^(['"]use strict['"];?\s*)/);
  const insertAt = directive ? directive[0].length : 0;
  let output = source.slice(0, insertAt) + bindings + source.slice(insertAt);
  if (needsViewData) {
    const dataIndex = output.search(/\bdata\s*:\s*\{/);
    if (dataIndex >= 0) {
      const brace = output.indexOf('{', dataIndex);
      output = output.slice(0, brace + 1) + '\n    localeCopy,' + output.slice(brace + 1);
    } else {
      const registration = output.search(/\b(?:Page|Component)\s*\(\s*\{/);
      if (registration < 0) throw new Error(`无法为 ${relative(jsFile)} 注入页面语言数据`);
      const brace = output.indexOf('{', registration);
      output = output.slice(0, brace + 1) + '\n  data: { localeCopy },' + output.slice(brace + 1);
    }
  }
  return output;
}

function injectNavigationTitle(source) {
  if (source.includes('wx.setNavigationBarTitle')) return source;
  const call = 'wx.setNavigationBarTitle({ title: localeCopy.navigationTitle });';
  const method = source.match(/\bonLoad\s*\([^)]*\)\s*\{/);
  if (method) {
    const brace = method.index + method[0].lastIndexOf('{');
    return source.slice(0, brace + 1) + `\n    ${call}` + source.slice(brace + 1);
  }
  const functionProperty = source.match(/\bonLoad\s*:\s*function\s*\([^)]*\)\s*\{/);
  if (functionProperty) {
    const brace = functionProperty.index + functionProperty[0].lastIndexOf('{');
    return source.slice(0, brace + 1) + `\n    ${call}` + source.slice(brace + 1);
  }
  const registration = source.match(/\bPage\s*\(\s*\{/);
  if (!registration) throw new Error('无法定位 Page 注册以设置导航标题');
  const brace = registration.index + registration[0].lastIndexOf('{');
  return source.slice(0, brace + 1)
    + `\n  onLoad() {\n    ${call}\n  },`
    + source.slice(brace + 1);
}

function transformJson(source, entries) {
  const match = source.match(/"navigationBarTitleText"\s*:\s*"([^"]*)"/);
  if (!match || !HAN.test(match[1])) return { source, navigationTitle: false };
  entries.set('navigationTitle', JSON.stringify(match[1]));
  return {
    source: source.slice(0, match.index)
      + match[0].replace(JSON.stringify(match[1]), '""')
      + source.slice(match.index + match[0].length),
    navigationTitle: true
  };
}

function localeSource(entries) {
  const rows = Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, raw]) => (
    `  ${key}: ${raw}`
  ));
  return `'use strict';\n\nmodule.exports = Object.freeze({\n${rows.join(',\n')}\n});\n`;
}

function parseLocaleModule(source) {
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  return module.exports && typeof module.exports === 'object' ? module.exports : {};
}

function readBaselineLocaleEntries(localeFile) {
  const relativePath = path.relative(ROOT, localeFile).replace(/\\/g, '/');
  let source = '';
  try {
    source = childProcess.execFileSync('git', ['show', `HEAD:${relativePath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (_) {
    return new Map();
  }
  return new Map(Object.entries(parseLocaleModule(source)).map(([key, value]) => [key, JSON.stringify(value)]));
}

function readExistingLocaleEntries(localeFile) {
  const entries = readBaselineLocaleEntries(localeFile);
  if (!fs.existsSync(localeFile)) return entries;
  const current = parseLocaleModule(fs.readFileSync(localeFile, 'utf8'));
  for (const [key, value] of Object.entries(current)) entries.set(key, JSON.stringify(value));
  return entries;
}

const targetPath = path.resolve(ROOT, TARGET);
const files = fs.statSync(targetPath).isDirectory() ? walk(targetPath) : [targetPath];
const groups = new Map();
for (const file of files) {
  const stem = file.replace(/\.(?:js|json|wxml)$/, '');
  if (!groups.has(stem)) groups.set(stem, {});
  groups.get(stem)[path.extname(file).slice(1)] = file;
}

let changedFiles = 0;
let extractedEntries = 0;
for (const [stem, group] of groups) {
  const entries = new Map();
  const sources = {};
  if (group.js) sources.js = transformJavascript(fs.readFileSync(group.js, 'utf8'), entries);
  if (group.wxml) sources.wxml = transformWxml(fs.readFileSync(group.wxml, 'utf8'), entries);
  let navigationTitle = false;
  if (group.json) {
    const transformedJson = transformJson(fs.readFileSync(group.json, 'utf8'), entries);
    sources.json = transformedJson.source;
    navigationTitle = transformedJson.navigationTitle;
  }
  const sourceRelative = path.relative(SOURCE_ROOT, stem);
  const localeFile = path.join(LOCALE_ROOT, `${sourceRelative}.js`);
  const existingEntries = readExistingLocaleEntries(localeFile);
  if (!entries.size) {
    if (!existingEntries.size) continue;
    const source = localeSource(existingEntries);
    const previous = fs.existsSync(localeFile) ? fs.readFileSync(localeFile, 'utf8') : '';
    if (previous !== source && WRITE) {
      fs.mkdirSync(path.dirname(localeFile), { recursive: true });
      fs.writeFileSync(localeFile, source, 'utf8');
      changedFiles += 1;
    }
    continue;
  }
  if (!group.js && group.wxml) throw new Error(`缺少与 ${relative(group.wxml)} 对应的 JS 文件`);
  if (navigationTitle) sources.js = injectNavigationTitle(sources.js);
  sources.js = injectJavascriptBindings(sources.js, group.js, localeFile, Boolean(group.wxml));
  extractedEntries += entries.size;
  const writes = [
    { file: group.js, source: sources.js },
    ...(group.wxml ? [{ file: group.wxml, source: sources.wxml }] : []),
    ...(group.json ? [{ file: group.json, source: sources.json }] : []),
    { file: localeFile, source: localeSource(new Map([...existingEntries, ...entries])) }
  ];
  for (const write of writes) {
    const previous = fs.existsSync(write.file) ? fs.readFileSync(write.file, 'utf8') : '';
    if (previous === write.source) continue;
    changedFiles += 1;
    if (WRITE) {
      fs.mkdirSync(path.dirname(write.file), { recursive: true });
      fs.writeFileSync(write.file, write.source, 'utf8');
    }
  }
}

console.log(`${WRITE ? '已迁移' : '预检'}：${changedFiles} 个文件，${extractedEntries} 条语言资源`);
