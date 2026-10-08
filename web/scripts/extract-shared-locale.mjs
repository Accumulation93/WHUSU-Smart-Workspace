/**
 * 一次性抽取脚本：把小程序语言文件里两端共用的对象抽到共享语言库。
 *
 * 只做机械搬运，不改一个字的文案：从 miniprogram/locales/zh-CN/main.js 里按名字
 * 取出 login / portal / messageCenter 三个对象，写成共享语言库文件，
 * 之后两端都只从共享语言库引用，改一处两端同步。
 *
 * 用法：node scripts/extract-shared-locale.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const source = fs.readFileSync(path.join(repo, 'miniprogram/locales/zh-CN/main.js'), 'utf8');

function bodyOf(name) {
  const start = source.indexOf('const ' + name + ' = Object.freeze({');
  if (start < 0) throw new Error('找不到对象：' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error('对象未闭合：' + name);
}

const targets = [
  { file: 'login.js', name: 'login', note: '登录子应用的用户可见文案' },
  { file: 'portal.js', name: 'portal', note: '门户（应用服务）的用户可见文案' },
  { file: 'messages.js', name: 'messageCenter', note: '消息中心的用户可见文案' }
];

for (const target of targets) {
  const header = "'use strict';\n\n"
    + '/**\n'
    + ' * ' + target.note + '（共享语言库，唯一来源）。\n'
    + ' *\n'
    + ' * 小程序与网页都从这里取文案：网页侧由 scripts/sync-shared-modules.js 生成 ES 模块副本，\n'
    + ' * 小程序侧生成同名 CommonJS 副本，副本不一致时检查直接失败。\n'
    + ' * 修改文案只能改本文件，改完运行 node scripts/sync-shared-modules.js --write。\n'
    + ' */\n\n';
  const object = bodyOf(target.name);
  const needsCommon = /common\./.test(object);
  const body = (needsCommon ? "const common = require('./common');\n\n" : '')
    + 'module.exports = Object.freeze(' + object + ');\n';
  const out = path.join(repo, 'shared/locales/zh-CN', target.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, header + body);
  console.log('已生成 ' + path.relative(repo, out).replace(/\\/g, '/'));
}
