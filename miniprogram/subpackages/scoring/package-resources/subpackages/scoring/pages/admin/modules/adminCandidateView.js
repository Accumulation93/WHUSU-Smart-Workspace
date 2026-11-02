'use strict';

function safeText(value) {
  return String(value || '').trim();
}

function buildAssignmentLabel(assignment) {
  const source = assignment || {};
  const explicitLabel = safeText(source.assignmentLabel);
  if (explicitLabel) return explicitLabel;
  return [
    safeText(source.identityCategoryName || source.identity),
    safeText(source.department),
    safeText(source.workGroup)
  ].filter(Boolean).join(' · ');
}

function normalizeAssignment(assignment, copy) {
  const source = assignment || {};
  const assignmentNature = safeText(source.assignmentNature || source.assignmentKind);
  const natureLabels = copy && copy.assignmentNatureLabels || {};
  return {
    assignmentId: safeText(source.assignmentId || source.id),
    assignmentNature,
    assignmentNatureLabel: natureLabels[assignmentNature] || assignmentNature,
    department: safeText(source.department),
    identityCategoryName: safeText(source.identityCategoryName || source.identity),
    workGroup: safeText(source.workGroup),
    assignmentLabel: buildAssignmentLabel(source)
  };
}

function buildAdminCandidate(item, copy) {
  const source = item || {};
  return {
    id: source.id,
    name: safeText(source.name),
    studentId: safeText(source.studentId),
    assignments: (Array.isArray(source.assignments) ? source.assignments : [])
      .map((assignment) => normalizeAssignment(assignment, copy))
      .filter((assignment) => assignment.assignmentId)
  };
}

function candidateMatches(candidate, keyword) {
  const text = safeText(keyword).toLowerCase();
  if (!text) return true;
  const personFields = [candidate.name, candidate.studentId];
  const assignmentFields = (candidate.assignments || []).reduce((fields, assignment) => fields.concat([
    assignment.assignmentNature,
    assignment.assignmentNatureLabel,
    assignment.department,
    assignment.identityCategoryName,
    assignment.workGroup,
    assignment.assignmentLabel
  ]), []);
  return personFields.concat(assignmentFields).some((value) => (
    safeText(value).toLowerCase().indexOf(text) !== -1
  ));
}

function filterAdminCandidates(sourceList, keyword, limit, copy) {
  const max = Math.max(0, Number(limit) || 0);
  const result = [];
  (Array.isArray(sourceList) ? sourceList : []).some((item) => {
    const candidate = buildAdminCandidate(item, copy);
    if (candidateMatches(candidate, keyword)) result.push(candidate);
    return max > 0 && result.length >= max;
  });
  return result;
}

module.exports = {
  buildAdminCandidate,
  candidateMatches,
  filterAdminCandidates
};
