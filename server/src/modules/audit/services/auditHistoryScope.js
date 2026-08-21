'use strict';

const { safeString } = require('../../../utils/helpers');
const { parseSnapshot } = require('./auditAssignmentContext');

function snapshotAssignmentId(raw) {
  const snapshot = parseSnapshot(raw);
  return safeString(snapshot && snapshot.assignmentId);
}

function resolvedRecordAssignmentId(record) {
  const source = record || {};
  return safeString(source.operator_assignment_id || source.operatorAssignmentId)
    || snapshotAssignmentId(source.operator_context_snapshot || source.operatorContextSnapshot)
    || safeString(source.processed_assignment_id || source.processedAssignmentId)
    || snapshotAssignmentId(source.processed_context_snapshot || source.processedContextSnapshot);
}

function eventMatchesAssignment(event, steps, assignmentId) {
  const expectedAssignmentId = safeString(assignmentId);
  if (!expectedAssignmentId) return false;

  const eventAssignmentId = resolvedRecordAssignmentId(event);
  if (eventAssignmentId) return eventAssignmentId === expectedAssignmentId;

  const eventStepIndex = Number(event && (event.step_index || event.stepIndex));
  const eventRound = Number(event && event.round) || 1;
  const matchedStep = (steps || []).find(function(step) {
    return Number(step.sort_order || step.sortOrder) === eventStepIndex
      && (Number(step.round) || 1) === eventRound;
  });
  return resolvedRecordAssignmentId(matchedStep) === expectedAssignmentId;
}

function submissionMatchesSubmitterAssignment(submission, assignmentId) {
  const expectedAssignmentId = safeString(assignmentId);
  if (!expectedAssignmentId) return false;
  const actualAssignmentId = safeString(
    submission && (submission.submitted_assignment_id || submission.submittedAssignmentId)
  ) || snapshotAssignmentId(
    submission && (submission.submitted_context_snapshot || submission.submittedContextSnapshot)
  );
  return Boolean(actualAssignmentId) && actualAssignmentId === expectedAssignmentId;
}

function assignmentSqlExpression(eventAlias, stepAlias) {
  const eventPrefix = eventAlias || 'e';
  const stepPrefix = stepAlias || 'handled_step';
  return `COALESCE(
    NULLIF(${eventPrefix}.operator_assignment_id, ''),
    CASE
      WHEN JSON_VALID(${eventPrefix}.operator_context_snapshot) THEN
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${eventPrefix}.operator_context_snapshot, '$.assignmentId')), '')
      ELSE NULL
    END,
    NULLIF(${stepPrefix}.processed_assignment_id, ''),
    CASE
      WHEN JSON_VALID(${stepPrefix}.processed_context_snapshot) THEN
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${stepPrefix}.processed_context_snapshot, '$.assignmentId')), '')
      ELSE NULL
    END
  )`;
}

module.exports = {
  snapshotAssignmentId,
  resolvedRecordAssignmentId,
  eventMatchesAssignment,
  submissionMatchesSubmitterAssignment,
  assignmentSqlExpression
};
