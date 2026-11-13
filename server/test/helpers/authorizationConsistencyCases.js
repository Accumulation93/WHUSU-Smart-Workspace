'use strict';

const assert = require('node:assert/strict');

module.exports = async function authorizationConsistencyCases({ db, model, editor, state, revision, call, success, rejected, base }) {
  const copy = require('../../../shared/locales/zh-CN/authorization');
  const readonly = await success('getAuthorizationManagement');
  assert.equal(readonly.canManage, false);
  assert.equal(readonly.canInspectOwn, true);
  assert.equal(readonly.canInspectOthers, false);
  assert.equal(readonly.canManageDelegations, false);
  for (const key of ['rules', 'schemes', 'delegations', 'delegationOptions']) assert.deepEqual(readonly[key], []);
  const ownAccess = await success('getCurrentAuthorizationAccess');
  assert.equal(ownAccess.canInspectOwnAuthorization, true);
  assert.equal(ownAccess.canInspectOthersAuthorization, false);
  assert.equal((await success('getEffectiveAuthorization')).subjectId, 'jd-actor');
  await rejected('getEffectiveAuthorization', { role: 'user', subjectId: 'jd-target' });
  await db.query(`INSERT INTO admin_grants(id,person_id,org_id,admin_level) VALUES ('jd-admin','jd-person','job-delegate','admin');
    INSERT INTO departments(id,name,org_id) VALUES ('jd-hidden-department','不得下发部门','job-delegate');
    INSERT INTO org_hr_profile_template_snapshots(id,org_id) VALUES ('jd-profile','job-delegate');
    INSERT INTO org_hr_profile_template_snapshot_fields(id,snapshot_id,label,type) VALUES
      ('jd-field-visible','jd-profile','可见资料项','text'),('jd-field-hidden','jd-profile','不得下发资料项','text'),
      ('jd-field-protected','jd-profile','历史学号字段','text');
    INSERT INTO auth_sessions(id,account_id,openid_hash,context_id,context_type,context_subject_id,organization_id,role,token_version,expires_at)
      VALUES ('jd-admin-session','jd-account','','jd-admin-context','admin','jd-admin','job-delegate','admin',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`);
  await success('saveAuthorizationRule', { name: '管理员只有业务权', policy: { ...base,
    subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }] }, expectedRevision: await revision() }, true);
  const businessAdmin = await success('getAuthorizationManagement', {}, 'admin');
  assert.equal(businessAdmin.canManage, false);
  assert.equal(businessAdmin.canInspectOwn, true);
  assert.equal(businessAdmin.canInspectOthers, false);
  assert.equal(businessAdmin.canManageDelegations, false);
  await rejected('saveAuthorizationRule', { name: '业务权不等于分配', policy: base, expectedRevision: await revision() }, 'admin');
  const ownOnlyInspection = (await success('saveAuthorizationRule', { name: '仅查当前管理身份', policy: { ...base,
    subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }], capabilities: ['authorization.effective.read'],
    scopes: [{ kind: 'records', ids: ['jd-admin'] }] }, expectedRevision: await revision() }, true)).rule;
  assert.equal((await success('getAuthorizationManagement', {}, 'admin')).canInspectOthers, false);
  assert.equal((await success('getCurrentAuthorizationAccess', {}, 'admin')).canInspectOthersAuthorization, false);
  const ownOnlyCandidates = await success('getAuthorizationCandidates', { purpose: 'inspection' }, 'admin');
  assert.deepEqual(ownOnlyCandidates.assignments, []);
  assert.deepEqual(ownOnlyCandidates.adminGrants, []);
  assert.equal((await success('getEffectiveAuthorization', {}, 'admin')).subjectId, 'jd-admin');
  await success('deleteAuthorizationRules', { rules: [{ id: ownOnlyInspection.id, version: ownOnlyInspection.version }], expectedRevision: await revision() }, true);
  const inspectRule = (await success('saveAuthorizationRule', { name: '查询一个岗位', policy: { ...base,
    subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }], capabilities: ['authorization.effective.read'],
    scopes: [{ kind: 'records', ids: ['jd-target'] }] }, expectedRevision: await revision() }, true)).rule;
  assert.equal((await success('getAuthorizationManagement', {}, 'admin')).canInspectOthers, true);
  assert.equal((await success('getCurrentAuthorizationAccess', {}, 'admin')).canInspectOthersAuthorization, true);
  assert.equal((await success('getEffectiveAuthorization', { role: 'user', subjectId: 'jd-target' }, 'admin')).subjectId, 'jd-target');
  const denyInspection = (await success('saveAuthorizationRule', { name: '逐记录禁止全部可查对象', policy: {
    ...inspectRule.policy, effect: 'deny' }, expectedRevision: await revision() }, true)).rule;
  assert.equal((await success('getAuthorizationManagement', {}, 'admin')).canInspectOthers, false);
  assert.equal((await success('getCurrentAuthorizationAccess', {}, 'admin')).canInspectOthersAuthorization, false);
  await rejected('getEffectiveAuthorization', { role: 'user', subjectId: 'jd-target' }, 'admin');
  await success('deleteAuthorizationRules', { rules: [{ id: inspectRule.id, version: inspectRule.version },
    { id: denyInspection.id, version: denyInspection.version }], expectedRevision: await revision() }, true);
  // 只查询本人时，仅传解释实际引用的名称，不取得人事目录或其他资料项。
  const ownPolicy = { ...base, subjects: [{ kind: 'assignments', ids: ['jd-actor'] }], capabilities: ['hr.people.read'],
    scopes: [{ kind: 'assignmentScope', dimensions: { natureId: ['staff'], departmentId: ['jd-department'] } }],
    fields: ['profile:jd-field-visible'] };
  await success('saveAuthorizationRule', { name: '本人查询资料项', policy: ownPolicy, expectedRevision: await revision() }, true);
  const own = await success('getEffectiveAuthorization');
  assert.equal(own.capabilities.find(item => item.capability === 'hr.people.read').grantState, 'granted');
  assert.equal(own.capabilities.find(item => item.capability === 'hr.people.read').grantBasis, 'rule');
  assert.equal(own.capabilities.find(item => item.capability === 'scoring.currentActivity.read').grantState, 'not_granted');
  assert.equal(own.capabilities.find(item => item.capability === 'scoring.currentActivity.read').businessEntry, true);
  assert.deepEqual(own.scopeDirectory.assignments, []);
  assert.deepEqual(own.scopeDirectory.adminGrants, []);
  assert.deepEqual(own.scopeDirectory.dimensions.departmentId, [{ id: 'jd-department', name: '测试部门' }]);
  assert.deepEqual(own.fieldLabels, { 'profile:jd-field-visible': '可见资料项' });
  assert(!JSON.stringify(own).includes('不得下发'));
  assert(!JSON.stringify(own.scopeDirectory).includes('personId'));
  assert(!JSON.stringify(own).includes('JD-1'));
  // 保留历史原始字段协议，但展示必须按被查询角色投影，不能把学号包装为普通岗位可用权限。
  const restrictedRule = (await success('saveAuthorizationRule', { name: '历史受保护资料项', policy: { ...ownPolicy,
    fields: ['studentId', 'profile:jd-field-protected'] }, expectedRevision: await revision() }, true)).rule;
  const unrestrictedRule = (await success('saveAuthorizationRule', { name: '未单独限制资料项', policy: { ...ownPolicy,
    fields: null }, expectedRevision: await revision() }, true)).rule;
  const userExplanation = await success('getEffectiveAuthorization');
  const userFields = userExplanation.capabilities.find(item => item.capability === 'hr.people.read').rules;
  assert.deepEqual(userFields.find(item => item.id === restrictedRule.id).fields, ['profile:jd-field-protected', 'studentId']);
  assert.deepEqual(userFields.find(item => item.id === restrictedRule.id).displayFields, []);
  assert.equal(userFields.find(item => item.id === unrestrictedRule.id).fields, null);
  assert(userFields.find(item => item.id === unrestrictedRule.id).displayFields.includes('name'));
  assert(userFields.find(item => item.id === unrestrictedRule.id).displayFields.includes('profile:jd-field-visible'));
  assert(!userFields.find(item => item.id === unrestrictedRule.id).displayFields.includes('studentId'));
  assert(!userFields.find(item => item.id === unrestrictedRule.id).displayFields.includes('profile:jd-field-protected'));
  assert.equal(userExplanation.fieldLabels['profile:jd-field-protected'], undefined);
  const inspectUser = (await success('saveAuthorizationRule', { name: '管理员查普通岗位仍受保护', policy: { ...base,
    subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }], capabilities: ['authorization.effective.read'],
    scopes: [{ kind: 'records', ids: ['jd-actor'] }] }, expectedRevision: await revision() }, true)).rule;
  const inspectedByAdmin = await success('getEffectiveAuthorization', { role: 'user', subjectId: 'jd-actor' }, 'admin');
  assert.deepEqual(inspectedByAdmin.capabilities.find(item => item.capability === 'hr.people.read').rules, userFields);
  assert.equal(inspectedByAdmin.fieldLabels['profile:jd-field-protected'], undefined);
  await success('saveAuthorizationRule', { name: '管理身份人事读取', policy: { ...base, fields: null,
    subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }], capabilities: ['hr.people.read'] }, expectedRevision: await revision() }, true);
  const adminExplanation = await success('getEffectiveAuthorization', {}, 'admin');
  assert(adminExplanation.capabilities.find(item => item.capability === 'hr.people.read').rules.some(item => item.displayFields.includes('studentId')));
  await success('deleteAuthorizationRules', { rules: [{ id: inspectUser.id, version: inspectUser.version }], expectedRevision: await revision() }, true);

  // 实际共用前端 helper 继承字段、期限及指定记录，生成简单身份分配参数后经 HTTP 保存回读。
  const limited = { ...base, capabilities: ['hr.people.read'], fields: ['name'],
    startsAt: '2000-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z',
    scopes: [{ kind: 'records', ids: ['jd-hr'] }] };
  const first = (await success('saveAuthorizationDelegation', { name: '限定姓名与期限', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['jd-actor'] }], envelope: limited, expectedRevision: await revision() }, true)).delegation;
  const secondEnvelope = { ...limited, capabilities: ['hr.people.update'], fields: ['membershipStatus'] };
  const second = (await success('saveAuthorizationDelegation', { name: '限定成员状态', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['jd-actor'] }], envelope: secondEnvelope, expectedRevision: await revision() }, true)).delegation;
  let management = await success('getAuthorizationManagement');
  assert.equal(management.delegationOptions.length, 2);
  const option = management.delegationOptions.find(item => item.id === first.id);
  assert.equal(option.name, '限定姓名与期限');
  assert.equal(option.version, first.version);
  for (const key of ['subjects', 'capabilities', 'scopes', 'fields', 'startsAt', 'endsAt']) assert.deepEqual(option.envelope[key], limited[key]);
  const scheme = (await success('saveAuthorizationScheme', { name: '限定读取身份', capabilities: limited.capabilities }, true)).scheme;
  const published = await success('publishAuthorizationScheme', { id: scheme.id, version: scheme.version, expectedRevision: await revision() }, true);
  management = await success('getAuthorizationManagement');
  let draft = editor.selectDelegation(editor.createDraft(), option);
  draft = editor.setPersonnel(draft, 'assignments', [{ assignmentId: 'jd-target' }]);
  draft.schemeId = scheme.id; draft.policy.capabilities = limited.capabilities.slice();
  assert.equal(editor.canUseIdentityFlow(draft, option), true);
  const payload = editor.request(editor.prepareSimpleDraft(draft, management.schemes, copy, option), await revision(), management.catalog);
  assert.equal(payload.delegationId, first.id);
  const saved = (await success('saveAuthorizationRule', payload)).rule;
  const reopened = (await state()).rules.find(item => item.id === saved.id);
  assert.equal(reopened.schemeId, scheme.id);
  for (const key of ['subjects', 'capabilities', 'scopes', 'fields', 'startsAt', 'endsAt']) assert.deepEqual(reopened.policy[key], limited[key]);
  assert.equal((await success('getAuthorizationManagement')).rules.find(item => item.id === saved.id).canEdit, true);
  for (const delegationId of ['missing', second.id]) await rejected('saveAuthorizationRule', { ...payload, id: undefined,
    delegationId, expectedRevision: await revision() });
  await rejected('saveAuthorizationRule', { ...payload, id: undefined, schemeId: '',
    policy: { ...payload.policy, capabilities: ['hr.people.read', 'hr.people.update'], fields: ['name', 'membershipStatus'] }, expectedRevision: await revision() });
  await rejected('saveAuthorizationRule', { ...payload, id: undefined, policy: { ...payload.policy, fields: null }, expectedRevision: await revision() });
  await rejected('saveAuthorizationRule', { ...payload, id: undefined, policy: { ...payload.policy, endsAt: null }, expectedRevision: await revision() });
  await rejected('saveAuthorizationRule', { id: saved.id, version: saved.version, name: '不能从一项资格搬到另一项',
    policy: secondEnvelope, expectedRevision: await revision() });
  const secondRule = (await success('saveAuthorizationRule', { name: '第二项资格内修改', policy: secondEnvelope,
    delegationId: second.id, expectedRevision: await revision() })).rule;
  // 历史版本逐项只读判断，不能被前一个版本的资格收窄；恢复仍是整单写入。
  const historyScheme = (await success('saveAuthorizationScheme', { name: '分别属于两项资格的历史',
    capabilities: limited.capabilities }, true)).scheme;
  const historyVersion1 = await success('publishAuthorizationScheme', { id: historyScheme.id,
    version: historyScheme.version, expectedRevision: await revision() }, true);
  const historyDraft2 = (await success('saveAuthorizationScheme', { id: historyScheme.id, version: historyVersion1.version,
    name: '分别属于两项资格的历史', capabilities: secondEnvelope.capabilities }, true)).scheme;
  const historyVersion2 = await success('publishAuthorizationScheme', { id: historyScheme.id,
    version: historyDraft2.version, expectedRevision: await revision() }, true);
  const beforeHistoryRead = await state();
  const readableVersions = await success('getAuthorizationSchemeVersions', { id: historyScheme.id });
  assert.deepEqual(readableVersions.versions.map(item => item.version), [2, 1]);
  assert.deepEqual(readableVersions.versions.map(item => item.capabilities), [secondEnvelope.capabilities, limited.capabilities]);
  assert.deepEqual(await state(), beforeHistoryRead);
  await rejected('publishAuthorizationScheme', { id: historyScheme.id, version: historyVersion2.version,
    restoreVersion: 1, expectedRevision: await revision() });
  await rejected('deleteAuthorizationRules', { rules: [{ id: saved.id, version: saved.version },
    { id: secondRule.id, version: secondRule.version }], expectedRevision: await revision() });
  const thirdEnvelope = { ...limited, subjects: [{ kind: 'assignments', ids: ['jd-outside'] }] };
  const third = (await success('saveAuthorizationDelegation', { name: '另一个岗位相同功能', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['jd-actor'] }], envelope: thirdEnvelope, expectedRevision: await revision() }, true)).delegation;
  const outsideRule = (await success('saveAuthorizationRule', { name: '身份另一资格关联', policy: thirdEnvelope,
    schemeId: scheme.id, delegationId: third.id, expectedRevision: await revision() })).rule;
  const multiEnvelopePage = await success('getAuthorizationManagement');
  assert.equal(multiEnvelopePage.rules.find(item => item.id === saved.id).canEdit, true);
  assert.equal(multiEnvelopePage.rules.find(item => item.id === outsideRule.id).canEdit, true);
  assert.equal(multiEnvelopePage.schemes.find(item => item.id === scheme.id).canPublish, false);
  for (const delegationId of [undefined, first.id, third.id]) {
    await rejected('publishAuthorizationScheme', { id: scheme.id, version: published.version,
      delegationId, expectedRevision: await revision() });
  }
  const [[publicationCount]] = await db.query('SELECT COUNT(*) AS count FROM authorization_scheme_versions WHERE scheme_id=?', [scheme.id]);
  assert.equal(Number(publicationCount.count), 1);
  await success('deleteAuthorizationRules', { rules: [{ id: outsideRule.id, version: outsideRule.version }], expectedRevision: await revision() }, true);
  await success('deleteAuthorizationDelegation', { id: third.id, version: third.version, expectedRevision: await revision() }, true);
  // 已发布版可用而新草稿越界时，仍可以分配发布版，但不能修改草稿或发布。
  await success('saveAuthorizationScheme', { id: scheme.id, version: published.version, name: '限定读取身份',
    capabilities: ['hr.people.read', 'venue.bookings.delete'] }, true);
  const visibleScheme = (await success('getAuthorizationManagement')).schemes.find(item => item.id === scheme.id);
  assert(visibleScheme, '可用发布版不能随越界草稿一起消失');
  assert.equal(visibleScheme.canEdit, false);
  assert.equal(visibleScheme.canPublish, false);
  assert.deepEqual(visibleScheme.publishedCapabilities, limited.capabilities);
  const superManagement = await success('getAuthorizationManagement', {}, true);
  assert.equal(superManagement.schemes.find(item => item.id === scheme.id).canPublish, false,
    '超级管理员也不能发布与关联规则资料项不兼容的草稿');
  const beforeInvalidPublication = await state();
  const incompatiblePublication = await call('publishAuthorizationScheme', { id: scheme.id, version: visibleScheme.version,
    expectedRevision: await revision() }, true);
  assert.equal(incompatiblePublication.code, 400, JSON.stringify(incompatiblePublication));
  assert.deepEqual(await state(), beforeInvalidPublication);
  assert.equal(superManagement.catalog.find(item => item.key === 'authorization.rules.create').systemControlled, true);
  assert.equal(superManagement.catalog.find(item => item.key === 'authorization.effective.read').systemControlled, false);
  const assignedAgain = (await success('saveAuthorizationRule', { ...payload, expectedRevision: await revision() })).rule;
  assert.deepEqual((await state()).rules.find(item => item.id === assignedAgain.id).policy.fields, ['name']);
  await success('deleteAuthorizationDelegation', { id: first.id, version: first.version, expectedRevision: await revision() }, true);
  await rejected('saveAuthorizationRule', { ...payload, expectedRevision: await revision() });
  await success('deleteAuthorizationDelegation', { id: second.id, version: second.version, expectedRevision: await revision() }, true);

  // 新增受控管理动作被拒绝；历史值兼容保留但不得扩充另一受控能力。
  const controlled = 'authorization.rules.read';
  const adminPolicy = { ...base, subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }], capabilities: [controlled] };
  await rejected('saveAuthorizationRule', { name: '不能新增受控动作', policy: adminPolicy, expectedRevision: await revision() }, true);
  await rejected('saveAuthorizationScheme', { name: '不能新增受控身份', capabilities: [controlled] }, true);
  const forbiddenDelegation = await call('saveAuthorizationDelegation', { name: '不能新增受控资格', enabled: true,
    subjects: [{ kind: 'adminGrants', ids: ['jd-admin'] }], envelope: adminPolicy, expectedRevision: await revision() }, true);
  assert.equal(forbiddenDelegation.code, 400, JSON.stringify(forbiddenDelegation));
  await db.query('INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?,?,?,?)',
    ['jd-legacy-rule', 'job-delegate', '历史受控规则', JSON.stringify({ ...adminPolicy, id: 'jd-legacy-rule', organizationId: 'job-delegate' })]);
  await success('saveAuthorizationRule', { id: 'jd-legacy-rule', version: 1, name: '保留历史受控规则', policy: adminPolicy, expectedRevision: await revision() }, true);
  await rejected('saveAuthorizationRule', { id: 'jd-legacy-rule', version: 2, name: '不得扩大历史动作',
    policy: { ...adminPolicy, capabilities: [controlled, 'authorization.rules.create'] }, expectedRevision: await revision() }, true);
  await db.query('INSERT INTO authorization_schemes(id,org_id,name,draft_capabilities_json) VALUES (?,?,?,?)',
    ['jd-legacy-scheme', 'job-delegate', '历史受控身份', JSON.stringify([controlled])]);
  const legacyDraft = (await success('saveAuthorizationScheme', { id: 'jd-legacy-scheme', version: 1,
    name: '保留历史受控身份', capabilities: [controlled] }, true)).scheme;
  const legacyPublished = await success('publishAuthorizationScheme', { id: legacyDraft.id, version: legacyDraft.version, expectedRevision: await revision() }, true);
  assert.deepEqual((await success('getAuthorizationSchemeVersions', { id: legacyDraft.id }, true)).versions[0].capabilities, [controlled]);
  await rejected('saveAuthorizationRule', { name: '不得复制历史动作新授权', schemeId: legacyDraft.id,
    policy: adminPolicy, expectedRevision: await revision() }, true);
  const cleanedLegacy = (await success('saveAuthorizationScheme', { id: legacyDraft.id, version: legacyPublished.version,
    name: '历史受控身份去除旧动作', capabilities: ['hr.people.read'] }, true)).scheme;
  const cleanedPublished = await success('publishAuthorizationScheme', { id: legacyDraft.id, version: cleanedLegacy.version,
    expectedRevision: await revision() }, true);
  const controlledHistory = await success('getAuthorizationSchemeVersions', { id: legacyDraft.id }, true);
  assert.deepEqual(controlledHistory.versions.map(item => item.version), [2, 1]);
  assert.deepEqual(controlledHistory.versions[1].capabilities, [controlled]);
  await rejected('publishAuthorizationScheme', { id: legacyDraft.id, version: cleanedPublished.version,
    restoreVersion: 1, expectedRevision: await revision() }, true);
  await rejected('saveAuthorizationRule', { name: '管理身份没有相对岗位', policy: { ...adminPolicy,
    capabilities: ['hr.people.read'], scopes: [{ kind: 'assignmentScope', dimensions: { natureId: 'same' } }] }, expectedRevision: await revision() }, true);
  assert.equal((await success('getAuthorizationManagement')).canManage, false);
  console.log('授权一致性 HTTP 专项：本人只读、最小解释资料、指定资格字段及期限继承保存回读、跨资格拒绝、发布版与草稿分离、受控历史兼容及相对岗位拒绝通过。');
};
