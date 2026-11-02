'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { inspect } = require('../src/core/services/authorizationLegacyInventory');
const legacy = require('../src/core/services/adminPermissions');
const context = { organizationId: 'org', adminGrantId: 'grant',
  admin: { id: 'old-admin', org_id: 'org', admin_level: 'admin' } };
const inventory = keys => inspect({ ...context, overrides: keys.map(permission_key => ({ permission_key, granted: 1 })) });

test('评分、审核与岗位字典的旧入口逐项保留，删除隐含读取不扩展到写入或导出', () => {
  const mapping = {
    '/listScoreActivities': ['scoring.activities.read'],
    '/getCurrentScoreActivity': ['scoring.currentActivity.read'],
    '/getLatestPublishedScoreActivity': ['scoring.latestPublishedActivity.read'],
    '/saveScoreActivity': ['scoring.activities.create', 'scoring.activities.update'],
    '/setCurrentScoreActivity': ['scoring.activities.update'],
    '/toggleActivityPause': ['scoring.activities.update'],
    '/deleteScoreActivity': ['scoring.activities.delete'],
    '/listScoreTemplates': ['scoring.templates.read'],
    '/saveScoreTemplate': ['scoring.templates.create', 'scoring.templates.update'],
    '/duplicateScoreTemplate': ['scoring.templates.create'],
    '/deleteScoreTemplate': ['scoring.templates.delete'],
    '/listRateRules': ['scoring.rules.read'],
    '/saveRateRule': ['scoring.rules.create', 'scoring.rules.update'],
    '/batchSaveRateRules': ['scoring.rules.create', 'scoring.rules.update'],
    '/generateRateTargetRules': ['scoring.rules.create'],
    '/deleteRateRule': ['scoring.rules.delete'],
    '/getScoreResults': ['scoring.results.read'],
    '/getScorerTaskStatus': ['scoring.results.read'],
    '/exportScoreResults': ['scoring.results.export'],
    '/exportScorerTaskStatus': ['scoring.results.export'],
    '/revokeScoreRecord': ['scoring.results.revoke'],
    '/getResultPublication': ['scoring.publications.read'],
    '/listPubViewRules': ['scoring.publications.read'],
    '/listPubMeritRules': ['scoring.publications.read'],
    '/getMeritListSummary': ['scoring.publications.read'],
    '/exportMeritListSummary': ['scoring.publications.export'],
    '/saveResultPublication': ['scoring.publications.create', 'scoring.publications.update'],
    '/savePubViewRule': ['scoring.publications.create', 'scoring.publications.update'],
    '/savePubMeritRule': ['scoring.publications.create', 'scoring.publications.update'],
    '/deletePubViewRule': ['scoring.publications.delete'],
    '/deletePubMeritRule': ['scoring.publications.delete'],
    '/batchDeletePubViewRules': ['scoring.publications.delete'],
    '/batchDeletePubMeritRules': ['scoring.publications.delete'],
    '/removeMeritListDesignation': ['scoring.publications.delete'],
    '/listAuditFlowTemplates': ['audit.templates.read'],
    '/getAuditTemplateEditorData': ['audit.templates.read'],
    '/saveAuditFlowTemplate': ['audit.templates.create', 'audit.templates.update'],
    '/deleteAuditFlowTemplate': ['audit.templates.delete'],
    '/listStamps': ['audit.stamps.read'],
    '/listIdentityStamps': ['audit.stamps.read'],
    '/listStampCandidates': ['audit.stamps.read'],
    '/saveStamp': ['audit.stamps.create', 'audit.stamps.update'],
    '/saveStampGrants': ['audit.stamps.update'],
    '/deleteStamp': ['audit.stamps.delete'],
    '/saveDepartment': ['hr.departments.create', 'hr.departments.update'],
    '/deleteDepartment': ['hr.departments.delete'],
    '/saveIdentity': ['hr.identities.create', 'hr.identities.update'],
    '/deleteIdentity': ['hr.identities.delete'],
    '/saveWorkGroup': ['hr.workGroups.create', 'hr.workGroups.update'],
    '/deleteWorkGroup': ['hr.workGroups.delete']
  };
  for (const key of legacy.listPermissionKeys()) {
    const result = inventory([key]);
    for (const [path, capabilities] of Object.entries(mapping)) {
      const route = result.routes.find(item => item.path === path);
      assert(route, path);
      for (const capability of capabilities) assert.equal(result.candidateCapabilities.includes(capability), route.allowed, key + ':' + path + ':' + capability);
    }
  }
  const deletes = inventory(['scoring.publications.delete', 'audit.templates.delete', 'audit.stamps.delete']).candidateCapabilities;
  assert(!deletes.includes('scoring.latestPublishedActivity.read'));
  assert(!deletes.includes('scoring.publications.export'));
  assert(!deletes.includes('audit.stamps.update'));
  assert(!deletes.includes('audit.templates.create'));
});

