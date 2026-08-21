const localeCopy = require('../../../locales/zh-CN/generated/modules/scoring/routes/scoring');
const { format: localeFormat } = require('../../../locales/runtime');
const express = require('express');
const router = express.Router();
const { safeString, toNumber, makeOrgRuleKey, buildNameMap, generateId } = require('../../../utils/helpers');
const departmentModel = require('../../../core/models/department');
const identityModel = require('../../../core/models/identity');
const workGroupModel = require('../../../core/models/workGroup');
const pubCache = require('../utils/pubCache');
const scoreActivityModel = require('../models/scoreActivity');
const scoreTemplateModel = require('../models/scoreTemplate');
const scoreQuestionModel = require('../models/scoreQuestion');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const scoreRecordModel = require('../models/scoreRecord');
const scoreAnswerModel = require('../models/scoreAnswer');
const adminInfoModel = require('../../../core/models/adminInfo');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const participantService = require('../services/participants');
const { getCurrentOrgId } = require('../../../utils/orgContext');

// ──────────────────────────── helpers ────────────────────────────

function parseTimezone(value) {
  const tz = Number(value);
  return (Number.isFinite(tz) && tz >= -12 && tz <= 14) ? tz : 8;
}

function formatDate(value, timezone) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const tz = parseTimezone(timezone);
  const utcEpoch = date.getTime() - date.getTimezoneOffset() * 60000;
  const local = new Date(utcEpoch + tz * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  const datePart = `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}`;
  const timePart = `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}`;
  const timezoneLabel = tz === 8 ? '' : ` (UTC${tz >= 0 ? '+' : ''}${tz})`;
  return `${datePart} ${timePart}${timezoneLabel}`;
}

async function fetchOrgLookups() {
  const [departments, identities, workGroups] = await Promise.all([
    departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
  ]);
  return {
    departmentsById: buildNameMap(departments),
    identitiesById: buildNameMap(identities),
    workGroupsById: buildNameMap(workGroups)
  };
}

function normalizeHrPerson(record, lookups) {
  const departmentId = safeString(record.department_id);
  const identityId = safeString(record.identity_id);
  const workGroupId = safeString(record.work_group_id);
  return {
    id: record.id, name: safeString(record.name), studentId: safeString(record.student_id),
    legacyHrId: safeString(record.legacy_hr_id || record.id),
    personId: safeString(record.person_id),
    membershipId: safeString(record.membership_id),
    assignmentId: safeString(record.assignment_id),
    assignmentNature: safeString(record.assignment_kind),
    assignmentLabel: participantService.buildAssignmentLabel({
      ...record,
      department: lookups.departmentsById.get(departmentId) || '',
      identityCategory: lookups.identitiesById.get(identityId) || '',
      workGroup: lookups.workGroupsById.get(workGroupId) || ''
    }),
    departmentId,
    identityCategoryId: identityId,
    identityId,
    workGroupId,
    department: lookups.departmentsById.get(departmentId) || '',
    identityCategory: lookups.identitiesById.get(identityId) || '',
    identity: lookups.identitiesById.get(identityId) || '',
    workGroup: lookups.workGroupsById.get(workGroupId) || ''
  };
}

function normalizeClause(clauseData, templateConfigs) {
  return {
    scopeType: safeString(clauseData.scope_type),
    targetIdentityId: safeString(clauseData.target_identity_id),
    requireAllComplete: clauseData.require_all_complete === 1,
    templateConfigs: (templateConfigs || []).map(tc => ({
      templateId: tc.template_id,
      weight: Number(tc.weight),
      sortOrder: Number(tc.sort_order),
      calculationMethod: safeString(tc.calculation_method) || 'weighted_average',
      trimHighCount: Number(tc.trim_high_count || 0),
      trimLowCount: Number(tc.trim_low_count || 0)
    })).sort((a, b) => a.sortOrder - b.sortOrder)
  };
}

function buildClauseScopes(clauses, scorer) {
  const scopes = [];
  for (const clause of clauses) {
    if ((clause.scopeType === 'same_work_group_identity' || clause.scopeType === 'same_work_group_all') && !scorer.workGroupId) {
      continue;
    }
    const s = { scopeType: clause.scopeType };
    if (clause.scopeType === 'all_people') { scopes.push(s); return scopes; }
    if (clause.scopeType === 'same_department_identity') { s.departmentId = scorer.departmentId; s.identityId = clause.targetIdentityId; }
    else if (clause.scopeType === 'same_department_all') { s.departmentId = scorer.departmentId; }
    else if (clause.scopeType === 'same_work_group_identity') { s.departmentId = scorer.departmentId; s.workGroupId = scorer.workGroupId; s.identityId = clause.targetIdentityId; }
    else if (clause.scopeType === 'same_work_group_all') { s.departmentId = scorer.departmentId; s.workGroupId = scorer.workGroupId; }
    else if (clause.scopeType === 'identity_only') { s.identityId = clause.targetIdentityId; }
    else { continue; }
    scopes.push(s);
  }
  return scopes;
}

async function loadRuleFull(ruleId) {
  const rule = await rateRuleModel.getById(ruleId);
  if (!rule) return null;
  const clauses = await rateRuleClauseModel.getByRuleId(ruleId);
  const clauseIds = clauses.map(c => c.id);
  const configs = await clauseTemplateConfigModel.getByClauseIds(clauseIds);
  const configsByClause = new Map();
  configs.forEach(c => {
    if (!configsByClause.has(c.clause_id)) configsByClause.set(c.clause_id, []);
    configsByClause.get(c.clause_id).push(c);
  });
  return {
    ...rule,
    clauses: clauses.map(c => normalizeClause(c, configsByClause.get(c.id) || []))
  };
}

function buildTemplateConfigSignature(templateConfigs, templatesById) {
  return (templateConfigs || [])
    .map(config => {
      const template = templatesById.get(safeString(config.templateId));
      if (!template) return '';
      // Use question count instead of full parameters so that score-range changes
      // (min/start/max/step) do not invalidate existing score records
      const qCount = template.questions.length;
      const method = safeString(config.calculationMethod || config.calculation_method) || 'weighted_average';
      const trimH = Number(config.trimHighCount || config.trim_high_count || 0);
      const trimL = Number(config.trimLowCount || config.trim_low_count || 0);
      return `${safeString(config.templateId)}[${qCount}|${method}|${trimH}|${trimL}]`;
    })
    .filter(Boolean)
    .join('|');
}

// ──────────────────── getRateTargets ────────────────────

