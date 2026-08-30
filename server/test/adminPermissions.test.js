const assert = require('assert');
const {
  PERMISSION_DEFINITIONS,
  ROUTE_RULES,
  defaultGranted,
  isApplicable,
  canConfigureAdminPermissions,
  editablePermissionKeys,
  loadEffectivePermissions,
  hasGrantedPermission,
  scopeAccountSessions,
  serializeCatalog
} = require('../src/core/services/adminPermissions');

(async () => {
  assert(PERMISSION_DEFINITIONS.size >= 20, '权限目录必须保持细粒度');
  assert.strictEqual(isApplicable('permissions.manage_regular_admins', 'admin'), true);
  assert.strictEqual(isApplicable('permissions.manage_regular_admins', 'super_admin'), false);
  assert.strictEqual(isApplicable('system.organizations', 'admin'), false);
  assert.strictEqual(isApplicable('auth.policy.manage', 'admin'), true);
  assert.strictEqual(defaultGranted('admin', PERMISSION_DEFINITIONS.get('hr.people')), false);
  assert.strictEqual(defaultGranted('admin', PERMISSION_DEFINITIONS.get('system.admin_accounts.read')), false);
  assert.strictEqual(defaultGranted('admin', PERMISSION_DEFINITIONS.get('hr.profile_templates.manage')), false);
  assert.strictEqual(defaultGranted('admin', PERMISSION_DEFINITIONS.get('hr.profile_templates.select')), false);
  assert.strictEqual(isApplicable('auth.accounts.global_manage', 'admin'), false);
  assert.strictEqual(isApplicable('auth.accounts.global_manage', 'super_admin'), true);

  assert(ROUTE_RULES.get('/listAdmins').anyOf.includes('system.admin_accounts.read'));
  assert(ROUTE_RULES.get('/saveAdmin').anyOf.includes('system.admin_accounts.write'));
  assert(ROUTE_RULES.get('/listPersonIdentities').anyOf.includes('hr.people'));
  assert(ROUTE_RULES.get('/listPersonIdentities').anyOf.includes('hr.profile_review'));
  assert(ROUTE_RULES.get('/listPersonIdentities').anyOf.includes('system.admin_accounts.read'));
  assert.deepStrictEqual(ROUTE_RULES.get('/saveMembershipAssignment').anyOf, ['hr.people']);
  assert.deepStrictEqual(ROUTE_RULES.get('/deleteMembershipAssignment').anyOf, ['hr.people']);
  assert.deepStrictEqual(ROUTE_RULES.get('/reactivateHrMembership').anyOf, ['hr.people']);
  assert(ROUTE_RULES.get('/saveScoreActivity').anyOf.includes('scoring.activities'));
  assert.deepStrictEqual(ROUTE_RULES.get('/batchSaveRateRules').anyOf, ['scoring.rules']);
  [
    '/batchSavePubViewRules',
    '/batchSavePubMeritRules',
    '/batchDeletePubViewRules',
    '/batchDeletePubMeritRules'
  ].forEach((route) => {
    assert.deepStrictEqual(ROUTE_RULES.get(route).anyOf, ['scoring.publications']);
  });
  assert(ROUTE_RULES.get('/saveOrganization').anyOf.includes('system.organizations'));
  assert.deepStrictEqual(ROUTE_RULES.get('/admin/health').anyOf, ['system.settings']);
  assert.deepStrictEqual(ROUTE_RULES.get('/saveHrProfileTemplateDefinition').anyOf, ['hr.profile_templates.manage']);
  assert.deepStrictEqual(ROUTE_RULES.get('/applyHrProfileTemplateSwitch').anyOf, ['hr.profile_templates.select']);
  assert.strictEqual(ROUTE_RULES.get('/reviewHrProfileChange').anyOf.includes('hr.profile_review'), true);
  assert.deepStrictEqual(
    ROUTE_RULES.get('/listHrInfo').anyOf,
    [
      'hr.people', 'hr.import', 'hr.profile_review', 'scoring.publications', 'venue.resources',
      'audit.templates', 'audit.stamps', 'audit.submissions', 'audit.verification'
    ]
  );
  assert.deepStrictEqual(
    ROUTE_RULES.get('/listHrGovernance').anyOf,
    ['auth.identity.verify', 'auth.accounts.recover', 'auth.accounts.global_manage']
  );
  assert.strictEqual(ROUTE_RULES.get('/listHrInfo').anyOf.includes('auth.policy.manage'), false);
  assert.strictEqual(ROUTE_RULES.get('/listHrGovernance').anyOf.includes('auth.policy.manage'), false);
  assert.deepStrictEqual(
    ROUTE_RULES.get('/listHrProfileAdminData').anyOf,
    ['hr.people', 'hr.profile_review']
  );
  assert.deepStrictEqual(
    ROUTE_RULES.get('/getHrPersonDetail').anyOf,
    ['hr.people', 'hr.profile_review']
  );
  assert.strictEqual(ROUTE_RULES.get('/buildTableFile').anyOf.includes('hr.people'), true);
  assert.strictEqual(ROUTE_RULES.get('/buildTableFile').anyOf.includes('hr.profile_review'), true);
  assert.deepStrictEqual(ROUTE_RULES.get('/listVenueBookingRules').anyOf, ['venue.approvals']);
  assert.deepStrictEqual(ROUTE_RULES.get('/saveVenueBookingRule').anyOf, ['venue.approvals']);
  assert.deepStrictEqual(ROUTE_RULES.get('/deleteVenueBookingRule').anyOf, ['venue.approvals']);
  assert.strictEqual(ROUTE_RULES.get('/listPendingVenueApprovals').allowUserRole, true);
  assert.strictEqual(ROUTE_RULES.get('/listVenueApprovalHistory').allowUserRole, true);
  assert.strictEqual(ROUTE_RULES.get('/getVenueApprovalHistoryDetail').allowUserRole, true);
  assert.strictEqual(ROUTE_RULES.get('/approveVenueBookingStep').allowUserRole, true);
  assert.strictEqual(ROUTE_RULES.get('/rejectVenueBookingStep').allowUserRole, true);
  assert.strictEqual(ROUTE_RULES.get('/saveVenueApprovalWholeFlow').allowUserRole, false);
  assert.deepStrictEqual(ROUTE_RULES.get('/listUserBindings').anyOf, ['system.admin_accounts.read']);
  assert.strictEqual(ROUTE_RULES.get('/getSubmissionDetail').allowUserRole, true);
  ['/getAuditFile', '/downloadAuditFile', '/getAuditFilePreview'].forEach((route) => {
    assert.deepStrictEqual(ROUTE_RULES.get(route).anyOf, ['audit.submissions']);
    assert.strictEqual(ROUTE_RULES.get(route).allowUserRole, true);
  });
  assert.strictEqual(ROUTE_RULES.get('/verifySignatureChain').allowUserRole, true);
  assert.deepStrictEqual(ROUTE_RULES.get('/unbindHrWechat').anyOf, ['auth.accounts.global_manage']);
  assert.deepStrictEqual(ROUTE_RULES.get('/previewPersonIdentityCorrection').anyOf, ['auth.accounts.global_manage']);
  assert.deepStrictEqual(ROUTE_RULES.get('/applyPersonIdentityCorrection').anyOf, ['auth.accounts.global_manage']);
  assert.deepStrictEqual(ROUTE_RULES.get('/mergePersons').anyOf, ['auth.accounts.global_manage']);
  assert.deepStrictEqual(ROUTE_RULES.get('/admin/auth/security').anyOf, ['auth.accounts.global_manage']);
  assert.deepStrictEqual(
    ROUTE_RULES.get('/admin/auth/security/sessions/revoke').anyOf,
    ['auth.accounts.global_manage']
  );
  assert.deepStrictEqual(
    ROUTE_RULES.get('/admin/auth/security/passphrase').anyOf,
    ['auth.accounts.global_manage']
  );
  assert.deepStrictEqual(
    ROUTE_RULES.get('/admin/auth/security/passphrase/revoke').anyOf,
    ['auth.accounts.global_manage']
  );
  ROUTE_RULES.forEach((rule) => {
    assert(rule.anyOf.length > 0);
    rule.anyOf.forEach((key) => assert(PERMISSION_DEFINITIONS.has(key), '路由引用了未知权限: ' + key));
  });

  const orgId = 'org-44';
  const superAdmin = { id: 'super', admin_level: 'super_admin', org_id: '' };
  const manager = { id: 'manager', admin_level: 'admin', org_id: orgId };
  const regularAdmin = { id: 'regular', admin_level: 'admin', org_id: orgId };
  const otherOrgAdmin = { id: 'other', admin_level: 'admin', org_id: 'org-43' };
  const enabledManager = {
    canAccessPermissionSystem: true,
    permissions: { 'hr.people': true, 'permissions.manage_regular_admins': true }
  };
  const disabledManager = { canAccessPermissionSystem: false, permissions: {} };

  assert.strictEqual(hasGrantedPermission({ permissions: ['auth.accounts.recover'] }, 'auth.accounts.global_manage'), false);
  assert.strictEqual(hasGrantedPermission({ permissions: ['*'] }, 'auth.accounts.global_manage'), true);
  assert.strictEqual(hasGrantedPermission({ permissions: { 'auth.accounts.global_manage': true } }, 'auth.accounts.global_manage'), true);
  const accountSessions = [
    { id: 'same-org', organization_id: orgId },
    { id: 'other-org', organization_id: 'org-43' },
    { id: 'no-org', organization_id: '' }
  ];
  assert.deepStrictEqual(
    scopeAccountSessions(accountSessions, orgId, false).map((item) => item.id),
    ['same-org']
  );
  assert.deepStrictEqual(
    scopeAccountSessions(accountSessions, orgId, true).map((item) => item.id),
    ['same-org', 'other-org', 'no-org']
  );

  assert.strictEqual(canConfigureAdminPermissions(superAdmin, {}, regularAdmin, orgId), true);
  assert.strictEqual(canConfigureAdminPermissions(superAdmin, {}, superAdmin, orgId), false);
  assert.strictEqual(canConfigureAdminPermissions(manager, enabledManager, regularAdmin, orgId), true);
  assert.strictEqual(canConfigureAdminPermissions(manager, disabledManager, regularAdmin, orgId), false);
  assert.strictEqual(canConfigureAdminPermissions(manager, enabledManager, manager, orgId), false);
  assert.strictEqual(canConfigureAdminPermissions(superAdmin, {}, otherOrgAdmin, orgId), false);

  const superEditable = editablePermissionKeys(superAdmin, {}, regularAdmin, orgId);
  assert(superEditable.includes('permissions.manage_regular_admins'));
  const delegatedEditable = editablePermissionKeys(manager, enabledManager, regularAdmin, orgId);
  assert.deepStrictEqual(delegatedEditable, ['hr.people']);

  const superEffective = await loadEffectivePermissions(superAdmin, orgId);
  assert.strictEqual(superEffective.isSuper, true);
  assert.strictEqual(superEffective.canAccessPermissionSystem, true);
  assert(Array.from(PERMISSION_DEFINITIONS.keys()).every((key) => superEffective.permissions[key] === true));

  const regularCatalog = serializeCatalog('admin', {}, delegatedEditable);
  assert.strictEqual(regularCatalog.some((group) => group.key === 'permissions'), true);
  assert.strictEqual(
    regularCatalog.find((group) => group.key === 'scoring').label,
    '考核评分'
  );
  const hrPeople = regularCatalog
    .find((group) => group.key === 'hr')
    .permissions.find((item) => item.key === 'hr.people');
  assert.strictEqual(hrPeople.editable, true);

  console.log('两级管理员细粒度权限矩阵测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
