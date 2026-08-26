'use strict';

const { buildCalculationPolicySignature } = require('./calculationSnapshotSignature');

const CALCULATION_SNAPSHOT_VERSION = 2;
const LEGACY_CALCULATION_SNAPSHOT_VERSION = 1;

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function bool(value) {
  return value === true || value === 1 || value === '1';
}

function canonicalParticipantEvidence(source) {
  const item = source || {};
  return {
    participantId: text(item.participantId),
    subjectKey: text(item.subjectKey),
    personId: text(item.personId),
    assignmentId: text(item.assignmentId)
  };
}

function canonicalAssignmentContext(source) {
  const item = source || {};
  return {
    contextId: text(item.contextId),
    organizationId: text(item.organizationId),
    organizationName: text(item.organizationName),
    membershipId: text(item.membershipId),
    personId: text(item.personId),
    legacyHrId: text(item.legacyHrId),
    name: text(item.name),
    studentId: text(item.studentId),
    assignmentId: text(item.assignmentId),
    assignmentNature: text(item.assignmentNature),
    assignmentLabel: text(item.assignmentLabel),
    departmentId: text(item.departmentId),
    department: text(item.department),
    identityCategoryId: text(item.identityCategoryId),
    identityCategory: text(item.identityCategory),
    workGroupId: text(item.workGroupId),
    workGroup: text(item.workGroup)
  };
}

function canonicalParticipant(source) {
  const item = source || {};
  return Object.assign(canonicalParticipantEvidence(item), {
    context: canonicalAssignmentContext(item.context)
  });
}

function canonicalQuestion(source, fallbackIndex) {
  const item = source || {};
  const questionIndex = integer(item.questionIndex, fallbackIndex);
  return {
    id: text(item.id),
    questionIndex,
    globalQuestionIndex: integer(item.globalQuestionIndex, questionIndex),
    question: text(item.question),
    scoreLabel: text(item.scoreLabel),
    minValue: number(item.minValue),
    startValue: number(item.startValue),
    maxValue: number(item.maxValue),
    stepValue: number(item.stepValue, 1)
  };
}

function canonicalTemplate(source, fallbackSortOrder) {
  const item = source || {};
  return {
    templateId: text(item.templateId),
    templateName: text(item.templateName),
    weight: number(item.weight, 1),
    sortOrder: integer(item.sortOrder, fallbackSortOrder),
    calculationMethod: text(item.calculationMethod) || 'weighted_average',
    trimHighCount: integer(item.trimHighCount),
    trimLowCount: integer(item.trimLowCount),
    questions: (Array.isArray(item.questions) ? item.questions : [])
      .map((question, index) => canonicalQuestion(question, index + 1))
  };
}

function canonicalizeCalculationSnapshot(source) {
  const snapshot = source || {};
  const rule = snapshot.rule || {};
  const clause = snapshot.clause || {};
  const canonical = {
    version: CALCULATION_SNAPSHOT_VERSION,
    capturedAt: text(snapshot.capturedAt),
    activityId: text(snapshot.activityId),
    participantGranularity: 'assignment',
    templateConfigSignature: text(snapshot.templateConfigSignature),
    calculationPolicySignature: '',
    scorer: canonicalParticipant(snapshot.scorer),
    target: canonicalParticipant(snapshot.target),
    rule: {
      id: text(rule.id),
      scorerDepartmentId: text(rule.scorerDepartmentId),
      scorerIdentityCategoryId: text(rule.scorerIdentityCategoryId),
      allowSelfAssessment: bool(rule.allowSelfAssessment)
    },
    clause: {
      id: text(clause.id),
      scopeType: text(clause.scopeType),
      targetIdentityCategoryId: text(clause.targetIdentityCategoryId),
      requireAllComplete: bool(clause.requireAllComplete),
      requiredTargets: (Array.isArray(clause.requiredTargets) ? clause.requiredTargets : [])
        .map(canonicalParticipantEvidence)
    },
    templates: (Array.isArray(snapshot.templates) ? snapshot.templates : [])
      .map((template, index) => canonicalTemplate(template, index + 1))
  };
  canonical.calculationPolicySignature = buildCalculationPolicySignature(canonical, 2);
  return canonical;
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function isCanonicalCalculationSnapshot(snapshot) {
  return Number(snapshot && snapshot.version) === CALCULATION_SNAPSHOT_VERSION
    && stableJson(snapshot) === stableJson(canonicalizeCalculationSnapshot(snapshot));
}

function isSupportedCalculationSnapshotVersion(value) {
  const version = Number(value);
  return version === LEGACY_CALCULATION_SNAPSHOT_VERSION || version === CALCULATION_SNAPSHOT_VERSION;
}

module.exports = {
  CALCULATION_SNAPSHOT_VERSION,
  LEGACY_CALCULATION_SNAPSHOT_VERSION,
  canonicalizeCalculationSnapshot,
  isCanonicalCalculationSnapshot,
  isSupportedCalculationSnapshotVersion,
  stableJson
};