router.post('/getRateTargets', async (req, res) => {
  try {
    const openid = req.openid;
    const role = safeString(req.get('X-Role')).toLowerCase();
    if (role !== 'admin' && role !== 'user') {
      return res.json({ status: 'invalid_role', message: localeCopy.copy_10d3269bb4 });
    }

    const lookups = await fetchOrgLookups();
    let scorer = null;

    if (role === 'admin') {
      const admin = await adminInfoModel.getByOpenid(openid);
      if (!admin) return res.json({ status: 'need_bind', message: localeCopy.copy_f048be09ae });
      scorer = {
        id: admin.id, name: admin.name, studentId: admin.student_id || '',
        departmentId: '', department: '', identityId: '', identity: '',
        workGroupId: '', workGroup: '',
        adminLevel: admin.admin_level
      };
      const identityLabel = admin.admin_level === 'super_admin' ? '超级管理员' : '普通管理员';
      scorer.identity = identityLabel;
      return res.json({ status: 'success', scorer, targets: [] });
    }

    const currentActivity = await scoreActivityModel.getCurrent();
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'need_bind', message: actorResult.message || localeCopy.copy_4e84385ce1 });
    }
    const orgId = await getCurrentOrgId();
    const granularity = participantService.normalizeGranularity(
      currentActivity && currentActivity.participant_granularity
    );
    const scorerRecord = await participantService.resolveActorParticipant(orgId, actorResult.actor, granularity);
    if (!scorerRecord) {
      return res.json({ status: 'invalid_scorer', message: localeCopy.copy_c20c4aad74 });
    }
    scorer = normalizeHrPerson(scorerRecord, lookups);

    if (!scorer.departmentId || !scorer.identityId) {
      return res.json({ status: 'invalid_scorer', message: localeCopy.copy_d9159d48b5 });
    }

    if (!currentActivity) {
      return res.json({ status: 'success', scorer, rule: null, currentActivity: null, targets: [] });
    }

    // Validate activity is not paused
    if (currentActivity.is_paused) {
      return res.json({
        status: 'activity_paused',
        message: localeCopy.copy_5b46959129,
        scorer,
        currentActivity: { id: currentActivity.id, name: currentActivity.name || '', isPaused: true },
        targets: []
      });
    }

    // Validate current date is within activity date range
    let now = new Date();
    let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (currentActivity.start_date) {
      let startDate = new Date(currentActivity.start_date);
      if (today < startDate) {
        return res.json({
          status: 'activity_not_started',
          message: localeCopy.copy_d6213b5668,
          scorer,
          currentActivity: { id: currentActivity.id, name: currentActivity.name || '' },
          targets: []
        });
      }
    }
    if (currentActivity.end_date) {
      let endDate = new Date(currentActivity.end_date);
      if (today > endDate) {
        return res.json({
          status: 'activity_ended',
          message: localeCopy.copy_e4bebdb4ea,
          scorer,
          currentActivity: { id: currentActivity.id, name: currentActivity.name || '' },
          targets: []
        });
      }
    }

    // Find matching rule
    const scorerKey = makeOrgRuleKey(scorer.departmentId, scorer.identityId);
    const rule = await rateRuleModel.getByKey(currentActivity.id, scorerKey);

    if (!rule || !rule.is_active) {
      return res.json({ status: 'missing_rule', message: localeCopy.copy_0bde584db1 });
    }

    const ruleFull = await loadRuleFull(rule.id);

    // Get scored targets
    const scoredRecords = await scoreRecordModel.getByScorerParticipant(scorerRecord, currentActivity.id);

    // Collect targets from all clauses — load only scoped HR records
    const targetMap = new Map();
    const clauseScopes = buildClauseScopes(ruleFull.clauses, scorer);
    const allHrInfo = clauseScopes.length
      ? await participantService.listParticipants(orgId, granularity)
      : [];
    const resolveRecordParticipantId = typeof participantService.createRecordParticipantResolver === 'function'
      ? participantService.createRecordParticipantResolver(allHrInfo)
      : (record, side) => participantService.participantRecordId(record, side, granularity);
    const scoredTargetIdSet = new Set(
      scoredRecords.map((record) => resolveRecordParticipantId(record, 'target')).filter(Boolean)
    );

    for (const clause of ruleFull.clauses) {
      if ((clause.scopeType === 'same_work_group_identity' || clause.scopeType === 'same_work_group_all') && !scorer.workGroupId) {
        continue;
      }

      const targets = allHrInfo.filter(item => {
        const target = normalizeHrPerson(item, lookups);
        if (clause.scopeType === 'same_department_identity') return target.departmentId === scorer.departmentId && target.identityId === clause.targetIdentityId;
        if (clause.scopeType === 'same_department_all') return target.departmentId === scorer.departmentId;
        if (clause.scopeType === 'same_work_group_identity') return target.departmentId === scorer.departmentId && target.workGroupId === scorer.workGroupId && target.identityId === clause.targetIdentityId;
        if (clause.scopeType === 'same_work_group_all') return target.departmentId === scorer.departmentId && target.workGroupId === scorer.workGroupId;
        if (clause.scopeType === 'identity_only') return target.identityId === clause.targetIdentityId;
        if (clause.scopeType === 'all_people') return true;
        return false;
      });

      targets.forEach(item => {
        if (!rule.allow_self_assessment && participantService.isSameNaturalPerson(item, scorerRecord)) return;
        if (!targetMap.has(item.id)) {
          const person = normalizeHrPerson(item, lookups);
          const isScored = scoredTargetIdSet.has(item.id);
          targetMap.set(item.id, {
            ...person,
            isScored,
            scoreStatus: isScored ? 'scored' : 'pending',
            scoreStatusText: isScored ? '已评分' : '待评分'
          });
        }
      });
    }

    const sortedTargets = Array.from(targetMap.values()).sort((a, b) => {
      if (a.isScored !== b.isScored) return a.isScored ? 1 : -1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    const targetPresentation = participantService.decorateAssignmentDisambiguation(sortedTargets);

    res.json({
      status: 'success', scorer,
      rule: ruleFull,
      currentActivity: {
        id: currentActivity.id,
        name: currentActivity.name,
        participantGranularity: granularity
      },
      targets: targetPresentation.rows,
      needsAssignmentDisambiguation: targetPresentation.needsAssignmentDisambiguation
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_a2d8fd888c });
  }
});

// ──────────────────── getScoreFormData ────────────────────

const RULE_SCOPE_LABEL_MAP = {
  same_department_identity: '同一部门内的指定身份成员',
  same_department_all: '同一部门内的所有成员',
  same_work_group_identity: '同一部门同一职能组内的指定身份成员',
  same_work_group_all: '同一部门同一职能组内的所有成员',
  identity_only: '全体成员中的指定身份',
  all_people: '全体成员'
};

