const crypto = require('crypto');
const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');
const requestDeduplication = require('../../utils/requestDeduplication');
const deletionModel = require('../models/hrMemberDeletion');
const unifiedIdentityModel = require('../models/unifiedIdentity');

const MEMBERSHIP_SCOPE = 'membership';
const PERSON_SCOPE = 'person';
const VALID_SCOPES = new Set([MEMBERSHIP_SCOPE, PERSON_SCOPE]);
const VOLATILE_CLEANUP_CATEGORIES = new Set(['scoring_caches']);

class HrMemberDeletionError extends Error {
  constructor(code, httpStatus, details) {
    super(code);
    this.name = 'HrMemberDeletionError';
    this.code = code;
    this.httpStatus = httpStatus || 400;
    this.details = details || null;
  }
}

function actorPersonId(actor) {
  return safeString(actor && (actor.personId || actor.person_id));
}

function actorOrganizationId(actor) {
  return safeString(actor && (
    actor.organizationId
    || actor.orgId
    || actor.profile && actor.profile.org_id
  ));
}

function assertActorAuthorization(actor, scope, organizationId) {
  const personId = actorPersonId(actor);
  const adminLevel = safeString(actor && (actor.adminLevel || actor.admin_level));
  if (!personId || !['admin', 'super_admin'].includes(adminLevel)) {
    throw new HrMemberDeletionError('hr_member_deletion_forbidden', 403);
  }
  if (scope === PERSON_SCOPE && adminLevel !== 'super_admin') {
    throw new HrMemberDeletionError('person_deletion_super_admin_required', 403);
  }
  if (scope === MEMBERSHIP_SCOPE && adminLevel !== 'super_admin'
    && actorOrganizationId(actor) !== safeString(organizationId)) {
    throw new HrMemberDeletionError('hr_member_deletion_wrong_organization', 403);
  }
}

function assertClientRequestId(data) {
  const clientRequestId = safeString(data && data.clientRequestId).trim();
  if (!clientRequestId) {
    throw new HrMemberDeletionError('hr_member_deletion_client_request_id_required', 400);
  }
  if (clientRequestId.length > 96 || !/^[A-Za-z0-9._:-]+$/.test(clientRequestId)) {
    throw new HrMemberDeletionError('hr_member_deletion_client_request_id_invalid', 400);
  }
  return clientRequestId;
}

function dateValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : safeString(value);
}

