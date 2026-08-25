const pool = require('../../../config/db');
const unifiedIdentityModel = require('../../../core/models/unifiedIdentity');
const { safeString } = require('../../../utils/helpers');

function parseObject(raw) {
  if (!raw) return {};
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = safeString(source && source[key]);
    if (value) return value;
  }
  return '';
}

function normalizeAssignment(source) {
  const row = source || {};
  const assignment = {
    contextId: firstString(row, ['contextId', 'context_id']),
    assignmentId: firstString(row, ['assignmentId', 'assignment_id', 'creatorAssignmentId', 'approverAssignmentId']),
    membershipId: firstString(row, ['membershipId', 'membership_id']),
    personId: firstString(row, ['personId', 'person_id']),
    legacyHrId: firstString(row, ['legacyHrId', 'legacy_hr_id', 'hrId', 'id']),
    organizationId: firstString(row, ['organizationId', 'organization_id', 'orgId', 'org_id']),
    assignmentKind: firstString(row, ['assignmentKind', 'assignment_kind']) || 'staff',
    departmentId: firstString(row, ['departmentId', 'department_id']),
    identityCategoryId: firstString(row, ['identityCategoryId', 'identityId', 'identity_id']),
    workGroupId: firstString(row, ['workGroupId', 'work_group_id']),
    personName: firstString(row, ['personName', 'person_name', 'name']),
    studentId: firstString(row, ['studentId', 'student_id']),
    departmentName: firstString(row, ['departmentName', 'department_name', 'department']),
    identityCategoryName: firstString(row, ['identityCategoryName', 'identityName', 'identity_name', 'identity']),
    workGroupName: firstString(row, ['workGroupName', 'work_group_name', 'workGroup'])
  };
  assignment.assignmentLabel = firstString(row, ['assignmentLabel', 'assignment_label'])
    || [assignment.identityCategoryName, assignment.departmentName, assignment.workGroupName].filter(Boolean).join(' · ');
  return assignment;
}

function toRuleProfile(assignment) {
  const value = normalizeAssignment(assignment);
  return {
    id: value.legacyHrId,
    org_id: value.organizationId,
    person_id: value.personId,
    membership_id: value.membershipId,
    assignment_id: value.assignmentId,
    assignment_kind: value.assignmentKind,
    department_id: value.departmentId,
    identity_id: value.identityCategoryId,
    work_group_id: value.workGroupId,
    name: value.personName,
    student_id: value.studentId,
    department_name: value.departmentName,
    identity_name: value.identityCategoryName,
    work_group_name: value.workGroupName,
    assignment_label: value.assignmentLabel
  };
}

function toAssignmentSnapshot(assignment) {
  const value = normalizeAssignment(assignment);
  if (!value.assignmentId) return null;
  return {
    contextId: value.contextId,
    assignmentId: value.assignmentId,
    membershipId: value.membershipId,
    personId: value.personId,
    legacyHrId: value.legacyHrId,
    organizationId: value.organizationId,
    assignmentKind: value.assignmentKind,
    departmentId: value.departmentId,
    identityCategoryId: value.identityCategoryId,
    workGroupId: value.workGroupId,
    personName: value.personName,
    studentId: value.studentId,
    departmentName: value.departmentName,
    identityCategoryName: value.identityCategoryName,
    workGroupName: value.workGroupName,
    assignmentLabel: value.assignmentLabel
  };
}

function overlayStoredSnapshot(current, stored) {
  const result = Object.assign({}, current);
  Object.keys(stored || {}).forEach(function(key) {
    if (safeString(stored[key])) result[key] = stored[key];
  });
  return result;
}

const ASSIGNMENT_SELECT = `SELECT ma.id AS assignment_id, ma.membership_id, ma.org_id,
       ma.assignment_kind, ma.department_id, ma.identity_id, ma.work_group_id,
       ma.status AS assignment_status, om.person_id, om.legacy_hr_id,
       om.status AS membership_status, p.name AS person_name, p.student_id,
       p.status AS person_status, d.name AS department_name,
       i.name AS identity_name, w.name AS work_group_name
  FROM membership_assignments ma
  JOIN organization_memberships om
    ON om.id = ma.membership_id AND om.org_id = ma.org_id
  JOIN persons p ON p.id = om.person_id
  LEFT JOIN departments d ON d.id = ma.department_id AND d.org_id = ma.org_id
  LEFT JOIN identities i ON i.id = ma.identity_id AND i.org_id = ma.org_id
  LEFT JOIN work_groups w ON w.id = ma.work_group_id AND w.org_id = ma.org_id`;

