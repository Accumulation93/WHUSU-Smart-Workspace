'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function unifiedPermissionIntegrationCases(admin, post) {
  const model = require('../../src/core/models/authorization');
  const { createGuard } = require('../../src/core/services/authorizationManagement');
  const { createAuthorizationSession } = require('../../src/core/services/authorizationSession');
  const org = 'org';
  const identityModel = 'unified';
  for (const filename of ['20261102193000_authorization_runtime_transition.sql',
    '20261122153000_unified_identity_assignment_links.sql', '20261122170000_authorization_grant_sources.sql']) {
    const migration = fs.readFileSync(path.join(__dirname, '../../db/deploy', filename), 'utf8');
    await admin.query(migration);
    await admin.query(migration);
  }
  await admin.query("UPDATE authorization_runtime_transition SET phase='enforced',minimum_protocol=3 WHERE id=1");
  await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
  await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");

  const revision = async () => (await model.read(admin, org)).revision;
  const body = { identityModel, assignmentMode: 'snapshot', name: 'Snapshot role',
    expectedRevision: await revision(), policy: { effect: 'allow', enabled: true,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['audit.submissions.read'],
      scopes: [{ kind: 'organization' }], fields: null } };
  const preview = await (await post('previewAuthorizationRule', body)).json();
  assert.equal(preview.status, 'success');
  assert.match(preview.previewToken, /^[a-f0-9]{64}$/);
  const withoutVersion = { ...body };
  delete withoutVersion.identityModel;
  assert.equal((await (await post('saveAuthorizationRule', withoutVersion)).json()).status, 'authorization_upgrade_required');
  assert.equal((await (await post('saveAuthorizationRule', { ...body, previewToken: 'obsolete' })).json()).status, 'authorization_stale_reference');
  const saved = await (await post('saveAuthorizationRule', { ...body, previewToken: preview.previewToken })).json();
  assert.equal(saved.status, 'success');
  const reopened = await (await post('getAuthorizationManagement', {})).json();
  assert(reopened.rules.some(rule => rule.id === saved.rule.id && rule.policy.subjects[0].ids[0] === 'assignment'));
  assert.equal(reopened.unifiedIdentity, true);
  assert.equal((await post('setAuthorizationBasicCapability', { identityModel, capability: 'notifications.items.read',
    enabled: false, expectedRevision: await revision() })).status, 200);
  assert((await model.read(admin, org, false, true)).disabledBasic.has('notifications.items.read'));
  const root = { accountId: 'account', personId: 'person', sessionId: 'session', contextId: 'context', organizationId: org };
  assert.equal((await createAuthorizationSession(admin, root)).isSuper, true);
  const legacyCreate = await post('saveAdmin', { name: 'Compatibility candidate', studentId: 'legacy-identity-test', adminLevel: 'admin' });
  assert.equal(legacyCreate.status, 409);
  assert.equal((await legacyCreate.json()).status, 'authorization_upgrade_required');
  const [[legacyCount]] = await admin.query('SELECT COUNT(*) AS total FROM admin_info WHERE student_id=?', ['legacy-identity-test']);
  assert.equal(Number(legacyCount.total), 0);
  const modernAdmins = await (await post('listAdmins', { identityModel })).json();
  assert.equal(modernAdmins.status, 'success');
  assert(modernAdmins.creatableLevels.every(row => row.value === 'super_admin'));

  for (const suffix of ['issuer', 'child', 'recipient']) {
    const person = 'delegation-' + suffix;
    await admin.query('INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?)', [person, person, person, person]);
    await admin.query("INSERT INTO accounts(id,person_id,status) VALUES (?,?, 'verified')", [person, person]);
    await admin.query('INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,?,?,?)', [person, person, person, org]);
    await admin.query('INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES (?,?,?,?)', [person, person, org, person]);
    await admin.query(`INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
      VALUES (?,?,?,'staff','department','identity')`, [person, person, org]);
    await admin.query(`INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,
      organization_id,role,token_version,expires_at) VALUES (?,?,'',?,'assignment',?,?,'user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`,
    [person, person, person, person, org]);
  }
  const ref = id => ({ accountId: id, personId: id, sessionId: id, contextId: id, organizationId: org });
  const subjects = ids => [{ kind: 'assignments', ids }];
  const bounds = ids => ({ effect: 'allow', enabled: true, subjects: subjects(ids),
    capabilities: ['audit.submissions.read'], scopes: [{ kind: 'organization' }], fields: null });
  const parent = await model.saveDelegation({ name: 'Primary delegation', subjects: subjects(['delegation-issuer']),
    envelope: bounds(['delegation-child', 'delegation-recipient']), enabled: true, allowRedelegation: true,
    expectedRevision: await revision() }, org, createGuard(root));
  const sub = await model.saveDelegation({ name: 'Subdelegation', subjects: subjects(['delegation-child']),
    envelope: bounds(['delegation-recipient']), enabled: true, expectedRevision: await revision() }, org,
  createGuard(ref('delegation-issuer'), parent.id));
  const delegated = await model.saveRule({ name: 'Dependent rule', expectedRevision: await revision(),
    policy: bounds(['delegation-recipient']) }, org, createGuard(ref('delegation-child'), sub.id));
  assert((await model.read(admin, org, false, true)).rules.some(rule => rule.id === delegated.id));
  const target = await createAuthorizationSession(admin, ref('delegation-recipient'));
  const permission = { capability: 'audit.submissions.read', resource: { type: 'audit.submissions', organizationId: org }, businessAllowed: true };
  assert.equal(target.check(permission).allowed, true);
  await model.deleteDelegation({ id: parent.id, version: parent.version, expectedRevision: await revision() }, org, createGuard(root));
  assert(!((await model.read(admin, org, false, true)).rules.some(rule => rule.id === delegated.id)));
  assert((await model.read(admin, org)).rules.some(rule => rule.id === delegated.id));
  assert.equal((await createAuthorizationSession(admin, ref('delegation-recipient'))).check(permission).allowed, false);
  await model.saveRule({ name: 'Scoped freeze', expectedRevision: await revision(),
    policy: { ...bounds(['delegation-issuer']), capabilities: ['auth.accounts.freeze'],
      scopes: [{ kind: 'people', ids: ['delegation-recipient'] }] } }, org, createGuard(root));
  const governance = require('../../src/core/models/accountGovernanceAuthorization');
  const issuer = ref('delegation-issuer');
  assert.equal((await governance.authorize(issuer, 'auth.accounts.freeze',
    { personId: 'delegation-recipient', accountId: 'delegation-recipient' })).personId, 'delegation-issuer');
  await assert.rejects(governance.authorize(issuer, 'auth.accounts.freeze',
    { personId: 'delegation-child', accountId: 'delegation-recipient' }), error => error.code === 'authorization_forbidden');
  await assert.rejects(governance.authorize(issuer, 'auth.accounts.resetPassphrase',
    { personId: 'delegation-recipient', accountId: 'delegation-recipient' }), error => error.code === 'authorization_forbidden');
};
