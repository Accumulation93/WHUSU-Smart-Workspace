'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');

// 仅替换存储层；路由、统一身份解析和权限计算仍运行生产实现。
const target = { id: 'target', name: '管理员甲', student_id: 'PRIVATE-STUDENT-001', admin_level: 'admin', org_id: 'org-a' };
function substitute(relative, exports) {
  const id = require.resolve(relative);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
substitute('../src/config/db', {});
substitute('../src/core/models/adminPermission', {
  async listTargets(orgId) { assert.strictEqual(orgId, 'org-a'); return [target]; },
  async getTarget(orgId, id) { return orgId === target.org_id && id === target.id ? target : null; },
  async getOverrides(orgId, adminId) {
    return adminId === 'delegated' ? [{ permission_key: 'permissions.manage_regular_admins', granted: 1 }] : [];
  }
});
substitute('../src/core/models/unifiedIdentity', {
  async listLegacyAdminAuthenticationStates() { return { target: 'verified' }; }
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const role = req.get('X-Test-Role');
  req.logger = { error() {} };
  if (role) {
    req.authAccount = { id: 'account', personId: 'operator-person' };
    req.authContext = {
      personId: 'operator-person', role: 'admin', adminGrantId: 'grant',
      contextId: 'context', organizationId: req.get('X-Test-Org') || 'org-a',
      legacyAdminId: role, adminLevel: role === 'super' ? 'super_admin' : 'admin'
    };
  }
  next();
});
app.use(require('../src/core/routes/adminPermissions'));

(async () => {
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const base = 'http://127.0.0.1:' + listener.address().port;
  async function request(route, role, organization) {
    const headers = { 'Content-Type': 'application/json' };
    if (role) headers['X-Test-Role'] = role;
    if (organization) headers['X-Test-Org'] = organization;
    const response = await fetch(base + route, { method: 'POST', headers, body: JSON.stringify({ adminId: target.id }) });
    return { status: response.status, body: await response.json() };
  }
  try {
    for (const role of ['super', 'delegated']) {
      for (const route of ['/listPermissionManagedAdmins', '/getAdminPermissionDetail']) {
        const response = await request(route, role);
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.status, 'success');
        const admin = response.body.admin || response.body.list[0];
        assert.strictEqual(admin.name, target.name);
        assert.strictEqual(Object.hasOwn(admin, 'studentId'), false);
        assert.strictEqual(Object.hasOwn(admin, 'student_id'), false);
        assert.strictEqual(JSON.stringify(response.body).includes(target.student_id), false);
      }
    }
    assert.strictEqual((await request('/getAdminPermissionDetail', 'super', 'org-b')).status, 403);
    assert.strictEqual((await request('/listPermissionManagedAdmins', 'unprivileged')).status, 403);
    assert.strictEqual((await request('/getAdminPermissionDetail')).status, 403);
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }

  const pagePath = path.resolve(__dirname, '../../miniprogram/subpackages/org/pages/adminPermissions/adminPermissions');
  let definition;
  vm.runInNewContext(fs.readFileSync(pagePath + '.js', 'utf8'), {
    Page(value) { definition = value; }, require() { return {}; }
  });
  const page = { data: { admins: [{ name: target.name, studentId: target.student_id, adminLevelLabel: '普通管理员' }] }, setData(value) { Object.assign(this.data, value); } };
  definition.onKeywordInput.call(page, { detail: { value: target.student_id } });
  assert.strictEqual(page.data.filteredAdmins.length, 0);
  definition.onKeywordInput.call(page, { detail: { value: target.name } });
  assert.strictEqual(page.data.filteredAdmins.length, 1);
  assert.strictEqual(/studentId|student_id/.test(fs.readFileSync(pagePath + '.wxml', 'utf8')), false);
  console.log('权限目录与详情的学号保护、跨组织拒绝及小程序搜索测试通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