router.post('/getScoreFormData', async (req, res) => {
  try {
    const timezone = parseTimezone(req.body.timezone);
    const targetId = safeString(req.body.targetId);
    if (!targetId) return res.json({ status: 'invalid_params', message: localeCopy.copy_77bf5b6009 });

    const activity = await scoreActivityModel.getCurrent();
    if (!activity) return res.json({ status: 'missing_activity', message: localeCopy.copy_ff48e241fb });
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || localeCopy.copy_4e84385ce1 });
    }
    const orgId = await getCurrentOrgId();
    const granularity = participantService.normalizeGranularity(activity.participant_granularity);
    const [scorerRecord, targetRecord, lookups] = await Promise.all([
      participantService.resolveActorParticipant(orgId, actorResult.actor, granularity),
      participantService.resolveParticipant(orgId, targetId, granularity),
      fetchOrgLookups()
    ]);
    if (!scorerRecord) return res.json({ status: 'invalid_scorer', message: localeCopy.copy_c20c4aad74 });
    if (!targetRecord) return res.json({ status: 'target_not_found', message: localeCopy.copy_245da65c1c });
    const scorer = normalizeHrPerson(scorerRecord, lookups);

    if (activity.is_paused) {
      return res.json({ status: 'activity_paused', message: localeCopy.copy_5b46959129 });
    }

    let now = new Date();
    let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (activity.start_date) {
      let startDate = new Date(activity.start_date);
      if (today < startDate) {
        return res.json({ status: 'activity_not_started', message: localeCopy.copy_d6213b5668 });
      }
    }
    if (activity.end_date) {
      let endDate = new Date(activity.end_date);
      if (today > endDate) {
        return res.json({ status: 'activity_ended', message: localeCopy.copy_e4bebdb4ea });
      }
    }

    const scorerKey = makeOrgRuleKey(scorer.departmentId, scorer.identityId);
    const rule = await rateRuleModel.getByKey(activity.id, scorerKey);
    if (!rule || !rule.is_active) {
      return res.json({ status: 'missing_rule', message: localeCopy.copy_0bde584db1 });
    }

    const ruleFull = await loadRuleFull(rule.id);

    // Find matching clauses for this target — load only the target record
    const targetPerson = normalizeHrPerson(targetRecord, lookups);
    const matchedClauseEntries = [];

    for (const clause of ruleFull.clauses) {
      if ((clause.scopeType === 'same_work_group_identity' || clause.scopeType === 'same_work_group_all') && !scorer.workGroupId) {
        continue;
      }

      let match = false;
      if (clause.scopeType === 'same_department_identity') match = targetPerson.departmentId === scorer.departmentId && targetPerson.identityId === clause.targetIdentityId;
      else if (clause.scopeType === 'same_department_all') match = targetPerson.departmentId === scorer.departmentId;
      else if (clause.scopeType === 'same_work_group_identity') match = targetPerson.departmentId === scorer.departmentId && targetPerson.workGroupId === scorer.workGroupId && targetPerson.identityId === clause.targetIdentityId;
      else if (clause.scopeType === 'same_work_group_all') match = targetPerson.departmentId === scorer.departmentId && targetPerson.workGroupId === scorer.workGroupId;
      else if (clause.scopeType === 'identity_only') match = targetPerson.identityId === clause.targetIdentityId;
      else if (clause.scopeType === 'all_people') match = true;

      if (match) {
        matchedClauseEntries.push({ person: targetPerson, clause });
      }
    }

    if (!matchedClauseEntries.length) {
      return res.json({ status: 'target_not_allowed', message: localeCopy.copy_89c48c7311 });
    }
    if (!rule.allow_self_assessment && participantService.isSameNaturalPerson(scorerRecord, targetRecord)) {
      return res.json({ status: 'target_not_allowed', message: localeCopy.copy_c3cf0a1624 });
    }

    const configuredClauseEntry = matchedClauseEntries.find(item =>
      Array.isArray(item.clause.templateConfigs) && item.clause.templateConfigs.length
    );

    if (!configuredClauseEntry) {
      return res.json({ status: 'missing_clause_config', message: localeCopy.copy_57a174b63c });
    }

    // Load templates and questions
    const templateIds = configuredClauseEntry.clause.templateConfigs.map(c => c.templateId);
    const templateDocs = await Promise.all(templateIds.map(id => scoreTemplateModel.getById(id)));
    const questionsByTemplate = await Promise.all(templateIds.map(id => scoreQuestionModel.getByTemplateId(id)));

    const templatesById = new Map();
    const templateDocsList = [];

    for (let i = 0; i < templateIds.length; i++) {
      const templateDoc = templateDocs[i];
      const questions = questionsByTemplate[i];
      if (!templateDoc || !questions.length) {
        return res.json({ status: 'missing_template', message: localeCopy.copy_57a174b63c });
      }
      const config = configuredClauseEntry.clause.templateConfigs[i];
      templatesById.set(templateIds[i], { ...templateDoc, questions });
      templateDocsList.push({
        id: templateDoc.id, name: templateDoc.name, description: templateDoc.description || '',
        weight: config.weight, sortOrder: config.sortOrder,
        questions: questions.map((q, index) => ({
          id: `${templateDoc.id}_${index}`, questionIndex: index + 1,
          question: q.question, scoreLabel: q.score_label,
          minValue: toNumber(q.min_value, 0), startValue: toNumber(q.start_value, 0),
          maxValue: toNumber(q.max_value, 0), stepValue: toNumber(q.step_value, 0.5)
        }))
      });
    }

    templateDocsList.sort((a, b) => a.sortOrder - b.sortOrder);

    const mergedQuestions = [];
    templateDocsList.forEach(td => {
      td.questions.forEach((q, i) => {
        mergedQuestions.push({
          id: `${td.id}_${q.questionIndex}`, templateId: td.id, templateName: td.name,
          templateWeight: td.weight, templateSortOrder: td.sortOrder,
          questionIndex: q.questionIndex, question: q.question, scoreLabel: q.scoreLabel,
          minValue: q.minValue, startValue: q.startValue, maxValue: q.maxValue, stepValue: q.stepValue
        });
      });
    });

    const templateConfigSignature = buildTemplateConfigSignature(
      configuredClauseEntry.clause.templateConfigs, templatesById
    );

    // Check existing records
    const existingRecords = await scoreRecordModel.getByParticipantPair(scorerRecord, targetRecord, activity.id);
    let existingRecord = null;
    for (const record of existingRecords) {
      if (safeString(record.template_config_signature) === templateConfigSignature) {
        const answers = await scoreAnswerModel.getByRecordId(record.id);
        existingRecord = { id: record.id, submittedAt: formatDate(record.submitted_at, timezone), answers };
        break;
      } else {
        await scoreAnswerModel.removeByRecordId(record.id);
        await scoreRecordModel.remove(record.id);
      }
    }

    const answerMap = new Map();
    if (existingRecord && existingRecord.answers) {
      const hasZero = existingRecord.answers.some(a => a.question_index === 0);
      existingRecord.answers.forEach(a => {
        answerMap.set(String(hasZero ? a.question_index + 1 : a.question_index), a.score);
      });
    }

    res.json({
      status: 'success', scorer,
      target: configuredClauseEntry.person,
      currentActivity: { id: activity.id, name: activity.name, description: activity.description,
        startDate: activity.start_date, endDate: activity.end_date,
        participantGranularity: granularity },
      existingRecord: existingRecord ? { id: existingRecord.id, submittedAt: existingRecord.submittedAt } : null,
      rule: {
        id: rule.id, scorerDepartment: scorer.department, scorerIdentity: scorer.identity,
        clauseScopeType: configuredClauseEntry.clause.scopeType,
        clauseScopeLabel: RULE_SCOPE_LABEL_MAP[configuredClauseEntry.clause.scopeType] || configuredClauseEntry.clause.scopeType,
        clauseTargetIdentity: configuredClauseEntry.clause.targetIdentityId
          ? (lookups.identitiesById.get(configuredClauseEntry.clause.targetIdentityId) || '') : '',
        templateConfigSignature
      },
      templateBundle: {
        name: templateDocsList.map(t => t.name).join(' + '),
        templates: templateDocsList,
        questions: mergedQuestions.map((item, index, list) => ({
          ...item,
          showTemplateHeader: index === 0 || list[index - 1].templateId !== item.templateId,
          score: answerMap.has(String(index + 1)) ? String(answerMap.get(String(index + 1))) : ''
        }))
      }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_45de35fe1a });
  }
});