test('删除附带的读取入口单独留存，不把场地日程扩大为全部借用', () => {
  const result = inventory(['venue.resources.delete']);
  assert.equal(result.routes.find(route => route.path === '/getVenueSchedule').allowed, true);
  assert.equal(result.routes.find(route => route.path === '/listAllVenueBookings').allowed, false);
  assert.equal(result.routes.find(route => route.path === '/saveVenue').allowed, false);
  assert.equal(result.readyForCutover, false);
});

test('旧的未勾选项没有转成明确禁止，并保留已有隐含读取', () => {
  const result = inspect({ ...context, overrides: [
    { permission_key: 'audit.submissions_delete', granted: 1 },
    { permission_key: 'audit.submissions', granted: 0 },
    { permission_key: 'system.admin_accounts.write', granted: 1 },
    { permission_key: 'system.admin_accounts.read', granted: 0 }
  ] });
  assert(result.keys.includes('audit.submissions'));
  assert(result.keys.includes('system.admin_accounts.read'));
  assert(!result.keys.includes('venue.bookings'));
  assert(!Object.hasOwn(result, 'deny'));
});

test('未知、损坏及不适用的旧授权进入差异清单，不能猜测补权', () => {
  const result = inspect({ ...context, overrides: [
    { permission_key: 'future.permission', granted: 1 },
    { permission_key: 'venue.bookings', granted: 'yes' },
    { permission_key: 'venue.bookings', granted: 0 },
    { permission_key: 'auth.accounts.global_manage', granted: 1 }
  ] });
  assert.deepEqual(result.issues.map(item => item.kind), [
    'unknown_permission', 'invalid_granted', 'duplicate_override', 'inapplicable_grant'
  ]);
  assert.deepEqual(result.keys, []);
  assert.equal(result.readyForCutover, false);
});

test('分配权不得被当作使用权自动迁移；普通岗位和其他组织不能冒充旧管理身份', () => {
  const result = inventory(['permissions.manage_regular_admins']);
  assert.deepEqual(result.candidateCapabilities, []);
  assert.equal(result.delegationRequested, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.readyForCutover, false);
  assert.throws(() => inspect({ ...context, admin: { ...context.admin, org_id: 'other' }, overrides: [] }));
  assert.throws(() => inspect({ ...context, admin: { ...context.admin, admin_level: 'user' }, overrides: [] }));
});

test('逐项旧权限的所有入口判断与现有权限服务一致', async () => {
  const dbPath = require.resolve('../src/config/db');
  const modelPath = require.resolve('../src/core/models/adminPermission');
  const oldDb = require.cache[dbPath];
  const oldModel = require.cache[modelPath];
  require.cache[dbPath] = { exports: { query: () => { throw Error('test_requires_explicit_connection'); } } };
  delete require.cache[modelPath];
  try {
    for (const key of legacy.listPermissionKeys()) {
      const result = inventory([key]);
      const effective = await legacy.loadEffectivePermissions(context.admin, 'org', {
        query: async () => [[{ permission_key: key, granted: 1 }]]
      });
      assert.deepEqual(result.keys, effective.keys.slice().sort(), key);
      for (const route of result.routes) {
        assert.equal(route.allowed, legacy.hasAnyPermission(effective, legacy.ROUTE_RULES.get(route.path).anyOf), key + ':' + route.path);
      }
    }
  } finally {
    if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
    if (oldModel) require.cache[modelPath] = oldModel; else delete require.cache[modelPath];
  }
  const before = inventory(['venue.resources', 'venue.approvals']);
  const reordered = inventory(['venue.approvals', 'venue.resources']);
  assert.equal(before.digest, reordered.digest);
  assert.notEqual(before.digest, inventory(['venue.resources']).digest);
});