function stableList(items, mapper) {
  return (Array.isArray(items) ? items : [])
    .map(mapper)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function buildPreviewVersion(data) {
  const source = {
    scope: safeString(data.scope),
    person: {
      id: safeString(data.person && data.person.person_id),
      status: safeString(data.person && data.person.person_status),
      updatedAt: dateValue(data.person && data.person.person_updated_at),
      accountId: safeString(data.person && data.person.account_id),
      accountStatus: safeString(data.person && data.person.account_status),
      accountUpdatedAt: dateValue(data.person && data.person.account_updated_at)
    },
    memberships: stableList(data.memberships, (item) => ({
      id: safeString(item.id),
      organizationId: safeString(item.org_id),
      legacyHrId: safeString(item.legacy_hr_id),
      status: safeString(item.status),
      updatedAt: dateValue(item.updated_at)
    })),
    assignments: stableList(data.assignments, (item) => ({
      id: safeString(item.id),
      membershipId: safeString(item.membership_id),
      status: safeString(item.status),
      updatedAt: dateValue(item.updated_at)
    })),
    adminReferences: stableList(data.adminReferences, (item) => ({
      id: safeString(item.id),
      legacyAdminId: safeString(item.legacy_admin_id),
      organizationId: safeString(item.org_id),
      status: safeString(item.status),
      updatedAt: dateValue(item.updated_at)
    })),
    blockers: stableList(data.blockers, (item) => ({
      category: safeString(item.category),
      count: Number(item.count || 0)
    })),
    cleanup: stableList((data.cleanupImpact || []).filter(
      (item) => !VOLATILE_CLEANUP_CATEGORIES.has(safeString(item.category))
    ), (item) => ({
      category: safeString(item.category),
      count: Number(item.count || 0)
    })),
    rules: stableList(data.ruleImpact, (item) => ({
      type: safeString(item.type),
      id: safeString(item.id),
      name: safeString(item.name),
      stepName: safeString(item.stepName),
      stepOrder: Number(item.stepOrder || 0),
      reference: safeString(item.reference),
      wouldDisable: Boolean(item.wouldDisable)
    }))
  };
  return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function deletionDigest(person) {
  const secret = safeString(process.env.HR_DELETION_AUDIT_SECRET || process.env.JWT_SECRET);
  if (!secret) throw new HrMemberDeletionError('hr_deletion_audit_secret_missing', 500);
  return crypto.createHmac('sha256', secret).update([
    safeString(person && person.person_id),
    safeString(person && person.normalized_student_id),
    safeString(person && person.person_created_at)
  ].join('|')).digest('hex');
}

function combineCleanupCounts(target, source) {
  const result = target || {};
  Object.entries(source || {}).forEach(([key, value]) => {
    result[key] = Number(result[key] || 0) + Number(value || 0);
  });
  return result;
}

function uniqueDisabledRules(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = `${safeString(item.type)}:${safeString(item.id)}`;
    if (!safeString(item.id) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueRuleImpact(items) {
  const merged = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = [safeString(item.type), safeString(item.id), safeString(item.reference),
      safeString(item.stepName), Number(item.stepOrder || 0)].join(':');
    if (!safeString(item.id)) return;
    const current = merged.get(key);
    merged.set(key, Object.assign({}, current || {}, item, {
      wouldDisable: Boolean(item.wouldDisable || current && current.wouldDisable)
    }));
  });
  return Array.from(merged.values());
}

function getScope(data) {
  const scope = safeString(data && data.scope) || MEMBERSHIP_SCOPE;
  if (!VALID_SCOPES.has(scope)) throw new HrMemberDeletionError('invalid_hr_deletion_scope', 400);
  return scope;
}

async function loadDeletionState(connection, data, options) {
  const config = options || {};
  const scope = getScope(data);
  const organizationId = safeString(data && data.organizationId);
  let person;
  const loadTarget = async () => {
    if (scope === MEMBERSHIP_SCOPE) {
      return deletionModel.getTargetByLegacyHrId(
        connection,
        data.legacyHrId,
        organizationId,
        false
      );
    }
    if (safeString(data && data.personId)) {
      return deletionModel.getTargetByPersonId(connection, data.personId, false);
    }
    if (safeString(data && data.legacyHrId) && organizationId) {
      return deletionModel.getTargetByLegacyHrId(
        connection,
        data.legacyHrId,
        organizationId,
        false
      );
    }
    return null;
  };
  if (scope === MEMBERSHIP_SCOPE) {
    if (!safeString(data && data.legacyHrId) || !organizationId) {
      throw new HrMemberDeletionError('hr_member_deletion_target_required', 400);
    }
    person = await loadTarget();
  } else {
    person = await loadTarget();
  }
  if (!person) throw new HrMemberDeletionError('hr_member_deletion_target_not_found', 404);
  if (config.lock) {
    const locked = await deletionModel.lockPersonDeletionBarrier(connection, person.person_id);
    if (!locked) throw new HrMemberDeletionError('hr_member_deletion_target_not_found', 404);
    person = await loadTarget();
    if (!person) throw new HrMemberDeletionError('hr_member_deletion_target_not_found', 404);
  }

  const memberships = await deletionModel.listMemberships(connection, person.person_id, Boolean(config.lock));
  const assignments = await deletionModel.listAssignments(
    connection,
    memberships.map((item) => item.id),
    Boolean(config.lock)
  );
  const adminReferences = await deletionModel.listAdminReferences(
    connection,
    person.person_id,
    scope === MEMBERSHIP_SCOPE ? organizationId : '',
    Boolean(config.lock)
  );
  const scopedMemberships = scope === MEMBERSHIP_SCOPE
    ? memberships.filter((item) => safeString(item.org_id) === organizationId)
    : memberships;
  if (scope === MEMBERSHIP_SCOPE && !scopedMemberships.length) {
    throw new HrMemberDeletionError('hr_member_deletion_target_not_found', 404);
  }
  const target = deletionModel.buildTargetScope(
    person,
    scopedMemberships,
    assignments,
    scope === MEMBERSHIP_SCOPE ? organizationId : ''
  );
  target.adminGrantIds = adminReferences.map((item) => safeString(item.id)).filter(Boolean);
  target.legacyAdminIds = adminReferences.map((item) => safeString(item.legacy_admin_id)).filter(Boolean);
  target.legacyOpenids = await deletionModel.listPersonOpenidReferences(
    connection,
    person.account_id,
    Boolean(config.lock)
  );
  const blockers = await deletionModel.scanBusinessBlockers(connection, target, Boolean(config.lock));
  const cleanupImpact = await deletionModel.scanCleanupImpact(connection, target);
  let ruleImpact = [];
  if (scope === MEMBERSHIP_SCOPE) {
    ruleImpact = await deletionModel.scanRuleImpact(connection, target, Boolean(config.lock));
  } else {
    for (const membership of memberships) {
      const membershipAssignments = assignments.filter(
        (item) => safeString(item.membership_id) === safeString(membership.id)
      );
      const organizationTarget = deletionModel.buildTargetScope(
        person,
        [membership],
        membershipAssignments,
        safeString(membership.org_id)
      );
      organizationTarget.adminGrantIds = adminReferences
        .filter((item) => safeString(item.org_id) === safeString(membership.org_id))
        .map((item) => safeString(item.id))
        .filter(Boolean);
      organizationTarget.legacyAdminIds = adminReferences
        .filter((item) => safeString(item.org_id) === safeString(membership.org_id))
        .map((item) => safeString(item.legacy_admin_id))
        .filter(Boolean);
      organizationTarget.legacyOpenids = target.legacyOpenids;
      ruleImpact.push(...await deletionModel.scanRuleImpact(
        connection,
        organizationTarget,
        Boolean(config.lock)
      ));
    }
    ruleImpact = uniqueRuleImpact(ruleImpact);
  }
  return {
    scope,
    organizationId,
    person,
    memberships: scopedMemberships,
    allMemberships: memberships,
    assignments: assignments.filter((item) => (
      scopedMemberships.some((membership) => safeString(membership.id) === safeString(item.membership_id))
    )),
    allAssignments: assignments,
    adminReferences,
    target,
    blockers,
    cleanupImpact,
    ruleImpact
  };
}

async function evaluateSafety(connection, state, actor, lock) {
  const safetyBlocks = [];
  if (safeString(state.person.person_id) === actorPersonId(actor)) {
    safetyBlocks.push({ category: 'current_operator', count: 1 });
  }
  const superAdminState = await deletionModel.lockSuperAdminState(
    connection,
    state.person.person_id,
    Boolean(lock)
  );
  if (superAdminState.targetIsSuperAdmin && superAdminState.activeCount <= 1) {
    safetyBlocks.push({ category: 'last_effective_super_admin', count: 1 });
  }
  return safetyBlocks;
}

function publicTarget(state) {
  return {
    personId: safeString(state.person.person_id),
    legacyHrId: safeString(state.memberships[0] && state.memberships[0].legacy_hr_id),
    name: safeString(state.person.name),
    studentId: safeString(state.person.student_id),
    membershipCount: state.allMemberships.length,
    organizationCount: new Set(state.allMemberships.map((item) => safeString(item.org_id))).size
  };
}

function publicCountItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    category: safeString(item.category),
    count: Number(item.count || 0)
  }));
}

