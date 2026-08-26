'use strict';

const crypto = require('crypto');

function projectParticipant(item) {
  const source = item || {};
  return {
    participantId: source.participantId,
    subjectKey: source.subjectKey,
    personId: source.personId,
    assignmentId: source.assignmentId
  };
}

function projectQuestion(item) {
  const source = item || {};
  return {
    id: source.id,
    questionIndex: source.questionIndex,
    globalQuestionIndex: source.globalQuestionIndex,
    question: source.question,
    scoreLabel: source.scoreLabel,
    minValue: source.minValue,
    startValue: source.startValue,
    maxValue: source.maxValue,
    stepValue: source.stepValue
  };
}

function projectTemplate(item) {
  const source = item || {};
  return {
    templateId: source.templateId,
    templateName: source.templateName,
    weight: source.weight,
    sortOrder: source.sortOrder,
    calculationMethod: source.calculationMethod,
    trimHighCount: source.trimHighCount,
    trimLowCount: source.trimLowCount,
    questions: (source.questions || []).map(projectQuestion)
  };
}

function projectCalculationPolicy(source) {
  const snapshot = source || {};
  const rule = snapshot.rule || {};
  const clause = snapshot.clause || {};
  return {
    rule: {
      id: rule.id,
      scorerDepartmentId: rule.scorerDepartmentId,
      scorerIdentityCategoryId: rule.scorerIdentityCategoryId,
      allowSelfAssessment: rule.allowSelfAssessment
    },
    clause: {
      id: clause.id,
      scopeType: clause.scopeType,
      targetIdentityCategoryId: clause.targetIdentityCategoryId,
      requireAllComplete: clause.requireAllComplete,
      requiredTargets: (clause.requiredTargets || []).map(projectParticipant)
    },
    templates: (snapshot.templates || []).map(projectTemplate)
  };
}

function calculationPolicyDigest(source) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(projectCalculationPolicy(source)))
    .digest('hex');
}

function buildCalculationPolicySignature(source, signatureVersion = 2) {
  const version = Number(signatureVersion) === 1 ? 1 : 2;
  return 'v' + version + ':' + calculationPolicyDigest(source);
}

function validateCalculationPolicySignature(source, signature) {
  const value = String(signature || '').trim();
  const match = /^v(1|2):([0-9a-f]{64})$/.exec(value);
  return Boolean(match && match[2] === calculationPolicyDigest(source));
}

module.exports = {
  projectCalculationPolicy,
  calculationPolicyDigest,
  buildCalculationPolicySignature,
  validateCalculationPolicySignature
};
