'use strict';

/**
 * 用户文案质量审计（针对语言系统里的文案值本身）。
 *
 * 现有 user-visible-copy-audit.js 只检查“业务代码里有没有硬编码文案”，
 * 却整目录跳过 locales/**，导致语言文件里的文案值不受任何规则约束。
 * 本脚本补齐这一层，按已确认的文案规范检查：
 *
 *   R1 首尾空格      R2 以标点开头/结尾   R3 以冒号结尾
 *   R4 符号装饰      R5 半角括号/半角省略号
 *   R6 碎片词条      R7 内部术语黑名单
 *   R8 同一键跨文件文案不一致
 *   R9 引用了不存在的 hash 键（copy_xxxxxxxxxx）
 *   R10 声明但未被引用的 hash 键（死键）
 *
 * 用法：
 *   node scripts/copy-quality-audit.js            # 报告全部命中项
 *   node scripts/copy-quality-audit.js --strict   # 有任何命中项即失败
 *
 * 历史遗留文案由人工逐条改写（禁止脚本批量替换），清零后再接入 --strict 门禁。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MINI_ROOT = path.join(ROOT, 'miniprogram');
const LOCALE_ROOT = path.join(MINI_ROOT, 'locales', 'zh-CN');
const SERVER_LOCALE_ROOT = path.join(ROOT, 'server', 'src', 'locales', 'zh-CN');
const WEB_LOCALE_ROOT = path.join(ROOT, 'web', 'src', 'locales', 'zh-CN');
const HASH_KEY = /^copy_[0-9a-f]{10}$/;

// 单字/单token 碎片：它们只能靠拼接才成句，必须与相邻文案合并。
const FRAGMENT_TOKENS = /^(?:第|步|轮|人|项|条|份|页|次|天|时|分|秒|月|年|日|至|到|由|或|共|已|个|组|台|间|张|位|名|与|及|的|地|中|前|后|上|下|左|右)$/;
// 内部术语：用户不该看到这些词，应改用业务语言。
const INTERNAL_TERMS = /(预检|字段|字典|凭据|缓存|快照|会话|令牌|哈希|枚举|路由|接口|参数|配置项|数据表|库表|自然人合并|匹配到|用户审核|用户分步|工作上下文)/;
const GLYPHS = /[▼▲◀▶✓✗✕○●◯✎⌫⟳]/;

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.name.endsWith('.js')) output.push(full);
  }
  return output;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

// 逐字符读取，避免把转义引号或模板串里的引号当作结束符。
function readLiteral(source, start) {
  const quote = source[start];
  let index = start + 1;
  let text = '';
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      text += source[index + 1] || '';
      index += 2;
      continue;
    }
    if (char === quote) return { text, end: index + 1 };
    text += char;
    index += 1;
  }
  return null;
}

function collectCopy(file) {
  const source = fs.readFileSync(file, 'utf8');
  const entries = [];
  const pattern = /(?:^|\n)\s*(?:([A-Za-z_$][\w$]*)|["']([^"']+)["'])\s*:\s*(['"`])/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const key = match[1] || match[2];
    const literalStart = match.index + match[0].length - 1;
    const literal = readLiteral(source, literalStart);
    if (!literal) continue;
    entries.push({
      file: relative(file),
      key,
      text: literal.text,
      line: source.slice(0, literalStart).split('\n').length
    });
  }
  return entries;
}

function collectReferencedHashKeys() {
  const used = new Set();
  const stack = [MINI_ROOT, path.join(ROOT, 'server', 'src')];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'locales' || entry.name === 'node_modules') continue;
        stack.push(full);
        continue;
      }
      if (!/\.(?:js|wxml|wxs|json)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const found of text.matchAll(/copy_[0-9a-f]{10}/g)) used.add(found[0]);
    }
  }
  return used;
}

const files = walk(LOCALE_ROOT)
  .filter((file) => !file.endsWith(`${path.sep}runtime.js`))
  .concat(fs.existsSync(SERVER_LOCALE_ROOT) ? walk(SERVER_LOCALE_ROOT) : [])
  .concat(fs.existsSync(WEB_LOCALE_ROOT) ? walk(WEB_LOCALE_ROOT) : []);
const entries = files.flatMap(collectCopy);
// 文案质量规则作用于小程序与网页文案；服务端文案本轮只参与“键是否声明”的判定。
const miniEntries = entries.filter((entry) => !entry.file.startsWith('server/'));
const findings = [];

function report(rule, entry, detail) {
  findings.push({
    rule,
    file: entry.file,
    key: entry.key,
    text: entry.text,
    detail: detail || ''
  });
}

const byKey = new Map();
for (const entry of miniEntries) {
  if (!byKey.has(entry.key)) byKey.set(entry.key, []);
  byKey.get(entry.key).push(entry);

  const text = entry.text;
  const hasCjk = /[\u3400-\u9fff]/.test(text);
  if (!hasCjk) continue;

  if (/^\s|\s$/.test(text)) report('R1-首尾空格', entry);
  if (/^[，。、；：！？）】」』.!?,;:)\]]/.test(text) || /[，。、；（【「『,;:(\[]$/.test(text)) report('R2-首尾标点', entry);
  if (/：$|:$/.test(text)) report('R3-尾部冒号', entry);
  if (GLYPHS.test(text)) report('R4-符号装饰', entry);
  if (/[()]/.test(text) || /\.\.\./.test(text)) report('R5-半角标点', entry);
  if (FRAGMENT_TOKENS.test(text.trim())) report('R6-碎片词条', entry);
  if (INTERNAL_TERMS.test(text)) report('R7-内部术语', entry);
}

for (const [key, group] of byKey) {
  // 语义键按页面/模块命名，天然可以逐页不同；只有内容寻址的 hash 键要求跨文件一致。
  if (!HASH_KEY.test(key)) continue;
  const texts = Array.from(new Set(group.map((item) => item.text)));
  if (texts.length > 1) {
    for (const entry of group) report('R8-同键文案不一致', entry, texts.join(' | '));
  }
}

const referenced = collectReferencedHashKeys();
const declared = new Set(entries.map((entry) => entry.key).filter((key) => HASH_KEY.test(key)));
for (const key of referenced) {
  if (HASH_KEY.test(key) && !declared.has(key)) {
    report('R9-引用未声明的键', { file: 'miniprogram/**', key, text: '', line: 0 });
  }
}
const deadKeys = entries.filter((entry) => HASH_KEY.test(entry.key) && !referenced.has(entry.key));
for (const entry of deadKeys) report('R10-死键', entry);

const summary = new Map();
for (const item of findings) summary.set(item.rule, (summary.get(item.rule) || 0) + 1);
console.log(`用户文案质量审计：${files.length} 个语言文件，${entries.length} 条文案值，命中 ${findings.length} 条`);
for (const [rule, count] of Array.from(summary.entries()).sort()) {
  console.log(`  ${rule}: ${count}`);
}
if (findings.length) {
  console.table(findings.slice(0, 200));
  if (findings.length > 200) console.log(`（仅显示前 200 条，共 ${findings.length} 条）`);
}

if (process.argv.includes('--strict') && findings.length) process.exitCode = 1;
