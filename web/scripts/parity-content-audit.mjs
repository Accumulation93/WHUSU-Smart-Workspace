/**
 * 提示语与图标逐条对照（网页 vs 小程序）。
 *
 * 用法：node scripts/parity-content-audit.mjs
 *
 * 它做两件事：
 * 1. 提示语：把小程序对应页面用到的语言值取出来，和网页同页面的语言值做集合对照，
 *    输出「小程序有、网页没有」和「网页有、小程序没有」两列，逐条列出。
 * 2. 图标：把小程序对应 WXML 里用到的 ui-icon 名称和网页同页面的图标做对照。
 *
 * 退出码：存在缺失提示语或缺失图标时为 1，便于接进检查脚本。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');

/** 每一个条目把小程序页面与网页页面对应起来。 */
const PAGES = [
  {
    name: '门户',
    miniLocales: [['miniprogram/locales/zh-CN/main.js', 'portal']],
    miniWxml: ['miniprogram/subpackages/main/pages/portal/portal.wxml'],
    webLocale: 'web/src/locales/zh-CN/portal.js',
    webViews: ['web/src/views/PortalView.vue']
  },
  {
    name: '消息中心',
    miniLocales: [['miniprogram/locales/zh-CN/main.js', 'messageCenter']],
    miniWxml: ['miniprogram/subpackages/message/pages/messageCenter/messageCenter.wxml'],
    webLocale: 'web/src/locales/zh-CN/messages.js',
    webViews: ['web/src/views/MessagesView.vue', 'web/src/components/MessageRow.vue']
  },
  {
    name: '登录',
    miniLocales: [['miniprogram/locales/zh-CN/main.js', 'login']],
    miniWxml: ['miniprogram/subpackages/main/pages/login/login.wxml'],
    webLocale: 'web/src/locales/zh-CN/login.js',
    webViews: ['web/src/views/LoginView.vue']
  },
  {
    name: '工作角色切换',
    miniLocales: [
      ['miniprogram/locales/zh-CN/generated/subpackages/org/pages/identitySwitch/identitySwitch.js', null]
    ],
    miniWxml: ['miniprogram/subpackages/org/pages/identitySwitch/identitySwitch.wxml'],
    webLocale: 'web/src/locales/zh-CN/workRole.js',
    webViews: ['web/src/views/WorkRoleView.vue']
  },
  {
    name: '共享 Hero',
    miniLocales: [['miniprogram/locales/zh-CN/generated/components/workspace-hero/workspace-hero.js', null]],
    miniWxml: ['miniprogram/components/workspace-hero/workspace-hero.wxml'],
    webLocale: 'web/src/locales/zh-CN/hero.js',
    webViews: ['web/src/components/WorkspaceHero.vue']
  }
];

function read(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8');
}

/** 取出源码里某个 `const name = Object.freeze({ ... });` 的对象体。 */
function objectBody(source, name) {
  if (!name) return source;
  const start = source.indexOf('const ' + name + ' = Object.freeze({');
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

/** 源码里的中文文案值（只取字符串字面量里的中文）。 */
function copyValues(source) {
  const values = new Set();
  const pattern = /(['"`])((?:[^'"`\\]|\\.)*?)\1/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const text = match[2].trim();
    if (text && /[\u4e00-\u9fff]/.test(text)) values.add(text);
  }
  return values;
}

function iconNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/ui-icon[^>]*name="([a-z-]+)"/g)) names.add(match[1]);
  for (const match of source.matchAll(/<UiIcon[^>]*name="([a-z-]+)"/g)) names.add(match[1]);
  for (const match of source.matchAll(/:name="'([a-z-]+)'"/g)) names.add(match[1]);
  return names;
}

let failures = 0;

/**
 * 网页端不提供的能力，对应的提示语不算差异。
 * 每一条都注明原因，便于以后小程序新增同类能力时重新评估。
 */
