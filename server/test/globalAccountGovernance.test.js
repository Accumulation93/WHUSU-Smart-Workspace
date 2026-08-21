const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../src/core/routes/unifiedAuth.js'),
  'utf8'
);

function routeBody(routePath, nextRoutePath) {
  const startMarker = "router.post('" + routePath + "'";
  const start = routeSource.indexOf(startMarker);
  assert(start >= 0, '缺少路由：' + routePath);
  const end = nextRoutePath
    ? routeSource.indexOf("router.post('" + nextRoutePath + "'", start + startMarker.length)
    : routeSource.length;
  assert(end > start, '无法确定路由边界：' + routePath);
  return routeSource.slice(start, end);
}

[
  ['/admin/auth/security/sessions/revoke', '/admin/auth/security/passphrase'],
  ['/admin/auth/security/passphrase', '/admin/auth/security/passphrase/revoke'],
  ['/admin/auth/security/passphrase/revoke', '/auth/recovery/start']
].forEach(([routePath, nextRoutePath]) => {
  const body = routeBody(routePath, nextRoutePath);
  assert(
    body.includes("requireAdminPermission(req, 'auth.accounts.global_manage')"),
    routePath + ' 必须要求全局账号治理权限'
  );
  assert(
    !body.includes("requireAdminPermission(req, 'auth.accounts.recover')"),
    routePath + ' 不得以组织账号恢复权限执行全局写操作'
  );
});

const securityReadBody = routeBody('/admin/auth/security', '/admin/auth/security/sessions/revoke');
assert(securityReadBody.includes("requireAdminPermission(req, 'auth.accounts.recover')"));
assert(securityReadBody.includes('scopeAccountSessions('));
assert(securityReadBody.includes("hasGrantedPermission(actor, 'auth.accounts.global_manage')"));

const recoveriesBody = routeBody('/admin/auth/recoveries', '/admin/auth/accounts');
['issue_codes', 'revoke_codes', 'approve'].forEach((action) => {
  const actionStart = recoveriesBody.indexOf("action === '" + action + "'");
  assert(actionStart >= 0, '缺少恢复操作：' + action);
  const remaining = recoveriesBody.slice(actionStart);
  const nextAction = remaining.indexOf("if (action === '", 1);
  const actionBody = nextAction >= 0 ? remaining.slice(0, nextAction) : remaining;
  assert(
    actionBody.includes("requireAdminPermission(req, 'auth.accounts.global_manage')"),
    action + ' 必须要求全局账号治理权限'
  );
});

console.log('全局账号治理写权限与组织会话隔离契约测试通过');