test('场地细分动作迁移逐入口等价，隐含读取不附带新增维护和复制权', () => {
  const mapping = {
    '/listVenues': ['venue.resources.read'],
    '/saveVenue': ['venue.resources.create', 'venue.resources.update'],
    '/deleteVenue': ['venue.resources.delete'],
    '/getVenueSchedule': ['venue.schedule.read'],
    '/listVenueOpenRules': ['venue.openRules.read'],
    '/saveVenueOpenRule': ['venue.openRules.create', 'venue.openRules.update'],
    '/deleteVenueOpenRule': ['venue.openRules.delete'],
    '/listVenueActivityRules': ['venue.activityRules.read'],
    '/saveVenueActivityRule': ['venue.activityRules.create', 'venue.activityRules.update'],
    '/deleteVenueActivityRule': ['venue.activityRules.delete'],
    '/listAllVenueBookings': ['venue.bookings.read'],
    '/createAdminVenueBooking': ['venue.bookings.create'],
    '/previewVenueBookingDeletion': ['venue.bookings.delete'],
    '/deleteVenueBooking': ['venue.bookings.delete'],
    '/getVenueRuleCandidates': ['venue.approvalCandidates.read'],
    '/listVenueBookingRules': ['venue.bookingRules.read'],
    '/saveVenueBookingRule': ['venue.bookingRules.create', 'venue.bookingRules.update'],
    '/deleteVenueBookingRule': ['venue.bookingRules.delete'],
    '/saveVenueBookingWindow': ['venue.bookingWindows.create'],
    '/getVenueApprovalFlow': ['venue.approvals.read'],
    '/listVenueApprovalFlows': ['venue.approvals.read'],
    '/saveVenueApprovalFlow': ['venue.approvals.create', 'venue.approvals.update'],
    '/saveVenueApprovalWholeFlow': ['venue.approvals.create', 'venue.approvals.update'],
    '/saveVenueApprovalFlowMeta': ['venue.approvals.create', 'venue.approvals.update'],
    '/saveVenueApprovalStep': ['venue.approvals.update'],
    '/saveVenueApprovalStepRule': ['venue.approvals.update'],
    '/deleteVenueApprovalFlow': ['venue.approvals.delete'],
    '/deleteVenueApprovalStep': ['venue.approvals.delete'],
    '/deleteVenueApprovalStepRule': ['venue.approvals.delete'],
    '/approveVenueBookingStep': ['venue.bookings.approve'],
    '/rejectVenueBookingStep': ['venue.bookings.approve'],
    '/listPendingVenueApprovals': ['venue.bookings.approve'],
    '/listVenueApprovalHistory': ['venue.approvalHistory.read'],
    '/getVenueApprovalHistoryDetail': ['venue.approvalHistory.read'],
    '/listVenueBookingPurposes': ['venue.purposes.read'],
    '/saveVenueBookingPurpose': ['venue.purposes.create', 'venue.purposes.update'],
    '/deleteVenueBookingPurpose': ['venue.purposes.delete']
  };
  for (const key of legacy.listPermissionKeys()) {
    const result = inventory([key]);
    for (const [path, actions] of Object.entries(mapping)) {
      const old = result.routes.find(route => route.path === path);
      for (const capability of actions) assert.equal(result.candidateCapabilities.includes(capability), old.allowed, key + ':' + path + ':' + capability);
    }
    assert.equal(result.candidateCapabilities.some(key => /\.(share|receive)$/.test(key)), false);
  }
  const deletionOnly = inventory(['venue.approvals.delete']).candidateCapabilities;
  assert(deletionOnly.includes('venue.openRules.read'));
  assert(!deletionOnly.includes('venue.openRules.update'));
  assert(!deletionOnly.includes('venue.approvalCandidates.read'));
  assert(!deletionOnly.includes('venue.approvalHistory.read'));
  assert(!deletionOnly.includes('venue.bookings.read'));
});
