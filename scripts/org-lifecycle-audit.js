'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const appConfig = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const pages = (appConfig.pages || []).concat(...(appConfig.subPackages || []).map((pkg) => (
  (pkg.pages || []).map((page) => pkg.root + '/' + page)
)));
const lifecycleExempt = new Set([
  'subpackages/main/pages/login/login',
  'subpackages/org/pages/switch/switch',
  'subpackages/venue/pages/venueBookings/venueBookings'
]);
const issues = [];

function add(rule, file, message) {
  issues.push({ rule, file: file.replace(/\\/g, '/'), message });
}

for (const page of pages) {
  const relativeFile = page + '.js';
  const source = fs.readFileSync(path.join(miniRoot, relativeFile), 'utf8');
  if (!lifecycleExempt.has(page)) {
    if (!/require\([^\n]*orgSession/.test(source)) add('missing-org-session', relativeFile, '页面未接入组织快照工具');
    if (!/\bonShow\s*[:(]/.test(source)) add('missing-on-show', relativeFile, '页面缺少 onShow 生命周期');
    if (!/orgSession\.consume\(this\)/.test(source)) add('missing-consume', relativeFile, 'onShow 未消费组织版本');
    if (!/orgSession\.invalidateRequests\(this\)/.test(source)) add('missing-invalidate', relativeFile, '组织变化未使旧请求失效');
  }
}

function walk(dir, extension, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extension, output);
    else if (entry.name.endsWith(extension)) output.push(full);
  }
  return output;
}

for (const file of walk(miniRoot, '.js')) {
  const relativeFile = path.relative(miniRoot, file).replace(/\\/g, '/');
  if (relativeFile === 'utils/api.js' || relativeFile === 'utils/filePreview.js') continue;
  const source = fs.readFileSync(file, 'utf8');
  if (/wx\.(?:request|downloadFile|uploadFile)\s*\(/.test(source)) {
    add('raw-network-call', relativeFile, '页面绕过统一请求客户端');
  }
  if (relativeFile !== 'utils/orgSession.js'
      && /(?:setStorageSync|removeStorageSync)\(\s*['"](?:activeOrgId|activeRole|token)['"]/.test(source)) {
    add('direct-context-write', relativeFile, '组织、角色或令牌必须通过 orgSession 原子提交');
  }
}

for (const file of walk(miniRoot, '.wxml')) {
  const relativeFile = path.relative(miniRoot, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  if (/>\s*{{[^}]*\b(?:openid|hrId|fileId|adminId)\b[^}]*}}\s*</i.test(source)
      || /(?:文件ID|OpenID|数据库编号|随机编号)/i.test(source)) {
    add('visible-internal-id', relativeFile, '可见文本疑似暴露内部技术标识');
  }
}

const apiSource = fs.readFileSync(path.join(miniRoot, 'utils/api.js'), 'utf8');
for (const header of ['Authorization', 'X-Active-Org', 'X-Role', 'X-Client-Version', 'X-Request-Id']) {
  if (!apiSource.includes(header)) add('missing-request-header', 'utils/api.js', '缺少统一请求头 ' + header);
}
if (!apiSource.includes('request_cancelled')) add('missing-cancellation', 'utils/api.js', '缺少明确的过期请求取消语义');

const orgSessionSource = fs.readFileSync(path.join(miniRoot, 'utils/orgSession.js'), 'utf8');
for (const field of ['orgId', 'role', 'token', 'version']) {
  if (!new RegExp('\\b' + field + '\\s*:').test(orgSessionSource)) {
    add('incomplete-context-snapshot', 'utils/orgSession.js', '组织快照缺少 ' + field);
  }
}
if (!/function commitContext\s*\(/.test(orgSessionSource)) {
  add('missing-context-commit', 'utils/orgSession.js', '缺少统一上下文原子提交入口');
}

console.log('组织生命周期审计：' + pages.length + ' 个注册页面，问题 ' + issues.length + ' 个');
if (issues.length) console.table(issues);
if (process.argv.includes('--strict') && issues.length) process.exitCode = 1;