async function previewHrMemberDeletion(data, actor) {
  const scope = getScope(data);
  assertActorAuthorization(actor, scope, data && data.organizationId);
  const state = await loadDeletionState(pool, data, { lock: false });
  const safetyBlocks = await evaluateSafety(pool, state, actor, false);
  const version = buildPreviewVersion(state);
  return {
    scope,
    eligible: state.blockers.length === 0 && safetyBlocks.length === 0,
    target: publicTarget(state),
    version,
    blockers: publicCountItems(state.blockers),
    safetyBlocks,
    cleanupImpact: publicCountItems(state.cleanupImpact),
    requiresCleanupAcceptance: state.cleanupImpact.length > 0,
    affectedRules: state.ruleImpact,
    organizations: state.allMemberships.map((item) => ({
      organizationId: safeString(item.org_id),
      organizationName: safeString(item.organization_name),
      membershipStatus: safeString(item.status),
      legacyHrId: safeString(item.legacy_hr_id)
    }))
  };
}

function assertExecutable(state, safetyBlocks, expectedVersion, acceptCleanup) {
  if (state.blockers.length) {
    throw new HrMemberDeletionError('hr_member_deletion_has_business_history', 409, {
      blockers: publicCountItems(state.blockers)
    });
  }
  if (safetyBlocks.length) {
    throw new HrMemberDeletionError('hr_member_deletion_safety_blocked', 409, {
      safetyBlocks
    });
  }
  if (state.cleanupImpact.length && acceptCleanup !== true) {
    throw new HrMemberDeletionError('hr_member_deletion_cleanup_confirmation_required', 409, {
      cleanupImpact: publicCountItems(state.cleanupImpact)
    });
  }
  const currentVersion = buildPreviewVersion(state);
  if (!safeString(expectedVersion) || safeString(expectedVersion) !== currentVersion) {
    throw new HrMemberDeletionError('hr_member_deletion_preview_expired', 409, {
      currentVersion
    });
  }
  return currentVersion;
}

