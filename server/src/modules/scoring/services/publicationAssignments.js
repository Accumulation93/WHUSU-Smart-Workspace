const { safeString } = require('../../../utils/helpers');

function assignmentIdOf(assignment) {
  return safeString(assignment && (assignment.assignment_id || assignment.assignmentId || assignment.id));
}

function personIdOf(assignment) {
  return safeString(assignment && (assignment.person_id || assignment.personId || assignment.legacy_hr_id || assignment.legacyHrId));
}

function legacyHrIdOf(assignment) {
  return safeString(assignment && (assignment.legacy_hr_id || assignment.legacyHrId));
}

function parseContextSnapshot(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value) || {}; } catch (_) { return {}; }
}

function resolveRequestedAssignments(requestedIds, assignments) {
  const rows = Array.isArray(assignments) ? assignments : [];
  const ids = [...new Set((Array.isArray(requestedIds) ? requestedIds : []).map(safeString).filter(Boolean))];
  const byAssignmentId = new Map();
  const byLegacyHrId = new Map();
  rows.forEach((assignment) => {
    const assignmentId = assignmentIdOf(assignment);
    if (assignmentId) byAssignmentId.set(assignmentId, assignment);
    const legacyHrId = legacyHrIdOf(assignment);
    if (!legacyHrId) return;
    if (!byLegacyHrId.has(legacyHrId)) byLegacyHrId.set(legacyHrId, []);
    byLegacyHrId.get(legacyHrId).push(assignment);
  });

  const targets = [];
  const seenAssignmentIds = new Set();
  for (const requestedId of ids) {
    let assignment = byAssignmentId.get(requestedId) || null;
    if (!assignment) {
      const legacyMatches = byLegacyHrId.get(requestedId) || [];
      if (legacyMatches.length > 1) {
        return { ok: false, status: 'ambiguous_assignment', targetId: requestedId, targets: [] };
      }
      assignment = legacyMatches[0] || null;
    }
    if (!assignment) return { ok: false, status: 'invalid_assignment', targetId: requestedId, targets: [] };
    const assignmentId = assignmentIdOf(assignment);
    if (!assignmentId || seenAssignmentIds.has(assignmentId)) continue;
    seenAssignmentIds.add(assignmentId);
    targets.push(assignment);
  }
  return { ok: true, targets };
}

function matchesRuleGrantee(assignment, rule) {
  if (!assignment || !rule) return false;
  return safeString(assignment.department_id || assignment.departmentId) === safeString(rule.grantee_department_id || rule.granteeDepartmentId)
    && safeString(assignment.identity_id || assignment.identityId) === safeString(rule.grantee_identity_id || rule.granteeIdentityId);
}

function matchesMeritClause(target, clause, viewer) {
  if (!target || !clause || !viewer) return false;
  const targetIdentityId = safeString(target.identity_id || target.identityId);
  const requiredIdentityId = safeString(clause.target_identity_id || clause.targetIdentityId);
  if (requiredIdentityId && targetIdentityId !== requiredIdentityId) return false;

  const scopeType = safeString(clause.scope_type || clause.scopeType || 'all_people');
  const targetDepartmentId = safeString(target.department_id || target.departmentId);
  const viewerDepartmentId = safeString(viewer.department_id || viewer.departmentId);
  const targetWorkGroupId = safeString(target.work_group_id || target.workGroupId);
  const viewerWorkGroupId = safeString(viewer.work_group_id || viewer.workGroupId);

  if (scopeType === 'own_results') return personIdOf(target) === personIdOf(viewer);
  if (scopeType === 'all_people' || scopeType === 'identity_only') return true;
  if (scopeType === 'same_department_identity' || scopeType === 'same_department_all') {
    return targetDepartmentId === viewerDepartmentId;
  }
  if (scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') {
    return targetDepartmentId === viewerDepartmentId
      && !!targetWorkGroupId
      && targetWorkGroupId === viewerWorkGroupId;
  }
  return false;
}

