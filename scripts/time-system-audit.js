'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'miniprogram_npm', 'coverage', 'dist']);
const SERVER_SKIP_DIRECTORIES = new Set([
  ...SKIP_DIRECTORIES,
  'test',
  'tests',
  '__tests__',
  'fixtures',
  '__fixtures__',
  'mocks',
  '__mocks__'
]);
// timeStart/timeEnd 既可能是绝对时间，也可能是 HH:mm 业务钟点，不能仅凭字段名误判。
// 绝对时间接口必须在视图模型阶段改名为 *Text；日期、每日钟点、时长和偏移值保持原语义。
const ABSOLUTE_TIME_ACTION = '(?:created|updated|processed|signed|expires?|expired|approved|rejected|reviewed|submitted|completed|deleted|joined|left|revoked|bound|verified|consumed|read|published|requested|required|available|checked|touched|invited|selected|seen|locked|used|starts?|started|ends?|ended)';
const RAW_ABSOLUTE_FIELD_PATTERN = new RegExp(`(?:${ABSOLUTE_TIME_ACTION}(?:At|Until)|${ABSOLUTE_TIME_ACTION}_(?:at|until))$`, 'i');
const NON_ABSOLUTE_FIELD_PATTERN = /(?:Text|Date|DateText|Time|TimeText|Clock|Duration|Milliseconds|Seconds|Minutes|Hours|Days|Weeks|Months|Years|Timezone|TimezoneOffset|UtcOffset|Offset|Interval|Period)$/i;
const ISO_LITERAL_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/g;
const LOCALE_TIME_PATTERN = /\.(?:toLocaleString|toLocaleDateString|toLocaleTimeString)\s*\(/g;
const DEVICE_LOCAL_DATE_GETTER_PATTERN = /\.(?:getFullYear|getMonth|getDate|getHours|getMinutes|getDay)\s*\(/g;
const MANUAL_UTC_PATTERN = /\.toISOString\s*\(\s*\)[\s\S]{0,160}?(?:\.slice\s*\(|\.substring\s*\(|\.substr\s*\(|\.split\s*\(\s*['"]T['"]|\.replace\s*\(\s*['"]T['"])/g;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function listFiles(root, relativeDirectory, extensions, skipDirectories = SKIP_DIRECTORIES) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const visit = (current) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      if (entry.isDirectory() && skipDirectories.has(entry.name)) return;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(absolutePath);
    });
  };
  visit(directory);
  return files;
}

function isRawAbsoluteTimeField(fieldName) {
  if (!fieldName || NON_ABSOLUTE_FIELD_PATTERN.test(fieldName)) return false;
  return RAW_ABSOLUTE_FIELD_PATTERN.test(fieldName);
}

function isLocaleReference(expression, tokenIndex) {
  const prefix = expression.slice(0, tokenIndex);
  return /(?:^|[^A-Za-z0-9_$])(?:localeCopy|locale|i18n|translations?)\s*\.\s*$/i.test(prefix);
}

function isDatabaseTimeTextContext(source, index) {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  const nextLineBreak = source.indexOf('\n', index);
  const lineEnd = nextLineBreak < 0 ? source.length : nextLineBreak;
  const line = source.slice(lineStart, lineEnd);
  return /\b(?:sql|db|database|mysql|query|execute|insert|update|upsert|persist|stored?|record|row|createdAt|created_at|updatedAt|updated_at|processedAt|processed_at|expiresAt|expires_at)\w*\b/i.test(line);
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function addFinding(findings, file, source, index, rule, detail) {
  const position = lineAndColumn(source, index);
  findings.push({ file, line: position.line, column: position.column, rule, detail });
}

function maskJavaScriptComments(source) {
  const chars = source.split('');
  let state = 'normal';
  let escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1] || '';
    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') state = 'normal';
      else chars[index] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        index += 1;
        state = 'normal';
      } else if (char !== '\n' && char !== '\r') chars[index] = ' ';
      continue;
    }
    if (state !== 'normal') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if ((state === 'single' && char === "'")
        || (state === 'double' && char === '"')
        || (state === 'template' && char === '`')) state = 'normal';
      continue;
    }
    if (char === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'block-comment';
    } else if (char === "'") state = 'single';
    else if (char === '"') state = 'double';
    else if (char === '`') state = 'template';
  }
  return chars.join('');
}

function maskXmlComments(source) {
  const chars = source.split('');
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('<!--', index);
    if (start < 0) break;
    const end = source.indexOf('-->', start + 4);
    const limit = end < 0 ? source.length : end + 3;
    for (let cursor = start; cursor < limit; cursor += 1) {
      if (chars[cursor] !== '\n' && chars[cursor] !== '\r') chars[cursor] = ' ';
    }
    index = limit;
  }
  return chars.join('');
}

// 逐字符提取 Mustache，避免把属性字符串中的 > 或引号误认为标签边界。
function extractMustacheExpressions(source) {
  const expressions = [];
  let index = 0;
  while (index < source.length - 1) {
    if (source[index] !== '{' || source[index + 1] !== '{') {
      index += 1;
      continue;
    }
    const start = index;
    index += 2;
    let quote = '';
    let escaped = false;
    while (index < source.length - 1) {
      const char = source[index];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '}' && source[index + 1] === '}') {
        expressions.push({ start, text: source.slice(start + 2, index) });
        index += 2;
        break;
      }
      index += 1;
    }
  }
  return expressions;
}