async function acquireDeletionLock(connection, personId) {
  const lock = await deletionModel.acquireDeletionLock(connection, personId, 10);
  if (!lock.acquired) {
    throw new HrMemberDeletionError('hr_member_deletion_busy', 409);
  }
  return lock.key;
}

async function acquireSuperAdminGovernanceLock(connection) {
  const lock = await deletionModel.acquireSuperAdminGovernanceLock(connection, 10);
  if (!lock.acquired) {
    throw new HrMemberDeletionError('hr_member_deletion_busy', 409);
  }
  return lock.key;
}

async function executeWithIdempotency(data, actor, scope, operationType, callback, options) {
  const clientRequestId = assertClientRequestId(data);
  assertActorAuthorization(actor, scope, data && data.organizationId);
  return pool.withTransaction(async (connection) => {
    const authorizedActor = options && typeof options.authorize === 'function'
      ? await options.authorize(connection)
      : actor;
    assertActorAuthorization(authorizedActor, scope, data && data.organizationId);
    const actorKey = `person:${actorPersonId(authorizedActor)}`;
    const dedupOrgId = scope === PERSON_SCOPE ? '__global__' : safeString(data.organizationId);
    const requestedResourceId = requestDeduplication.stableResourceId(
      operationType,
      scope === PERSON_SCOPE
        ? ['person', safeString(data.personId || data.legacyHrId)]
        : ['membership', safeString(data.organizationId), safeString(data.legacyHrId)]
    );
    let governanceLockKey = '';
    try {
      // 组织成员删除同样可能移除管理员授权。所有永久删除必须先串行化
      // 全局治理状态，再锁定目标人员并重新执行与预检相同的安全判断。
      governanceLockKey = await acquireSuperAdminGovernanceLock(connection);
      let claim;
      try {
        claim = await requestDeduplication.claim(connection, {
          orgId: dedupOrgId,
          actorKey,
          operationType,
          clientRequestId,
          resourceId: requestedResourceId
        });
      } catch (error) {
        if (safeString(error && error.code) === 'IDEMPOTENCY_RESOURCE_CONFLICT') {
          throw new HrMemberDeletionError('hr_member_deletion_idempotency_conflict', 409);
        }
        throw error;
      }
      if (!claim.claimed) {
        return claim.response || {
          scope,
          deleted: true,
          idempotent: true,
          targetId: safeString(claim.resourceId)
        };
      }

      const state = await loadDeletionState(connection, Object.assign({}, data, { scope }), { lock: true });
      const lockKey = await acquireDeletionLock(connection, state.person.person_id);
      try {
        const safetyBlocks = await evaluateSafety(connection, state, authorizedActor, true);
        const version = assertExecutable(state, safetyBlocks, data.expectedVersion, data.acceptCleanup);
        const response = await callback(connection, state, version, authorizedActor);
        await requestDeduplication.complete(connection, Object.assign({}, claim, {
          orgId: dedupOrgId,
          actorKey,
          operationType,
          resourceId: requestedResourceId
        }), response);
        return response;
      } finally {
        await deletionModel.releaseDeletionLock(connection, lockKey);
      }
    } finally {
      if (governanceLockKey) {
        await deletionModel.releaseDeletionLock(connection, governanceLockKey);
      }
    }
  });
}