// ──────────────────── submitScoreRecord ────────────────────

function isStepAligned(score, startValue, stepValue) {
  const step = toNumber(stepValue, 0);
  if (!step) return true;
  const diff = (toNumber(score, 0) - toNumber(startValue, 0)) / step;
  return Math.abs(diff - Math.round(diff)) < 1e-8;
}

router.post('/submitScoreRecord', async (req, res) => {
  try {
    const targetId = safeString(req.body.targetId);
    const activityId = safeString(req.body.activityId);
    const templateConfigSignature = safeString(req.body.templateConfigSignature);
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];

    if (!req.openid) {
      return res.json({ status: 'auth_failed', message: localeCopy.copy_0ee2356002 });
    }
    if (!targetId || !activityId || !templateConfigSignature || !answers.length) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_ba0ae586e3 });
    }

    // Validate activity is not paused and within date range
    const activity = await scoreActivityModel.getById(activityId);
    if (!activity) {
      return res.json({ status: 'missing_activity', message: localeCopy.copy_4f0d449737 });
    }
    if (activity.is_paused) {
      return res.json({ status: 'activity_paused', message: localeCopy.copy_d643c74b0e });
    }
    let now = new Date();
    let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (activity.start_date) {
      let startDate = new Date(activity.start_date);
      if (today < startDate) {
        return res.json({ status: 'activity_not_started', message: localeCopy.copy_2c6c18b79b });
      }
    }
    if (activity.end_date) {
      let endDate = new Date(activity.end_date);
      if (today > endDate) {
        return res.json({ status: 'activity_ended', message: localeCopy.copy_725b89a6cd });
      }
    }

    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || localeCopy.copy_4e84385ce1 });
    }
    const orgId = await getCurrentOrgId();
    const granularity = participantService.normalizeGranularity(activity.participant_granularity);
    const [scorerRecord, targetRecord, lookups] = await Promise.all([
      participantService.resolveActorParticipant(orgId, actorResult.actor, granularity),
      participantService.resolveParticipant(orgId, targetId, granularity),
      fetchOrgLookups()
    ]);

    if (!scorerRecord) return res.json({ status: 'invalid_scorer', message: localeCopy.copy_c20c4aad74 });
    if (!targetRecord) return res.json({ status: 'target_not_found', message: localeCopy.copy_245da65c1c });

    const scorer = normalizeHrPerson(scorerRecord, lookups);
    const targetPerson = normalizeHrPerson(targetRecord, lookups);
    const scorerSubjectKey = participantService.participantSubjectKey(scorerRecord, granularity);
    const targetSubjectKey = participantService.participantSubjectKey(targetRecord, granularity);
    const scorerKey = makeOrgRuleKey(scorer.departmentId, scorer.identityId);

    const rule = await rateRuleModel.getByKey(activityId, scorerKey);
    if (!rule || !rule.is_active) {
      return res.json({ status: 'missing_rule', message: localeCopy.copy_50b40b1390 });
    }

    const ruleFull = await loadRuleFull(rule.id);

    // Validate target is in scope — check only the target person, not all HR
    let matchedClause = null;
    let targetInScope = false;

    for (const clause of ruleFull.clauses) {
      if (!clause.templateConfigs.length) continue;
      if ((clause.scopeType === 'same_work_group_identity' || clause.scopeType === 'same_work_group_all') && !scorer.workGroupId) continue;

      let match = false;
      if (clause.scopeType === 'same_department_identity') match = targetPerson.departmentId === scorer.departmentId && targetPerson.identityId === clause.targetIdentityId;
      else if (clause.scopeType === 'same_department_all') match = targetPerson.departmentId === scorer.departmentId;
      else if (clause.scopeType === 'same_work_group_identity') match = targetPerson.departmentId === scorer.departmentId && targetPerson.workGroupId === scorer.workGroupId && targetPerson.identityId === clause.targetIdentityId;
      else if (clause.scopeType === 'same_work_group_all') match = targetPerson.departmentId === scorer.departmentId && targetPerson.workGroupId === scorer.workGroupId;
      else if (clause.scopeType === 'identity_only') match = targetPerson.identityId === clause.targetIdentityId;
      else if (clause.scopeType === 'all_people') match = true;

      if (match) {
        targetInScope = true;
        if (!matchedClause || !matchedClause.templateConfigs.length) {
          matchedClause = clause;
        }
      }
    }

    if (!targetInScope) {
      return res.json({ status: 'target_not_allowed', message: localeCopy.copy_89c48c7311 });
    }
    if (!rule.allow_self_assessment && participantService.isSameNaturalPerson(scorerRecord, targetRecord)) {
      return res.json({ status: 'target_not_allowed', message: localeCopy.copy_c3cf0a1624 });
    }
    if (!matchedClause) {
      return res.json({ status: 'missing_rule', message: localeCopy.copy_bce1328642 });
    }

    // Build question bundle from templates (parallel)
    const questionBundle = [];
    const templatesById = new Map();

    const templateResults = await Promise.all(
      matchedClause.templateConfigs.map(config => Promise.all([
        scoreTemplateModel.getById(config.templateId),
        scoreQuestionModel.getByTemplateId(config.templateId)
      ]))
    );

    for (let ti = 0; ti < matchedClause.templateConfigs.length; ti++) {
      const config = matchedClause.templateConfigs[ti];
      const [templateDoc, questions] = templateResults[ti];

      if (!templateDoc || !questions.length) {
        return res.json({ status: 'missing_template', message: localeCopy.copy_c0797ed4eb });
      }

      templatesById.set(config.templateId, { ...templateDoc, questions });

      questions.forEach((q, qi) => {
        questionBundle.push({
          templateId: templateDoc.id, templateSortOrder: config.sortOrder,
          questionIndex: qi + 1, question: q.question, scoreLabel: q.score_label,
          minValue: toNumber(q.min_value, 0), startValue: toNumber(q.start_value, 0),
          maxValue: toNumber(q.max_value, 0), stepValue: toNumber(q.step_value, 0.5)
        });
      });
    }

    // Verify signature
    if (buildTemplateConfigSignature(matchedClause.templateConfigs, templatesById) !== safeString(templateConfigSignature)) {
      return res.json({ status: 'template_mismatch', message: localeCopy.copy_c0797ed4eb });
    }

    questionBundle.sort((a, b) => {
      if (a.templateSortOrder !== b.templateSortOrder) return a.templateSortOrder - b.templateSortOrder;
      return a.questionIndex - b.questionIndex;
    });

    // Validate answers
    const answerMap = new Map(answers.map(a => [String(a.questionIndex), Number(a.score)]));
    const normalizedAnswers = [];

    for (let i = 0; i < questionBundle.length; i++) {
      const question = questionBundle[i];
      const score = answerMap.get(String(i + 1));

      if (score == null || Number.isNaN(score)) {
        return res.json({ status: 'invalid_score', message: localeFormat(localeCopy.copy_57e36dc50b, [i + 1]) });
      }
      if (score < question.minValue || score > question.maxValue) {
        return res.json({ status: 'invalid_score', message: localeFormat(localeCopy.copy_45604d4257, [i + 1]) });
      }
      if (!isStepAligned(score, question.startValue, question.stepValue)) {
        return res.json({ status: 'invalid_score', message: localeFormat(localeCopy.copy_cc1ba72c8d, [i + 1]) });
      }

      normalizedAnswers.push({ questionIndex: i + 1, score });
    }

    // Save record — update existing or create new, then insert answers — all in a transaction
    const { withTransaction } = require('../../../config/db');
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let resultRecordId;
    let duplicateResponse = null;
    const clientRequestId = safeString(req.body.clientRequestId);

    await withTransaction(async (conn) => {
      const dedup = require('../../../utils/requestDeduplication');
      const candidateRecordId = generateId();
      const claim = await dedup.claim(conn, {
        orgId,
        actorKey: 'score-subject:' + scorerSubjectKey,
        operationType: 'submit_score',
        clientRequestId,
        resourceId: candidateRecordId
      });
      if (!claim.claimed) {
        duplicateResponse = claim.response || { status: 'success', recordId: claim.resourceId, idempotent: true };
        resultRecordId = duplicateResponse.recordId || claim.resourceId;
        return;
      }

      await conn.query(
        `INSERT INTO score_records
          (id, activity_id, rule_id, scorer_id, scorer_person_id, scorer_assignment_id,
           scorer_context_snapshot, scorer_subject_key, target_id, target_person_id, target_assignment_id,
           target_context_snapshot, target_subject_key, template_config_signature, submitted_at, org_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          rule_id = VALUES(rule_id),
          scorer_id = VALUES(scorer_id),
           scorer_person_id = VALUES(scorer_person_id),
           scorer_assignment_id = VALUES(scorer_assignment_id),
           scorer_context_snapshot = VALUES(scorer_context_snapshot),
          target_id = VALUES(target_id),
           target_person_id = VALUES(target_person_id),
           target_assignment_id = VALUES(target_assignment_id),
           target_context_snapshot = VALUES(target_context_snapshot),
          template_config_signature = VALUES(template_config_signature),
          submitted_at = VALUES(submitted_at)`,
        [
          candidateRecordId,
          activityId,
          rule.id,
          safeString(scorerRecord.legacy_hr_id || scorerRecord.id),
          safeString(scorerRecord.person_id) || null,
          safeString(scorerRecord.assignment_id) || null,
          JSON.stringify(participantService.buildAssignmentSnapshot(scorerRecord, {
            contextId: actorResult.actor.contextId
          })),
          scorerSubjectKey,
          safeString(targetRecord.legacy_hr_id || targetRecord.id),
          safeString(targetRecord.person_id) || null,
          safeString(targetRecord.assignment_id) || null,
          JSON.stringify(participantService.buildAssignmentSnapshot(targetRecord)),
          targetSubjectKey,
          templateConfigSignature,
          nowUtc,
          orgId
        ]
      );
      const [records] = await conn.query(
        `SELECT id FROM score_records
         WHERE org_id = ? AND activity_id = ?
           AND scorer_subject_key = ? AND target_subject_key = ?
         FOR UPDATE`,
        [orgId, activityId, scorerSubjectKey, targetSubjectKey]
      );
      if (!records.length) throw new Error(localeCopy.copy_af9ac03fc1);
      const recordId = records[0].id;
      await conn.query('DELETE FROM score_answers WHERE record_id = ? AND org_id = ?', [recordId, orgId]);

      // Insert answers
      for (const answer of normalizedAnswers) {
        await conn.query(
          'INSERT INTO score_answers (id, record_id, question_index, score, org_id) VALUES (?, ?, ?, ?, ?)',
          [generateId(), recordId, answer.questionIndex, answer.score, orgId]
        );
      }

      resultRecordId = recordId;
      await dedup.complete(conn, {
        ...claim,
        resourceId: recordId,
        orgId,
        actorKey: 'score-subject:' + scorerSubjectKey,
        operationType: 'submit_score'
      }, { status: 'success', recordId });
    });

    // Invalidate publication score cache so next viewer sees fresh results
    await pubCache.invalidate(activityId, orgId);

    res.json(duplicateResponse || { status: 'success', recordId: resultRecordId });
  } catch (e) {
    if (e && e.code === 'INVALID_CLIENT_REQUEST_ID') {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_534935765f });
    }
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_fee6d129e3 });
  }
});

