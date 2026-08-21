const { safeString, makeOrgRuleKey } = require('../../../utils/helpers');
const scoreActivityModel = require('../models/scoreActivity');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const scoreRecordModel = require('../models/scoreRecord');
const participantService = require('./participants');
const { getCurrentOrgId } = require('../../../utils/orgContext');

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value).slice(0, 10);
  const parts = text.split('-').map((item) => parseInt(item, 10));
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function buildDueAt(endDate) {
  const date = parseDateOnly(endDate);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

function isActivityActionable(activity, now) {
  if (!activity || activity.is_paused) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseDateOnly(activity.start_date);
  const end = parseDateOnly(activity.end_date);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function buildClauseScope(clause, scorer) {
  const scopeType = safeString(clause.scope_type);
  if ((scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') && !scorer.work_group_id) {
    return null;
  }
  if (scopeType === 'all_people') return { scopeType };
  if (scopeType === 'same_department_identity') {
    return { scopeType, departmentId: scorer.department_id, identityId: clause.target_identity_id };
  }
  if (scopeType === 'same_department_all') {
    return { scopeType, departmentId: scorer.department_id };
  }
  if (scopeType === 'same_work_group_identity') {
    return {
      scopeType,
      departmentId: scorer.department_id,
      workGroupId: scorer.work_group_id,
      identityId: clause.target_identity_id
    };
  }
  if (scopeType === 'same_work_group_all') {
    return { scopeType, departmentId: scorer.department_id, workGroupId: scorer.work_group_id };
  }
  if (scopeType === 'identity_only') {
    return { scopeType, identityId: clause.target_identity_id };
  }
  return null;
}

function targetMatchesClause(target, clause, scorer) {
  const scopeType = safeString(clause.scope_type);
  if (scopeType === 'same_department_identity') {
    return target.department_id === scorer.department_id && target.identity_id === clause.target_identity_id;
  }
  if (scopeType === 'same_department_all') return target.department_id === scorer.department_id;
  if (scopeType === 'same_work_group_identity') {
    return target.department_id === scorer.department_id &&
      target.work_group_id === scorer.work_group_id && target.identity_id === clause.target_identity_id;
  }
  if (scopeType === 'same_work_group_all') {
    return target.department_id === scorer.department_id && target.work_group_id === scorer.work_group_id;
  }
  if (scopeType === 'identity_only') return target.identity_id === clause.target_identity_id;
  return scopeType === 'all_people';
}

async function getUserScoringTask(hrRecord, activityOverride, nowOverride, actorOverride) {
  if (!hrRecord || !hrRecord.id || !actorOverride || !safeString(actorOverride.assignmentId)) return null;
  const now = nowOverride || new Date();
  const activity = activityOverride || await scoreActivityModel.getCurrent();
  if (!isActivityActionable(activity, now)) return null;
  const orgId = await getCurrentOrgId();
  const granularity = participantService.normalizeGranularity(activity.participant_granularity);
  const actor = actorOverride;
  const scorer = await participantService.resolveActorParticipant(orgId, actor, granularity);
  if (!scorer) return null;

  const scorerKey = makeOrgRuleKey(scorer.department_id, scorer.identity_id);
  const rule = await rateRuleModel.getByKey(activity.id, scorerKey);
  if (!rule || !rule.is_active) return null;

  const clauses = await rateRuleClauseModel.getByRuleId(rule.id);
  if (!clauses.length) return null;
  const configs = await clauseTemplateConfigModel.getByClauseIds(clauses.map((item) => item.id));
  const configuredClauseIds = new Set(configs.map((item) => item.clause_id));
  const activeClauses = clauses.filter((item) => configuredClauseIds.has(item.id));
  const scopes = activeClauses.map((item) => buildClauseScope(item, scorer)).filter(Boolean);
  if (!scopes.length) return null;

  const [targets, records] = await Promise.all([
    participantService.listParticipants(orgId, granularity),
    scoreRecordModel.getByScorerParticipant(scorer, activity.id)
  ]);
  const resolveRecordParticipantId = typeof participantService.createRecordParticipantResolver === 'function'
    ? participantService.createRecordParticipantResolver(targets)
    : (record, side) => participantService.participantRecordId(record, side, granularity);
  const scoredIds = new Set(
    records.map((item) => resolveRecordParticipantId(item, 'target')).filter(Boolean)
  );
  const expectedIds = new Set();
  for (const target of targets) {
    if (!rule.allow_self_assessment && participantService.isSameNaturalPerson(target, scorer)) continue;
    if (activeClauses.some((clause) => targetMatchesClause(target, clause, scorer))) {
      expectedIds.add(target.id);
    }
  }
  const pendingCount = Array.from(expectedIds).filter((id) => !scoredIds.has(id)).length;
  if (!pendingCount) return null;
  const dueAt = buildDueAt(activity.end_date);
  return {
    activity,
    pendingCount,
    expectedCount: expectedIds.size,
    dueAt
  };
}

module.exports = { getUserScoringTask, buildDueAt, isActivityActionable };