async function deleteHrMembershipPermanently(data, actor, options) {
  return executeWithIdempotency(
    data,
    actor,
    MEMBERSHIP_SCOPE,
    'delete_hr_membership_permanently',
    async (connection, state, version, authorizedActor) => {
      const cleanup = await deletionModel.cleanupMembershipArtifacts(connection, state.target);
      const result = {
        scope: MEMBERSHIP_SCOPE,
        deleted: true,
        idempotent: false,
        targetId: safeString(state.person.person_id),
        organizationId: state.organizationId,
        previewVersion: version,
        cleanupCounts: cleanup.cleanupCounts,
        affectedRules: uniqueRuleImpact(state.ruleImpact),
        disabledRules: uniqueDisabledRules(cleanup.disabledRules)
      };
      await unifiedIdentityModel.appendAuditEvent({
        connection,
        eventType: 'hr_membership_permanently_deleted',
        actorPersonId: actorPersonId(authorizedActor),
        targetPersonId: safeString(state.person.person_id),
        organizationId: state.organizationId,
        contextId: safeString(authorizedActor && authorizedActor.contextId),
        requestId: safeString(data.requestId),
        ip: safeString(data.ip),
        detail: {
          scope: MEMBERSHIP_SCOPE,
          cleanupCounts: result.cleanupCounts,
          affectedRules: result.affectedRules,
          disabledRules: result.disabledRules
        }
      });
      return result;
    },
    options
  );
}

async function deletePersonPermanently(data, actor, options) {
  return executeWithIdempotency(
    data,
    actor,
    PERSON_SCOPE,
    'delete_person_permanently',
    async (connection, state, version, authorizedActor) => {
      if (safeString(data.confirmStudentId) !== safeString(state.person.student_id)) {
        throw new HrMemberDeletionError('person_deletion_confirmation_mismatch', 400);
      }
      const digest = deletionDigest(state.person);
      const cleanupCounts = {};
      const disabledRules = [];
      const affectedRules = state.ruleImpact.slice();
      for (const membership of state.allMemberships) {
        const membershipAssignments = state.allAssignments.filter(
          (item) => safeString(item.membership_id) === safeString(membership.id)
        );
        const target = {
          personId: safeString(state.person.person_id),
          organizationId: safeString(membership.org_id),
          legacyHrIds: [safeString(membership.legacy_hr_id)],
          assignmentIds: membershipAssignments.map((item) => safeString(item.id))
        };
        const cleanup = await deletionModel.cleanupMembershipArtifacts(connection, target);
        combineCleanupCounts(cleanupCounts, cleanup.cleanupCounts);
        disabledRules.push(...cleanup.disabledRules);
      }
      const globalCounts = await deletionModel.cleanupGlobalPersonArtifacts(
        connection,
        {
          personId: safeString(state.person.person_id),
          accountId: safeString(state.person.account_id),
          organizationIds: state.target.organizationIds,
          legacyAdminIds: state.adminReferences.map((item) => safeString(item.legacy_admin_id)),
          legacyHrIds: state.target.legacyHrIds,
          assignmentIds: state.target.assignmentIds,
          legacyOpenids: state.target.legacyOpenids
        },
        digest
      );
      combineCleanupCounts(cleanupCounts, globalCounts);
      const result = {
        scope: PERSON_SCOPE,
        deleted: true,
        idempotent: false,
        targetId: digest,
        previewVersion: version,
        cleanupCounts,
        affectedRules: uniqueRuleImpact(affectedRules),
        disabledRules: uniqueDisabledRules(disabledRules),
        deletionDigest: digest
      };
      await unifiedIdentityModel.appendAuditEvent({
        connection,
        eventType: 'person_permanently_deleted',
        actorPersonId: actorPersonId(authorizedActor),
        targetPersonId: null,
        organizationId: safeString(data.organizationId),
        contextId: safeString(authorizedActor && authorizedActor.contextId),
        requestId: safeString(data.requestId),
        ip: safeString(data.ip),
        detail: {
          scope: PERSON_SCOPE,
          deletionDigest: digest,
          cleanupCounts,
          affectedRules: result.affectedRules,
          disabledRules: result.disabledRules
        }
      });
      return result;
    },
    options
  );
}

module.exports = {
  MEMBERSHIP_SCOPE,
  PERSON_SCOPE,
  HrMemberDeletionError,
  buildPreviewVersion,
  assertClientRequestId,
  previewHrMemberDeletion,
  deleteHrMembershipPermanently,
  deletePersonPermanently
};