// ──────────────────── getScorerTaskStatus ────────────────────

router.post('/getScorerTaskStatus', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const activityId = safeString(req.body.activityId);
    const filters = req.body.filters || {};
    const offset = Math.max(0, Math.floor(toNumber(req.body.offset, 0)));
    const scorerKey = safeString(req.body.scorerKey);

    if (!activityId) return res.json({ status: 'invalid_params', message: localeCopy.copy_c5ed87fa11 });

    const activity = await scoreActivityModel.getById(activityId);
    if (!activity) return res.json({ status: 'activity_not_found', message: localeCopy.copy_83aacffc9f });
    const orgId = await getCurrentOrgId();
    const granularity = participantService.normalizeGranularity(activity.participant_granularity);
    const [allMembers, allRules, allRecords, lookups] = await Promise.all([
      participantService.listParticipants(orgId, granularity),
      rateRuleModel.getByActivity(activityId),
      scoreRecordModel.getByActivity(activityId),
      fetchOrgLookups()
    ]);

    const members = allMembers.map(m => normalizeHrPerson(m, lookups));

    // Load rule clauses and configs in batch
    const ruleIds = allRules.map(r => r.id);
    const allClauses = await rateRuleClauseModel.getByRuleIds(ruleIds);
    const clauseIds = allClauses.map(c => c.id);
    const allConfigs = clauseIds.length ? await clauseTemplateConfigModel.getByClauseIds(clauseIds) : [];

    const configsByClause = new Map();
    allConfigs.forEach(c => {
      if (!configsByClause.has(c.clause_id)) configsByClause.set(c.clause_id, []);
      configsByClause.get(c.clause_id).push(c);
    });

    const rulesData = allRules.map(rule => {
      const clauses = allClauses.filter(c => c.rule_id === rule.id);
      return {
        ...rule,
        allowSelfAssessment: Boolean(rule.allow_self_assessment),
        scorerKey: makeOrgRuleKey(rule.scorer_department_id, rule.scorer_identity_id),
        clauses: clauses.map(c => ({
          scopeType: safeString(c.scope_type),
          targetIdentityId: safeString(c.target_identity_id),
          templateConfigs: (configsByClause.get(c.id) || []).map(tc => ({
            templateId: tc.template_id, weight: Number(tc.weight), sortOrder: Number(tc.sort_order)
          }))
        }))
      };
    })

    // Build task rows
    const membersByRuleKey = new Map();
    members.forEach(m => {
      const key = makeOrgRuleKey(m.departmentId, m.identityId);
      if (!key) return;
      if (!membersByRuleKey.has(key)) membersByRuleKey.set(key, []);
      membersByRuleKey.get(key).push(m);
    });

    const scorerMap = new Map();
    rulesData.forEach(rule => {
      const scorers = membersByRuleKey.get(rule.scorerKey) || [];
      (rule.clauses || []).forEach(clause => {
        if (!clause.templateConfigs || !clause.templateConfigs.length) return;
        scorers.forEach(sc => {
          const sk = safeString(sc.id) || sc.studentId;
          if (!sk) return;
          if (!scorerMap.has(sk)) {
            scorerMap.set(sk, {
              scorerKey: sk, scorerId: sc.id, scorerName: sc.name, scorerStudentId: sc.studentId,
              personId: sc.personId, assignmentId: sc.assignmentId, assignmentKind: sc.assignmentKind,
              departmentId: sc.departmentId, identityId: sc.identityId, workGroupId: sc.workGroupId,
              department: sc.department, identity: sc.identity, workGroup: sc.workGroup,
              expectedTargets: new Map(), submittedTargetIds: new Set()
            });
          }
          const sr = scorerMap.get(sk);
          members.forEach(target => {
            let match = false;
            if (clause.scopeType === 'same_department_identity') match = target.departmentId === sc.departmentId && target.identityId === clause.targetIdentityId;
            else if (clause.scopeType === 'same_department_all') match = target.departmentId === sc.departmentId;
            else if (clause.scopeType === 'same_work_group_identity') match = target.departmentId === sc.departmentId && target.workGroupId === sc.workGroupId && target.identityId === clause.targetIdentityId;
            else if (clause.scopeType === 'same_work_group_all') match = target.departmentId === sc.departmentId && target.workGroupId === sc.workGroupId;
            else if (clause.scopeType === 'identity_only') match = target.identityId === clause.targetIdentityId;
            else if (clause.scopeType === 'all_people') match = true;
            if (match && (rule.allowSelfAssessment || !participantService.isSameNaturalPerson(sc, target))) {
              sr.expectedTargets.set(target.id, target);
            }
          });
        });
      });
    });

    const resolveRecordParticipantId = typeof participantService.createRecordParticipantResolver === 'function'
      ? participantService.createRecordParticipantResolver(members)
      : (record, side) => participantService.participantRecordId(record, side, granularity);

    // Mark submitted
    allRecords.forEach(record => {
      const sk = resolveRecordParticipantId(record, 'scorer');
      const targetParticipantId = resolveRecordParticipantId(record, 'target');
      const sr = scorerMap.get(sk);
      if (sr && sr.expectedTargets.has(targetParticipantId)) {
        sr.submittedTargetIds.add(targetParticipantId);
      }
    });

    let rows = Array.from(scorerMap.values())
      .map(item => {
        const expectedCount = item.expectedTargets.size;
        const submittedCount = Array.from(item.submittedTargetIds)
          .filter(tid => item.expectedTargets.has(tid)).length;
        return {
          scorerKey: item.scorerKey, scorerId: item.scorerId, scorerName: item.scorerName,
          scorerStudentId: item.scorerStudentId, department: item.department,
          personId: item.personId, assignmentId: item.assignmentId, assignmentKind: item.assignmentKind,
          departmentId: item.departmentId, identityId: item.identityId, workGroupId: item.workGroupId,
          identity: item.identity, workGroup: item.workGroup,
          expectedCount, submittedCount, pendingCount: Math.max(expectedCount - submittedCount, 0),
          completionRate: expectedCount ? Number(((submittedCount / expectedCount) * 100).toFixed(2)) : 100
        };
      })
      .filter(item => {
        if (scorerKey) return item.scorerKey === scorerKey;
        return item.pendingCount > 0;
      });
    const scorerPresentation = participantService.decorateAssignmentDisambiguation(rows);
    rows = scorerPresentation.rows;

    // Apply filters
    const deptFilter = safeString(filters.department);
    const identFilter = safeString(filters.identity);
    const wgFilter = safeString(filters.workGroup);
    const keyword = safeString(filters.keyword).toLowerCase();

    if (deptFilter && deptFilter !== '全部' && deptFilter !== '全部部门') {
      rows = rows.filter(r => r.department === deptFilter);
    }
    if (identFilter && identFilter !== '全部' && identFilter !== '全部身份') {
      rows = rows.filter(r => r.identity === identFilter);
    }
    if (wgFilter && wgFilter !== '全部' && wgFilter !== '全部职能组' && wgFilter !== '全部工作分工') {
      rows = rows.filter(r => r.workGroup === wgFilter);
    }
    if (keyword) {
      rows = rows.filter(r =>
        [r.scorerName, r.scorerStudentId, r.department, r.identity, r.workGroup]
          .join(' ').toLowerCase().includes(keyword)
      );
    }

    rows.sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      return String(a.scorerName).localeCompare(String(b.scorerName), 'zh-CN');
    });

    res.json({
      status: 'success',
      activityName: activity.name,
      stats: { totalPendingScorers: rows.length },
      filterOptions: {
        departments: [...new Set(rows.map(r => r.department).filter(Boolean))].sort(),
        identities: [...new Set(rows.map(r => r.identity).filter(Boolean))].sort(),
        workGroups: [...new Set(rows.map(r => r.workGroup).filter(Boolean))].sort()
      },
      scorers: rows.slice(offset, offset + 50),
      needsAssignmentDisambiguation: scorerPresentation.needsAssignmentDisambiguation,
      pagination: { offset, nextOffset: offset + 50, total: rows.length, hasMore: offset + 50 < rows.length, returnedCount: Math.min(50, Math.max(0, rows.length - offset)) }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_36a1730e53 });
  }
});

