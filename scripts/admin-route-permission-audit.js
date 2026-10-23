'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); } catch (_) {
  if (process.env.WHUSU_ADMIN_AUDIT_CHILD) throw new Error('无法加载路由解析器');
  const child = cp.spawnSync(process.execPath, ['--expose-internals', __filename, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, WHUSU_ADMIN_AUDIT_CHILD: '1' }
  });
  process.exit(child.status == null ? 1 : child.status);
}
const { ROUTE_RULES } = require('../server/src/core/services/adminPermissions');
const ROOT = path.resolve(__dirname, '../server/src');
const EXPLICIT_SHARED_ROUTES = new Set(['/adminLogin', '/activateOrganization', '/admin/listMyOrganizations', '/unbindRole', '/getRateTargets', '/getMyAdminPermissions', '/listPermissionManagedAdmins', '/getAdminPermissionDetail', '/saveAdminPermissions']);
// 普通端使用通讯录逐人授权；管理端在事务中复核人事读取权限。
EXPLICIT_SHARED_ROUTES.add('/resolvePersonLinks');
// 日程业务同时服务岗位成员和管理员，按具体记录、安排规则及场地权限判权。
// 三个规则管理接口仍必须登记 ROUTE_RULES；真实越权写入由 calendarIntegration 覆盖。
for (const route of ['/getCalendarConfiguration', '/getCalendar', '/saveCalendarEvent',
  '/changeCalendarParticipation', '/saveCalendarParticipants', '/getCalendarParticipants',
  '/exportCalendar', '/manageCalendarSubscription']) EXPLICIT_SHARED_ROUTES.add(route);
function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (entry.name.endsWith('.js') && fullPath.includes(`${path.sep}routes${path.sep}`)) output.push(fullPath);
  }
  return output;
}
function visit(node, callback, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  callback(node, ancestors);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, callback, ancestors.concat(node)));
    else if (value && typeof value.type === 'string') visit(value, callback, ancestors.concat(node));
  }
}
function strings(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return [node.value];
  if (node?.type === 'ArrayExpression') return node.elements.flatMap(strings);
  return [];
}
function inventory(source) {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', locations: true });
  const calls = [], routes = [], unresolved = [], functions = new Map();
  visit(ast, node => {
    if (node.type === 'CallExpression') calls.push(node);
    if (node.type === 'FunctionDeclaration' && node.id) functions.set(node.id.name, node);
    if (node.type === 'VariableDeclarator' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init?.type)) functions.set(node.id.name, node.init);
  });
  function handlerSource(node, seen = new Set()) {
    let body = source.slice(node.start, node.end);
    visit(node, child => {
      const name = child.type === 'CallExpression' && child.callee.type === 'Identifier' ? child.callee.name
        : child.type === 'Identifier' ? child.name : '';
      if (!functions.has(name) || seen.has(name)) return;
      seen.add(name);
      body += '\n' + handlerSource(functions.get(name), seen);
    });
    return body;
  }
  visit(ast, (node, ancestors) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression'
      || node.callee.object.name !== 'router' || !['get', 'post', 'put', 'patch', 'delete'].includes(node.callee.property.name)) return;
    let names = strings(node.arguments[0]);
    if (!names.length) {
      const owner = ancestors.slice().reverse().find(item => item.type === 'FunctionDeclaration');
      const parameter = owner?.params.findIndex(item => item.name === node.arguments[0]?.name);
      if (owner && parameter >= 0) names = calls.filter(call => call.callee.name === owner.id.name).flatMap(call => strings(call.arguments[parameter]));
    }
    const body = handlerSource(node);
    const admin = /ensureAdmin\s*\(|requireAdmin\b|resolveRequestAdmin\s*\(|requireAdminOrganizationPermission\s*\(|resolvePermissionManager\s*\(|actorFromRequest\s*\(|req\.admin(?:Permissions)?\b/.test(body);
    if (!names.length) unresolved.push({ line: node.loc.start.line, admin });
    names.forEach(route => routes.push({ route, method: node.callee.property.name, line: node.loc.start.line, admin }));
  });
  return { routes, unresolved };
}
if (process.argv.includes('--self-test')) {
  const assert = require('assert/strict');
  const example = inventory("router.post(['/one', '/two'], async(req,res)=>{ await ensureAdmin(req); }); router.get('/three', requireAdmin); function register(route){router.post(route, (req,res)=>{ actorFromRequest(req); });} register('/four'); // router.post('/fake', ensureAdmin)\n");
  assert.deepEqual(example.routes.map(row => row.route), ['/one', '/two', '/three', '/four']);
  assert.equal(example.unresolved.length, 0);
  assert.ok(example.routes.every(row => row.admin));
  const factory = inventory("function handler(){return (req,res)=>actorFromRequest(req);} const forwarded=(req,res)=>handler()(req,res); router.post('/factory', handler()); router.delete('/forward', forwarded);");
  assert.ok(factory.routes.every(row => row.admin));
  console.log('路由数组、多种 HTTP 方法、注册函数及注释排除测试通过');
}
const missing = [], unresolved = [];
let total = 0;
for (const file of walk(ROOT)) {
  const found = inventory(fs.readFileSync(file, 'utf8'));
  const relative = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
  total += found.routes.length;
  found.routes.forEach(row => {
    if (row.admin && !EXPLICIT_SHARED_ROUTES.has(row.route) && !ROUTE_RULES.has(row.route)) missing.push({ ...row, file: relative });
  });
  found.unresolved.forEach(row => unresolved.push({ ...row, file: relative }));
}
console.log(`管理员路由权限覆盖审计：识别 ${total} 个路由，缺失 ${missing.length} 个，无法解析 ${unresolved.length} 个`);
if (missing.length) console.table(missing);
if (unresolved.length) console.table(unresolved);
if (process.argv.includes('--strict') && (missing.length || unresolved.length)) process.exitCode = 1;
