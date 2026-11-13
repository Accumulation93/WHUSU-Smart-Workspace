'use strict';

const assert = require('node:assert/strict');
const express = require('express');

module.exports = async function assignmentDelegationCases(db) {
  // 独立组织与真实会话夹具，避免修改其他授权专项的计数和名单。
  await db.query(`INSERT INTO organizations(id,name) VALUES ('job-delegate','岗位委托测试');
    INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES ('jd-person','分配人员','JD-1','JD-1');
    INSERT INTO accounts(id,person_id) VALUES ('jd-account','jd-person');
    INSERT INTO hr_info(id,name,student_id,org_id) VALUES ('jd-hr','分配人员','JD-1','job-delegate');
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES ('jd-member','jd-person','job-delegate','jd-hr');
    INSERT INTO departments(id,name,org_id) VALUES ('jd-department','测试部门','job-delegate');
    INSERT INTO identities(id,name,org_id) VALUES ('jd-identity','测试身份','job-delegate');
    INSERT IGNORE INTO assignment_natures(id,org_id,name) VALUES ('staff','job-delegate','本会岗位');
    INSERT INTO identity_nature_links(org_id,identity_id,nature_id) VALUES ('job-delegate','jd-identity','staff');
    INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id) VALUES
      ('jd-actor','jd-member','job-delegate','staff','jd-department','jd-identity'),
      ('jd-target','jd-member','job-delegate','staff','jd-department','jd-identity'),
      ('jd-outside','jd-member','job-delegate','staff','jd-department','jd-identity');
    INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('jd-super','jd-person','','super_admin');
    INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at) VALUES
      ('jd-user-session','jd-account','','jd-user-context','assignment','jd-actor','job-delegate','user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY),
      ('jd-super-session','jd-account','','jd-super-context','admin','jd-super','job-delegate','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY);
    UPDATE authorization_organizations SET mode='enforced' WHERE org_id='job-delegate'`);
  const model = require('../../src/core/models/authorization');
  const editor = require('../../../shared/authorizationEditor');
  const { CATALOG } = require('../../src/core/services/authorizationCatalog');
  const catalog = [...CATALOG.values()];
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    const superUser = req.headers['x-test-role'] === 'super';
    const ordinaryAdmin = req.headers['x-test-role'] === 'admin';
    req.authAccount = { id: 'jd-account', personId: 'jd-person' };
    req.authSession = { id: superUser ? 'jd-super-session' : ordinaryAdmin ? 'jd-admin-session' : 'jd-user-session' };
    req.authContext = { personId: 'jd-person', contextId: superUser ? 'jd-super-context' : ordinaryAdmin ? 'jd-admin-context' : 'jd-user-context',
      organizationId: 'job-delegate', role: superUser || ordinaryAdmin ? 'admin' : 'user',
      ...(superUser || ordinaryAdmin ? { adminGrantId: superUser ? 'jd-super' : 'jd-admin' } : { assignmentId: 'jd-actor' }) };
    require('../../src/utils/orgContext').orgStorage.run('job-delegate', next);
  });
  app.use('/api', require('../../src/core/routes/authorization'));
  const listener = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  async function call(action, body = {}, superUser = false) {
    const response = await fetch('http://127.0.0.1:' + listener.address().port + '/api/' + action, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': superUser === 'admin' ? 'admin' : superUser ? 'super' : 'user' },
      body: JSON.stringify(body)
    });
    return { code: response.status, data: await response.json() };
  }
  async function success(action, body = {}, superUser = false) {
    const result = await call(action, body, superUser);
    assert.equal(result.code, 200, action + ': ' + JSON.stringify(result));
    assert.equal(result.data.status, 'success');
    return result.data;
  }
  const state = () => model.read(db, 'job-delegate');
  const revision = async () => (await state()).revision;
  const base = { effect: 'allow', enabled: true, subjects: [{ kind: 'assignments', ids: ['jd-target'] }],
    capabilities: ['venue.bookings.read'], scopes: [{ kind: 'organization' }], fields: null, startsAt: null, endsAt: null };
  async function saveRule(policy, superUser = false, schemeId = '') {
    const draft = editor.createDraft(); draft.name = '岗位委托规则'; draft.policy = structuredClone(policy); draft.schemeId = schemeId;
    return success('saveAuthorizationRule', editor.request(draft, await revision(), catalog), superUser);
  }
  async function rejected(action, body, superUser = false) {
    const before = await state();
    const result = await call(action, body, superUser);
    assert.equal(result.code, 403, action + ': ' + JSON.stringify(result));
    assert.deepEqual(await state(), before, action + ' 拒绝后不得写入');
  }
  try {
    assert.equal((await success('getCurrentAuthorizationAccess')).canManageAuthorization, false);
    await rejected('saveAuthorizationRule', { name: '未获委托', policy: base, expectedRevision: await revision() });
    const governanceAttempt = await call('saveAuthorizationDelegation', { name: '岗位不可承担治理分配', enabled: true,
      subjects: [{ kind: 'assignments', ids: ['jd-actor'] }], envelope: { ...base,
        subjects: [{ kind: 'adminGrants', ids: ['jd-super'] }], capabilities: ['system.settings.read'] },
      expectedRevision: await revision() }, true);
    assert.equal(governanceAttempt.code, 400, JSON.stringify(governanceAttempt));
    assert.equal((await model.listDelegations(db, 'job-delegate')).length, 0);
    const envelope = { ...base, capabilities: ['venue.bookings.read', 'venue.bookings.create'],
      subjects: [{ kind: 'assignments', ids: ['jd-actor', 'jd-target'] }] };
    const delegationDraft = editor.createDelegationDraft(); delegationDraft.name = '岗位分配资格';
    delegationDraft.policy = envelope;
    const prepared = editor.setDelegationRecipients(delegationDraft, [{ assignmentId: 'jd-actor' }], 'assignments');
    const delegation = (await success('saveAuthorizationDelegation', editor.delegationRequest(prepared, await revision(), catalog), true)).delegation;
    assert.deepEqual((await model.listDelegations(db, 'job-delegate'))[0].subjects, [{ kind: 'assignments', ids: ['jd-actor'] }]);
    assert.equal((await success('getCurrentAuthorizationAccess')).canManageAuthorization, true);
    assert.equal((await success('getAuthorizationManagement')).canManage, true);
    assert.deepEqual((await success('getAuthorizationCandidates')).assignments.map(item => item.assignmentId), ['jd-target']);
    const saved = (await saveRule(base)).rule;
    assert.deepEqual((await state()).rules.find(item => item.id === saved.id).policy.subjects, base.subjects);
    assert.deepEqual((await success('getAuthorizationManagement')).rules.find(item => item.id === saved.id).policy.capabilities, base.capabilities);
    for (const policy of [
      { ...base, subjects: [{ kind: 'assignments', ids: ['jd-outside'] }] },
      { ...base, capabilities: ['venue.bookings.delete'] },
      { ...base, subjects: [{ kind: 'assignments', ids: ['jd-actor'] }] }
    ]) await rejected('saveAuthorizationRule', { name: '越界授权', policy, expectedRevision: await revision() });
    await rejected('saveAuthorizationDelegation', { name: '禁止转授', subjects: [{ kind: 'assignments', ids: ['jd-target'] }],
      enabled: true, envelope, expectedRevision: await revision() });
    // 同一人的其他岗位没有继承分配资格。
    await db.query("UPDATE auth_sessions SET context_subject_id='jd-target' WHERE id='jd-user-session'");
    assert.equal((await success('getCurrentAuthorizationAccess')).canManageAuthorization, false);
    await rejected('saveAuthorizationRule', { name: '跨岗位', policy: base, expectedRevision: await revision() });
    await db.query("UPDATE auth_sessions SET context_subject_id='jd-actor' WHERE id='jd-user-session'");
    // 动态范围即使命中候选，也不能转换为永久指定岗位授权；含本人条件不可自改。
    const dynamic = { ...envelope, subjects: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'], departmentId: ['jd-department'] } }] };
    const dynamicDelegation = (await success('saveAuthorizationDelegation', { name: '动态范围', enabled: true,
      subjects: [{ kind: 'assignments', ids: ['jd-actor'] }], envelope: dynamic, expectedRevision: await revision() }, true)).delegation;
    await rejected('saveAuthorizationRule', { name: '动态自身', policy: dynamic, expectedRevision: await revision() });
    await rejected('saveAuthorizationRule', { name: '动态转指定', policy: { ...base, subjects: [{ kind: 'assignments', ids: ['jd-outside'] }] }, expectedRevision: await revision() });
    assert.deepEqual((await success('getAuthorizationCandidates')).assignments.map(item => item.assignmentId), ['jd-target']);
    // 发布及恢复逐条检查关联规则，不能借授权身份间接改变本人权限。
    const scheme = (await success('saveAuthorizationScheme', { name: '岗位授权身份', capabilities: base.capabilities }, true)).scheme;
    const published = await success('publishAuthorizationScheme', { id: scheme.id, version: scheme.version, expectedRevision: await revision() }, true);
    const ownRule = (await saveRule({ ...base, subjects: [{ kind: 'assignments', ids: ['jd-actor'] }] }, true, scheme.id)).rule;
    const updatedScheme = (await success('saveAuthorizationScheme', { id: scheme.id, version: published.version,
      name: '岗位授权身份', capabilities: envelope.capabilities })).scheme;
    const versionsBefore = (await db.query('SELECT * FROM authorization_scheme_versions WHERE scheme_id=?', [scheme.id]))[0];
    await rejected('publishAuthorizationScheme', { id: scheme.id, version: updatedScheme.version, expectedRevision: await revision() });
    const publishedBySuper = await success('publishAuthorizationScheme', { id: scheme.id, version: updatedScheme.version, expectedRevision: await revision() }, true);
    await rejected('publishAuthorizationScheme', { id: scheme.id, version: publishedBySuper.version, restoreVersion: 1, expectedRevision: await revision() });
    assert.equal((await db.query('SELECT * FROM authorization_scheme_versions WHERE scheme_id=?', [scheme.id]))[0].length, versionsBefore.length + 1);
    assert.deepEqual((await state()).rules.find(item => item.id === ownRule.id).policy.capabilities, envelope.capabilities.slice().sort());
    // 动态本人关联规则走同一发布检查。
    const dynamicScheme = (await success('saveAuthorizationScheme', { name: '动态授权身份', capabilities: base.capabilities }, true)).scheme;
    const dynamicPublished = await success('publishAuthorizationScheme', { id: dynamicScheme.id, version: dynamicScheme.version, expectedRevision: await revision() }, true);
    await saveRule({ ...dynamic, capabilities: base.capabilities }, true, dynamicScheme.id);
    await rejected('publishAuthorizationScheme', { id: dynamicScheme.id, version: dynamicPublished.version, expectedRevision: await revision() });
    await success('deleteAuthorizationDelegation', { id: dynamicDelegation.id, version: dynamicDelegation.version, expectedRevision: await revision() }, true);
    const expiredEnvelope = { ...envelope, id: delegation.id, organizationId: 'job-delegate', endsAt: '2000-01-01T00:00:00.000Z' };
    await db.query('UPDATE authorization_delegations SET envelope_json=? WHERE id=?', [JSON.stringify(expiredEnvelope), delegation.id]);
    assert.equal((await success('getCurrentAuthorizationAccess')).canManageAuthorization, false);
    await rejected('saveAuthorizationRule', { name: '委托到期', policy: base, expectedRevision: await revision() });
    // 历史损坏委托即便绕过创建校验写入，也不能恢复普通岗位的治理资格。
    const invalidGovernance = { ...expiredEnvelope, endsAt: null, subjects: [{ kind: 'adminGrants', ids: ['jd-super'] }], capabilities: ['system.settings.read'] };
    await db.query('UPDATE authorization_delegations SET envelope_json=? WHERE id=?', [JSON.stringify(invalidGovernance), delegation.id]);
    assert.equal((await call('getCurrentAuthorizationAccess')).code, 403);
    await rejected('saveAuthorizationRule', { name: '历史治理委托', policy: base, expectedRevision: await revision() });
    await db.query('UPDATE authorization_delegations SET envelope_json=? WHERE id=?', [JSON.stringify({ ...envelope, id: delegation.id, organizationId: 'job-delegate' }), delegation.id]);
    await success('deleteAuthorizationDelegation', { id: delegation.id, version: delegation.version, expectedRevision: await revision() }, true);
    assert.equal((await success('getCurrentAuthorizationAccess')).canManageAuthorization, false);
    await rejected('saveAuthorizationRule', { id: saved.id, version: saved.version, name: '撤权后保存', policy: base, expectedRevision: await revision() });
    await require('./authorizationConsistencyCases')({ db, model, editor, state, revision, call, success, rejected, base });
    console.log('普通岗位委托 HTTP 专项：前端参数保存回读、同人不同岗位、范围越界、自授权、动态目标、方案发布恢复及撤销通过。');
  } finally { await new Promise(resolve => listener.close(resolve)); }
};
