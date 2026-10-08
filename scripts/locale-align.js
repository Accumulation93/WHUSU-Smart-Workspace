'use strict';

/**
 * 共享语言库对齐器。
 *
 * 目标：网页端不得再自己保存任何一条中文文案，只能引用共享语言库
 * （shared/locales/zh-CN/**）。本脚本把网页语言文件里现有的字面量
 * 逐条换成对共享语言库的引用，并报告找不到对应条目的字面量。
 *
 *   node scripts/locale-align.js --report    # 只报告，不写文件
 *   node scripts/locale-align.js --write     # 生成引用式网页语言文件
 *
 * 找不到对应条目的字面量必须人工判断：要么改成共享语言库里的原话，
 * 要么登记为共享语言库新增条目（shared/locales/zh-CN/web.js）。
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const childProcess = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SHARED_ROOT = path.join(ROOT, 'shared', 'locales');
const WEB_LOCALE_ROOT = path.join(ROOT, 'web', 'src', 'locales', 'zh-CN');

/**
 * 网页语言文件到共享语言库模块的对应关系。
 *
 * prefer 里的模块排在前面的优先命中，用于在多个模块含有同一句话时
 * 挑出语义上更贴切的那一份；没有命中就退回到全库搜索。
 */
const VIEWS = {
  'common.js': { webSection: 'common', prefer: ['common.js'] },
  'errors.js': { webSection: 'errors', prefer: [] },
  'hero.js': { prefer: ['generated/components/workspace-hero/workspace-hero.js'] },
  'hr.js': { webSection: 'hr', prefer: [] },
  'system.js': { webSection: 'system', prefer: [] },
  'venue.js': { webSection: 'venue', prefer: [] },
  'verify.js': { webSection: 'verify', prefer: [] },
  'workbench.js': { webSection: 'workbench', prefer: ['main.js'] },
  'workRole.js': { prefer: ['generated/subpackages/org/pages/identitySwitch/identitySwitch.js'] },
  'login.js': { prefer: ['main.js'] },
  'messages.js': { prefer: ['main.js'] },
  'portal.js': { prefer: ['main.js'] },
  'audit.js': {
    webSection: 'audit',
    prefer: [
      'generated/subpackages/audit/pages/mySubmissions/mySubmissions.js',
      'generated/subpackages/audit/pages/pendingApprovals/pendingApprovals.js',
      'generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory.js',
      'generated/subpackages/audit/pages/submissionDetail/submissionDetail.js',
      'generated/subpackages/audit/pages/signatureManager/signatureManager.js',
      'generated/subpackages/audit/pages/verification/verification.js',
      'generated/subpackages/audit/components/signaturePad/signaturePad.js'
    ]
  },
  'scoring.js': {
    webSection: 'scoring',
    prefer: [
      'generated/subpackages/scoring/pages/scorerTasks/scorerTasks.js',
      'generated/subpackages/scoring/pages/score/score.js',
      'generated/subpackages/scoring/pages/admin/admin.js'
    ]
  },
  'signingEvidence.js': { prefer: ['signingEvidence.js'] },
  'time.js': { prefer: ['time.js'] },
  'auditVerification.js': { prefer: ['auditVerification.js'] },
  'admin.js': {
    webSection: 'admin',
    prefer: [
      'generated/subpackages/org/pages/adminPermissions/adminPermissions.js',
      'generated/subpackages/scoring/pages/admin/admin.js'
    ]
  }
};

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (entry.name.endsWith('.js')) output.push(full);
  }
  return output;
}

/** 在沙箱里执行一份 CommonJS 语言模块，返回它的导出对象。 */
function loadCommonJs(file, cache) {
  const normalized = file.replace(/\\/g, '/');
  if (cache.has(normalized)) return cache.get(normalized);
  const source = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  cache.set(normalized, module.exports);
  const sandbox = {
    module,
    exports: module.exports,
    require: (request) => {
      if (!request.startsWith('.')) throw new Error('语言库不允许引用外部模块：' + request);
      const resolved = path.resolve(path.dirname(file), request);
      const candidate = fs.existsSync(resolved) ? resolved : `${resolved}.js`;
      return loadCommonJs(candidate, cache);
    }
  };
  vm.runInNewContext(source, sandbox, { filename: normalized });
  cache.set(normalized, module.exports);
  return module.exports;
}

