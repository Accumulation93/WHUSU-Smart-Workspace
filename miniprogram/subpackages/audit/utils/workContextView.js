function safeString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function buildAssignmentLabel(source) {
  const item = source || {};
  const direct = safeString(item.assignmentLabel || item.assignmentName);
  if (direct) return direct;
  return [
    item.identityCategoryName || item.identityCategory || item.identity,
    item.departmentName || item.department,
    item.workGroupName || item.workGroup
  ].map(safeString).filter(Boolean).join(' · ');
}

function normalizeAssignment(source, activeAssignmentId) {
  const item = source || {};
  const assignmentId = safeString(item.assignmentId || item.id);
  return {
    assignmentId,
    assignmentNature: safeString(item.assignmentNature || item.assignmentKind),
    assignmentLabel: buildAssignmentLabel(item),
    departmentId: safeString(item.departmentId),
    department: safeString(item.departmentName || item.department),
    identityCategoryId: safeString(item.identityCategoryId || item.identityId),
    identityCategory: safeString(item.identityCategoryName || item.identityCategory || item.identity),
    workGroupId: safeString(item.workGroupId),
    workGroup: safeString(item.workGroupName || item.workGroup),
    isCurrent: Boolean(assignmentId && assignmentId === safeString(activeAssignmentId))
  };
}

function legacyCandidateAssignment(candidate, activeAssignmentId) {
  const item = candidate || {};
  const hasAssignmentData = item.assignmentId || item.departmentId || item.identityCategoryId
    || item.identityId || item.workGroupId || item.assignmentLabel || item.department
    || item.identityCategory || item.identity || item.workGroup;
  return hasAssignmentData ? normalizeAssignment(item, activeAssignmentId) : null;
}

function normalizeCandidate(candidate, activeAssignmentId) {
  const item = candidate || {};
  let assignments = Array.isArray(item.eligibleAssignments)
    ? item.eligibleAssignments.map(function(assignment) {
      return normalizeAssignment(assignment, activeAssignmentId);
    })
    : [];
  if (!assignments.length) {
    const legacy = legacyCandidateAssignment(item, activeAssignmentId);
    if (legacy) assignments = [legacy];
  }
  assignments = assignments.filter(function(assignment) {
    return assignment.assignmentId || assignment.assignmentLabel;
  });
  const primary = assignments[0] || {};
  const values = function(key) {
    return assignments.map(function(assignment) { return assignment[key]; }).filter(Boolean);
  };
  const unique = function(list) {
    return (list || []).filter(function(value, index, source) {
      return source.indexOf(value) === index;
    });
  };
  return Object.assign({}, item, {
    id: safeString(item.id || item.hrId),
    studentId: safeString(item.studentId),
    eligibleAssignments: assignments,
    eligibleAssignmentLabels: unique(values('assignmentLabel')),
    eligibleDepartments: unique(values('department')),
    eligibleIdentityCategories: unique(values('identityCategory')),
    eligibleWorkGroups: unique(values('workGroup')),
    department: safeString(primary.department),
    identityCategory: safeString(primary.identityCategory),
    identity: safeString(primary.identityCategory),
    workGroup: safeString(primary.workGroup),
    currentContextEligible: assignments.some(function(assignment) { return assignment.isCurrent; })
  });
}

function filterCandidateAssignments(candidate, filters) {
  const item = candidate || {};
  const options = filters || {};
  const assignments = Array.isArray(item.eligibleAssignments) ? item.eligibleAssignments : [];
  const hasAssignmentFilters = Boolean(options.department || options.identityCategory || options.workGroup);
  const matchingAssignments = assignments.filter(function(assignment) {
    if (options.department && assignment.department !== options.department) return false;
    if (options.identityCategory && assignment.identityCategory !== options.identityCategory) return false;
    if (options.workGroup && assignment.workGroup !== options.workGroup) return false;
    return true;
  });
  if (hasAssignmentFilters && !matchingAssignments.length) return null;
  const keyword = safeString(options.keyword).trim().toLowerCase();
  if (!keyword) return Object.assign({}, item, { eligibleAssignments: matchingAssignments });
  const personSearchable = [item.name, item.studentId].map(safeString).join(' ').toLowerCase();
  if (personSearchable.indexOf(keyword) >= 0) {
    return Object.assign({}, item, { eligibleAssignments: matchingAssignments });
  }
  const keywordAssignments = matchingAssignments.filter(function(assignment) {
    return [
      assignment.assignmentLabel,
      assignment.department,
      assignment.identityCategory,
      assignment.workGroup
    ].map(safeString).join(' ').toLowerCase().indexOf(keyword) >= 0;
  });
  return keywordAssignments.length
    ? Object.assign({}, item, { eligibleAssignments: keywordAssignments })
    : null;
}

function candidateMatches(candidate, filters) {
  return Boolean(filterCandidateAssignments(candidate, filters));
}

function selectedAssignmentViews(persons, selectedAssignmentIds, unavailableLabel) {
  const selected = (Array.isArray(selectedAssignmentIds) ? selectedAssignmentIds : []).map(safeString);
  const views = [];
  (Array.isArray(persons) ? persons : []).forEach(function(person) {
    (person.eligibleAssignments || []).forEach(function(assignment) {
      const assignmentId = safeString(assignment.assignmentId);
      if (!assignmentId || selected.indexOf(assignmentId) < 0) return;
      views.push({
        selectionKey: assignmentId,
        id: safeString(person.id),
        name: safeString(person.name),
        studentId: safeString(person.studentId),
        assignmentId,
        assignmentLabel: safeString(assignment.assignmentLabel) || safeString(unavailableLabel),
        assignmentNature: safeString(assignment.assignmentNature),
        departmentId: safeString(assignment.departmentId),
        department: safeString(assignment.department),
        identityCategoryId: safeString(assignment.identityCategoryId),
        identityCategory: safeString(assignment.identityCategory),
        workGroupId: safeString(assignment.workGroupId),
        workGroup: safeString(assignment.workGroup),
        isCurrent: assignment.isCurrent === true
      });
    });
  });
  return views;
}

