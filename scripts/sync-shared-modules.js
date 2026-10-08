'use strict';

/**
 * 共用模块唯一源与运行时副本同步。
 *
 * 小程序的项目根目录固定为 miniprogram/，运行时不能引用目录外的文件；
 * 服务端 release 和网页构建目录也各自独立。所以共用逻辑统一放在 shared/，
 * 由本脚本按清单生成各使用方的副本：传 --write 重新生成，不传参数只做一致性校验。
 *
 * 副本格式按使用方决定：Node 与小程序使用 CommonJS 原样复制，
 * 浏览器构建使用由唯一源机械转换出的 ES 模块，避免两套实现各自演化。
 *
 *   node scripts/sync-shared-modules.js           # 校验全部副本
 *   node scripts/sync-shared-modules.js --write   # 重新生成全部副本
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const MANIFEST = [
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

function normalize(text) {
  return String(text).replace(/\r\n/g, '\n');
}

const EXPORT_CONVENTION = /\nmodule\.exports = \{([\s\S]*?)\};\s*$/;

/**
 * 把唯一源转换成浏览器可用的 ES 模块。
 *
 * 只接受一种结尾写法：最后一行的 module.exports = { 标识符清单 };
 * 转换失败时直接报错，避免共用模块在浏览器里悄悄变成另一份实现。
 */
function toEsm(content, target) {
  const match = content.match(EXPORT_CONVENTION);
  if (!match) {
    throw new Error('共用模块必须以 module.exports = { ... }; 结尾才能生成网页副本：' + target);
  }
  const names = match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .map((line) => line.replace(/,$/, '').trim());
  const invalid = names.filter((name) => !/^[A-Za-z_$][\w$]*$/.test(name));
  if (invalid.length) {
    throw new Error('共用模块导出清单只能写标识符名：' + target + ' -> ' + invalid.join('、'));
  }
  const body = content.slice(0, match.index) + '\nconst sharedModule = {' + match[1] + '};\n';
  // 唯一源已经用 const/function 声明过这些名字，只能导出既有绑定，
  // 不能再写 export const，否则会重复声明。
  const named = 'export { ' + names.join(', ') + ' };';
  const banner = '// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；'
    + '修改唯一源后重新运行 node scripts/sync-shared-modules.js --write\n';
  return banner + body + '\n' + named + '\nexport default sharedModule;\n';
}

function entryOf(source) {
  const entry = MANIFEST.find((item) => item.source === source);
  if (!entry) throw new Error('共用模块未登记：' + source);
  return entry;
}

function syncModule(source, write) {
  const entry = entryOf(source);
  const content = normalize(fs.readFileSync(path.join(ROOT, entry.source), 'utf8'));
  entry.targets.forEach((target) => {
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

function syncAll(write) {
  MANIFEST.forEach((entry) => syncModule(entry.source, write));
  return MANIFEST.length;
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const count = syncAll(write);
  console.log(write
    ? '共用模块副本已重新生成：' + count + ' 个模块'
    : '共用模块副本一致：' + count + ' 个模块');
}

module.exports = { MANIFEST, syncModule, syncAll, toEsm };