// ──────────────────── exportScorerTaskStatus ────────────────────

const { buildWorkbookBuffer } = require('../../../utils/excelFile');

function buildExportCsv(headers, rows) {
  let escapeCsv = function (v) { let t = String(v == null ? '' : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  let csvText = '﻿' + headers.map(function (h) { return escapeCsv(h.label); }).join(',') + '\r\n' +
    rows.map(function (r) { return headers.map(function (h) { return escapeCsv(r[h.key]); }).join(','); }).join('\r\n');
  return Buffer.from(csvText, 'utf-8').toString('base64');
}

async function buildExportXlsx(sheetName, headers, rows) {
  let headerLabels = headers.map(function (h) { return h.label; });
  let dataRows = rows.map(function (row) { return headers.map(function (h) { return row[h.key]; }); });
  const buffer = await buildWorkbookBuffer(sheetName, [headerLabels].concat(dataRows));
  return buffer.toString('base64');
}

function buildTaskExportReport(activityName, reportType, rows) {
  if (reportType === 'detail') {
    return {
      fileName: activityName + localeCopy.copy_6edf0fb992,
      sheetName: '未完成评分明细',
      headers: [
        { key: 'scorerName', label: localeCopy.copy_b74f5017ad },
        { key: 'scorerStudentId', label: localeCopy.copy_1a9dbccd72 },
        { key: 'department', label: localeCopy.copy_62f8e70200 },
        { key: 'identity', label: localeCopy.copy_474f638a6f },
        { key: 'workGroup', label: localeCopy.copy_be736f763d },
        { key: 'targetName', label: localeCopy.copy_e33cda7435 },
        { key: 'targetStudentId', label: localeCopy.copy_712e06f661 },
        { key: 'targetDepartment', label: localeCopy.copy_d6c72cfd3b },
        { key: 'targetIdentity', label: localeCopy.copy_e95e7b70bf },
        { key: 'targetWorkGroup', label: localeCopy.copy_5956aa0bc5 }
      ],
      rows: rows.flatMap(function (row) {
        return (row.pendingList || []).map(function (target) {
          return {
            scorerName: row.scorerName, scorerStudentId: row.scorerStudentId,
            department: row.department, identity: row.identity, workGroup: row.workGroup,
            targetName: target.targetName, targetStudentId: target.targetStudentId,
            targetDepartment: target.targetDepartment, targetIdentity: target.targetIdentity,
            targetWorkGroup: target.targetWorkGroup
          };
        });
      })
    };
  }

  return {
    fileName: activityName + localeCopy.copy_f539673f88,
    sheetName: '未完成评分概览',
    headers: [
      { key: 'scorerName', label: localeCopy.copy_b74f5017ad },
      { key: 'scorerStudentId', label: localeCopy.copy_1a9dbccd72 },
      { key: 'department', label: localeCopy.copy_62f8e70200 },
      { key: 'identity', label: localeCopy.copy_474f638a6f },
      { key: 'workGroup', label: localeCopy.copy_be736f763d },
      { key: 'expectedCount', label: localeCopy.copy_6c33883f9b },
      { key: 'submittedCount', label: localeCopy.copy_4430825ac4 },
      { key: 'pendingCount', label: localeCopy.copy_41f72ed2a2 },
      { key: 'completionRate', label: localeCopy.copy_cc6cc6ec7f }
    ],
    rows: rows
  };
}

router.post('/exportScorerTaskStatus', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const activityId = safeString(req.body.activityId);
    const reportType = safeString(req.body.reportType) || 'summary';
    const format = safeString(req.body.format) || 'csv';
    const filters = req.body.filters || {};

    if (!activityId) return res.json({ status: 'invalid_params', message: localeCopy.copy_c5ed87fa11 });

    const activity = await scoreActivityModel.getById(activityId);
    if (!activity) return res.json({ status: 'activity_not_found', message: localeCopy.copy_83aacffc9f });
    const orgId = await getCurrentOrgId();
    const granularity = participantService.normalizeGranularity(activity.participant_granularity);
    const [allMembers, allRules, allRecords, lookups] = await Promise.all([
      participantService.listParticipants(orgId, granularity),
      rateRuleModel.getByActivity(activityId),
      scoreRecordModel.getByActivity(activityId),
      fetchOrgLookups()
    ]);

    const members = allMembers.map(m => normalizeHrPerson(m, lookups));

    // Load rule clauses and configs in batch
    const ruleIds = allRules.map(r => r.id);
    const allClauses = await rateRuleClauseModel.getByRuleIds(ruleIds);
    const clauseIds = allClauses.map(c => c.id);
    const allConfigs = clauseIds.length ? await clauseTemplateConfigModel.getByClauseIds(clauseIds) : [];

    const configsByClause = new Map();
    allConfigs.forEach(c => {
      if (!configsByClause.has(c.clause_id)) configsByClause.set(c.clause_id, []);
      configsByClause.get(c.clause_id).push(c);
    });

    const rulesData = allRules.map(rule => {
      const clauses = allClauses.filter(c => c.rule_id === rule.id);
      return {
        ...rule,
        allowSelfAssessment: Boolean(rule.allow_self_assessment),
        scorerKey: makeOrgRuleKey(rule.scorer_department_id, rule.scorer_identity_id),
        clauses: clauses.map(c => ({
          scopeType: safeString(c.scope_type),
          targetIdentityId: safeString(c.target_identity_id),
          templateConfigs: (configsByClause.get(c.id) || []).map(tc => ({
            templateId: tc.template_id, weight: Number(tc.weight), sortOrder: Number(tc.sort_order)
          }))
        }))
      };
    })

    // Build task rows
    const membersByRuleKey = new Map();
    members.forEach(m => {
      const key = makeOrgRuleKey(m.departmentId, m.identityId);
      if (!key) return;
      if (!membersByRuleKey.has(key)) membersByRuleKey.set(key, []);
      membersByRuleKey.get(key).push(m);
    });

    const scorerMap = new Map();
    rulesData.forEach(rule => {
      const scorers = membersByRuleKey.get(rule.scorerKey) || [];
      (rule.clauses || []).forEach(clause => {
        if (!clause.templateConfigs || !clause.templateConfigs.length) return;
        scorers.forEach(sc => {
          const sk = safeString(sc.id) || sc.studentId;
          if (!sk) return;
          if (!scorerMap.has(sk)) {
            scorerMap.set(sk, {
              scorerKey: sk, scorerId: sc.id, scorerName: sc.name, scorerStudentId: sc.studentId,
              personId: sc.personId, assignmentId: sc.assignmentId, assignmentKind: sc.assignmentKind,
              departmentId: sc.departmentId, identityId: sc.identityId, workGroupId: sc.workGroupId,
              department: sc.department, identity: sc.identity, workGroup: sc.workGroup,
              expectedTargets: new Map(), submittedTargetIds: new Set()
            });
          }
          const sr = scorerMap.get(sk);
          members.forEach(target => {
            let match = false;
            if (clause.scopeType === 'same_department_identity') match = target.departmentId === sc.departmentId && target.identityId === clause.targetIdentityId;
            else if (clause.scopeType === 'same_department_all') match = target.departmentId === sc.departmentId;
            else if (clause.scopeType === 'same_work_group_identity') match = target.departmentId === sc.departmentId && target.workGroupId === sc.workGroupId && target.identityId === clause.targetIdentityId;
            else if (clause.scopeType === 'same_work_group_all') match = target.departmentId === sc.departmentId && target.workGroupId === sc.workGroupId;
            else if (clause.scopeType === 'identity_only') match = target.identityId === clause.targetIdentityId;
            else if (clause.scopeType === 'all_people') match = true;
            if (match && (rule.allowSelfAssessment || !participantService.isSameNaturalPerson(sc, target))) {
              sr.expectedTargets.set(target.id, target);
            }
          });
        });
      });
    });

    const resolveRecordParticipantId = typeof participantService.createRecordParticipantResolver === 'function'
      ? participantService.createRecordParticipantResolver(members)
      : (record, side) => participantService.participantRecordId(record, side, granularity);
    allRecords.forEach(record => {
      const sk = resolveRecordParticipantId(record, 'scorer');
      const targetParticipantId = resolveRecordParticipantId(record, 'target');
      const sr = scorerMap.get(sk);
      if (sr && sr.expectedTargets.has(targetParticipantId)) {
        sr.submittedTargetIds.add(targetParticipantId);
      }
    });

    let rows = Array.from(scorerMap.values())
      .map(item => {
        const expectedCount = item.expectedTargets.size;
        const submittedCount = Array.from(item.submittedTargetIds)
          .filter(tid => item.expectedTargets.has(tid)).length;
        const pendingList = Array.from(item.expectedTargets.values())
          .filter(target => !item.submittedTargetIds.has(target.id))
          .map(target => ({
            targetId: target.id, targetName: target.name, targetStudentId: target.studentId,
            targetDepartment: target.department, targetIdentity: target.identity,
            targetWorkGroup: target.workGroup
          }));
        return {
          scorerKey: item.scorerKey, scorerId: item.scorerId, scorerName: item.scorerName,
          scorerStudentId: item.scorerStudentId, department: item.department,
          personId: item.personId, assignmentId: item.assignmentId, assignmentKind: item.assignmentKind,
          departmentId: item.departmentId, identityId: item.identityId, workGroupId: item.workGroupId,
          identity: item.identity, workGroup: item.workGroup,
          expectedCount, submittedCount, pendingCount: Math.max(expectedCount - submittedCount, 0),
          completionRate: expectedCount ? Number(((submittedCount / expectedCount) * 100).toFixed(2)) : 100,
          pendingList
        };
      })
      .filter(item => item.pendingCount > 0);

    // Apply filters
    const deptFilter = safeString(filters.department);
    const identFilter = safeString(filters.identity);
    const wgFilter = safeString(filters.workGroup);
    const keyword = safeString(filters.keyword).toLowerCase();

    if (deptFilter && deptFilter !== '全部' && deptFilter !== '全部部门') {
      rows = rows.filter(r => r.department === deptFilter);
    }
    if (identFilter && identFilter !== '全部' && identFilter !== '全部身份') {
      rows = rows.filter(r => r.identity === identFilter);
    }
    if (wgFilter && wgFilter !== '全部' && wgFilter !== '全部职能组' && wgFilter !== '全部工作分工' && wgFilter !== '全部工作分工（职能组）') {
      rows = rows.filter(r => r.workGroup === wgFilter);
    }
    if (keyword) {
      rows = rows.filter(r =>
        [r.scorerName, r.scorerStudentId, r.department, r.identity, r.workGroup]
          .join(' ').toLowerCase().includes(keyword)
      );
    }

    rows.sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      return String(a.scorerName).localeCompare(String(b.scorerName), 'zh-CN');
    });

    const EXPORT_MAX_ROWS = 50000;
    if (rows.length > EXPORT_MAX_ROWS) {
      return res.json({
        status: 'too_large',
        message: localeFormat(localeCopy.copy_985bc885b8, [rows.length]),
        rowCount: rows.length,
        maxAllowed: EXPORT_MAX_ROWS
      });
    }

    const activityName = safeString(activity.name) || localeCopy.copy_fc13a82b49;
    const report = buildTaskExportReport(activityName, reportType, rows);
    // All exports produce XLSX — wx.openDocument only supports Excel formats for save-to-path
    const fileContent = await buildExportXlsx(report.sheetName, report.headers, report.rows);
    const extension = 'xlsx';

    res.json({ status: 'success', fileContent, fileName: report.fileName, extension });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_88f78adc7a });
  }
});

module.exports = router;