async function loadAssignmentById(assignmentId, orgId, activeOnly) {
  const id = safeString(assignmentId);
  if (!id) return null;
  const params = [id];
  let where = ' WHERE ma.id = ?';
  if (safeString(orgId)) {
    where += ' AND ma.org_id = ?';
    params.push(safeString(orgId));
  }
  if (activeOnly !== false) {
    where += " AND ma.status = 'active' AND om.status = 'active' AND p.status = 'active'";
  }
  const [rows] = await pool.query(ASSIGNMENT_SELECT + where + ' LIMIT 1', params);
  return rows[0] ? normalizeAssignment(rows[0]) : null;
}

async function listActiveAssignmentsByPerson(personId, orgId) {
  const params = [safeString(personId)];
  let where = " WHERE om.person_id = ? AND ma.status = 'active' AND om.status = 'active' AND p.status = 'active'";
  if (safeString(orgId)) {
    where += ' AND ma.org_id = ?';
    params.push(safeString(orgId));
  }
  const [rows] = await pool.query(ASSIGNMENT_SELECT + where + ' ORDER BY ma.created_at, ma.id', params);
  return rows.map(normalizeAssignment);
}

async function listActiveAssignmentsByLegacyHrId(legacyHrId, orgId) {
  const params = [safeString(legacyHrId)];
  let where = " WHERE om.legacy_hr_id = ? AND ma.status = 'active' AND om.status = 'active' AND p.status = 'active'";
  if (safeString(orgId)) {
    where += ' AND ma.org_id = ?';
    params.push(safeString(orgId));
  }
  const [rows] = await pool.query(ASSIGNMENT_SELECT + where + ' ORDER BY ma.created_at, ma.id', params);
  return rows.map(normalizeAssignment);
}

async function listActiveAssignmentsByOrg(orgId) {
  const [rows] = await pool.query(
    ASSIGNMENT_SELECT
      + " WHERE ma.org_id = ? AND ma.status = 'active' AND om.status = 'active' AND p.status = 'active'"
      + ' ORDER BY p.name, ma.created_at, ma.id',
    [safeString(orgId)]
  );
  return rows.map(normalizeAssignment);
}

async function resolveCurrentActorAssignment(actor, orgId) {
  if (!actor || actor.type !== 'user') return null;
  // 统一认证明确选择了“仅组织成员”上下文时，不得偷偷回退到某个岗位。
  if (safeString(actor.contextId) && !safeString(actor.assignmentId)) return null;
  const targetOrgId = safeString(orgId);
  let assignment = null;
  if (safeString(actor.assignmentId)) {
    assignment = await loadAssignmentById(actor.assignmentId, targetOrgId, true);
  } else {
    const compatible = await listActiveAssignmentsByLegacyHrId(actor.id, targetOrgId);
    assignment = compatible.length === 1 ? compatible[0] : null;
  }
  if (!assignment) return null;
  if (safeString(actor.personId) && assignment.personId !== safeString(actor.personId)) return null;
  if (safeString(actor.id) && assignment.legacyHrId !== safeString(actor.id)) return null;
  return assignment;
}

async function resolveBookingApplicantAssignment(booking) {
  if (!booking) return null;
  const stored = normalizeAssignment(parseObject(booking.creator_context_snapshot));
  stored.assignmentId = stored.assignmentId || safeString(booking.creator_assignment_id);
  stored.personId = stored.personId || safeString(booking.creator_person_id);
  stored.legacyHrId = stored.legacyHrId || safeString(booking.user_hr_id);
  stored.organizationId = stored.organizationId || safeString(booking.creator_org_id);
  const hasCompleteAssignmentSnapshot = Boolean(
    stored.assignmentId && stored.departmentId && stored.identityCategoryId
  );
  if (hasCompleteAssignmentSnapshot) {
    return Object.assign(stored, {
      source: 'snapshot',
      historicalSnapshotComplete: true
    });
  }
  // 不完整快照不得用当前岗位补齐；人员调岗后，当前值不能反向改变历史审批条件。
  // 没有完整不可变岗位快照时统一失败关闭，等待管理员按历史资料处理。
  return null;
}

async function resolveBookingApplicantAssignments(bookings) {
  const result = new Map();
  for (const booking of (bookings || [])) {
    result.set(safeString(booking.id), await resolveBookingApplicantAssignment(booking));
  }
  return result;
}

