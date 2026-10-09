'use strict';

// 共用逻辑与共享语言库的唯一源同步。
//
// 小程序根目录固定为 miniprogram/，运行时不能引用目录外的文件；服务端 release 和
// 网页构建目录也各自独立。所以共用内容统一放在 shared/，由本脚本按清单生成各使用方
// 的副本：传 --write 重新生成，不传参数只做一致性校验。
//
//   node scripts/sync-shared-modules.js           # 校验全部副本
//   node scripts/sync-shared-modules.js --write   # 重新生成全部副本

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const MANIFEST = [
  {
    source: 'shared/venueAdminTimeSelection.js',
    targets: [
      { path: 'miniprogram/subpackages/venue/utils/adminTimeSelection.js' },
      { path: 'web/src/shared/venueAdminTimeSelection.js', format: 'esm' }
    ]
  },
  {
    source: 'shared/hrProfileDate.js',
    targets: [
      { path: 'miniprogram/utils/hrProfileDateRules.js' },
      { path: 'web/src/shared/hrProfileDate.js', format: 'esm' }
    ]
  },
  {
    source: 'shared/hrFieldMatching.js',
    targets: [
      { path: 'miniprogram/utils/hrFieldMatching.js' },
      { path: 'server/src/core/services/hrFieldMatching.js' }
    ]
  },
  {
    source: 'shared/apiContracts.js',
    targets: [{ path: 'web/src/shared/apiContracts.js', format: 'esm' }]
  },
  {
    source: 'shared/dateTimeFormat.js',
    targets: [{ path: 'web/src/shared/dateTimeFormat.js', format: 'esm' }]
  }
];

// 共享语言库：shared/locales 是唯一来源，整棵目录镜像给两个使用方。
// 小程序只能读 miniprogram/locales 下的副本，网页只读构建目录里的副本，
// 两份都由本脚本生成，任一侧被手改都会导致检查失败。
const LOCALE_MIRROR = {
  source: 'shared/locales',
  targets: [
    { path: 'miniprogram/locales', format: 'commonjs' },
    { path: 'web/src/locales/zh-CN/shared', format: 'esm', strip: 'zh-CN/' }
  ]
};

// 唯一源路径在使用方目录里的落点。网页侧去掉 zh-CN/ 这一层，导入路径更短。
function localeTargetPath(relative, target) {
  if (!target.strip) return relative;
  if (relative.indexOf(target.strip) !== 0) return '';
  return relative.slice(target.strip.length);
}

function normalize(text) {
  return String(text).replace(/\r\n/g, '\n');
}

// 唯一源的结尾导出写法。
const EXPORT_CONVENTION = /(?:^|\n)module\.exports = (?:Object\.freeze\()?\{([\s\S]*?)\}(?:\))?;\s*$/;

// 唯一源里的相对依赖，网页副本要换成 ES 模块的 import。
const REQUIRE_CONVENTION = /^const (\w+) = require\('\.\/([\w.-]+)'\);\s*$/gm;

// 导出清单只有两种写法：标识符清单（可以换行、带注释）或对象字面量。
// 只有前者需要逐个校验名字，后者整体作为默认导出。
const IDENTIFIER_LIST = /^(?:[A-Za-z_$][\w$]*\s*,\s*)*[A-Za-z_$][\w$]*$/;

function exportNames(capture) {
  const cleaned = capture
    .split('\n')
    .map(function (line) { return line.replace(/\/\/.*$/, '').trim(); })
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!IDENTIFIER_LIST.test(cleaned)) return null;
  return cleaned.split(',').map(function (name) { return name.trim(); });
}

// 把唯一源转换成浏览器可用的 ES 模块。
//
// 只接受一种结尾写法，转换失败时直接报错，避免共用内容在浏览器里悄悄变成
// 另一份实现。唯一源已经用 const/function 声明过导出名，所以只导出既有绑定。
function toEsm(content, target) {
  const match = content.match(EXPORT_CONVENTION);
  if (!match) {
    throw new Error('共用模块必须以 module.exports = { ... }; 结尾才能生成网页副本：' + target);
  }
  const names = exportNames(match[1]);
  // 对象字面量形式的模块（例如语言库）只导出默认对象，不再逐一列命名导出。
  const isObjectLiteral = names === null;
  const head = content
    .slice(0, match.index)
    .replace(REQUIRE_CONVENTION, "import $1 from './$2.js';");
  const body = head + '\nconst sharedModule = Object.freeze({' + match[1] + '});\n';
  const named = isObjectLiteral ? '' : 'export { ' + names.join(', ') + ' };';
  const banner = '// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；'
    + '修改唯一源后重新运行 node scripts/sync-shared-modules.js --write\n';
  return banner + body + '\n' + (named ? named + '\n' : '') + 'export default sharedModule;\n';
}

