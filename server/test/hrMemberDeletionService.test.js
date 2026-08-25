const assert = require('assert');
const crypto = require('crypto');
const Module = require('module');
const safeString = (value) => value == null ? '' : String(value);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hr-member-deletion-test-secret';
process.env.AUTH_IDENTITY_SECRET = process.env.AUTH_IDENTITY_SECRET || 'hr-member-deletion-identity-test-secret';
process.env.DB_USER = process.env.DB_USER || 'hr_member_deletion_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'hr_member_deletion_test';

const connection = {
  async query(sql) {
    if (String(sql).includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (String(sql).includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    return [{ affectedRows: 1 }];
  }
};

const state = {
  blockers: [],
  cleanupImpact: [{ category: 'legacy_hr_records', count: 1, sampleIds: ['hr-target'] }],
  targetIsSuperAdmin: false,
  activeSuperAdmins: 2,
  cleanupCalls: [],
  audits: [],
  completions: [],
  claims: [],
  lockOrder: []
};

const person = {
  person_id: 'person-target',
  name: '误导入成员',
  student_id: '20260001',
  normalized_student_id: '20260001',
  person_status: 'active',
  person_created_at: '2026-08-23 08:00:00',
  person_updated_at: '2026-08-23 09:00:00',
  account_id: 'account-target',
  account_status: 'verified',
  account_updated_at: '2026-08-23 09:00:00'
};
const memberships = [{
  id: 'membership-target',
  person_id: 'person-target',
  org_id: 'org-a',
  legacy_hr_id: 'hr-target',
  status: 'active',
  organization_name: '测试组织',
  updated_at: '2026-08-23 09:00:00'
}];
const assignments = [{
  id: 'assignment-target',
  membership_id: 'membership-target',
  org_id: 'org-a',
  status: 'active',
  updated_at: '2026-08-23 09:00:00'
}];

const poolStub = {
  query: connection.query.bind(connection),
  async withTransaction(callback) { return callback(connection); }
};

const deletionModelStub = {
  async getTargetByLegacyHrId() { return Object.assign({}, person); },
  async getTargetByPersonId() { return Object.assign({}, person); },
  async lockPersonDeletionBarrier() { state.lockOrder.push('person-row'); return true; },
  async listMemberships() { return memberships.map((item) => Object.assign({}, item)); },
  async listAssignments() { return assignments.map((item) => Object.assign({}, item)); },
  async listAdminReferences() { return []; },
  async listPersonOpenidReferences() { return ['openid-target']; },
  buildTargetScope(targetPerson, targetMemberships, targetAssignments, organizationId) {
    return {
      personId: targetPerson.person_id,
      organizationId,
      organizationIds: targetMemberships.map((item) => item.org_id),
      legacyHrIds: targetMemberships.map((item) => item.legacy_hr_id),
      assignmentIds: targetAssignments.map((item) => item.id)
    };
  },
  async scanBusinessBlockers() { return state.blockers.map((item) => Object.assign({}, item)); },
  async scanCleanupImpact() { return state.cleanupImpact.map((item) => Object.assign({}, item)); },
  async scanRuleImpact() {
    const target = arguments[1] || {};
    return [{
      type: safeString(target.organizationId) === 'org-b' ? 'venue_rule' : 'audit_template',
      id: safeString(target.organizationId) === 'org-b' ? 'venue-b' : 'template-a',
      reference: 'approval_step',
      wouldDisable: true
    }];
  },
  async lockSuperAdminState() {
    return { targetIsSuperAdmin: state.targetIsSuperAdmin, activeCount: state.activeSuperAdmins };
  },
  async acquireDeletionLock() { return { key: 'hr-delete:person-target', acquired: true }; },
  async acquireSuperAdminGovernanceLock() {
    state.lockOrder.push('global-governance');
    return { key: 'hr-delete:super-admin-governance', acquired: true };
  },
  async releaseDeletionLock(unusedConnection, key) {
    state.lockOrder.push(`release:${key}`);
    return true;
  },
  async cleanupMembershipArtifacts(unusedConnection, target) {
    state.cleanupCalls.push({ type: 'membership', target });
    return {
      cleanupCounts: { memberships: 1, legacyHrRecords: 1 },
      disabledRules: [{ type: 'audit_template', id: 'template-a' }]
    };
  },
  async cleanupGlobalPersonArtifacts(unusedConnection, target, digest) {
    state.cleanupCalls.push({ type: 'person', target, digest });
    return { persons: 1, accounts: 1, redactedAuditEvents: 2 };
  }
};

const requestDeduplicationStub = {
  stableResourceId(operationType, parts) {
    return crypto.createHash('sha256').update(JSON.stringify([operationType, ...parts])).digest('hex');
  },
  async claim(unusedConnection, data) {
    state.claims.push(data);
    return { claimed: true, enabled: true, clientRequestId: 'request-1' };
  },
  async complete(unusedConnection, claim, response) {
    state.completions.push({ claim, response });
  }
};

const identityStub = {
  async appendAuditEvent(data) { state.audits.push(data); }
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '../../config/db') return poolStub;
  if (request === '../models/hrMemberDeletion') return deletionModelStub;
  if (request === '../../utils/requestDeduplication') return requestDeduplicationStub;
  if (request === '../models/unifiedIdentity') return identityStub;
  return originalLoad.call(this, request, parent, isMain);
};
const servicePath = require.resolve('../src/core/services/hrMemberDeletionService');
delete require.cache[servicePath];
const service = require(servicePath);
Module._load = originalLoad;

function adminActor(overrides) {
  return Object.assign({
    personId: 'person-actor',
    contextId: 'ctx-admin',
    adminLevel: 'admin',
    profile: { org_id: 'org-a' }
  }, overrides || {});
}

function membershipRequest(overrides) {
  return Object.assign({
    scope: 'membership',
    legacyHrId: 'hr-target',
    organizationId: 'org-a',
    clientRequestId: 'request-1',
    acceptCleanup: true
  }, overrides || {});
}

async function testBusinessBlockerAppearsInPreview() {
  state.blockers = [{ category: 'audit_submissions', count: 1, sampleIds: ['submission-1'] }];
  const preview = await service.previewHrMemberDeletion(membershipRequest(), adminActor());
  assert.strictEqual(preview.eligible, false);
  assert.deepStrictEqual(preview.blockers, [{ category: 'audit_submissions', count: 1 }]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(preview.blockers[0], 'sampleIds'), false);
  state.blockers = [];
}

async function testMembershipDeletionUsesPreviewVersionAndAudit() {
  state.cleanupCalls = [];
  state.audits = [];
  state.completions = [];
  state.claims = [];
  state.lockOrder = [];
  const preview = await service.previewHrMemberDeletion(membershipRequest(), adminActor());
  assert.strictEqual(preview.eligible, true);
  assert.strictEqual(preview.affectedRules[0].wouldDisable, true);
  const result = await service.deleteHrMembershipPermanently(
    membershipRequest({ expectedVersion: preview.version }),
    adminActor()
  );
  assert.strictEqual(result.deleted, true);
  assert.strictEqual(result.scope, 'membership');
  assert.deepStrictEqual(result.affectedRules, [{
    type: 'audit_template',
    id: 'template-a',
    reference: 'approval_step',
    wouldDisable: true
  }]);
  assert.deepStrictEqual(result.disabledRules, [{ type: 'audit_template', id: 'template-a' }]);
  assert.strictEqual(state.cleanupCalls.length, 1);
  assert.strictEqual(state.audits[0].eventType, 'hr_membership_permanently_deleted');
  assert.strictEqual(state.audits[0].targetPersonId, 'person-target');
  assert.strictEqual(state.completions.length, 1);
  assert.strictEqual(state.claims[0].resourceId.length, 64);
  assert(!state.claims[0].resourceId.includes('org-a'));
  assert(
    state.lockOrder.indexOf('global-governance') < state.lockOrder.indexOf('person-row'),
    '组织成员永久删除必须先获取全局治理锁，再锁目标人员行'
  );
}

async function testSelfAndLastSuperAdminAreBlocked() {
  let preview = await service.previewHrMemberDeletion(
    membershipRequest(),
    adminActor({ personId: 'person-target' })
  );
  assert(preview.safetyBlocks.some((item) => item.category === 'current_operator'));

  state.targetIsSuperAdmin = true;
  state.activeSuperAdmins = 1;
  preview = await service.previewHrMemberDeletion(
    membershipRequest(),
    adminActor()
  );
  assert(preview.safetyBlocks.some((item) => item.category === 'last_effective_super_admin'));

  preview = await service.previewHrMemberDeletion({
    scope: 'person', personId: 'person-target', organizationId: 'org-a'
  }, adminActor({ adminLevel: 'super_admin' }));
  assert(preview.safetyBlocks.some((item) => item.category === 'last_effective_super_admin'));
  state.targetIsSuperAdmin = false;
  state.activeSuperAdmins = 2;
}

async function testExpiredPreviewIsRejected() {
  await assert.rejects(
    service.deleteHrMembershipPermanently(
      membershipRequest({ expectedVersion: 'expired' }),
      adminActor()
    ),
    (error) => error.code === 'hr_member_deletion_preview_expired' && error.httpStatus === 409
  );
}

async function testCleanupRequiresExplicitAcceptance() {
  const request = membershipRequest({ acceptCleanup: false, clientRequestId: 'request-cleanup-confirmation' });
  const preview = await service.previewHrMemberDeletion(request, adminActor());
  assert.strictEqual(preview.requiresCleanupAcceptance, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(preview.cleanupImpact[0], 'sampleIds'), false);
  await assert.rejects(
    service.deleteHrMembershipPermanently(Object.assign({}, request, {
      expectedVersion: preview.version
    }), adminActor()),
    (error) => error.code === 'hr_member_deletion_cleanup_confirmation_required'
      && error.details.cleanupImpact.every((item) => !Object.prototype.hasOwnProperty.call(item, 'sampleIds'))
  );
}

async function testDeletionReauthorizesInsideTransaction() {
  const request = membershipRequest({ clientRequestId: 'request-transaction-authorization' });
  const preview = await service.previewHrMemberDeletion(request, adminActor());
  let authorizationConnection = null;
  await service.deleteHrMembershipPermanently(Object.assign({}, request, {
    expectedVersion: preview.version
  }), adminActor(), {
    async authorize(transactionConnection) {
      authorizationConnection = transactionConnection;
      return adminActor({ contextId: 'ctx-reauthorized' });
    }
  });
  assert.strictEqual(authorizationConnection, connection);
  assert.strictEqual(state.audits[state.audits.length - 1].contextId, 'ctx-reauthorized');

  state.cleanupCalls = [];
  await assert.rejects(
    service.deleteHrMembershipPermanently(Object.assign({}, request, {
      clientRequestId: 'request-transaction-authorization-revoked',
      expectedVersion: preview.version
    }), adminActor(), {
      async authorize() {
        throw Object.assign(new Error('permission revoked'), { code: 'permission_denied' });
      }
    }),
    (error) => error.code === 'permission_denied'
  );
  assert.strictEqual(state.cleanupCalls.length, 0);
}

async function testDeletionRequiresValidClientRequestIdAndReplaysStoredResult() {
  await assert.rejects(
    service.deleteHrMembershipPermanently(
      membershipRequest({ clientRequestId: '' }),
      adminActor()
    ),
    (error) => error.code === 'hr_member_deletion_client_request_id_required'
      && error.httpStatus === 400
  );
  await assert.rejects(
    service.deleteHrMembershipPermanently(
      membershipRequest({ clientRequestId: 'invalid request id' }),
      adminActor()
    ),
    (error) => error.code === 'hr_member_deletion_client_request_id_invalid'
      && error.httpStatus === 400
  );
  await assert.rejects(
    service.deleteHrMembershipPermanently(
      membershipRequest({ clientRequestId: 'x'.repeat(97) }),
      adminActor()
    ),
    (error) => error.code === 'hr_member_deletion_client_request_id_invalid'
      && error.httpStatus === 400
  );

  const originalClaim = requestDeduplicationStub.claim;
  const storedResult = {
    scope: 'membership', deleted: true, idempotent: false, targetId: 'person-target',
    cleanupCounts: { memberships: 1 }, affectedRules: [], disabledRules: []
  };
  state.cleanupCalls = [];
  requestDeduplicationStub.claim = async () => ({
    claimed: false,
    enabled: true,
    clientRequestId: 'request-replay',
    resourceId: 'stored-resource',
    response: storedResult
  });
  try {
    const replayed = await service.deleteHrMembershipPermanently(
      membershipRequest({ clientRequestId: 'request-replay' }),
      adminActor()
    );
    assert.deepStrictEqual(replayed, storedResult);
    assert.strictEqual(state.cleanupCalls.length, 0);

    requestDeduplicationStub.claim = async () => {
      const error = new Error('conflict');
      error.code = 'IDEMPOTENCY_RESOURCE_CONFLICT';
      throw error;
    };
    await assert.rejects(
      service.deleteHrMembershipPermanently(
        membershipRequest({ clientRequestId: 'request-replay' }),
        adminActor()
      ),
      (error) => error.code === 'hr_member_deletion_idempotency_conflict'
        && error.httpStatus === 409
    );
  } finally {
    requestDeduplicationStub.claim = originalClaim;
  }
}

async function testPersonDeletionRequiresTypedStudentIdAndKeepsOnlyDigest() {
  const actor = adminActor({ adminLevel: 'super_admin' });
  const request = {
    scope: 'person', personId: 'person-target', organizationId: 'org-a',
    clientRequestId: 'request-person', acceptCleanup: true
  };
  const preview = await service.previewHrMemberDeletion(request, actor);
  await assert.rejects(
    service.deletePersonPermanently(Object.assign({}, request, {
      expectedVersion: preview.version,
      confirmStudentId: '错误学号'
    }), actor),
    (error) => error.code === 'person_deletion_confirmation_mismatch'
  );

  state.cleanupCalls = [];
  state.audits = [];
  state.claims = [];
  state.lockOrder = [];
  const result = await service.deletePersonPermanently(Object.assign({}, request, {
    expectedVersion: preview.version,
    confirmStudentId: '20260001'
  }), actor);
  assert.strictEqual(result.scope, 'person');
  assert.strictEqual(result.deletionDigest.length, 64);
  assert.notStrictEqual(result.deletionDigest, '20260001');
  assert(state.cleanupCalls.some((item) => item.type === 'person'));
  const audit = state.audits[state.audits.length - 1];
  assert.strictEqual(audit.targetPersonId, null);
  assert.strictEqual(audit.detail.deletionDigest, result.deletionDigest);
  assert(!JSON.stringify(audit.detail).includes('20260001'));
  assert.strictEqual(state.claims[state.claims.length - 1].resourceId.length, 64);
  assert(
    state.lockOrder.indexOf('global-governance') < state.lockOrder.indexOf('person-row'),
    '彻底删除必须先获取全局治理锁，再锁目标人员行'
  );
}

async function testPersonPreviewIncludesEveryOrganizationRuleInVersion() {
  memberships.push({
    id: 'membership-b', person_id: 'person-target', org_id: 'org-b', legacy_hr_id: 'hr-b',
    status: 'active', organization_name: '另一组织', updated_at: '2026-08-23 09:00:00'
  });
  assignments.push({
    id: 'assignment-b', membership_id: 'membership-b', org_id: 'org-b',
    status: 'active', updated_at: '2026-08-23 09:00:00'
  });
  try {
    const preview = await service.previewHrMemberDeletion({
      scope: 'person', personId: 'person-target', organizationId: 'org-a'
    }, adminActor({ adminLevel: 'super_admin' }));
    assert(preview.affectedRules.some((item) => item.id === 'template-a'));
    assert(preview.affectedRules.some((item) => item.id === 'venue-b'));
    const originalVersion = preview.version;
    deletionModelStub.scanRuleImpact = async function scanChangedRuleImpact(unusedConnection, target) {
      return [{
        type: 'audit_template', id: `changed-${safeString(target.organizationId)}`,
        reference: 'approval_step', wouldDisable: false
      }];
    };
    const changed = await service.previewHrMemberDeletion({
      scope: 'person', personId: 'person-target', organizationId: 'org-a'
    }, adminActor({ adminLevel: 'super_admin' }));
    assert.notStrictEqual(changed.version, originalVersion);
  } finally {
    memberships.pop();
    assignments.pop();
    deletionModelStub.scanRuleImpact = async function restoreRuleImpact(unusedConnection, target) {
      return [{
        type: safeString(target.organizationId) === 'org-b' ? 'venue_rule' : 'audit_template',
        id: safeString(target.organizationId) === 'org-b' ? 'venue-b' : 'template-a',
        reference: 'approval_step', wouldDisable: true
      }];
    };
  }
}

function testReferencePairRemoval() {
  const model = require('../src/core/models/hrMemberDeletion');
  const blockerCategories = new Set(model.BUSINESS_REFERENCES.map((item) => item.category));
  ['scoring_records', 'scoring_designations', 'audit_submissions', 'audit_steps',
    'audit_signatures', 'audit_events', 'venue_bookings'].forEach((category) => {
    assert(blockerCategories.has(category), `缺少业务阻断类别：${category}`);
  });
  const venueReference = model.BUSINESS_REFERENCES.find((item) => item.category === 'venue_bookings');
  assert(venueReference.columns.textColumns.includes('approval_snapshots_json'));
  const result = model.removePairedReferences(
    'hr-a,hr-target,hr-b',
    'assignment-a,assignment-target,assignment-b',
    new Set(['hr-target']),
    new Set(['assignment-target'])
  );
  assert.deepStrictEqual(result, {
    people: ['hr-a', 'hr-b'],
    assignments: ['assignment-a', 'assignment-b']
  });
  const multiAssignmentResult = model.removePairedReferences(
    'hr-a,hr-target',
    'assignment-a-1,assignment-a-2,assignment-target',
    new Set(['hr-target']),
    new Set(['assignment-target'])
  );
  assert.deepStrictEqual(multiAssignmentResult, {
    people: ['hr-a'],
    assignments: ['assignment-a-1', 'assignment-a-2']
  });
  const jsonResult = model.removePersonFromStarterJson(
    JSON.stringify([{ conditionType: 'person', personHrIds: ['hr-target'], assignmentIds: ['assignment-target'] }]),
    new Set(['hr-target']),
    new Set(['assignment-target'])
  );
  assert.strictEqual(jsonResult.changed, true);
  assert.deepStrictEqual(JSON.parse(jsonResult.value), []);
}

async function testOrganizationProfileCleanupRestoresOtherOrganizationValue() {
  const model = require('../src/core/models/hrMemberDeletion');
  const calls = [];
  const result = await model.removeOrganizationGlobalProfileValues({
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT * FROM person_profile_values')) {
        return [[{
          id: 'current-a', normalized_label: '政治面貌', field_type: 'text'
        }]];
      }
      if (normalized.startsWith('SELECT * FROM person_profile_value_history')) {
        return [[{
          id: 'history-b', normalized_label: '政治面貌', field_label: '政治面貌',
          field_type: 'text', field_value: '群众', value_updated_at: '2026-08-22 08:00:00',
          source_org_id: 'org-b', source_record_id: 'record-b', source_field_id: 'field-b'
        }]];
      }
      if (normalized.startsWith('DELETE FROM person_profile_value_history')) return [{ affectedRows: 2 }];
      return [{ affectedRows: 1 }];
    }
  }, 'person-target', 'org-a');
  assert.deepStrictEqual(result, { removedCurrent: 1, restoredCurrent: 1, removedHistory: 2 });
  const insert = calls.find((item) => item.sql.startsWith('INSERT INTO person_profile_values'));
  assert(insert);
  assert(insert.params.includes('org-b'));
  assert(!insert.params.includes('org-a'));
}

(async () => {
  await testBusinessBlockerAppearsInPreview();
  await testMembershipDeletionUsesPreviewVersionAndAudit();
  await testSelfAndLastSuperAdminAreBlocked();
  await testExpiredPreviewIsRejected();
  await testCleanupRequiresExplicitAcceptance();
  await testDeletionReauthorizesInsideTransaction();
  await testDeletionRequiresValidClientRequestIdAndReplaysStoredResult();
  await testPersonDeletionRequiresTypedStudentIdAndKeepsOnlyDigest();
  await testPersonPreviewIncludesEveryOrganizationRuleInVersion();
  testReferencePairRemoval();
  await testOrganizationProfileCleanupRestoresOtherOrganizationValue();
  console.log('误导入成员永久删除服务测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