function buildAssignmentLabel(assignment, lookups) {
  if (assignment && typeof assignment.assignmentLabel === 'string' && safeString(assignment.assignmentLabel)) {
    return safeString(assignment.assignmentLabel);
  }
  const source = assignment && assignment.assignmentLabel && typeof assignment.assignmentLabel === 'object'
    ? Object.assign({}, assignment, assignment.assignmentLabel)
    : (assignment || {});
  const lookupData = lookups || {};
  const departmentsById = lookupData.departmentsById || new Map();
  const identitiesById = lookupData.identitiesById || new Map();
  const workGroupsById = lookupData.workGroupsById || new Map();
  const departmentId = safeString(source.department_id || source.departmentId);
  const identityCategoryId = safeString(source.identity_id || source.identityCategoryId || source.identityId);
  const workGroupId = safeString(source.work_group_id || source.workGroupId);
  const identityCategory = identitiesById.get(identityCategoryId) || safeString(source.identityCategory || source.identity);
  const department = departmentsById.get(departmentId) || safeString(source.department);
  const workGroup = workGroupsById.get(workGroupId) || safeString(source.workGroup || source.work_group);
  return [identityCategory, department, workGroup].filter(Boolean).join(' · ');
}

function buildDesignationCandidates(assignments, clauses, viewer, lookups, selectedAssignmentIds) {
  const rows = Array.isArray(assignments) ? assignments : [];
  const ruleClauses = Array.isArray(clauses) ? clauses : [];
  const selected = selectedAssignmentIds instanceof Set ? selectedAssignmentIds : new Set();
  const candidates = [];
  const seenAssignmentIds = new Set();

  for (const clause of ruleClauses) {
    const targetIdentityId = safeString(clause.target_identity_id || clause.targetIdentityId);
    const targetIdentity = lookups && lookups.identitiesById
      ? (lookups.identitiesById.get(targetIdentityId) || '')
      : '';
    for (const assignment of rows) {
      const assignmentId = assignmentIdOf(assignment);
      if (!assignmentId || seenAssignmentIds.has(assignmentId)) continue;
      if (!matchesMeritClause(assignment, clause, viewer)) continue;
      const legacyHrId = legacyHrIdOf(assignment);
      if (!legacyHrId) continue;
      seenAssignmentIds.add(assignmentId);
      const assignmentLabel = buildAssignmentLabel(assignment, lookups);
      candidates.push({
        id: assignmentId,
        targetHrId: legacyHrId,
        targetAssignmentId: assignmentId,
        assignmentId,
        personId: safeString(assignment.person_id || assignment.personId),
        name: safeString(assignment.name),
        studentId: safeString(assignment.student_id || assignment.studentId),
        assignmentNature: safeString(assignment.assignment_kind || assignment.assignmentNature),
        assignmentLabel,
        departmentId: safeString(assignment.department_id || assignment.departmentId),
        department: safeString(assignment.department) || (lookups.departmentsById.get(safeString(assignment.department_id || assignment.departmentId)) || ''),
        identityId: safeString(assignment.identity_id || assignment.identityCategoryId || assignment.identityId),
        identity: safeString(assignment.identityCategory || assignment.identity) || (lookups.identitiesById.get(safeString(assignment.identity_id || assignment.identityCategoryId || assignment.identityId)) || ''),
        identityCategoryId: safeString(assignment.identity_id || assignment.identityCategoryId || assignment.identityId),
        identityCategory: safeString(assignment.identityCategory || assignment.identity) || (lookups.identitiesById.get(safeString(assignment.identity_id || assignment.identityCategoryId || assignment.identityId)) || ''),
        workGroupId: safeString(assignment.work_group_id || assignment.workGroupId),
        workGroup: safeString(assignment.workGroup || assignment.work_group) || (lookups.workGroupsById.get(safeString(assignment.work_group_id || assignment.workGroupId)) || ''),
        isSelected: selected.has(assignmentId),
        targetIdentityId,
        targetIdentity
      });
    }
  }

  const assignmentCountByPerson = new Map();
  candidates.forEach((candidate) => {
    const personKey = safeString(candidate.personId || candidate.targetHrId);
    assignmentCountByPerson.set(personKey, (assignmentCountByPerson.get(personKey) || 0) + 1);
  });
  let needsAssignmentDisambiguation = false;
  const decorated = candidates.map((candidate) => {
    const personKey = safeString(candidate.personId || candidate.targetHrId);
    if ((assignmentCountByPerson.get(personKey) || 0) < 2) return candidate;
    needsAssignmentDisambiguation = true;
    return Object.assign({}, candidate, {
      needsAssignmentDisambiguation: true,
      assignmentLabel: buildAssignmentLabel(candidate, lookups)
    });
  });

  return { rows: decorated, needsAssignmentDisambiguation };
}

