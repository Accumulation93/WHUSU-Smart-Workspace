'use strict';
const assert = require('node:assert/strict');
const express = require('express');
function substitute(relative, exports) { const id = require.resolve(relative); require.cache[id] = { id, filename: id, loaded: true, exports }; }
const calls = [];
substitute('../src/config/db', { async query(sql, values) {
  assert.deepEqual(values, ['org-a']); calls.push(sql);
  assert(!/student_id/i.test(sql), '审核目录不得读取学号');
  if (sql.includes('FROM hr_info h')) return [[{ id: 'hr-a', name: '成员甲', student_id: 'PRIVATE-STUDENT' }, { id: 'hr-empty', name: '无岗位成员' }]];
  if (sql.includes('FROM membership_assignments ma')) return [[{ assignment_id: 'assignment-a', hr_id: 'hr-a', department_id: 'dept-a', department_name: '部门甲', identity_id: 'identity-a', identity_name: '成员', student_id: 'PRIVATE-STUDENT' }]];
  throw Error('unexpected_query');
} });
for (const name of ['department','identity','workGroup']) substitute('../src/core/models/' + name, { getAll: async () => [{ id: name, name: '字典', student_id: 'PRIVATE-STUDENT', description: '不需要的详情' }] });
substitute('../src/core/models/adminPermission', { getOverrides: async (orgId, adminId) => ['allowed','blocked'].includes(adminId)
  ? [{ permission_key: 'audit.templates', granted: adminId === 'allowed' ? 1 : 0 }, { permission_key: 'audit.verification', granted: adminId === 'allowed' ? 1 : 0 }] : [] });
const { orgStorage } = require('../src/utils/orgContext');
const app = express(); app.use(express.json());
app.use((req, res, next) => {
  const selected = req.get('X-Test-Role');
  if (selected) { req.authAccount = { id: 'account-a', personId: 'operator' }; req.authContext = { role: selected === 'user' ? 'user' : 'admin',
    personId: 'operator', contextId: 'context-a', organizationId: 'org-a', adminGrantId: 'grant-a', legacyAdminId: selected,
    adminLevel: selected === 'super' ? 'super_admin' : 'admin' }; }
  orgStorage.run('org-a', next);
});
app.use('/api', require('../src/middleware/adminPermission').adminPermissionMiddleware, require('../src/modules/audit/routes/auditAdmin'));
async function main() {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const endpoint of ['getAuditTemplateEditorData','listAuditVerificationCandidates']) {
      for (const role of ['super','allowed','blocked','user','']) {
        const response = await fetch(base + '/api/' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) }, body: '{}' });
        const result = await response.json();
        if (role === 'super' || role === 'allowed') {
          assert.equal(result.status, 'success'); assert(!JSON.stringify(result).includes('PRIVATE-STUDENT'));
          const members = result.data ? result.data.people : result.candidates;
          assert.equal(members.length, 2); assert.equal(members[1].assignments.length, 0, '在职无岗位人员保留在自然人授权目录');
          assert.equal(members[0].assignments[0].assignmentId, 'assignment-a');
        } else assert.notEqual(result.status, 'success', '未认证、普通用户及细权限明确拒绝均不能读取');
      }
    }
    assert.equal(calls.length, 8, '每次成功目录查询只有两次人员查询，拒绝请求不读取目录');
    console.log('审核专用目录 HTTP 验证通过：两类管理员、细权限拒绝、未认证、组织参数、无岗位与身份隐私');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
