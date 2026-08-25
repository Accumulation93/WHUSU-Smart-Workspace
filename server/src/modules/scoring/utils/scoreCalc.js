/**
 * 评分结果只由提交时固化的计算快照解释。
 * 本模块是纯读取路径：不得读取当前岗位、当前规则或当前模板来重释历史记录，也不得写库。
 */
const crypto = require('crypto');
const { safeString, toNumber, roundScore } = require('../../../utils/helpers');
const pool = require('../../../config/db');
const { logger } = require('../../../utils/logger');

function applyCalcMethod(scores, weight, method, trimH, trimL) {
  if (!scores.length) return { averageScore: 0, contributionScore: 0 };
  if (method === 'trim_extremes') {
    const totalTrim = (trimH || 0) + (trimL || 0);
    if (scores.length < totalTrim) return { averageScore: 0, contributionScore: 0 };
    const sorted = scores.slice().sort((a, b) => a - b);
    const trimmed = sorted.slice(trimL || 0, scores.length - (trimH || 0));
    if (!trimmed.length) return { averageScore: 0, contributionScore: 0 };
    const average = trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
    return { averageScore: roundScore(average), contributionScore: roundScore(average * weight) };
  }
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return { averageScore: roundScore(average), contributionScore: roundScore(average * weight) };
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * 最终权重聚合只关心同一条不可变计分策略，不能包含每位评分人各自的
 * requiredTargets。后者只用于完整性校验；把它放进最终分组键会让“排除本人”
 * 的同类别评分人各自形成一个权重组，进而重复应用权重。
 */
function buildAggregationPolicySignature(snapshot) {
  const clause = Object.assign({}, snapshot && snapshot.clause);
  delete clause.requiredTargets;
  return 'v1:' + sha256Json({
    rule: snapshot && snapshot.rule,
    clause,
    templates: snapshot && snapshot.templates
  });
}

function validateCalculationSnapshot(record, activityId) {
  const snapshot = parseJsonObject(record.calculation_context_snapshot);
  if (!snapshot) return { ok: false, reason: 'missing_calculation_snapshot' };
  if (Number(snapshot.version) !== 1) return { ok: false, reason: 'unsupported_snapshot_version' };
  if (safeString(snapshot.activityId) !== safeString(activityId)) {
    return { ok: false, reason: 'snapshot_activity_mismatch' };
  }
  if (!snapshot.scorer || !safeString(snapshot.scorer.participantId) || !safeString(snapshot.scorer.subjectKey)) {
    return { ok: false, reason: 'missing_scorer_snapshot' };
  }
  if (!snapshot.target || !safeString(snapshot.target.participantId) || !safeString(snapshot.target.subjectKey)) {
    return { ok: false, reason: 'missing_target_snapshot' };
  }
  if (!snapshot.rule || !safeString(snapshot.rule.id)
    || !safeString(snapshot.rule.scorerDepartmentId)
    || !safeString(snapshot.rule.scorerIdentityCategoryId)) {
    return { ok: false, reason: 'missing_rule_snapshot' };
  }
  if (!snapshot.clause || !safeString(snapshot.clause.id)) {
    return { ok: false, reason: 'missing_clause_snapshot' };
  }
  if (!Array.isArray(snapshot.clause.requiredTargets)) {
    return { ok: false, reason: 'missing_required_targets_snapshot' };
  }
  if (!Array.isArray(snapshot.templates) || !snapshot.templates.length) {
    return { ok: false, reason: 'missing_template_snapshot' };
  }
  const recordSignature = safeString(record.template_config_signature);
  if (!recordSignature || recordSignature !== safeString(snapshot.templateConfigSignature)) {
    return { ok: false, reason: 'template_signature_mismatch' };
  }
  const expectedPolicySignature = 'v1:' + sha256Json({
    rule: snapshot.rule,
    clause: snapshot.clause,
    templates: snapshot.templates
  });
  if (safeString(snapshot.calculationPolicySignature) !== expectedPolicySignature) {
    return { ok: false, reason: 'calculation_policy_signature_mismatch' };
  }

  const globalIndexes = new Set();
  for (const template of snapshot.templates) {
    if (!safeString(template.templateId) || !Array.isArray(template.questions) || !template.questions.length) {
      return { ok: false, reason: 'invalid_template_snapshot' };
    }
    const weight = Number(template.weight);
    const trimHigh = Number(template.trimHighCount || 0);
    const trimLow = Number(template.trimLowCount || 0);
    const method = safeString(template.calculationMethod) || 'weighted_average';
    if (!Number.isFinite(weight) || weight < 0
      || !Number.isInteger(trimHigh) || trimHigh < 0
      || !Number.isInteger(trimLow) || trimLow < 0
      || (method !== 'weighted_average' && method !== 'trim_extremes')) {
      return { ok: false, reason: 'invalid_calculation_snapshot' };
    }
    for (const question of template.questions) {
      const index = Number(question.globalQuestionIndex);
      if (!Number.isInteger(index) || index < 1 || globalIndexes.has(index)) {
        return { ok: false, reason: 'invalid_question_snapshot' };
      }
      globalIndexes.add(index);
    }
  }
  if (!globalIndexes.size) return { ok: false, reason: 'missing_question_snapshot' };
  for (let index = 1; index <= globalIndexes.size; index += 1) {
    if (!globalIndexes.has(index)) return { ok: false, reason: 'non_contiguous_question_snapshot' };
  }
  if (snapshot.clause.requireAllComplete === true) {
    const requiredKeys = snapshot.clause.requiredTargets.map((target) => safeString(target && target.subjectKey));
    if (!requiredKeys.length || requiredKeys.some((key) => !key)) {
      return { ok: false, reason: 'invalid_required_targets_snapshot' };
    }
  }
  return { ok: true, snapshot, questionCount: globalIndexes.size };
}

function addDiagnostic(diagnostics, recordId, reason) {
  diagnostics.skippedRecords += 1;
  diagnostics.reasons[reason] = (diagnostics.reasons[reason] || 0) + 1;
  if (diagnostics.records.length < 50) diagnostics.records.push({ recordId: safeString(recordId), reason });
}

function getHistoricalSnapshotFailure(diagnostics) {
  const reasons = diagnostics && diagnostics.reasons && typeof diagnostics.reasons === 'object'
    ? diagnostics.reasons
    : {};
  const nonFatalReasons = new Set(['required_targets_incomplete']);
  let affectedRecordCount = 0;
  Object.keys(reasons).forEach((reason) => {
    if (!nonFatalReasons.has(reason)) affectedRecordCount += Number(reasons[reason] || 0);
  });
  if (!affectedRecordCount) return null;
  const missingSnapshotCount = Number(reasons.missing_calculation_snapshot || 0);
  return {
    status: missingSnapshotCount > 0 ? 'historical_snapshot_missing' : 'historical_snapshot_invalid',
    affectedRecordCount,
    missingSnapshotCount,
    reasons
  };
}

async function computeValidScoreMap(activityId, orgId, options = {}) {
  const visibleTargetIds = options.visibleTargetIds;
  const [recordRows] = await pool.query(
    'SELECT * FROM score_records WHERE activity_id = ? AND org_id = ?',
    [activityId, orgId]
  );
  const answerMap = new Map();
  if (recordRows.length) {
    const recordIds = recordRows.map((record) => record.id);
    const placeholders = recordIds.map(() => '?').join(',');
    const [answerRows] = await pool.query(
      `SELECT * FROM score_answers
        WHERE record_id IN (${placeholders}) AND org_id = ?
        ORDER BY record_id, question_index`,
      recordIds.concat(orgId)
    );
    answerRows.forEach((answer) => {
      if (!answerMap.has(answer.record_id)) answerMap.set(answer.record_id, new Map());
      answerMap.get(answer.record_id).set(Number(answer.question_index), toNumber(answer.score, 0));
    });
  }

  const diagnostics = {
    totalRecords: recordRows.length,
    acceptedRecords: 0,
    skippedRecords: 0,
    reasons: {},
    records: []
  };
  const candidates = [];
  for (const record of recordRows) {
    const validation = validateCalculationSnapshot(record, activityId);
    if (!validation.ok) {
      addDiagnostic(diagnostics, record.id, validation.reason);
      continue;
    }
    const snapshot = validation.snapshot;
    const targetId = safeString(snapshot.target.participantId);
    if (visibleTargetIds && !visibleTargetIds.has(targetId)) continue;
    if (snapshot.rule.allowSelfAssessment !== true
      && safeString(snapshot.scorer.personId)
      && safeString(snapshot.scorer.personId) === safeString(snapshot.target.personId)) {
      addDiagnostic(diagnostics, record.id, 'self_assessment_snapshot_violation');
      continue;
    }
    const answers = answerMap.get(record.id) || new Map();
    if (answers.size !== validation.questionCount) {
      addDiagnostic(diagnostics, record.id, 'answer_count_mismatch');
      continue;
    }
    let answersComplete = true;
    for (let index = 1; index <= validation.questionCount; index += 1) {
      if (!answers.has(index) || !Number.isFinite(answers.get(index))) {
        answersComplete = false;
        break;
      }
    }
    if (!answersComplete) {
      addDiagnostic(diagnostics, record.id, 'answer_snapshot_mismatch');
      continue;
    }
    candidates.push({ record, snapshot, answers, targetId });
  }

  const completionBuckets = new Map();
  candidates.forEach((candidate) => {
    const key = safeString(candidate.snapshot.scorer.subjectKey)
      + '||' + safeString(candidate.snapshot.calculationPolicySignature);
    if (!completionBuckets.has(key)) {
      completionBuckets.set(key, {
        required: new Set(candidate.snapshot.clause.requiredTargets.map((target) => safeString(target.subjectKey))),
        completed: new Set()
      });
    }
    completionBuckets.get(key).completed.add(safeString(candidate.snapshot.target.subjectKey));
    candidate.completionKey = key;
  });

  const incompleteBuckets = new Set();
  completionBuckets.forEach((bucket, key) => {
    for (const required of bucket.required) {
      if (!bucket.completed.has(required)) {
        incompleteBuckets.add(key);
        break;
      }
    }
  });

  const calculationMap = new Map();
  const submittedByTarget = new Map();
  const expectedByCount = new Map();
  const scorerExpectedSets = new Map();
  const countedCompletionBuckets = new Set();
  const targetSnapshots = new Map();

  candidates.forEach((candidate) => {
    const snapshot = candidate.snapshot;
    const scorerId = safeString(snapshot.scorer.participantId);
    if (!targetSnapshots.has(candidate.targetId)) {
      targetSnapshots.set(candidate.targetId, snapshot.target);
    }
    if (!submittedByTarget.has(candidate.targetId)) submittedByTarget.set(candidate.targetId, new Set());
    submittedByTarget.get(candidate.targetId).add(scorerId);

    if (options.includeCounts && !countedCompletionBuckets.has(candidate.completionKey)) {
      countedCompletionBuckets.add(candidate.completionKey);
      if (!scorerExpectedSets.has(scorerId)) scorerExpectedSets.set(scorerId, new Set());
      snapshot.clause.requiredTargets.forEach((requiredTarget) => {
        const requiredId = safeString(requiredTarget.participantId || requiredTarget.assignmentId);
        const requiredKey = safeString(requiredTarget.subjectKey);
        if (requiredId) expectedByCount.set(requiredId, (expectedByCount.get(requiredId) || 0) + 1);
        if (requiredKey) scorerExpectedSets.get(scorerId).add(requiredKey);
      });
    }

    if (snapshot.clause.requireAllComplete === true && incompleteBuckets.has(candidate.completionKey)) {
      addDiagnostic(diagnostics, candidate.record.id, 'required_targets_incomplete');
      return;
    }

    const scorerCategoryKey = safeString(snapshot.rule.scorerDepartmentId)
      + '::' + safeString(snapshot.rule.scorerIdentityCategoryId);
    snapshot.templates.forEach((template) => {
      let templateScore = 0;
      template.questions.forEach((question) => {
        templateScore += candidate.answers.get(Number(question.globalQuestionIndex));
      });
      const groupKey = candidate.targetId
        + '||' + scorerCategoryKey
        + '||' + safeString(template.templateId)
        + '||' + buildAggregationPolicySignature(snapshot);
      if (!calculationMap.has(groupKey)) {
        calculationMap.set(groupKey, {
          targetId: candidate.targetId,
          weight: Number(template.weight),
          method: safeString(template.calculationMethod) || 'weighted_average',
          trimHigh: Number(template.trimHighCount || 0),
          trimLow: Number(template.trimLowCount || 0),
          scores: []
        });
      }
      calculationMap.get(groupKey).scores.push(templateScore);
    });
    diagnostics.acceptedRecords += 1;
  });

  const finalScoreMap = new Map();
  calculationMap.forEach((item) => {
    const result = applyCalcMethod(item.scores, item.weight, item.method, item.trimHigh, item.trimLow);
    const current = finalScoreMap.get(item.targetId) || { finalScore: 0, contributorCount: 0 };
    current.finalScore = roundScore(current.finalScore + result.contributionScore);
    current.contributorCount += 1;
    finalScoreMap.set(item.targetId, current);
  });

  const scorerExpectedCount = new Map();
  scorerExpectedSets.forEach((targets, scorerId) => scorerExpectedCount.set(scorerId, targets.size));
  finalScoreMap.diagnostics = diagnostics;
  logger.debug('computeValidScoreMap immutable snapshot stats', {
    activityId,
    orgId,
    totalRecords: diagnostics.totalRecords,
    acceptedRecords: diagnostics.acceptedRecords,
    skippedRecords: diagnostics.skippedRecords,
    reasons: diagnostics.reasons,
    calculationGroups: calculationMap.size
  });

  if (options.includeCounts) {
    return {
      finalScoreMap,
      submittedByTarget,
      expectedByCount,
      scorerExpectedCount,
      targetSnapshots,
      diagnostics
    };
  }
  return { finalScoreMap, targetSnapshots, diagnostics };
}

module.exports = {
  applyCalcMethod,
  computeValidScoreMap,
  validateCalculationSnapshot,
  getHistoricalSnapshotFailure,
  buildAggregationPolicySignature
};
