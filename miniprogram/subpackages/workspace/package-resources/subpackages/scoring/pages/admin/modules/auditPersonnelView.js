'use strict';

const ALL_FILTER_KEY = '__all__';

function safeText(value) {
  return String(value || '').trim();
}

function buildAssignmentLabel(source) {
  return safeText(source.assignmentLabel) || [
    safeText(source.identityCategoryName || source.identity),
    safeText(source.department),
    safeText(source.workGroup)
  ].filter(Boolean).join(' · ');
}

function normalizeAssignment(source) {
  const assignment = source || {};
  const department = safeText(assignment.department);
  const identityCategoryName = safeText(assignment.identityCategoryName || assignment.identity);
  const workGroup = safeText(assignment.workGroup);
  const departmentKey = safeText(assignment.departmentId) || ('name:' + department);
  const identityKey = safeText(assignment.identityCategoryId || assignment.identityId) || ('name:' + identityCategoryName);
  const workGroupKey = safeText(assignment.workGroupId) || (workGroup ? departmentKey + '|name:' + workGroup : '');
  return {
    assignmentId: safeText(assignment.assignmentId || assignment.id),
    department,
    identityCategoryName,
    workGroup,
    departmentKey,
    identityKey,
    workGroupKey,
    assignmentLabel: buildAssignmentLabel(assignment)
  };
}

function normalizePerson(source) {
  const person = source || {};
  return {
    id: safeText(person.id),
    name: safeText(person.name),
    studentId: safeText(person.studentId),
    assignments: (Array.isArray(person.assignments) ? person.assignments : [])
      .map(normalizeAssignment)
      .filter((assignment) => assignment.assignmentId)
  };
}

function appendOption(map, key, label) {
  if (!key || !label || map.has(key)) return;
  map.set(key, { key, label });
}

function buildAuditPersonnelFilterOptions(sourceList, allLabel) {
  const departments = new Map();
  const identities = new Map();
  const workGroups = new Map();
  (Array.isArray(sourceList) ? sourceList : []).forEach((source) => {
    normalizePerson(source).assignments.forEach((assignment) => {
      appendOption(departments, assignment.departmentKey, assignment.department);
      appendOption(identities, assignment.identityKey, assignment.identityCategoryName);
      appendOption(
        workGroups,
        assignment.workGroupKey,
        assignment.workGroup ? [assignment.department, assignment.workGroup].filter(Boolean).join(' · ') : ''
      );
    });
  });
  const first = { key: ALL_FILTER_KEY, label: safeText(allLabel) };
  const sortByLabel = (left, right) => left.label.localeCompare(right.label, 'zh-CN');
  return {
    departments: [first].concat(Array.from(departments.values()).sort(sortByLabel)),
    identities: [first].concat(Array.from(identities.values()).sort(sortByLabel)),
    workGroups: [first].concat(Array.from(workGroups.values()).sort(sortByLabel))
  };
}

function assignmentMatches(assignment, filters) {
  const source = filters || {};
  return (!source.departmentKey || source.departmentKey === ALL_FILTER_KEY || assignment.departmentKey === source.departmentKey)
    && (!source.identityKey || source.identityKey === ALL_FILTER_KEY || assignment.identityKey === source.identityKey)
    && (!source.workGroupKey || source.workGroupKey === ALL_FILTER_KEY || assignment.workGroupKey === source.workGroupKey);
}

function filterAuditPersonnel(sourceList, filters, keyword, limit) {
  const text = safeText(keyword).toLowerCase();
  const max = Math.max(0, Number(limit) || 0);
  const result = [];
  (Array.isArray(sourceList) ? sourceList : []).some((source) => {
    const person = normalizePerson(source);
    const matchingAssignments = person.assignments.filter((assignment) => assignmentMatches(assignment, filters));
    const hasActiveAssignmentFilter = [filters && filters.departmentKey, filters && filters.identityKey, filters && filters.workGroupKey]
      .some((key) => key && key !== ALL_FILTER_KEY);
    if (hasActiveAssignmentFilter && !matchingAssignments.length) return false;
    const searchableAssignments = hasActiveAssignmentFilter ? matchingAssignments : person.assignments;
    const matchesKeyword = !text || [person.name, person.studentId].concat(
      searchableAssignments.reduce((values, assignment) => values.concat([
        assignment.department,
        assignment.identityCategoryName,
        assignment.workGroup,
        assignment.assignmentLabel
      ]), [])
    ).some((value) => safeText(value).toLowerCase().indexOf(text) !== -1);
    if (matchesKeyword) result.push(person);
    return max > 0 && result.length >= max;
  });
  return result;
}

module.exports = {
  ALL_FILTER_KEY,
  normalizePerson,
  buildAuditPersonnelFilterOptions,
  filterAuditPersonnel
};
