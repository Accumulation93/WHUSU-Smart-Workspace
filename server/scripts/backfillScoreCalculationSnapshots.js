'use strict';

const crypto = require('crypto');

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  const normalized = text(value).replace(' ', 'T');
  if (!normalized) return NaN;
  const parsed = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : normalized + 'Z');
  return Number.isFinite(parsed) ? parsed : NaN;
}

function evidenceTimestamp(value) {
  const parsed = timestampMs(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function timestampNotLaterThan(left, right) {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs <= rightMs;
}

function legacyTemplateSignature(configs, templatesById) {
  const ordered = (configs || [])
    .slice()
    .sort((left, right) => number(left.sort_order) - number(right.sort_order));
  if (!ordered.length) return '';
  const segments = ordered.map((config) => {
      const template = templatesById.get(text(config.template_id));
      if (!template || !template.questions.length) return '';
      return text(config.template_id)
        + '[' + template.questions.length
        + '|' + (text(config.calculation_method) || 'weighted_average')
        + '|' + number(config.trim_high_count)
        + '|' + number(config.trim_low_count) + ']';
    });
  return segments.every(Boolean) ? segments.join('|') : '';
}

function buildTemplateSnapshots(configs, templatesById) {
  let globalQuestionIndex = 0;
  return (configs || [])
    .slice()
    .sort((left, right) => number(left.sort_order) - number(right.sort_order))
    .map((config) => {
      const templateId = text(config.template_id);
      const template = templatesById.get(templateId);
      if (!template || !template.questions.length) return null;
      const questions = template.questions.map((question, index) => {
        globalQuestionIndex += 1;
        return {
          id: text(question.id),
          questionIndex: index + 1,
          globalQuestionIndex,
          question: text(question.question),
          scoreLabel: text(question.score_label),
          minValue: number(question.min_value),
          startValue: number(question.start_value),
          maxValue: number(question.max_value),
          stepValue: number(question.step_value, 0.5)
        };
      });
      return {
        templateId,
        templateName: text(template.name),
        weight: number(config.weight, 1),
        sortOrder: number(config.sort_order),
        calculationMethod: text(config.calculation_method) || 'weighted_average',
        trimHighCount: number(config.trim_high_count),
        trimLowCount: number(config.trim_low_count),
        questions
      };
    })
    .filter(Boolean);
}

function assignmentLabel(participant) {
  return [participant.identity, participant.department, participant.work_group]
    .map(text)
    .filter(Boolean)
    .join(' · ');
}

function assignmentSnapshot(participant) {
  return {
    contextId: '',
    organizationId: text(participant.org_id),
    organizationName: text(participant.organization_name),
    membershipId: text(participant.membership_id),
    personId: text(participant.person_id),
    legacyHrId: text(participant.legacy_hr_id),
    name: text(participant.name),
    studentId: text(participant.student_id),
    assignmentId: text(participant.id),
    assignmentNature: text(participant.assignment_kind),
    assignmentLabel: assignmentLabel(participant),
    departmentId: text(participant.department_id),
    department: text(participant.department),
    identityCategoryId: text(participant.identity_id),
    identityCategory: text(participant.identity),
    workGroupId: text(participant.work_group_id),
    workGroup: text(participant.work_group)
  };
}

function samePerson(left, right) {
  return text(left && left.person_id) && text(left && left.person_id) === text(right && right.person_id);
}

function matchesScope(clause, scorer, target) {
  const scope = text(clause.scope_type);
  const sameDepartment = text(scorer.department_id) === text(target.department_id);
  const sameWorkGroup = sameDepartment
    && text(scorer.work_group_id)
    && text(scorer.work_group_id) === text(target.work_group_id);
  const targetIdentityMatches = !text(clause.target_identity_id)
    || text(target.identity_id) === text(clause.target_identity_id);
  if (scope === 'same_department_identity') return sameDepartment && targetIdentityMatches;
  if (scope === 'same_department_all') return sameDepartment;
  if (scope === 'same_work_group_identity') return sameWorkGroup && targetIdentityMatches;
  if (scope === 'same_work_group_all') return sameWorkGroup;
  if (scope === 'identity_only') return targetIdentityMatches;
  return scope === 'all_people';
}

function participantEvidence(participant) {
  return {
    participantId: text(participant.id),
    subjectKey: 'assignment:' + text(participant.id),
    personId: text(participant.person_id),
    assignmentId: text(participant.id)
  };
}

function groupBy(rows, keyFactory) {
  const result = new Map();
  (rows || []).forEach((row) => {
    const key = keyFactory(row);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  });
  return result;
}

function buildIndexes(dataset) {
  const templatesById = new Map();
  const questionsByTemplate = groupBy(dataset.questions, (row) => text(row.template_id));
  dataset.templates.forEach((template) => {
    templatesById.set(text(template.id), Object.assign({}, template, {
      questions: (questionsByTemplate.get(text(template.id)) || [])
        .slice()
        .sort((left, right) => number(left.sort_order) - number(right.sort_order))
    }));
  });
  const configsByClause = groupBy(dataset.configs, (row) => text(row.clause_id));
  const clausesByRule = groupBy(dataset.clauses, (row) => text(row.rule_id));
  const rulesById = new Map(dataset.rules.map((row) => [text(row.id), row]));
  const participantsById = new Map(dataset.participants.map((row) => [text(row.id), row]));
  const participantsByOrg = groupBy(dataset.participants, (row) => text(row.org_id));
  const participantsByOrgLegacy = groupBy(
    dataset.participants,
    (row) => text(row.org_id) + '\u0000' + text(row.legacy_hr_id)
  );
  const answersByRecord = groupBy(dataset.answers, (row) => text(row.record_id));
  return {
    templatesById,
    configsByClause,
    clausesByRule,
    rulesById,
    participantsById,
    participantsByOrg,
    participantsByOrgLegacy,
    answersByRecord
  };
}

function recordBlock(reason, record) {
  return { reason, recordId: text(record.id), ruleId: text(record.rule_id) };
}

function legacyDirectoryTupleIsProven(participant, submittedAt) {
  if (!timestampNotLaterThan(participant.legacy_hr_created_at, submittedAt)) return false;
  if (!text(participant.id) || !text(participant.membership_id) || !text(participant.person_id)) return false;
  return text(participant.legacy_department_id) === text(participant.department_id)
    && text(participant.legacy_identity_id) === text(participant.identity_id)
    && text(participant.legacy_work_group_id) === text(participant.work_group_id);
}

function legacyScopeParticipant(participant) {
  return Object.assign({}, participant, {
    department_id: text(participant.legacy_department_id),
    identity_id: text(participant.legacy_identity_id),
    work_group_id: text(participant.legacy_work_group_id)
  });
}

function uniqueHistoricalAssignment(indexes, record, legacyHrId, role) {
  const key = text(record.org_id) + '\u0000' + text(legacyHrId);
  const all = indexes.participantsByOrgLegacy.get(key) || [];
  const directoryRowsAtSubmission = all.filter((participant) =>
    timestampNotLaterThan(participant.legacy_hr_created_at, record.submitted_at));
  if (directoryRowsAtSubmission.length !== 1) {
    return {
      blocker: recordBlock(role + '_legacy_assignment_' + (directoryRowsAtSubmission.length ? 'ambiguous' : 'missing'), record)
    };
  }
  if (!legacyDirectoryTupleIsProven(directoryRowsAtSubmission[0], record.submitted_at)) {
    return { blocker: recordBlock(role + '_legacy_assignment_tuple_unproven', record) };
  }
  return { participant: directoryRowsAtSubmission[0] };
}

function validateAnswers(record, templates, answersByRecord) {
  const answers = (answersByRecord.get(text(record.id)) || [])
    .slice()
    .sort((left, right) => number(left.question_index) - number(right.question_index));
  const questions = templates.flatMap((template) => template.questions);
  if (!questions.length || answers.length !== questions.length) return 'answer_count_mismatch';
  const seen = new Set();
  for (let index = 0; index < answers.length; index += 1) {
    const answer = answers[index];
    const questionIndex = number(answer.question_index, NaN);
    if (!Number.isInteger(questionIndex) || questionIndex !== index + 1 || seen.has(questionIndex)) {
      return 'answer_index_mismatch';
    }
    seen.add(questionIndex);
    const score = number(answer.score, NaN);
    const question = questions[index];
    const min = number(question.minValue, NaN);
    const max = number(question.maxValue, NaN);
    const start = number(question.startValue, NaN);
    const step = number(question.stepValue, NaN);
    if (![score, min, max, start, step].every(Number.isFinite) || step <= 0 || score < min || score > max) {
      return 'answer_range_mismatch';
    }
    const stepOffset = (score - start) / step;
    if (Math.abs(stepOffset - Math.round(stepOffset)) > 1e-8) return 'answer_step_mismatch';
  }
  return '';
}

function analyzeRecord(record, indexes, reconstructedAt) {
  if (record.calculation_context_snapshot) {
    return { status: 'existing', record };
  }
  const rule = indexes.rulesById.get(text(record.rule_id));
  if (!rule) return { status: 'blocked', blocker: recordBlock('rule_missing', record) };
  if (text(rule.activity_id) !== text(record.activity_id) || text(rule.org_id) !== text(record.org_id)) {
    return { status: 'blocked', blocker: recordBlock('rule_scope_mismatch', record) };
  }
  if (!timestampNotLaterThan(rule.updated_at, record.submitted_at)) {
    return { status: 'blocked', blocker: recordBlock('rule_updated_after_submission', record) };
  }
  const scorerResolution = uniqueHistoricalAssignment(indexes, record, record.scorer_id, 'scorer');
  if (scorerResolution.blocker) return { status: 'blocked', blocker: scorerResolution.blocker };
  const targetResolution = uniqueHistoricalAssignment(indexes, record, record.target_id, 'target');
  if (targetResolution.blocker) return { status: 'blocked', blocker: targetResolution.blocker };
  const scorer = scorerResolution.participant;
  const target = targetResolution.participant;
  if (text(record.scorer_assignment_id) && text(scorer.id) !== text(record.scorer_assignment_id)) {
    return { status: 'blocked', blocker: recordBlock('scorer_assignment_reference_mismatch', record) };
  }
  if (text(record.target_assignment_id) && text(target.id) !== text(record.target_assignment_id)) {
    return { status: 'blocked', blocker: recordBlock('target_assignment_reference_mismatch', record) };
  }
  if (text(scorer.org_id) !== text(record.org_id) || text(target.org_id) !== text(record.org_id)) {
    return { status: 'blocked', blocker: recordBlock('assignment_org_mismatch', record) };
  }
  if (text(record.scorer_person_id) && text(record.scorer_person_id) !== text(scorer.person_id)) {
    return { status: 'blocked', blocker: recordBlock('scorer_person_mismatch', record) };
  }
  if (text(record.target_person_id) && text(record.target_person_id) !== text(target.person_id)) {
    return { status: 'blocked', blocker: recordBlock('target_person_mismatch', record) };
  }
  if (text(rule.scorer_department_id) !== text(scorer.department_id)
    || text(rule.scorer_identity_id) !== text(scorer.identity_id)) {
    return { status: 'blocked', blocker: recordBlock('scorer_rule_dimension_mismatch', record) };
  }
  if (number(rule.allow_self_assessment) !== 1 && samePerson(scorer, target)) {
    return { status: 'blocked', blocker: recordBlock('self_assessment_not_allowed', record) };
  }

  const candidates = (indexes.clausesByRule.get(text(rule.id)) || []).filter((clause) => {
    const configs = indexes.configsByClause.get(text(clause.id)) || [];
    return legacyTemplateSignature(configs, indexes.templatesById) === text(record.template_config_signature)
      && matchesScope(clause, scorer, target);
  });
  if (!candidates.length) return { status: 'blocked', blocker: recordBlock('signature_or_scope_not_matched', record) };
  if (candidates.length !== 1) return { status: 'blocked', blocker: recordBlock('clause_match_ambiguous', record) };

  const clause = candidates[0];
  const configs = indexes.configsByClause.get(text(clause.id)) || [];
  const templates = buildTemplateSnapshots(configs, indexes.templatesById);
  for (const templateSnapshot of templates) {
    const template = indexes.templatesById.get(text(templateSnapshot.templateId));
    if (!template || !timestampNotLaterThan(template.updated_at, record.submitted_at)) {
      return { status: 'blocked', blocker: recordBlock('template_updated_after_submission', record) };
    }
  }
  const answerError = validateAnswers(record, templates, indexes.answersByRecord);
  if (answerError) return { status: 'blocked', blocker: recordBlock(answerError, record) };

  const legacyRowsAtSubmission = (indexes.participantsByOrg.get(text(record.org_id)) || [])
    .filter((participant) => timestampNotLaterThan(participant.legacy_hr_created_at, record.submitted_at));
  const assignmentsByLegacyHr = groupBy(legacyRowsAtSubmission, (participant) => text(participant.legacy_hr_id));
  const requiredAssignmentGroups = Array.from(assignmentsByLegacyHr.values()).filter((assignments) =>
    matchesScope(clause, scorer, legacyScopeParticipant(assignments[0]))
      && (number(rule.allow_self_assessment) === 1 || !samePerson(scorer, assignments[0])));
  if (requiredAssignmentGroups.some((assignments) =>
    assignments.length !== 1 || !legacyDirectoryTupleIsProven(assignments[0], record.submitted_at))) {
    return { status: 'blocked', blocker: recordBlock('required_target_historical_assignment_unproven', record) };
  }
  const requiredParticipants = requiredAssignmentGroups.map((assignments) => assignments[0]);
  if (!requiredParticipants.some((participant) => text(participant.id) === text(target.id))) {
    return { status: 'blocked', blocker: recordBlock('target_not_in_reconstructed_scope', record) };
  }

  const policy = {
    rule: {
      id: text(rule.id),
      scorerDepartmentId: text(rule.scorer_department_id),
      scorerIdentityCategoryId: text(rule.scorer_identity_id),
      allowSelfAssessment: number(rule.allow_self_assessment) === 1
    },
    clause: {
      id: text(clause.id),
      scopeType: text(clause.scope_type),
      targetIdentityCategoryId: text(clause.target_identity_id),
      requireAllComplete: number(clause.require_all_complete) === 1,
      requiredTargets: requiredParticipants.map(participantEvidence)
    },
    templates
  };
  const scorerContext = assignmentSnapshot(scorer);
  const targetContext = assignmentSnapshot(target);
  const calculationSnapshot = {
    version: 1,
    capturedAt: record.submitted_at,
    activityId: text(record.activity_id),
    participantGranularity: 'assignment',
    templateConfigSignature: text(record.template_config_signature),
    calculationPolicySignature: 'v1:' + sha256Json(policy),
    reconstruction: {
      version: 1,
      mode: 'legacy_exact_signature_timestamp_proven',
      reconstructedAt,
      signedFields: ['templateId', 'questionCount', 'calculationMethod', 'trimHighCount', 'trimLowCount'],
      provenFields: ['weight', 'questionPresentation', 'answerRange', 'scorerAssignment', 'targetAssignment', 'requiredTargets'],
      proof: {
        clockBasis: 'same_mysql_utc_session',
        ruleUpdatedAt: evidenceTimestamp(rule.updated_at),
        submittedAt: evidenceTimestamp(record.submitted_at),
        templateUpdatedAt: templates.map((templateSnapshot) => {
          const template = indexes.templatesById.get(text(templateSnapshot.templateId));
          return {
            templateId: text(templateSnapshot.templateId),
            updatedAt: evidenceTimestamp(template && template.updated_at)
          };
        }),
        scorerLegacyHrId: text(record.scorer_id),
        targetLegacyHrId: text(record.target_id),
        requiredTargetBasis: 'legacy_hr_created_at_and_unique_migrated_assignment_tuple'
      },
      cutoverFields: []
    },
    scorer: Object.assign(participantEvidence(scorer), { context: scorerContext }),
    target: Object.assign(participantEvidence(target), { context: targetContext }),
    rule: policy.rule,
    clause: policy.clause,
    templates: policy.templates
  };
  return {
    status: 'eligible',
    record,
    clauseId: text(clause.id),
    scorerContext,
    targetContext,
    calculationSnapshot
  };
}

function summarizeReasons(blockers) {
  const reasons = {};
  blockers.forEach((blocker) => {
    reasons[blocker.reason] = (reasons[blocker.reason] || 0) + 1;
  });
  return reasons;
}

function analyzeDataset(dataset, options = {}) {
  const reconstructedAt = options.reconstructedAt || new Date().toISOString();
  const indexes = buildIndexes(dataset);
  const recordsByActivity = groupBy(dataset.records, (row) => text(row.activity_id));
  const activities = [];

  recordsByActivity.forEach((records, activityId) => {
    const analyzed = records.map((record) => analyzeRecord(record, indexes, reconstructedAt));
    const blockers = analyzed.filter((item) => item.status === 'blocked').map((item) => item.blocker);
    const eligible = analyzed.filter((item) => item.status === 'eligible');
    const existing = analyzed.filter((item) => item.status === 'existing');
    if (existing.length && eligible.length) {
      blockers.push({ reason: 'partial_existing_snapshot_state', recordId: '', ruleId: '' });
    }
    const orgIds = Array.from(new Set(records.map((record) => text(record.org_id))));
    if (orgIds.length !== 1) blockers.push({ reason: 'activity_cross_org_inconsistent', recordId: '', ruleId: '' });
    const status = blockers.length ? 'isolated' : (eligible.length ? 'ready' : 'already_applied');
    const evidenceFingerprint = sha256Json({
      activityId,
      orgIds,
      records: records.map((record) => ({
        id: text(record.id),
        ruleId: text(record.rule_id),
        scorerAssignmentId: text(record.scorer_assignment_id),
        targetAssignmentId: text(record.target_assignment_id),
        signature: text(record.template_config_signature),
        answers: (indexes.answersByRecord.get(text(record.id)) || []).map((answer) => ({
          questionIndex: number(answer.question_index),
          score: number(answer.score)
        }))
      })).sort((left, right) => left.id.localeCompare(right.id)),
      snapshots: eligible.map((item) => ({
        id: text(item.record.id),
        clauseId: item.clauseId,
        policy: item.calculationSnapshot.calculationPolicySignature,
        scorerAssignmentId: text(item.scorerContext.assignmentId),
        targetAssignmentId: text(item.targetContext.assignmentId),
        reconstruction: item.calculationSnapshot.reconstruction
      })).sort((left, right) => left.id.localeCompare(right.id))
    });
    activities.push({
      activityId,
      orgId: orgIds[0] || '',
      status,
      totalRecordCount: records.length,
      eligibleRecordCount: status === 'ready' ? eligible.length : 0,
      existingSnapshotCount: existing.length,
      blockedRecordCount: blockers.length ? records.length : 0,
      reasons: summarizeReasons(blockers),
      blockerSamples: blockers.slice(0, 20),
      evidenceFingerprint,
      entries: status === 'ready' ? eligible : []
    });
  });

  activities.sort((left, right) => left.activityId.localeCompare(right.activityId));
  return {
    reconstructedAt,
    totalRecordCount: dataset.records.length,
    eligibleRecordCount: activities.reduce((sum, item) => sum + item.eligibleRecordCount, 0),
    blockedRecordCount: activities.reduce((sum, item) => sum + item.blockedRecordCount, 0),
    existingSnapshotCount: activities.reduce((sum, item) => sum + item.existingSnapshotCount, 0),
    canBackfillAll: activities.every((item) => item.status !== 'isolated'),
    activities
  };
}

async function loadDataset(connection) {
  const [snapshotColumns] = await connection.query(
    `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'score_records'
        AND COLUMN_NAME = 'calculation_context_snapshot'`
  );
  const snapshotExpression = number(snapshotColumns[0] && snapshotColumns[0].column_count) > 0
    ? 'calculation_context_snapshot'
    : 'NULL AS calculation_context_snapshot';
  const [records] = await connection.query(
    `SELECT id, activity_id, org_id, rule_id, scorer_id, scorer_person_id, scorer_assignment_id,
            scorer_subject_key, target_id, target_person_id, target_assignment_id, target_subject_key,
            template_config_signature, ${snapshotExpression}, submitted_at
       FROM score_records
      ORDER BY activity_id, id`
  );
  const [answers] = await connection.query(
    `SELECT record_id, question_index, score
       FROM score_answers
      ORDER BY record_id, question_index`
  );
  const [rules] = await connection.query(
    `SELECT * FROM rate_target_rules
      WHERE EXISTS (SELECT 1 FROM score_records record_row WHERE record_row.rule_id = rate_target_rules.id)`
  );
  const [clauses] = await connection.query(
    `SELECT clause_row.*
       FROM rate_rule_clauses clause_row
      WHERE EXISTS (SELECT 1 FROM score_records record_row WHERE record_row.rule_id = clause_row.rule_id)`
  );
  const clauseIds = clauses.map((row) => text(row.id));
  let configs = [];
  if (clauseIds.length) {
    const placeholders = clauseIds.map(() => '?').join(',');
    [configs] = await connection.query(
      `SELECT * FROM clause_template_configs WHERE clause_id IN (${placeholders}) ORDER BY clause_id, sort_order, id`,
      clauseIds
    );
  }
  const templateIds = Array.from(new Set(configs.map((row) => text(row.template_id))));
  let templates = [];
  let questions = [];
  if (templateIds.length) {
    const placeholders = templateIds.map(() => '?').join(',');
    [templates] = await connection.query(
      `SELECT * FROM score_question_templates WHERE id IN (${placeholders})`,
      templateIds
    );
    [questions] = await connection.query(
      `SELECT * FROM score_questions WHERE template_id IN (${placeholders}) ORDER BY template_id, sort_order, id`,
      templateIds
    );
  }
  const orgIds = Array.from(new Set(records.map((row) => text(row.org_id))));
  let participants = [];
  if (orgIds.length) {
    const placeholders = orgIds.map(() => '?').join(',');
    [participants] = await connection.query(
      `SELECT assignment_row.id, assignment_row.membership_id, legacy_hr_row.id AS legacy_hr_id,
              membership_row.person_id,
              COALESCE(person_row.name, legacy_hr_row.name) AS name,
              COALESCE(person_row.student_id, legacy_hr_row.student_id) AS student_id,
              legacy_hr_row.created_at AS legacy_hr_created_at,
              legacy_hr_row.department_id AS legacy_department_id,
              legacy_hr_row.identity_id AS legacy_identity_id,
              legacy_hr_row.work_group_id AS legacy_work_group_id,
              assignment_row.assignment_kind, assignment_row.department_id, assignment_row.identity_id,
              assignment_row.work_group_id, legacy_hr_row.org_id AS org_id,
              assignment_row.status AS assignment_status,
              assignment_row.revoked_by_departure_id,
              assignment_row.created_at AS assignment_created_at,
              assignment_row.updated_at AS assignment_updated_at,
              department_row.name AS department, identity_row.name AS identity,
              work_group_row.name AS work_group, organization_row.name AS organization_name
         FROM hr_info legacy_hr_row
         LEFT JOIN organization_memberships membership_row
           ON membership_row.legacy_hr_id = legacy_hr_row.id
          AND membership_row.org_id = legacy_hr_row.org_id
         LEFT JOIN membership_assignments assignment_row
           ON assignment_row.membership_id = membership_row.id
          AND assignment_row.org_id = membership_row.org_id
         LEFT JOIN persons person_row ON person_row.id = membership_row.person_id
         JOIN organizations organization_row ON organization_row.id = legacy_hr_row.org_id
         LEFT JOIN departments department_row
           ON department_row.id = assignment_row.department_id AND department_row.org_id = assignment_row.org_id
         LEFT JOIN identities identity_row
           ON identity_row.id = assignment_row.identity_id AND identity_row.org_id = assignment_row.org_id
         LEFT JOIN work_groups work_group_row
           ON work_group_row.id = assignment_row.work_group_id AND work_group_row.org_id = assignment_row.org_id
        WHERE legacy_hr_row.org_id IN (${placeholders})`,
      orgIds
    );
  }
  return { records, answers, rules, clauses, configs, templates, questions, participants };
}

function publicReport(analysis) {
  return {
    reconstructedAt: analysis.reconstructedAt,
    totalRecordCount: analysis.totalRecordCount,
    eligibleRecordCount: analysis.eligibleRecordCount,
    blockedRecordCount: analysis.blockedRecordCount,
    existingSnapshotCount: analysis.existingSnapshotCount,
    canBackfillAll: analysis.canBackfillAll,
    activities: analysis.activities.map((activity) => ({
      activityId: activity.activityId,
      orgId: activity.orgId,
      status: activity.status,
      totalRecordCount: activity.totalRecordCount,
      eligibleRecordCount: activity.eligibleRecordCount,
      existingSnapshotCount: activity.existingSnapshotCount,
      blockedRecordCount: activity.blockedRecordCount,
      reasons: activity.reasons,
      blockerSamples: activity.blockerSamples,
      evidenceFingerprint: activity.evidenceFingerprint
    }))
  };
}

async function persistAnalysis(connection, analysis) {
  await connection.query(
    `CREATE TEMPORARY TABLE tmp_score_snapshot_backfill (
       id VARCHAR(64) NOT NULL PRIMARY KEY,
       scorer_person_id VARCHAR(64) NOT NULL,
       scorer_assignment_id VARCHAR(64) NOT NULL,
       target_person_id VARCHAR(64) NOT NULL,
       target_assignment_id VARCHAR(64) NOT NULL,
       scorer_snapshot JSON NOT NULL,
       target_snapshot JSON NOT NULL,
       calculation_snapshot JSON NOT NULL
     ) ENGINE=InnoDB`
  );
  for (const activity of analysis.activities) {
    if (activity.status !== 'ready') continue;
    const chunkSize = 100;
    for (let offset = 0; offset < activity.entries.length; offset += chunkSize) {
      const chunk = activity.entries.slice(offset, offset + chunkSize);
      const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))').join(',');
      const values = [];
      chunk.forEach((entry) => {
        values.push(
          text(entry.record.id),
          text(entry.scorerContext.personId),
          text(entry.scorerContext.assignmentId),
          text(entry.targetContext.personId),
          text(entry.targetContext.assignmentId),
          JSON.stringify(entry.scorerContext),
          JSON.stringify(entry.targetContext),
          JSON.stringify(entry.calculationSnapshot)
        );
      });
      await connection.query(
         `INSERT INTO tmp_score_snapshot_backfill
           (id, scorer_person_id, scorer_assignment_id, target_person_id, target_assignment_id,
            scorer_snapshot, target_snapshot, calculation_snapshot)
         VALUES ${valuesSql}`,
        values
      );
    }
  }
  await connection.query(
    `UPDATE score_records record_row
       JOIN tmp_score_snapshot_backfill pending ON pending.id = record_row.id
        SET record_row.scorer_person_id = COALESCE(NULLIF(TRIM(record_row.scorer_person_id), ''), pending.scorer_person_id),
            record_row.scorer_assignment_id = COALESCE(NULLIF(TRIM(record_row.scorer_assignment_id), ''), pending.scorer_assignment_id),
            record_row.target_person_id = COALESCE(NULLIF(TRIM(record_row.target_person_id), ''), pending.target_person_id),
            record_row.target_assignment_id = COALESCE(NULLIF(TRIM(record_row.target_assignment_id), ''), pending.target_assignment_id),
            record_row.scorer_context_snapshot = COALESCE(record_row.scorer_context_snapshot, pending.scorer_snapshot),
            record_row.target_context_snapshot = COALESCE(record_row.target_context_snapshot, pending.target_snapshot),
            record_row.calculation_context_snapshot = COALESCE(record_row.calculation_context_snapshot, pending.calculation_snapshot)`
  );
  for (const activity of analysis.activities) {
    const persistedStatus = activity.status === 'ready' ? 'applied' : activity.status;
    await connection.query(
      `INSERT INTO score_snapshot_backfill_audits
         (activity_id, org_id, status, total_record_count, eligible_record_count,
          blocked_record_count, reasons_json, evidence_fingerprint, reconstructed_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, UTC_TIMESTAMP(3),
               CASE WHEN ? = 'applied' THEN UTC_TIMESTAMP(3) ELSE NULL END)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status), total_record_count = VALUES(total_record_count),
         eligible_record_count = VALUES(eligible_record_count), blocked_record_count = VALUES(blocked_record_count),
         reasons_json = VALUES(reasons_json), evidence_fingerprint = VALUES(evidence_fingerprint),
         reconstructed_at = VALUES(reconstructed_at), applied_at = VALUES(applied_at)`,
      [
        activity.activityId, activity.orgId, persistedStatus,
        activity.totalRecordCount, activity.eligibleRecordCount, activity.blockedRecordCount,
        JSON.stringify(activity.reasons), activity.evidenceFingerprint, persistedStatus
      ]
    );
  }
}

async function runCli(argv) {
  const apply = argv.includes('--apply');
  const requireAll = argv.includes('--require-all');
  const pool = require('../src/config/db');
  const connection = await pool.getConnection();
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    if (apply) {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.beginTransaction();
    }
    const dataset = await loadDataset(connection);
    const analysis = analyzeDataset(dataset);
    if (apply && !analysis.canBackfillAll) {
      const error = new Error('存在无法证明的评分活动，拒绝写入任何历史快照');
      error.code = 'SCORE_SNAPSHOT_BACKFILL_INCOMPLETE';
      throw error;
    }
    if (apply) {
      await persistAnalysis(connection, analysis);
      await connection.commit();
    }
    process.stdout.write(JSON.stringify(publicReport(analysis)) + '\n');
    if (requireAll && !analysis.canBackfillAll) process.exitCode = 2;
  } catch (error) {
    if (apply) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write('[score-snapshot-backfill] ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  legacyTemplateSignature,
  matchesScope,
  analyzeDataset,
  publicReport,
  loadDataset,
  runCli
};
