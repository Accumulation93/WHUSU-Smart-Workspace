'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const applyMemberRelationshipRoleMigration = require('./applyMemberRelationshipRoleMigration');

async function verifyLegacyMemberRoleWrites(admin, relationshipRoles, capability) {
  const organizationId = 'created-by-previous-release';
  const actorContextId = 'legacy-toggle-author';
  // 已上线旧进程和旧默认组织入口都只插入组织行，不创建基础权限角色。
  await admin.query('INSERT INTO organizations (id, name) VALUES (?, ?)', [organizationId, 'Legacy release organization']);
  const schemeId = relationshipRoles.schemeIdFor(organizationId);
  const role = () => relationshipRoles.read(admin, organizationId);
  assert.equal((await role()).schemeId, schemeId);
  assert.deepEqual(new Set((await role()).capabilities), new Set(relationshipRoles.CAPABILITIES));
  const draftCapability = 'audit.submissions.read';
  await admin.query('UPDATE authorization_schemes SET draft_capabilities_json = JSON_ARRAY(?) WHERE org_id = ? AND id = ?',
    [draftCapability, organizationId, schemeId]);

  // 重演旧版本的实际写入顺序，包括版本加一和原来的审计记录。
  const legacyToggle = async (enabled, commit) => {
    await admin.beginTransaction();
    try {
      await admin.query('SELECT revision FROM authorization_organizations WHERE org_id = ? FOR UPDATE', [organizationId]);
      if (enabled) {
        await admin.query('DELETE FROM authorization_basic_role_exclusions WHERE org_id = ? AND capability_key = ?',
          [organizationId, capability]);
      } else {
        await admin.query('INSERT INTO authorization_basic_role_exclusions (org_id, capability_key) VALUES (?, ?)',
          [organizationId, capability]);
      }
      await admin.query('UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = ?', [organizationId]);
      await admin.query(`INSERT INTO authorization_changes (id, org_id, actor_context_id, action, target_id, before_json, after_json)
        VALUES (UUID(), ?, ?, 'basic_permission_toggle', ?, ?, ?)`,
      [organizationId, actorContextId, capability, JSON.stringify({ enabled: !enabled }), JSON.stringify({ enabled })]);
      if (commit) await admin.commit();
      else await admin.rollback();
    } catch (error) {
      await admin.rollback();
      throw error;
    }
  };
  const versions = async () => (await admin.query(`SELECT version, capabilities_json, actor_context_id
    FROM authorization_scheme_versions WHERE org_id = ? AND scheme_id = ? ORDER BY version`, [organizationId, schemeId]))[0];
  const draft = async () => (await admin.query(`SELECT draft_capabilities_json FROM authorization_schemes
    WHERE org_id = ? AND id = ?`, [organizationId, schemeId]))[0][0].draft_capabilities_json;
  const existingRole = await relationshipRoles.read(admin, 'org');
  const originalVersions = await versions();
  await legacyToggle(false, false);
  assert.deepEqual(await versions(), originalVersions);
  assert.equal((await role()).capabilities.includes(capability), true);
  await legacyToggle(false, true);
  assert.equal((await role()).capabilities.includes(capability), false);
  assert.deepEqual(await draft(), [draftCapability]);
  await legacyToggle(true, true);
  assert.equal((await role()).capabilities.includes(capability), true);
  assert.deepEqual(await draft(), [draftCapability, capability]);
  const updatedVersions = await versions();
  assert.deepEqual(updatedVersions.map(item => item.version), [1, 2, 3]);
  assert.deepEqual(updatedVersions[0], originalVersions[0]);
  assert.equal(updatedVersions[1].capabilities_json.includes(capability), false);
  assert.equal(updatedVersions[2].capabilities_json.includes(capability), true);
  assert.equal(updatedVersions[1].actor_context_id, actorContextId);
  assert.equal(updatedVersions[2].actor_context_id, actorContextId);
  assert.deepEqual(await relationshipRoles.read(admin, 'org'), existingRole);
}

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
  const previousDisabled = 'calendar.events.create';
  await admin.query('INSERT INTO authorization_basic_role_exclusions (org_id, capability_key) VALUES (?, ?)', [org, previousDisabled]);
  await admin.query(`INSERT INTO authorization_schemes (id, org_id, name, draft_capabilities_json)
    VALUES ('prior-member-name', ?, '成员基础权限', JSON_ARRAY('audit.submissions.read'))`, [org]);
  await applyMemberRelationshipRoleMigration(admin);
  await applyMemberRelationshipRoleMigration(admin);
  await admin.query("UPDATE authorization_runtime_transition SET phase='enforced',minimum_protocol=3 WHERE id=1");
  await admin.query("UPDATE authorization_organizations SET mode='enforced' WHERE org_id='org'");
  await admin.query("UPDATE auth_sessions SET context_type='admin',context_subject_id='grant',role='admin' WHERE id='session'");

  const revision = async () => (await model.read(admin, org)).revision;
  const body = { identityModel, assignmentMode: 'snapshot', name: 'Snapshot role',
    expectedRevision: await revision(), policy: { effect: 'allow', enabled: true,
      subjects: [{ kind: 'assignments', ids: ['assignment'] }], capabilities: ['audit.submissions.read'],
      scopes: [{ kind: 'organization' }], fields: null } };
  assert.equal((await (await post('previewAuthorizationRule', { ...body, bindingModel: 'role' })).json()).status,
    'authorization_role_required');
  const preview = await (await post('previewAuthorizationRule', body)).json();
  assert.equal(preview.status, 'success');
  assert.match(preview.previewToken, /^[a-f0-9]{64}$/);
  const withoutVersion = { ...body };
  delete withoutVersion.identityModel;
  assert.equal((await (await post('saveAuthorizationRule', withoutVersion)).json()).status, 'authorization_upgrade_required');
  assert.equal((await (await post('saveAuthorizationRule', { ...body, previewToken: 'obsolete' })).json()).status, 'authorization_stale_reference');
  const saved = await (await post('saveAuthorizationRule', { ...body, previewToken: preview.previewToken })).json();
  assert.equal(saved.status, 'success');
  assert.match(saved.rule.schemeId, /^compat-rule-[\da-f]{48}$/);
  const reopened = await (await post('getAuthorizationManagement', {})).json();
  assert(reopened.rules.some(rule => rule.id === saved.rule.id && rule.policy.subjects[0].ids[0] === 'assignment'));
  assert.equal(reopened.unifiedIdentity, true);
  assert.equal(reopened.roleBindingOnly, true);
  const memberRole = reopened.schemes.find(item => item.id === reopened.basicRoleId);
  assert.equal(memberRole.name, '成员基础权限（2）');
  assert.deepEqual(reopened.relationshipRoleAssignment, { id: org, schemeId: memberRole.id,
    subject: 'organizationMembers', scope: 'businessRelationship', enabled: true });
  const relationshipRoles = require('../../src/core/models/authorizationRelationshipRole');
  assert.deepEqual(new Set(memberRole.publishedCapabilities), new Set(relationshipRoles.CAPABILITIES.filter(key => key !== previousDisabled)));
  await verifyLegacyMemberRoleWrites(admin, relationshipRoles, previousDisabled);
  const badBinding = await post('previewAuthorizationRule', { ...body, bindingModel: 'role', schemeId: memberRole.id,
    expectedRevision: await revision() });
  assert.equal((await badBinding.json()).status, 'authorization_forbidden');
  const generatedRole = reopened.schemes.find(item => item.id === saved.rule.schemeId);
  assert.deepEqual([generatedRole.canEdit, generatedRole.canPublish, generatedRole.publishedVersion], [true, true, 1]);
  assert.deepEqual(generatedRole.publishedCapabilities, body.policy.capabilities);
  const recipient = 'script-role-recipient';
  await admin.query(`INSERT INTO persons(id,name,student_id,normalized_student_id) VALUES (?,?,?,?);
    INSERT INTO accounts(id,person_id,status) VALUES (?,?,'verified');
    INSERT INTO hr_info(id,name,student_id,org_id) VALUES (?,?,?,?);
    INSERT INTO organization_memberships(id,person_id,org_id,legacy_hr_id) VALUES (?,?,?,?);
    INSERT INTO membership_assignments(id,membership_id,org_id,assignment_kind,department_id,identity_id)
      VALUES (?,?,?,'staff','department','identity');
    INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES (?,?,'',?,'assignment',?,?,'user',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`,
  [recipient, recipient, recipient, recipient,
    recipient, recipient,
    recipient, recipient, recipient, org,
    recipient, recipient, org, recipient,
    recipient, recipient, org,
    recipient, recipient, recipient, recipient, org]);
  const right = (capability, reference) => createAuthorizationSession(admin, reference).then(session =>
    session.check({ capability, resource: { type: 'audit.submissions', id: 'example', organizationId: org }, businessAllowed: true }).allowed);
  const recipientReference = { accountId: recipient, personId: recipient, sessionId: recipient, contextId: recipient, organizationId: org };
  assert.equal(await right('audit.submissions.read', recipientReference), false);
  const additionalRequest = { ...body, bindingModel: 'role', expectedRevision: await revision(), schemeId: generatedRole.id,
    name: 'Independent allocation from generated role',
    policy: { ...body.policy, subjects: [{ kind: 'assignments', ids: [recipient] }] } };
  const reassignPreview = await (await post('previewAuthorizationRule', additionalRequest)).json();
  assert.equal(reassignPreview.status, 'success');
  const assigned = await (await post('saveAuthorizationRule', { ...additionalRequest, previewToken: reassignPreview.previewToken })).json();
  assert.equal(assigned.status, 'success');
  assert.equal(assigned.rule.schemeId, generatedRole.id);
  assert.equal(await right('audit.submissions.read', recipientReference), true);
  const editedCapabilities = ['audit.submissions.approve', 'audit.submissions.read'];
  const edited = await (await post('saveAuthorizationScheme', { identityModel, id: generatedRole.id,
    version: generatedRole.version, name: 'Edited generated role', capabilities: editedCapabilities })).json();
  assert.equal(edited.status, 'success');
  assert.equal(await right('audit.submissions.approve', recipientReference), false);
  const publish = { identityModel, id: generatedRole.id, version: edited.scheme.version, expectedRevision: await revision() };
  const changePreview = await (await post('previewAuthorizationScheme', publish)).json();
  assert.equal(changePreview.status, 'success');
  assert.deepEqual(changePreview.rules.map(rule => rule.id).sort(), [saved.rule.id, assigned.rule.id].sort());
  assert.equal((await (await post('publishAuthorizationScheme', publish)).json()).publishedVersion, 2);
  assert.equal(await right('audit.submissions.approve', recipientReference), true);
  const publishedRules = (await (await post('getAuthorizationManagement', {})).json()).rules;
  const historical = publishedRules.find(rule => rule.id === saved.rule.id);
  assert.equal(historical.schemeId, generatedRole.id);
  assert.deepEqual(historical.policy, { ...saved.rule.policy, capabilities: editedCapabilities });

  const availableSources = await (await post('getOrganizationConfigurationWorkspace', {
    kind: 'authorization.schemes', tab: 'source', after: ''
  })).json();
  assert.equal(availableSources.status, 'success');
  assert(availableSources.items.some(item => item.id === generatedRole.id));
  const copiedOffer = await (await post('shareOrganizationConfiguration', {
    kind: 'authorization.schemes', sourceRecordId: generatedRole.id, targetOrganizationId: 'other'
  })).json();
  assert.equal(copiedOffer.status, 'success');
  const [[targetSession]] = await admin.query("SELECT context_subject_id FROM auth_sessions WHERE id='target-session'");
  await admin.query("UPDATE auth_sessions SET context_subject_id='grant' WHERE id='target-session'");
  try {
    const copiedDraft = await (await post('receiveOrganizationConfiguration', {
      shareId: copiedOffer.id, shareVersion: 1, requestId: 'generated-role-copy'
    }, false, true)).json();
    assert.equal(copiedDraft.status, 'success');
    const copiedResult = await (await post('applyOrganizationConfigurationDraft', {
      id: copiedDraft.id, version: 1
    }, false, true)).json();
    assert.equal(copiedResult.status, 'success');
    const copiedRole = (await model.listSchemes(admin, 'other')).find(role => role.id === copiedResult.resultId);
    assert.notEqual(copiedRole.id, generatedRole.id);
    assert.equal(copiedRole.publishedVersion, 0);
    assert.deepEqual(copiedRole.capabilities, editedCapabilities);
    assert.equal((await model.read(admin, 'other')).rules.some(rule => rule.schemeId === copiedRole.id), false);
  } finally {
    await admin.query("UPDATE auth_sessions SET context_subject_id=? WHERE id='target-session'", [targetSession.context_subject_id]);
  }
  const legacyUpdate = async (rule, capabilities) => {
    const request = { ...body, id: rule.id, version: rule.version, expectedRevision: await revision(),
      policy: { ...rule.policy, capabilities } };
    const candidate = await (await post('previewAuthorizationRule', request)).json();
    assert.equal(candidate.status, 'success');
    const result = await (await post('saveAuthorizationRule', { ...request, previewToken: candidate.previewToken })).json();
    assert.equal(result.status, 'success');
    return result.rule;
  };
  const retained = await legacyUpdate(historical, editedCapabilities);
  assert.equal(retained.schemeId, generatedRole.id);
  const rebound = await legacyUpdate(retained, body.policy.capabilities);
  assert.notEqual(rebound.schemeId, generatedRole.id);
  assert.equal(await right('audit.submissions.approve', recipientReference), true);
  const unchanged = (await model.listSchemes(admin, org)).find(role => role.id === generatedRole.id);
  assert.equal(unchanged.publishedVersion, 2);
  assert.deepEqual(unchanged.publishedCapabilities, editedCapabilities);
  assert.equal((await post('setAuthorizationBasicCapability', { identityModel, capability: 'notifications.items.read',
    enabled: false, expectedRevision: await revision() })).status, 200);
  assert((await model.read(admin, org, false, true)).disabledBasic.has('notifications.items.read'));
  const notification = async (businessGranted, resource = { type: 'notifications.items', id: 'own-item', organizationId: org }) =>
    (await createAuthorizationSession(admin, recipientReference)).check({ resource, capability: 'notifications.items.read',
      businessAllowed: true, businessGranted }).allowed;
  assert.equal(await notification(true), false);
  const toggledRole = (await model.listSchemes(admin, org)).find(role => role.id === memberRole.id);
  assert.equal(toggledRole.publishedVersion, 2);
  assert.equal(toggledRole.publishedCapabilities.includes('notifications.items.read'), false);
  const emptyDraft = await (await post('saveAuthorizationScheme', { identityModel, id: toggledRole.id,
    version: toggledRole.version, name: toggledRole.name, capabilities: [] })).json();
  assert.equal(emptyDraft.status, 'success');
  assert.equal((await model.read(admin, org, false, true)).disabledBasic.has('calendar.events.read'), false);
  const emptyPublish = { identityModel, id: toggledRole.id, version: emptyDraft.scheme.version, expectedRevision: await revision() };
  const relationshipPreview = await (await post('previewAuthorizationScheme', emptyPublish)).json();
  assert.deepEqual(relationshipPreview.relationshipRoleAssignment.afterCapabilities, []);
  const emptied = await (await post('publishAuthorizationScheme', emptyPublish)).json();
  assert.equal(emptied.status, 'success');
  assert.equal((await model.read(admin, org, false, true)).disabledBasic.size, relationshipRoles.CAPABILITIES.length);
  const restoreMemberRole = await (await post('publishAuthorizationScheme', { ...emptyPublish, version: emptied.version,
    expectedRevision: await revision(), restoreVersion: 1 })).json();
  assert.equal(restoreMemberRole.status, 'success');
  assert.equal(await notification(true), true);
  assert.equal(await notification(false), false);
  assert.equal(await notification(true, { type: 'notifications.items', id: 'own-item', organizationId: 'other' }), false);
  const personallyExplained = await require('../../src/core/services/authorizationInspection').inspect(admin, recipientReference);
  assert.deepEqual(personallyExplained.capabilities.filter(item => item.capability === 'notifications.items.read')
    .map(item => [item.grantBasis, item.roleId, item.roleName]), [['basic_role', memberRole.id, memberRole.name]]);
  await admin.query('INSERT INTO authorization_basic_role_exclusions (org_id, capability_key) VALUES (?, ?)',
    [org, 'notifications.items.read']);
  assert.equal(await notification(true), true);
  await admin.query('DELETE FROM authorization_basic_role_exclusions WHERE org_id = ? AND capability_key = ?',
    [org, 'notifications.items.read']);
  assert.deepEqual([...(await model.read(admin, org, false, true)).disabledBasic], [previousDisabled]);
  await applyMemberRelationshipRoleMigration(admin);
  assert.equal((await model.listSchemes(admin, org)).find(role => role.id === memberRole.id).publishedVersion, 4);
  console.log('成员基础角色：重复迁移、旧关闭状态、旧进程开关与新建组织、名称区分、旧开关改正式发布版本、空草稿和发布、回退、按本人业务关系、来源展示及组织隔离通过。');
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

  const general = 'audit.submissions.read';
  const special = 'auth.persons.delete';
  for (const [id, capabilities, publishedVersion] of [
    ['repairable-draft', [general, special], 0], ['special-only-draft', [special], 0],
    ['published-legacy-role', [general, special], 1], ['referenced-draft', [general, special], 0]
  ]) {
    await admin.query('INSERT INTO authorization_schemes (id,org_id,name,draft_capabilities_json,published_version) VALUES (?,?,?,?,?)',
      [id, org, id, JSON.stringify(capabilities), publishedVersion]);
  }
  await admin.query('INSERT INTO authorization_scheme_versions (id,org_id,scheme_id,version,capabilities_json,actor_context_id) VALUES (?,?,?,?,?,?)',
    ['legacy-version', org, 'published-legacy-role', 1, JSON.stringify([general, special]), 'context']);
  await admin.query('UPDATE authorization_rules SET scheme_id=? WHERE org_id=? AND id=?', ['referenced-draft', org, saved.rule.id]);

  const blocked = await post('previewAuthorizationScheme', { id: 'repairable-draft', version: 1, expectedRevision: await revision() });
  assert.equal(blocked.status, 409);
  assert.deepEqual(await blocked.json(), { status: 'authorization_special_capabilities', blockedCapabilityKeys: [special] });
  const beforeRepair = await (await post('getAuthorizationManagement', {})).json();
  assert.equal(beforeRepair.schemes.find(scheme => scheme.id === 'repairable-draft').canPublish, false);
  const repairSql = fs.readFileSync(path.join(__dirname, '../../db/deploy/20261122222000_repair_unpublished_authorization_drafts.sql'), 'utf8');
  await admin.query(repairSql);
  const afterFirstRepair = await revision();
  await admin.query(repairSql);
  assert.equal(await revision(), afterFirstRepair);
  const [changes] = await admin.query("SELECT before_json,after_json FROM authorization_changes WHERE action='scheme_draft_repair'");
  assert.equal(changes.length, 1);
  const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
  assert.deepEqual(parse(changes[0].before_json).capabilities, [general, special]);
  assert.deepEqual(parse(changes[0].after_json).capabilities, [general]);
  const repaired = (await (await post('getAuthorizationManagement', {})).json()).schemes;
  assert.deepEqual(repaired.find(scheme => scheme.id === 'repairable-draft').capabilities, [general]);
  assert.deepEqual(repaired.find(scheme => scheme.id === 'special-only-draft').capabilities, [special]);
  assert.deepEqual(repaired.find(scheme => scheme.id === 'referenced-draft').capabilities, [general, special]);
  assert.deepEqual(repaired.find(scheme => scheme.id === 'published-legacy-role').capabilities, [general, special]);
  assert.equal((await (await post('previewAuthorizationRule', { ...body, bindingModel: 'role',
    schemeId: 'repairable-draft', expectedRevision: await revision() })).json()).status, 'authorization_scheme_unpublished');

  const publishedRequest = { identityModel, id: 'repairable-draft', version: 2, expectedRevision: await revision() };
  const publicationPreview = await (await post('previewAuthorizationScheme', publishedRequest)).json();
  assert.equal(publicationPreview.status, 'success');
  assert.deepEqual(publicationPreview.capabilities, [general]);
  assert.equal((await (await post('publishAuthorizationScheme', publishedRequest)).json()).publishedVersion, 1);
  const allocationRequest = { ...body, expectedRevision: await revision(), schemeId: 'repairable-draft', name: 'Allocation from repaired role' };
  const allocationPreview = await (await post('previewAuthorizationRule', allocationRequest)).json();
  assert.equal(allocationPreview.status, 'success');
  const allocation = await (await post('saveAuthorizationRule', { ...allocationRequest, previewToken: allocationPreview.previewToken })).json();
  assert.equal(allocation.status, 'success');
  const allocationReadback = (await (await post('getAuthorizationManagement', {})).json()).rules.find(rule => rule.id === allocation.rule.id);
  assert.equal(allocationReadback.schemeId, 'repairable-draft');
  assert.deepEqual(allocationReadback.policy.capabilities, [general]);

  const history = await (await post('getAuthorizationSchemeVersions', { id: 'published-legacy-role' })).json();
  assert.equal(history.status, 'success');
  assert.deepEqual(history.versions[0].capabilities, [general, special]);
  assert.deepEqual(history.versions[0].blockedCapabilityKeys, [special]);
  const restore = await post('publishAuthorizationScheme', { identityModel, id: 'published-legacy-role', version: 1,
    restoreVersion: 1, expectedRevision: await revision() });
  assert.equal(restore.status, 409);
  assert.equal((await restore.json()).status, 'authorization_special_capabilities');
  const retiredCapability = 'audit.verification.configure';
  const management = (await (await post('getAuthorizationManagement', {})).json()).catalog;
  assert.equal(management.find(item => item.key === retiredCapability).assignmentRetired, true);
  const forbiddenRole = await post('saveAuthorizationScheme', { identityModel, name: 'Retired capability',
    capabilities: ['audit.verification.verify', retiredCapability], expectedRevision: await revision() });
  assert.equal(forbiddenRole.status, 403);

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
