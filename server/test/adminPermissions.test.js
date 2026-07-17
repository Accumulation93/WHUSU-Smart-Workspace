const assert = require('assert');
const {
  PERMISSION_DEFINITIONS,
  ROUTE_RULES,
  defaultGranted,
  isApplicable,
  canConfigureAdminPermissions,
  loadEffectivePermissions,
  serializeCatalog
} = require('../src/core/services/adminPermissions');

(async () => {
  assert(PERMISSION_DEFINITIONS.size >= 20, '权限目录必须保持细粒度');
  assert.strictEqual(isApplicable('permissions.manage_regular_admins', 'super_admin'), true);
  assert.strictEqual(isApplicable('permissions.manage_regular_admins', 'admin'), false);
  assert.strictEqual(isApplicable('system.organizations', 'super_admin'), false);
  assert.strictEqual(defaultGranted('super_admin', PERMISSION_DEFINITIONS.get('permissions.manage_regular_admins')), false);
  assert.strictEqual(defaultGranted('admin', PERMISSION_DEFINITIONS.get('hr.people')), true);
  assert.strictEqual(defaultGranted('admin', PERMISSION_DEFINITIONS.get('system.admin_accounts')), false);

  assert(ROUTE_RULES.get('/saveScoreActivity').anyOf.includes('scoring.activities'));
  assert(ROUTE_RULES.get('/revokeScoreRecord').anyOf.includes('scoring.results_revoke'));
  assert(ROUTE_RULES.get('/importHrTable').anyOf.includes('hr.import'));
  assert(ROUTE_RULES.get('/approveVenueBooking').anyOf.includes('venue.approvals'));
  assert(ROUTE_RULES.get('/saveOrganization').anyOf.includes('system.organizations'));
  ROUTE_RULES.forEach((rule) => {
    assert(rule.anyOf.length > 0);
    rule.anyOf.forEach((key) => assert(PERMISSION_DEFINITIONS.has(key), '路由引用了未知权限: ' + key));
  });

  const orgId = 'org-44';
  const root = { id: 'root', admin_level: 'root_admin', org_id: '' };
  const superAdmin = { id: 'super', admin_level: 'super_admin', org_id: orgId };
  const regularAdmin = { id: 'regular', admin_level: 'admin', org_id: orgId };
  const otherOrgAdmin = { id: 'other', admin_level: 'admin', org_id: 'org-43' };
  const enabledManager = { canAccessPermissionSystem: true };
  const disabledManager = { canAccessPermissionSystem: false };

  assert.strictEqual(canConfigureAdminPermissions(root, {}, superAdmin, orgId), true);
  assert.strictEqual(canConfigureAdminPermissions(root, {}, regularAdmin, orgId), true);
  assert.strictEqual(canConfigureAdminPermissions(superAdmin, enabledManager, regularAdmin, orgId), true);
  assert.strictEqual(canConfigureAdminPermissions(superAdmin, disabledManager, regularAdmin, orgId), false);
  assert.strictEqual(canConfigureAdminPermissions(regularAdmin, enabledManager, superAdmin, orgId), false);
  assert.strictEqual(canConfigureAdminPermissions(superAdmin, enabledManager, superAdmin, orgId), false);
  assert.strictEqual(canConfigureAdminPermissions(root, {}, otherOrgAdmin, orgId), false);

  const rootEffective = await loadEffectivePermissions(root, orgId);
  assert.strictEqual(rootEffective.isRoot, true);
  assert.strictEqual(rootEffective.canAccessPermissionSystem, true);
  assert(Array.from(PERMISSION_DEFINITIONS.keys()).every((key) => rootEffective.permissions[key] === true));

  const regularCatalog = serializeCatalog('admin', {});
  assert.strictEqual(regularCatalog.some((group) => group.key === 'permissions'), false);
  assert.strictEqual(regularCatalog.some((group) => group.key === 'system' && group.permissions.some((item) => item.key === 'system.admin_accounts')), false);

  console.log('管理员细粒度权限矩阵测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