function entryOf(source) {
  const entry = MANIFEST.find(function (item) { return item.source === source; });
  if (!entry) throw new Error('共用模块未登记：' + source);
  return entry;
}

function syncModule(source, write) {
  const entry = entryOf(source);
  const content = normalize(fs.readFileSync(path.join(ROOT, entry.source), 'utf8'));
  entry.targets.forEach(function (target) {
    const expected = target.format === 'esm' ? toEsm(content, target.path) : content;
    const absolute = path.join(ROOT, target.path);
    if (write) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, expected);
      return;
    }
    if (!fs.existsSync(absolute) || normalize(fs.readFileSync(absolute, 'utf8')) !== expected) {
      throw new Error('共用模块副本不同步：' + target.path);
    }
  });
  return entry.targets;
}

// 列出目录下全部 .js 文件，返回相对该目录的路径。
function walkJs(directory, prefix, output) {
  const list = output || [];
  const base = prefix || '';
  if (!fs.existsSync(directory)) return list;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) walkJs(path.join(directory, entry.name), relative, list);
    else if (entry.name.endsWith('.js')) list.push(relative);
  }
  return list;
}

// 同步共享语言库的整棵目录镜像。
//
// 校验模式下除了逐个比对内容，还要确认使用方目录里没有多余文件，
// 避免有人绕过语言库在自己那一侧新建文案文件。
function syncLocaleMirror(write) {
  const sourceRoot = path.join(ROOT, LOCALE_MIRROR.source);
  if (!fs.existsSync(sourceRoot)) {
    throw new Error('共享语言库目录不存在：' + LOCALE_MIRROR.source);
  }
  const allFiles = walkJs(sourceRoot).sort();
  if (!allFiles.length) throw new Error('共享语言库里没有任何语言文件：' + LOCALE_MIRROR.source);

  LOCALE_MIRROR.targets.forEach(function (target) {
    const targetRoot = path.join(ROOT, target.path);
    if (write) fs.mkdirSync(targetRoot, { recursive: true });
    const existing = walkJs(targetRoot).sort();

    const files = [];
    const mapping = new Map();
    allFiles.forEach(function (relative) {
      const mapped = localeTargetPath(relative, target);
      if (!mapped) return;
      files.push(mapped);
      mapping.set(mapped, relative);
    });
    files.sort();

    const stale = existing.filter(function (relative) { return files.indexOf(relative) < 0; });
    if (stale.length) {
      throw new Error('语言库副本里有不在唯一源中的文件：' + target.path + ' -> ' + stale.join('、'));
    }

    files.forEach(function (relative) {
      const source = normalize(fs.readFileSync(path.join(sourceRoot, mapping.get(relative)), 'utf8'));
      const expected = target.format === 'esm'
        ? toEsm(source, target.path + '/' + relative)
        : source;
      const absolute = path.join(targetRoot, relative);
      if (write) {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, expected);
        return;
      }
      if (!fs.existsSync(absolute) || normalize(fs.readFileSync(absolute, 'utf8')) !== expected) {
        throw new Error('语言库副本不同步：' + target.path + '/' + relative);
      }
    });
  });

  return allFiles.length;
}

function syncAll(write) {
  MANIFEST.forEach(function (entry) { syncModule(entry.source, write); });
  syncLocaleMirror(write);
  return MANIFEST.length;
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const count = syncAll(write);
  const localeCount = walkJs(path.join(ROOT, LOCALE_MIRROR.source)).length;
  console.log((write ? '共用内容副本已重新生成：' : '共用内容副本一致：')
    + count + ' 个模块，' + localeCount + ' 个语言文件');
}

module.exports = { MANIFEST, LOCALE_MIRROR, syncModule, syncLocaleMirror, syncAll, toEsm };