function contextToActor(context) {
  if (!context) return null;
  if (context.role === 'admin') {
    return {
      type: 'admin',
      id: safeString(context.legacyAdminId || context.adminGrantId),
      personId: safeString(context.personId),
      adminGrantId: safeString(context.adminGrantId),
      adminLevel: safeString(context.adminLevel),
      contextId: safeString(context.contextId),
      organizationId: safeString(context.organizationId),
      name: safeString(context.name)
    };
  }
  const assignment = safeString(context.assignmentId) ? normalizeAssignment({
    contextId: context.contextId,
    assignmentId: context.assignmentId,
    membershipId: context.membershipId,
    personId: context.personId,
    legacyHrId: context.legacyHrId,
    organizationId: context.organizationId,
    assignmentKind: context.assignmentNature || context.assignmentKind,
    departmentId: context.departmentId,
    identityCategoryId: context.identityId,
    workGroupId: context.workGroupId,
    personName: context.name,
    studentId: context.studentId,
    departmentName: context.department,
    identityCategoryName: context.identityCategoryName || context.identity,
    workGroupName: context.workGroup,
    assignmentLabel: context.assignmentLabel || context.identityName
  }) : null;
  return {
    type: 'user',
    id: assignment ? assignment.legacyHrId : safeString(context.legacyHrId),
    personId: assignment ? assignment.personId : safeString(context.personId),
    membershipId: assignment ? assignment.membershipId : safeString(context.membershipId),
    assignmentId: assignment ? assignment.assignmentId : '',
    contextId: assignment ? assignment.contextId : safeString(context.contextId),
    organizationId: assignment ? assignment.organizationId : safeString(context.organizationId),
    name: assignment ? assignment.personName : safeString(context.name),
    assignment,
    profile: assignment ? toRuleProfile(assignment) : null
  };
}

async function listAccountWorkActors(accountId) {
  if (!safeString(accountId)) return [];
  const contexts = await unifiedIdentityModel.listContexts(safeString(accountId));
  return contexts.map(contextToActor).filter(Boolean);
}

async function listApproverCandidates(orgId, excludeLegacyHrId) {
  const [rows] = await pool.query(
    ASSIGNMENT_SELECT
      + " WHERE ma.org_id = ? AND ma.status = 'active' AND om.status = 'active' AND p.status = 'active'"
      + ' ORDER BY p.name, p.student_id, ma.created_at, ma.id',
    [safeString(orgId)]
  );
  return rows.map(normalizeAssignment).filter(function(assignment) {
    if (safeString(excludeLegacyHrId) && assignment.legacyHrId === safeString(excludeLegacyHrId)) return;
    return true;
  }).map(function(assignment) {
    return {
      id: assignment.assignmentId,
      assignmentId: assignment.assignmentId,
      contextId: assignment.contextId,
      hrId: assignment.legacyHrId,
      legacyHrId: assignment.legacyHrId,
      personId: assignment.personId,
      organizationId: assignment.organizationId,
      name: assignment.personName,
      studentId: assignment.studentId,
      assignment: toAssignmentSnapshot(assignment),
      assignmentLabel: assignment.assignmentLabel
    };
  });
}

function designationPersonId(designation) {
  return firstString(typeof designation === 'object' ? designation : {}, ['personId', 'person_id']);
}

function designationLegacyHrId(designation) {
  if (typeof designation === 'string') return safeString(designation);
  return firstString(designation || {}, ['legacyHrId', 'hrId', 'id']);
}

function designationAssignmentId(designation) {
  return firstString(typeof designation === 'object' ? designation : {}, [
    'assignmentId',
    'assignment_id'
  ]);
}

function actorMatchesDesignation(actor, designation) {
  const assignmentId = designationAssignmentId(designation);
  if (assignmentId) {
    return safeString(actor && actor.assignmentId) === assignmentId
      && (!designationPersonId(designation)
        || safeString(actor && actor.personId) === designationPersonId(designation))
      && (!designationLegacyHrId(designation)
        || safeString(actor && actor.id) === designationLegacyHrId(designation));
  }
  // 旧的仅人员指定没有岗位约束，不能继续作为岗位规则授权依据。
  return false;
}

module.exports = {
  parseObject,
  normalizeAssignment,
  toRuleProfile,
  toAssignmentSnapshot,
  loadAssignmentById,
  listActiveAssignmentsByPerson,
  listActiveAssignmentsByLegacyHrId,
  listActiveAssignmentsByOrg,
  resolveCurrentActorAssignment,
  resolveBookingApplicantAssignment,
  resolveBookingApplicantAssignments,
  contextToActor,
  listAccountWorkActors,
  listApproverCandidates,
  designationPersonId,
  designationLegacyHrId,
  designationAssignmentId,
  actorMatchesDesignation
};
