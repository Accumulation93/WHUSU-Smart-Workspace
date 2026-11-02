'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.resolve(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/adminManagementBehavior.js');
const sandbox = { module: { exports: {} }, Behavior: value => value, require: () => ({}), wx: { showToast() {} } };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
async function run() {
  const calls = [], methods = sandbox.module.exports.methods;
  const host = { data: { authorizationEnforced: true, canWriteAdmins: true, canReadAdmins: true, canCreateAdmins: false,
    adminList: [{ id: 'a1', canEdit: true, canDelete: false }], adminForm: { id: 'a1', name: 'Updated', adminLevel: 'admin' } },
    setLoading() {}, resetAdminForm() {}, async loadAdminList() { this.reread = true; },
    async callCloud(name, data) { calls.push({ name, data: data && JSON.parse(JSON.stringify(data)) }); return { status: 'success' }; } };
  await methods.saveAdmin.call(host);
  assert.deepEqual(calls, [{ name: 'saveAdmin', data: { id: 'a1', name: 'Updated', adminLevel: 'admin' } }]);
  assert.equal(host.reread, true);
  await methods.exportAdmins.call(host);
  assert.equal(calls.length, 1, '读取管理员目录不能隐含导出权限');
  host.data.adminDeleteConfirmId = 'a1';
  await methods.confirmDeleteAdmin.call(host);
  assert.equal(calls.length, 1, '可编辑不能隐含删除权限');
  host.data.adminList[0].canEdit = false;
  await methods.saveAdmin.call(host);
  assert.equal(calls.length, 1, '撤销行级编辑授权后不可保存');
  console.log('管理员动作：编辑省略学号并回读、读取不授导出、编辑不授删除、行级撤权拒绝通过。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