/** 把任意嵌套对象压平成「路径 -> 字符串」清单。 */
function flatten(value, prefix = '', output = []) {
  if (typeof value === 'string') {
    output.push({ path: prefix, value });
    return output;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      flatten(value[key], prefix ? `${prefix}.${key}` : key, output);
    }
  }
  return output;
}

function sharedIndex() {
  const cache = new Map();
  const modules = new Map();
  const byValue = new Map();
  for (const file of walk(SHARED_ROOT)) {
    const key = path.relative(SHARED_ROOT, file).replace(/\\/g, '/');
    const loaded = loadCommonJs(file, cache);
    const leaves = flatten(loaded);
    modules.set(key, { leaves, loaded });
    for (const leaf of leaves) {
      if (!leaf.value) continue;
      if (!byValue.has(leaf.value)) byValue.set(leaf.value, []);
      byValue.get(leaf.value).push({ module: key, path: leaf.path });
    }
  }
  return { modules, byValue };
}

/** 跳出网页语言文件自身的标识符名（用于生成 import 名）。 */
function importName(moduleKey) {
  const base = path.basename(moduleKey, '.js').replace(/[^\w]/g, '_');
  return `src_${base}`;
}

function sharedImportPath(moduleKey) {
  // 网页侧的共享语言库副本按使用方需要去掉了 zh-CN/ 这一层，导入路径要跟着对齐。
  return `./shared/${moduleKey.replace(/^zh-CN\//, '')}`;
}

async function main() {
  const write = process.argv.includes('--write');
  const index = sharedIndex();
  const report = [];
  const generated = [];

  for (const [file, config] of Object.entries(VIEWS)) {
    const absolute = path.join(WEB_LOCALE_ROOT, file);
    if (!fs.existsSync(absolute)) continue;
    const href = `file://${absolute.replace(/\\/g, '/')}`;
    let source;
    try {
      source = (await import(href)).default;
    } catch (_) {
      // 已经生成过的语言文件只含引用，一旦共享语言库还没补齐就会导入失败；
      // 这时退回读取已提交的原始文案，保证脚本可以反复运行。
      source = committedDefault(absolute);
    }
    const leaves = flatten(source);

    const entries = [];
    const usedModules = new Set();
    for (const leaf of leaves) {
      if (!leaf.value || !/[\u3400-\u9fff]/.test(leaf.value)) {
        // 非中文（纯符号、公式）保留原样，不需要引用语言库。
        entries.push({ path: leaf.path, literal: leaf.value });
        continue;
      }
      const candidates = index.byValue.get(leaf.value) || [];
      const preferred = [];
      for (const moduleKey of config.prefer || []) {
        for (const candidate of candidates) {
          if (candidate.module === moduleKey) preferred.push(candidate);
        }
      }
      const hit = preferred[0] || candidates[0];
      if (hit) {
        usedModules.add(hit.module);
        entries.push({ path: leaf.path, ref: { module: hit.module, path: hit.path } });
        continue;
      }
      // 小程序里确实没有对应说法的网页独有文案，登记在共享语言库的 web.js 分区里。
      const webPath = config.webSection ? `${config.webSection}.${leaf.path}` : '';
      const webModule = index.modules.get('web.js');
      const webHit = webPath && webModule
        ? webModule.leaves.find((item) => item.path === webPath && item.value === leaf.value)
        : null;
      if (!webHit) {
        report.push({ file, path: leaf.path, value: leaf.value });
        entries.push({ path: leaf.path, literal: leaf.value });
        continue;
      }
      usedModules.add('web.js');
      entries.push({ path: leaf.path, ref: { module: 'web.js', path: webPath } });
    }

    generated.push({ file, entries, usedModules: [...usedModules].sort() });
  }

  if (report.length) {
    console.log('共享语言库里找不到对应条目：' + report.length + ' 条');
    for (const item of report) console.log(`  ${item.file}  ${item.path}  ${item.value}`);
  } else {
    console.log('共享语言库里找不到对应条目：0 条');
  }

  if (process.argv.includes('--scaffold')) {
    writeWebSection(report);
  }

  if (!write) {
    console.log('（--report 模式，未写入文件）');
    return;
  }

  for (const item of generated) {
    const names = new Map();
    item.usedModules.forEach((moduleKey) => names.set(moduleKey, importName(moduleKey)));
    const imports = item.usedModules
      .map((moduleKey) => `import ${names.get(moduleKey)} from '${sharedImportPath(moduleKey)}';`)
      .join('\n');

    const lines = [];
    for (const entry of item.entries) {
      const indent = '  '.repeat(entry.path.split('.').length);
      const key = entry.path.split('.').pop();
      const value = entry.ref ? `${names.get(entry.ref.module)}.${entry.ref.path}` : JSON.stringify(entry.literal);
      lines.push(`${indent}${key}: ${value},`);
    }

    const body = `// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。\n`
      + `// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。\n`
      + (imports ? `${imports}\n\n` : '')
      + `export default Object.freeze({\n${lines.join('\n')}\n});\n`;
    fs.writeFileSync(path.join(WEB_LOCALE_ROOT, item.file), body);
    console.log('已生成 web/src/locales/zh-CN/' + item.file);
  }
}

