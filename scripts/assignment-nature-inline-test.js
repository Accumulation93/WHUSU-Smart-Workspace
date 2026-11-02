'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const filename = path.resolve(__dirname, '../miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js');
const session = { beginRequest(host) { return ++host.sequence; }, isRequestCurrent(host, request) { return host.sequence === request; }, getSnapshot() { return { orgId: 'org' }; } };
const sandbox = { module: { exports: {} }, Behavior: value => value, require(name) { if (name.endsWith('/orgSession')) return session; if (name === './adminUtils') return { getErrorText: error => error.message }; return {}; } };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
const methods = sandbox.module.exports.methods;
async function run() {
  let writes = 0, reads = 0, failRead = true;
  const host = { sequence: 0, data: { assignmentNatureCanCreate: true, assignmentNatureName: 'New nature', assignmentNatureSavedId: '', membershipAssignmentFormVisible: true,
    membershipAssignmentForm: { hrId: 'member', organizationId: 'org', departmentId: 'department', identityId: 'identity' }, personIdentityOrganizations: [{ organizationId: 'org', dictionaries: {} }] },
    setData(patch) { for (const [key, value] of Object.entries(patch)) { if (key.startsWith('membershipAssignmentForm.')) this.data.membershipAssignmentForm[key.split('.')[1]] = value; else this.data[key] = value; } },
    async callCloud(name, payload) { if (name === 'saveAssignmentNature') { writes++; assert.equal(payload.name, 'New nature'); return { status: 'success', nature: { id: 'nature' } }; }
      assert.equal(name, 'listPersonIdentities'); assert.equal(payload.hrId, 'member'); reads++;
      if (failRead) return { status: 'error', message: 'read failed' };
      return { status: 'success', organizations: [{ organizationId: 'org', dictionaries: { assignmentNatures: [{ id: 'staff', name: 'Staff' }, { id: 'nature', name: 'New nature' }] } }] }; } };
  await methods.saveInlineAssignmentNature.call(host);
  assert.equal(host.data.assignmentNatureSavedId, 'nature'); assert.equal(host.data.assignmentNatureNotice, 'read failed');
  failRead = false; await methods.saveInlineAssignmentNature.call(host);
  assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(host.data.membershipAssignmentForm.assignmentKind, 'nature');
  assert.equal(host.data.membershipAssignmentForm.departmentId, 'department'); assert.equal(host.data.membershipAssignmentForm.identityId, 'identity');
  assert.equal(host.data.personIdentityOrganizations[0].dictionaries.assignmentNatures[1].id, 'nature');
  host.data.assignmentNatureCanCreate = false; await methods.saveInlineAssignmentNature.call(host); assert.equal(writes, 1);
  console.log('岗位内新增性质：真实方法请求、失败后仅回读、选中新项、保留已填部门身份、更新目录、未授权不写入通过。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