function validateDesignationTargets(designationTargetIds, assignments, clauses, viewer) {
  const activeAssignments = Array.isArray(assignments) ? assignments : [];
  const ruleClauses = Array.isArray(clauses) ? clauses : [];
  const resolved = resolveRequestedAssignments(designationTargetIds, activeAssignments);
  if (!resolved.ok) return resolved;
  for (const assignment of resolved.targets) {
    const inScope = ruleClauses.some((clause) => matchesMeritClause(assignment, clause, viewer));
    if (!inScope) {
      return {
        ok: false,
        status: 'out_of_scope',
        targetId: assignmentIdOf(assignment),
        targets: []
      };
    }
  }
  return { ok: true, targets: resolved.targets };
}

function resolveDesignationAssignmentId(designation) {
  const snapshot = parseContextSnapshot(designation && designation.target_context_snapshot);
  const explicit = safeString(designation && designation.target_assignment_id) || safeString(snapshot.assignmentId);
  if (explicit) return explicit;
  return '';
}

function buildDesignationPresentation(designation, lookups) {
  const snapshot = parseContextSnapshot(designation && designation.target_context_snapshot);
  const assignmentId = resolveDesignationAssignmentId(designation);
  const hasHistoricalAssignment = Boolean(
    safeString(snapshot.assignmentId)
    || safeString(snapshot.assignmentNature)
    || safeString(snapshot.departmentId)
    || safeString(snapshot.department)
    || safeString(snapshot.identityCategoryId)
    || safeString(snapshot.identityCategory)
    || safeString(snapshot.workGroupId)
    || safeString(snapshot.workGroup)
    || safeString(snapshot.assignmentLabel)
  );
  const departmentId = hasHistoricalAssignment ? safeString(snapshot.departmentId) : '';
  const identityId = hasHistoricalAssignment ? safeString(snapshot.identityCategoryId) : '';
  const workGroupId = hasHistoricalAssignment ? safeString(snapshot.workGroupId) : '';
  return {
    id: safeString(designation && designation.id),
    clauseId: safeString(designation && (designation.clause_id || designation.permission_id)),
    targetAssignmentId: assignmentId,
    targetHrId: safeString(snapshot.legacyHrId || designation && designation.target_hr_id),
    personId: safeString(snapshot.personId),
    name: safeString(snapshot.name),
    studentId: safeString(snapshot.studentId),
    assignmentNature: hasHistoricalAssignment ? safeString(snapshot.assignmentNature) : '',
    assignmentLabel: hasHistoricalAssignment ? buildAssignmentLabel(snapshot, lookups) : '',
    historicalAssignmentUnavailable: !hasHistoricalAssignment,
    departmentId,
    department: hasHistoricalAssignment ? safeString(snapshot.department) : '',
    identityId,
    identityCategoryId: identityId,
    identityCategory: hasHistoricalAssignment ? safeString(snapshot.identityCategory) : '',
    identity: hasHistoricalAssignment ? safeString(snapshot.identityCategory) : '',
    workGroupId,
    workGroup: hasHistoricalAssignment ? safeString(snapshot.workGroup) : '',
    targetContextSnapshot: snapshot
  };
}

function collectRuleCategories(assignments) {
  const categories = new Map();
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const departmentId = safeString(assignment.department_id || assignment.departmentId);
    const identityCategoryId = safeString(assignment.identity_id || assignment.identityId);
    if (!departmentId || !identityCategoryId) return;
    const key = departmentId + '::' + identityCategoryId;
    if (!categories.has(key)) categories.set(key, { deptId: departmentId, identId: identityCategoryId });
  });
  return categories;
}

module.exports = {
  assignmentIdOf,
  personIdOf,
  legacyHrIdOf,
  parseContextSnapshot,
  resolveRequestedAssignments,
  matchesRuleGrantee,
  matchesMeritClause,
  buildAssignmentLabel,
  buildDesignationCandidates,
  validateDesignationTargets,
  resolveDesignationAssignmentId,
  buildDesignationPresentation,
  collectRuleCategories
};