/** 读取某个文件在 HEAD 里的默认导出对象，用于生成脚本的重跑。 */
function committedDefault(absolute) {
  const relative = path.relative(ROOT, absolute).replace(/\\/g, '/');
  const text = childProcess.execFileSync('git', ['show', 'HEAD:' + relative], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  const start = text.indexOf('Object.freeze(');
  if (start < 0) throw new Error('无法从已提交版本里取出默认导出：' + relative);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return vm.runInNewContext('(' + text.slice(open, i + 1) + ')');
      }
    }
  }
  throw new Error('默认导出对象没有闭合：' + relative);
}

/** 把找不到对应条目的文案登记进共享语言库的 web.js 分区。 */
function writeWebSection(report) {
  const sections = new Map();
  const put = (section, leafPath, value) => {
    if (!sections.has(section)) sections.set(section, new Map());
    sections.get(section).set(leafPath, value);
  };

  // 先保留 web.js 里已经登记过的条目，再叠加本次新发现的，
  // 否则一次只带部分分区运行会把已有分区整段删掉。
  const existing = path.join(SHARED_ROOT, 'zh-CN', 'web.js');
  if (fs.existsSync(existing)) {
    const index = sharedIndex();
    const module = index.modules.get('web.js');
    if (module) {
      for (const leaf of module.leaves) {
        const dot = leaf.path.indexOf('.');
        if (dot < 0) continue;
        put(leaf.path.slice(0, dot), leaf.path.slice(dot + 1), leaf.value);
      }
    }
  }

  for (const item of report) {
    const view = VIEWS[item.file];
    const section = view && view.webSection;
    if (!section) continue;
    put(section, item.path, item.value);
  }

  const blocks = [];
  for (const [section, leaves] of sections) {
    const lines = [];
    for (const [leafPath, value] of leaves) {
      const parts = leafPath.split('.');
      lines.push('    '.repeat(parts.length - 1) + parts[parts.length - 1] + ': ' + JSON.stringify(value) + ',');
    }
    // 逐层还原嵌套结构，让登记顺序与网页语言文件的层级保持一致。
    const nested = new Map();
    for (const [leafPath, value] of leaves) {
      const parts = leafPath.split('.');
      let cursor = nested;
      for (let i = 0; i < parts.length - 1; i += 1) {
        if (!cursor.has(parts[i])) cursor.set(parts[i], new Map());
        cursor = cursor.get(parts[i]);
      }
      cursor.set(parts[parts.length - 1], value);
    }
    blocks.push(`  ${section}: Object.freeze(${renderMap(nested, 2)}),`);
  }

  const header = "'use strict';\n\n"
    + '/**\n'
    + ' * 网页版独有的用户可见文案（共享语言库的一部分）。\n'
    + ' *\n'
    + ' * 这里只登记小程序里确实没有对应说法的文案；凡是小程序已有的说法，\n'
    + ' * 网页都必须直接引用小程序那一份，不允许再写一遍。新增文案前先确认小程序侧没有同义句。\n'
    + ' */\n\n';
  const body = 'module.exports = Object.freeze({\n' + blocks.join('\n') + '\n});\n';
  const out = path.join(SHARED_ROOT, 'zh-CN', 'web.js');
  fs.writeFileSync(out, header + body);
  console.log('已登记共享语言库分区：shared/locales/zh-CN/web.js（' + sections.size + ' 个分区）');
}

function renderMap(map, depth) {
  const indent = '  '.repeat(depth);
  const lines = [];
  for (const [key, value] of map) {
    if (value instanceof Map) {
      lines.push(`${indent}${key}: Object.freeze(${renderMap(value, depth + 1)}),`);
    } else {
      lines.push(`${indent}${key}: ${JSON.stringify(value)},`);
    }
  }
  return '{\n' + lines.join('\n') + '\n' + '  '.repeat(depth - 1) + '}';
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