function decorateAssignmentSelection(persons, selectedAssignmentIds) {
  const selected = (Array.isArray(selectedAssignmentIds) ? selectedAssignmentIds : []).map(safeString);
  return (Array.isArray(persons) ? persons : []).map(function(person) {
    const assignments = (person.eligibleAssignments || []).map(function(assignment) {
      return Object.assign({}, assignment, {
        isSelected: selected.indexOf(safeString(assignment.assignmentId)) >= 0
      });
    });
    return Object.assign({}, person, {
      eligibleAssignments: assignments,
      isSelected: assignments.some(function(assignment) { return assignment.isSelected; })
    });
  });
}

function normalizeSnapshot(snapshot) {
  let source = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!source && typeof snapshot === 'string' && snapshot.trim()) {
    try {
      const parsed = JSON.parse(snapshot);
      source = parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      source = null;
    }
  }
  if (!source) return { hasSnapshot: false, assignmentLabel: '' };
  const assignmentLabel = buildAssignmentLabel(source);
  const hasSnapshot = Boolean(source.assignmentId || assignmentLabel);
  if (!hasSnapshot) return { hasSnapshot: false, assignmentLabel: '' };
  return {
    hasSnapshot: true,
    contextId: safeString(source.contextId),
    organizationId: safeString(source.organizationId),
    organizationName: safeString(source.organizationName),
    assignmentId: safeString(source.assignmentId),
    assignmentNature: safeString(source.assignmentNature || source.assignmentKind),
    assignmentLabel,
    department: safeString(source.departmentName || source.department),
    identityCategory: safeString(source.identityCategoryName || source.identityCategory || source.identity),
    workGroup: safeString(source.workGroupName || source.workGroup)
  };
}

function normalizeCurrentWorkContext(workContexts, selection, profile) {
  const selected = selection || {};
  const rows = Array.isArray(workContexts) ? workContexts : [];
  const contextId = safeString(selected.contextId);
  const context = rows.find(function(item) {
    return safeString(item && item.contextId) === contextId;
  }) || {};
  const merged = Object.assign({}, profile || {}, context);
  return {
    contextId,
    organizationId: safeString(context.organizationId || selected.organizationId),
    organizationName: safeString(context.organizationName),
    assignmentId: safeString(context.assignmentId || (profile && profile.assignmentId)),
    assignmentLabel: buildAssignmentLabel(merged),
    hasAssignment: Boolean(context.assignmentId || (profile && profile.assignmentId))
  };
}

function contextLabels(source) {
  const item = source || {};
  const contexts = item.requiredWorkContexts || item.eligibleWorkContexts || item.workContexts || item.eligibleAssignments || [];
  return (Array.isArray(contexts) ? contexts : []).map(buildAssignmentLabel).filter(Boolean)
    .filter(function(value, index, source) { return source.indexOf(value) === index; });
}

function normalizePendingItem(source, currentContext) {
  const item = source || {};
  const context = currentContext || {};
  const requiredOrganizationId = safeString(item.requiredOrganizationId || item.organizationId || item.orgId);
  const rawContextIds = item.requiredContextIds || item.eligibleContextIds || [];
  const rawAssignmentIds = item.requiredAssignmentIds || item.eligibleAssignmentIds || item.assignmentIds || [];
  const requiredContextIds = (Array.isArray(rawContextIds) ? rawContextIds : [rawContextIds])
    .map(safeString).filter(Boolean);
  const requiredAssignmentIds = (Array.isArray(rawAssignmentIds) ? rawAssignmentIds : [rawAssignmentIds])
    .map(safeString).filter(Boolean);
  const hasExplicitRequirement = Boolean(requiredOrganizationId || requiredContextIds.length || requiredAssignmentIds.length);
  const organizationMatches = !requiredOrganizationId || requiredOrganizationId === safeString(context.organizationId);
  const contextMatches = !requiredContextIds.length || requiredContextIds.indexOf(safeString(context.contextId)) >= 0;
  const assignmentMatches = !requiredAssignmentIds.length || requiredAssignmentIds.indexOf(safeString(context.assignmentId)) >= 0;
  return Object.assign({}, item, {
    requiredOrganizationId,
    requiredOrganizationName: safeString(item.requiredOrganizationName || item.organizationName || item.orgName),
    eligibleContextLabels: contextLabels(item),
    requiresContextSwitch: hasExplicitRequirement && !(organizationMatches && contextMatches && assignmentMatches)
  });
}

function isContextFailure(result) {
  const status = safeString(result && result.status);
  return [
    'forbidden',
    'wrong_context',
    'context_forbidden',
    'assignment_required',
    'assignment_mismatch',
    'wrong_assignment',
    'org_context_mismatch'
  ].indexOf(status) >= 0;
}

module.exports = {
  buildAssignmentLabel,
  normalizeAssignment,
  normalizeCandidate,
  filterCandidateAssignments,
  candidateMatches,
  selectedAssignmentViews,
  decorateAssignmentSelection,
  normalizeSnapshot,
  normalizeCurrentWorkContext,
  normalizePendingItem,
  isContextFailure
};