const WEB_UNSUPPORTED = [
  // 浏览器没有相机扫码入口，网页端不提供扫一扫
  '扫一扫', '扫到的内容', '这不是站内地址，可复制后用浏览器打开', '复制内容',
  '暂时无法打开扫一扫，请检查相机权限后重试',
  // 网页端只做口令登录，不做微信登录、绑定、认证码与恢复码
  '微信登录', '请重新微信登录', '请填写组织、姓名和学号', '提交失败，请重试',
  '请输入个人认证码', '请检查认证码', '请输入恢复码或恢复口令', '请检查恢复信息',
  '账号恢复码', '恢复口令', '登录提示', '请输入姓名', '姓名', '所属组织', '请选择组织',
  '继续', '暂未开放认证', '提交恢复请求', '更换微信', '返回身份认证', '绑定当前微信',
  '确认绑定', '暂不绑定', '绑定成功', '未绑定，请稍后重试', '关闭 ×',
  '提交后可使用恢复码或恢复口令，也可以等待管理员审核。',
  '填写姓名和学号后，再输入管理员提供的个人认证码。',
  '使用已设置的口令登录',
  '页面打开失败，请重试', '请使用本人微信登录', '输入个人认证码', '验证恢复信息',
  '保存新的恢复码', '等待管理员审核', '身份认证', '已通过口令登录。是否为该账号绑定当前微信，方便下次登录？也可以跳过。',
  '当前微信已绑定其他账号，本次为临时登录，无法绑定当前微信。', '进入工作台', '返回微信登录',
  '请向所属组织的管理员获取个人认证码。认证码有效期为 24 小时，使用后失效。', '个人认证码',
  '请输入 12 位认证码', '完成身份认证', '返回修改信息',
  '如果没有可用的恢复方式，请等待其他管理员审核。审核通过后，用当前微信重新登录。',
  '恢复方式', '确认更换微信', '请保存新的恢复码。关闭后不再显示。', '复制恢复码', '完成',
  '恢复申请已提交。请等待其他管理员审核，审核通过后用当前微信重新登录。',
  '登录', '暂时无法确认登录状态，可重试或手动登录', '账号已被冻结，登录后可查看处理方式',
  '重试', '去登录', '待办',
  // 网页端不做跨组织跳转与消息范围筛选
  '跨组织事项', '切换到以下组织后查看', '切换并查看', '目标组织', '请重新选择组织',
  '请重新选择工作角色', '切换工作角色后查看', '切换组织与工作角色后查看', '切换失败，请重试',
  '组织范围', '选择组织范围', '请重新选择组织或工作角色', '部分未完成', '操作未完成，请重试',
  // 无障碍标签与提示位，网页用 aria-label 表达
  '加载提示', '工作角色提示', '待办类型', '通知类型',
  // 网页端在登录页脚展示组织名，门户不再重复
  '武汉大学学生会'
];

for (const page of PAGES) {
  const miniCopy = new Set();
  for (const [file, object] of page.miniLocales) {
    if (!fs.existsSync(path.join(repo, file))) {
      console.log(`[跳过] 找不到小程序语言文件 ${file}`);
      continue;
    }
    copyValues(objectBody(read(file), object)).forEach((value) => miniCopy.add(value));
  }

  const webCopy = copyValues(read(page.webLocale));

  const allMissing = [...miniCopy].filter((value) => !webCopy.has(value));
  const missing = allMissing.filter((value) => !WEB_UNSUPPORTED.includes(value));
  const unsupported = allMissing.length - missing.length;
  const extra = [...webCopy].filter((value) => !miniCopy.has(value));

  const miniIcons = new Set();
  for (const file of page.miniWxml) iconNames(read(file)).forEach((name) => miniIcons.add(name));
  const webIcons = new Set();
  for (const file of page.webViews) iconNames(read(file)).forEach((name) => webIcons.add(name));
  const missingIcons = [...miniIcons].filter((name) => !webIcons.has(name));

  console.log('');
  console.log('=== ' + page.name + ' ===');
  console.log(
    '提示语：小程序 ' + miniCopy.size + ' 条，网页 ' + webCopy.size + ' 条，'
      + '一致 ' + (miniCopy.size - missing.length) + ' 条'
  );
  if (missing.length) {
    console.log('  小程序有、网页没有（' + missing.length + ' 条）：');
    missing.forEach((value) => console.log('    - ' + value));
  }
  if (unsupported) {
    console.log('  网页端不提供的能力（' + unsupported + ' 条，不计入差异）');
  }
  if (extra.length) {
    console.log('  网页有、小程序没有（' + extra.length + ' 条）：');
    extra.forEach((value) => console.log('    + ' + value));
  }
  if (missingIcons.length) {
    console.log('  小程序用到、网页没用到的图标：' + missingIcons.join('、'));
  }
  failures += missing.length + missingIcons.length;
}

console.log('');
console.log('差异合计：' + failures + ' 项');
if (failures) process.exitCode = 1;
