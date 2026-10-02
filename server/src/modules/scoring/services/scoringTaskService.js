const { safeString, makeOrgRuleKey } = require('../../../utils/helpers');
const scoreActivityModel = require('../models/scoreActivity');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const scoreRecordModel = require('../models/scoreRecord');
const participantService = require('./participants');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { memo, getState } = require('../../../utils/requestWork');
const { getSystemDate, parseSystemDateTime } = require('../../../utils/dateTime');
const systemConfig = require('../../../core/models/systemConfig');

function scopeKey(scope) {
  return JSON.stringify([scope.scopeType, scope.departmentId || '', scope.workGroupId || '', scope.identityId || '']);
}

function buildTargetIndex(targets) {
  const index = new Map();
  for (const target of targets) {
    for (const scopeType of ['all_people', 'same_department_identity', 'same_department_all', 'same_work_group_identity', 'same_work_group_all', 'identity_only']) {
      const scope = buildClauseScope({ scope_type: scopeType, target_identity_id: target.identity_id }, target);
      if (!scope) continue;
      const key = scopeKey(scope);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(target);
    }
  }
  return index;
}

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

function buildDueAt(endDate, timezoneOffset = 8) {
  const text = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : String(endDate || '').slice(0, 10);
  const date = parseSystemDateTime(text + ' 23:59:59', timezoneOffset);
  if (!date) return null;
  date.setUTCMilliseconds(999);
  return date;
}

function isActivityActionable(activity, now, timezoneOffset = 8) {
  if (!activity || activity.is_paused) return false;
  const today = getSystemDate(now, timezoneOffset);
  const start = activity.start_date ? String(activity.start_date).slice(0, 10) : '';
  const end = activity.end_date ? String(activity.end_date).slice(0, 10) : '';
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
  const orgId = await getCurrentOrgId();
  const activity = activityOverride || await memo('scoreActivity:' + orgId, () => scoreActivityModel.getCurrent());
  const config = await memo('todoTimezone', () => systemConfig.get());
  const timezoneOffset = config && config.timezone != null ? Number(config.timezone) : 8;
  const midnight = parseSystemDateTime(getSystemDate(now, timezoneOffset) + ' 00:00:00', timezoneOffset);
  const work = getState();
  if (work && midnight) work.nextBusinessBoundary = Math.min(work.nextBusinessBoundary || Infinity, midnight.getTime() + 86400000);
  if (!isActivityActionable(activity, now, timezoneOffset)) return null;
  const granularity = participantService.normalizeGranularity(activity.participant_granularity);
  const actor = actorOverride;
  const scorer = await participantService.resolveActorParticipant(orgId, actor, granularity);
  if (!scorer) return null;

  const scorerKey = makeOrgRuleKey(scorer.department_id, scorer.identity_id);
  const rule = await memo('scoreRule:' + orgId + ':' + activity.id + ':' + scorerKey, () => rateRuleModel.getByKey(activity.id, scorerKey));
  if (!rule || !rule.is_active) return null;

  const clauses = await memo('scoreClauses:' + orgId + ':' + rule.id, () => rateRuleClauseModel.getByRuleId(rule.id));
  if (!clauses.length) return null;
  const configs = await memo('scoreConfigs:' + orgId + ':' + rule.id, () => clauseTemplateConfigModel.getByClauseIds(clauses.map((item) => item.id)));
  const configuredClauseIds = new Set(configs.map((item) => item.clause_id));
  const activeClauses = clauses.filter((item) => configuredClauseIds.has(item.id));
  const scopes = activeClauses.map((item) => buildClauseScope(item, scorer)).filter(Boolean);
  if (!scopes.length) return null;

  const [targets, records] = await Promise.all([
    participantService.listParticipants(orgId, granularity),
    scoreRecordModel.getCompletionTargets(scorer, activity.id)
  ]);
  const resolveRecordParticipantId = typeof participantService.createRecordParticipantResolver === 'function'
    ? participantService.createRecordParticipantResolver(targets)
    : (record, side) => participantService.participantRecordId(record, side, granularity);
  const scoredIds = new Set(
    records.map((item) => resolveRecordParticipantId(item, 'target')).filter(Boolean)
  );
  const expectedIds = new Set();
  const targetIndex = await memo('scoreTargetIndex:' + orgId, () => buildTargetIndex(targets));
  const uniqueScopes = new Set(scopes.map(scopeKey));
  // 全员范围已覆盖其他范围，避免反复遍历重叠的大集合。
  const allKey = scopeKey({ scopeType: 'all_people' });
  const keys = uniqueScopes.has(allKey) ? [allKey] : Array.from(uniqueScopes);
  for (const key of keys) {
    for (const target of targetIndex.get(key) || []) {
      if (!rule.allow_self_assessment && participantService.isSameNaturalPerson(target, scorer)) continue;
      expectedIds.add(target.id);
    }
  }
  const pendingCount = Array.from(expectedIds).filter((id) => !scoredIds.has(id)).length;
  if (!pendingCount) return null;
  const dueAt = buildDueAt(activity.end_date, timezoneOffset);
  return {
    activity,
    pendingCount,
    expectedCount: expectedIds.size,
    dueAt
  };
}

module.exports = { getUserScoringTask, buildDueAt, isActivityActionable };
