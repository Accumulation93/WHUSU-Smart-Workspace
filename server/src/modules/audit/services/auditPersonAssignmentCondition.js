'use strict';

const { safeString } = require('../../../utils/helpers');
const { listActiveAssignments } = require('./auditAssignmentContext');

function normalizeIdList(value) {
  const raw = Array.isArray(value) ? value : safeString(value).split(',');
  return [...new Set(raw.map(function(id) { return safeString(id); }).filter(Boolean))];
}

function normalizePersonCondition(condition) {
  const source = condition || {};
  return {
    personHrIds: normalizeIdList(source.personHrIds || source.person_hr_ids),
    assignmentIds: normalizeIdList(
      source.assignmentIds || source.assignment_ids || source.personAssignmentIds
    )
  };
}

function validateBindings(condition, assignments) {
  const normalized = normalizePersonCondition(condition);
  if (!normalized.personHrIds.length) {
    return { ok: false, reason: 'person_required', condition: normalized };
  }
  if (!normalized.assignmentIds.length) {
    return { ok: false, reason: 'assignment_binding_required', condition: normalized };
  }

  const personSet = new Set(normalized.personHrIds);
  const assignmentSet = new Set(normalized.assignmentIds);
  const matchedAssignmentIds = new Set();
  const matchedPersonIds = new Set();

  (assignments || []).forEach(function(assignment) {
    const assignmentId = safeString(assignment.assignment_id || assignment.assignmentId);
    const hrId = safeString(assignment.hr_id || assignment.hrId || assignment.id);
    if (!assignmentSet.has(assignmentId)) return;
    if (!personSet.has(hrId)) return;
    matchedAssignmentIds.add(assignmentId);
    matchedPersonIds.add(hrId);
  });

  if (matchedAssignmentIds.size !== assignmentSet.size || matchedPersonIds.size !== personSet.size) {
    return { ok: false, reason: 'invalid_person_assignment_binding', condition: normalized };
  }

  return {
    ok: true,
    condition: {
      personHrIds: normalized.personHrIds.join(','),
      assignmentIds: normalized.assignmentIds.join(',')
    }
  };
}

async function resolveAndValidateBindings(condition, orgId, db) {
  const normalized = normalizePersonCondition(condition);
  if (!normalized.personHrIds.length || !normalized.assignmentIds.length) {
    return validateBindings(normalized, []);
  }
  const assignments = await listActiveAssignments(orgId, {
    hrIds: normalized.personHrIds
  }, db);
  return validateBindings(normalized, assignments);
}

module.exports = {
  normalizeIdList,
  normalizePersonCondition,
  validateBindings,
  resolveAndValidateBindings
};
