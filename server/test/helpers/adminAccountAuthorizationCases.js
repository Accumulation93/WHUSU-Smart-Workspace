'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function adminAccountAuthorizationCases(db) {
  await db.query(`INSERT INTO organizations(id,name) VALUES ('admin-auth','管理身份测试');
    INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('admin-actor','管理人','ADMIN-A','ADMIN-A');
    INSERT INTO accounts(id,person_id) VALUES ('admin-account','admin-actor');
    INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('admin-target','新增管理身份','ADMIN-B','ADMIN-B');
    INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('admin-target-hr','新增管理身份','ADMIN-B','admin-auth');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('admin-target-member','admin-target','admin-auth','admin-target-hr');
    INSERT INTO admin_info(id,name,student_id,admin_level,org_id) VALUES ('admin-legacy','管理人','ADMIN-A','admin','admin-auth');
    INSERT INTO admin_grants(id,person_id,org_id,admin_level,legacy_admin_id) VALUES ('admin-grant','admin-actor','admin-auth','admin','admin-legacy');
    INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES ('admin-session','admin-account','','admin-context','admin','admin-grant','admin-auth','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY);
    INSERT INTO authorization_organizations(org_id,mode) VALUES ('admin-auth','enforced') ON DUPLICATE KEY UPDATE mode='enforced'`);
  const policy = { id: 'admin-policy', organizationId: 'admin-auth', effect: 'allow', enabled: true,
    subjects: [{ kind: 'adminGrants', ids: ['admin-grant'] }],
    capabilities: ['system.adminAccounts.read','system.adminAccounts.create','system.adminAccounts.update','system.adminAccounts.delete','system.adminAccounts.export',
      'files.tables.parse','files.tables.build'],
    scopes: [{ kind: 'organization' }], fields: null };
  await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('admin-policy','admin-auth','管理身份维护',?)", [JSON.stringify(policy)]);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.authAccount = { id: 'admin-account', personId: 'admin-actor' };
    req.authSession = { id: 'admin-session' };
    req.authContext = { personId: 'admin-actor', contextId: 'admin-context', organizationId: 'admin-auth', role: 'admin',
      adminGrantId: 'admin-grant', legacyAdminId: 'admin-legacy', adminLevel: 'admin' };
    req.logger = { error: (...args) => console.error(...args) };
    next();
  });
  app.use('/api', require('../../src/middleware/adminPermission').adminPermissionMiddleware);
  app.use('/api', require('../../src/core/routes/admin'));
  app.use('/api', require('../../src/core/routes/buildTableFile'));
  app.use('/api', require('../../src/core/routes/parseTableFile'));
  const listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  async function call(name, body = {}) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + name, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return { code: response.status, data: await response.json() };
  }
  try {
    const candidates = await call('getAdminAccountCandidates');
    assert.deepEqual(candidates.data.list, [{ hrId: 'admin-target-hr', name: '新增管理身份' }]);
    const workbook = await call('buildTableFile', { headers: [{ key: 'name', label: '姓名' }], rows: [{ name: '表格测试' }], format: 'xlsx' });
    assert.equal(workbook.data.status, 'success');
    const parsed = await call('parseTableFile', { fileBase64: workbook.data.fileBase64, fileName: 'test.xlsx' });
    assert.deepEqual(parsed.data.sheets[0].rows, [['表格测试']]);
    const created = await call('saveAdmin', { hrId: 'admin-target-hr', adminLevel: 'admin' });
    assert.equal(created.data.status, 'success');
    const id = created.data.id;
    assert.equal((await call('saveAdmin', { id, name: '新增管理身份', adminLevel: 'admin' })).data.status, 'success');
    const listed = await call('listAdmins');
    assert.equal(listed.data.list.find(row => row.id === id).name, '新增管理身份');
    assert.equal(Object.hasOwn(listed.data.list[0], 'studentId'), false);
    assert.equal((await db.query('SELECT name FROM admin_info WHERE id=?', [id]))[0][0].name, '新增管理身份');
    const exported = await call('exportAdmins');
    assert.equal(exported.data.status, 'success');
    assert(!exported.data.csvContent.includes('ADMIN-B'));
    assert.equal((await call('saveAdmin', { id, name: '越界', adminLevel: 'admin', organizationId: 'other' })).code, 403);
    assert.equal((await call('saveAdmin', { id, name: '越界', adminLevel: 'admin', studentId: 'REPLACED' })).code, 403);
    await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify({ ...policy,
      capabilities: ['system.adminAccounts.read'] }), policy.id]);
    assert.equal((await call('deleteAdmin', { id })).code, 403);
    assert.equal((await call('getAdminAccountCandidates')).code, 403);
    assert.equal((await call('buildTableFile', { headers: ['name'], rows: [] })).code, 403);
    assert.equal((await db.query('SELECT id FROM admin_info WHERE id=?', [id]))[0].length, 1);
    await db.query('UPDATE authorization_rules SET policy_json=? WHERE id=?', [JSON.stringify(policy), policy.id]);
    assert.equal((await call('deleteAdmin', { id })).data.status, 'success');
    assert.equal((await db.query('SELECT id FROM admin_info WHERE id=?', [id]))[0].length, 0);
  } finally { await new Promise(resolve => listener.close(resolve)); }
};