function scanIsoLiterals(findings, file, source) {
  ISO_LITERAL_PATTERN.lastIndex = 0;
  let match;
  while ((match = ISO_LITERAL_PATTERN.exec(source))) {
    addFinding(findings, file, source, match.index, 'ui-iso-literal', '用户界面代码中出现 ISO UTC 裸字符串');
  }
}

function scanWxml(findings, file, source) {
  const searchableSource = maskXmlComments(source);
  extractMustacheExpressions(searchableSource).forEach((expression) => {
    const tokenPattern = /[A-Za-z_$][A-Za-z0-9_$]*/g;
    let token;
    while ((token = tokenPattern.exec(expression.text))) {
      if (isLocaleReference(expression.text, token.index)) continue;
      if (!isRawAbsoluteTimeField(token[0])) continue;
      addFinding(
        findings,
        file,
        source,
        expression.start + 2 + token.index,
        'wxml-raw-absolute-time',
        `WXML 直接渲染绝对时间字段 ${token[0]}`
      );
    }
  });
  scanIsoLiterals(findings, file, searchableSource);
}

function scanMiniProgramJavaScript(findings, file, source) {
  const searchableSource = maskJavaScriptComments(source);
  LOCALE_TIME_PATTERN.lastIndex = 0;
  let match;
  while ((match = LOCALE_TIME_PATTERN.exec(searchableSource))) {
    addFinding(findings, file, source, match.index, 'device-locale-time', '页面代码使用设备本地时区格式化时间');
  }
  if (/\/pages\/.*\.js$/i.test(file)) {
    DEVICE_LOCAL_DATE_GETTER_PATTERN.lastIndex = 0;
    while ((match = DEVICE_LOCAL_DATE_GETTER_PATTERN.exec(searchableSource))) {
      addFinding(
        findings,
        file,
        source,
        match.index,
        'device-local-date-getter',
        '业务页面直接读取设备本地年月日时分或星期，应使用 utils/dateTime 系统时区工具'
      );
    }
  }
  scanIsoLiterals(findings, file, searchableSource);
}

function scanServerJavaScript(findings, file, source) {
  const searchableSource = maskJavaScriptComments(source);
  MANUAL_UTC_PATTERN.lastIndex = 0;
  let match;
  while ((match = MANUAL_UTC_PATTERN.exec(searchableSource))) {
    if (!isDatabaseTimeTextContext(searchableSource, match.index)) continue;
    addFinding(findings, file, source, match.index, 'manual-utc-sql-text', '服务端手工截断或拼接 UTC 数据库文本');
  }
}

function scanRepository(root = DEFAULT_ROOT) {
  const findings = [];
  listFiles(root, 'miniprogram', new Set(['.js', '.wxs', '.wxml', '.json'])).forEach((absolutePath) => {
    const relativePath = toPosix(path.relative(root, absolutePath));
    const source = fs.readFileSync(absolutePath, 'utf8');
    if (absolutePath.endsWith('.wxml')) scanWxml(findings, relativePath, source);
    else if (relativePath !== 'miniprogram/utils/dateTime.js') {
      scanMiniProgramJavaScript(findings, relativePath, source);
    }
  });
  listFiles(root, 'server', new Set(['.js', '.cjs', '.mjs']), SERVER_SKIP_DIRECTORIES).forEach((absolutePath) => {
    const relativePath = toPosix(path.relative(root, absolutePath));
    scanServerJavaScript(findings, relativePath, fs.readFileSync(absolutePath, 'utf8'));
  });
  return findings.sort((left, right) => (
    left.file.localeCompare(right.file) || left.line - right.line || left.column - right.column
  ));
}

function parseArguments(argv) {
  const options = { root: DEFAULT_ROOT, strict: false, json: false };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--strict') options.strict = true;
    else if (argv[index] === '--json') options.json = true;
    else if (argv[index] === '--root') options.root = path.resolve(argv[++index] || '');
    else throw new Error(`未知参数: ${argv[index]}`);
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv);
  const findings = scanRepository(options.root);
  if (options.json) {
    process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + '\n');
  } else if (!findings.length) {
    console.log('[time-audit] 未发现时间体系违规');
  } else {
    findings.forEach((finding) => {
      console.error(`${finding.file}:${finding.line}:${finding.column} [${finding.rule}] ${finding.detail}`);
    });
    console.error(`[time-audit] 共发现 ${findings.length} 项违规`);
  }
  if (options.strict && findings.length) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[time-audit] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  RAW_ABSOLUTE_FIELD_PATTERN,
  NON_ABSOLUTE_FIELD_PATTERN,
  DEVICE_LOCAL_DATE_GETTER_PATTERN,
  isRawAbsoluteTimeField,
  isLocaleReference,
  isDatabaseTimeTextContext,
  extractMustacheExpressions,
  maskJavaScriptComments,
  maskXmlComments,
  scanRepository,
  parseArguments
};
