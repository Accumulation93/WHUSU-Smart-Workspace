const express = require('express');
const router = express.Router();
const { safeString, toNumber, roundScore, makeOrgRuleKey, buildNameMap, generateId } = require('../utils/helpers');
const userInfoModel = require('../models/userInfo');
const hrInfoModel = require('../models/hrInfo');
const departmentModel = require('../models/department');
const identityModel = require('../models/identity');
const workGroupModel = require('../models/workGroup');
const pubCache = require('../utils/pubCache');
const scoreActivityModel = require('../models/scoreActivity');
const scoreTemplateModel = require('../models/scoreTemplate');
const scoreQuestionModel = require('../models/scoreQuestion');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const scoreRecordModel = require('../models/scoreRecord');
const scoreAnswerModel = require('../models/scoreAnswer');
const adminInfoModel = require('../models/adminInfo');
const pool = require('../config/db');

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
    departmentId, identityId, workGroupId,
    department: lookups.departmentsById.get(departmentId) || '',
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
    const role = safeString(req.body.role || 'user');

    const lookups = await fetchOrgLookups();
    let scorer = null;

    if (role === 'admin') {
      const admin = await adminInfoModel.getByOpenid(openid);
      if (!admin) return res.json({ status: 'need_bind', message: '请先绑定管理员身份' });
      scorer = {
        id: admin.id, name: admin.name, studentId: admin.student_id || '',
        departmentId: '', department: '', identityId: '', identity: '',
        workGroupId: '', workGroup: '',
        adminLevel: admin.admin_level
      };
      const identityLabel = admin.admin_level === 'root_admin' ? '至高权限管理员'
        : admin.admin_level === 'super_admin' ? '超级管理员' : '管理员';
      scorer.identity = identityLabel;
      return res.json({ status: 'success', scorer, targets: [] });
    }

    // User role
    const user = await userInfoModel.getByOpenid(openid);
    if (!user) return res.json({ status: 'need_bind', message: '请先绑定用户身份' });

    const hrId = safeString(user.hr_id);
    if (!hrId) return res.json({ status: 'need_bind', message: '绑定记录缺少人事ID，请重新绑定' });

    const hrRecord = await hrInfoModel.getById(hrId);
    if (!hrRecord) return res.json({ status: 'need_bind', message: '绑定的人事信息不存在，请重新绑定' });

    scorer = normalizeHrPerson(hrRecord, lookups);

    if (!scorer.departmentId || !scorer.identityId) {
      return res.json({ status: 'invalid_scorer', message: '当前用户缺少评分规则所需的人事信息。' });
    }

    const currentActivity = await scoreActivityModel.getCurrent();
    if (!currentActivity) {
      return res.json({ status: 'success', scorer, rule: null, currentActivity: null, targets: [] });
    }

    // Validate activity is not paused
    if (currentActivity.is_paused) {
      return res.json({
        status: 'activity_paused',
        message: '当前评分活动已暂停',
        scorer,
        currentActivity: { id: currentActivity.id, name: currentActivity.name || '', isPaused: true },
        targets: []
      });
    }

    // Validate current date is within activity date range
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (currentActivity.start_date) {
      var startDate = new Date(currentActivity.start_date);
      if (today < startDate) {
        return res.json({
          status: 'activity_not_started',
          message: '当前评分活动尚未开始',
          scorer,
          currentActivity: { id: currentActivity.id, name: currentActivity.name || '' },
          targets: []
        });
      }
    }
    if (currentActivity.end_date) {
      var endDate = new Date(currentActivity.end_date);
      if (today > endDate) {
        return res.json({
          status: 'activity_ended',
          message: '当前评分活动已结束',
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
      return res.json({ status: 'missing_rule', message: '当前评分人类别还没有配置被评分人规则。' });
    }

    const ruleFull = await loadRuleFull(rule.id);

    // Get scored targets
    const scoredRecords = await scoreRecordModel.getByScorer(scorer.id, currentActivity.id);
    const scoredTargetIdSet = new Set(scoredRecords.map(r => r.target_id).filter(Boolean));

    // Collect targets from all clauses — load only scoped HR records
    const targetMap = new Map();
    const clauseScopes = buildClauseScopes(ruleFull.clauses, scorer);
    const allHrInfo = clauseScopes.length ? await hrInfoModel.getByScopes(clauseScopes) : [];

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
        if (!rule.allow_self_assessment && item.id === scorer.id) return;
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

    const targets = Array.from(targetMap.values()).sort((a, b) => {
      if (a.isScored !== b.isScored) return a.isScored ? 1 : -1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

    res.json({
      status: 'success', scorer,
      rule: ruleFull,
      currentActivity: { id: currentActivity.id, name: currentActivity.name },
      targets
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '获取评分任务失败' });
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
    const openid = req.openid;
    const targetId = safeString(req.body.targetId);
    if (!targetId) return res.json({ status: 'invalid_params', message: '缺少被评分人信息' });

    const user = await userInfoModel.getByOpenid(openid);
    if (!user) return res.json({ status: 'user_not_found', message: '未找到当前用户信息，请重新登录' });

    const hrId = safeString(user.hr_id);
    if (!hrId) return res.json({ status: 'invalid_scorer', message: '当前用户缺少评分所需的人事信息' });

    const hrRecord = await hrInfoModel.getById(hrId);
    if (!hrRecord) return res.json({ status: 'invalid_scorer', message: '当前用户人事信息不存在，请重新绑定' });

    const lookups = await fetchOrgLookups();
    const scorer = normalizeHrPerson(hrRecord, lookups);

    if (!scorer.departmentId || !scorer.identityId) {
      return res.json({ status: 'invalid_scorer', message: '当前用户缺少评分所需的人事信息' });
    }

    const activity = await scoreActivityModel.getCurrent();
    if (!activity) return res.json({ status: 'missing_activity', message: '当前暂无评分活动' });

    if (activity.is_paused) {
      return res.json({ status: 'activity_paused', message: '当前评分活动已暂停' });
    }

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (activity.start_date) {
      var startDate = new Date(activity.start_date);
      if (today < startDate) {
        return res.json({ status: 'activity_not_started', message: '当前评分活动尚未开始' });
      }
    }
    if (activity.end_date) {
      var endDate = new Date(activity.end_date);
      if (today > endDate) {
        return res.json({ status: 'activity_ended', message: '当前评分活动已结束' });
      }
    }

    const scorerKey = makeOrgRuleKey(scorer.departmentId, scorer.identityId);
    const rule = await rateRuleModel.getByKey(activity.id, scorerKey);
    if (!rule || !rule.is_active) {
      return res.json({ status: 'missing_rule', message: '当前评分人类别尚未配置被评分人规则' });
    }

    const ruleFull = await loadRuleFull(rule.id);

    // Find matching clauses for this target — load only the target record
    const targetDoc = await hrInfoModel.getById(targetId);
    if (!targetDoc) {
      return res.json({ status: 'target_not_found', message: '被评分人不存在' });
    }
    const targetPerson = normalizeHrPerson(targetDoc, lookups);
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
      return res.json({ status: 'target_not_allowed', message: '当前被评分人不在你的评分范围内' });
    }

    const configuredClauseEntry = matchedClauseEntries.find(item =>
      Array.isArray(item.clause.templateConfigs) && item.clause.templateConfigs.length
    );

    if (!configuredClauseEntry) {
      return res.json({ status: 'missing_clause_config', message: '当前被评分人规则尚未配置评分问题，请联系管理员完善设置' });
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
        return res.json({ status: 'missing_template', message: '当前暂无评分问题，请联系管理员配置评分问题' });
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
    const existingRecords = await scoreRecordModel.getByScorerTarget(scorer.id, targetId, activity.id);
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
        startDate: activity.start_date, endDate: activity.end_date },
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
    res.json({ status: 'error', message: safeString(e.message) || '获取评分表单失败' });
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
    const openid = req.openid;
    const targetId = safeString(req.body.targetId);
    const activityId = safeString(req.body.activityId);
    const templateConfigSignature = safeString(req.body.templateConfigSignature);
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const scorerId = safeString(req.body.scorerId);

    if (!openid) {
      return res.json({ status: 'auth_failed', message: '未登录' });
    }
    if (!scorerId || !targetId || !templateConfigSignature || !answers.length) {
      return res.json({ status: 'invalid_params', message: '评分信息不完整' });
    }

    // Validate activity is not paused and within date range
    const activity = await scoreActivityModel.getById(activityId);
    if (!activity) {
      return res.json({ status: 'missing_activity', message: '当前评分活动不存在' });
    }
    if (activity.is_paused) {
      return res.json({ status: 'activity_paused', message: '当前评分活动已暂停，无法提交评分' });
    }
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (activity.start_date) {
      var startDate = new Date(activity.start_date);
      if (today < startDate) {
        return res.json({ status: 'activity_not_started', message: '当前评分活动尚未开始，无法提交评分' });
      }
    }
    if (activity.end_date) {
      var endDate = new Date(activity.end_date);
      if (today > endDate) {
        return res.json({ status: 'activity_ended', message: '当前评分活动已结束，无法提交评分' });
      }
    }

    // Verify that the authenticated user matches the scorer identity
    const currentUser = await userInfoModel.getByOpenid(openid);
    if (!currentUser || safeString(currentUser.hr_id) !== scorerId) {
      return res.json({ status: 'forbidden', message: '身份验证失败' });
    }

    const lookups = await fetchOrgLookups();
    const [hrRecord, targetRecord] = await Promise.all([
      hrInfoModel.getById(scorerId),
      hrInfoModel.getById(targetId)
    ]);

    if (!hrRecord) return res.json({ status: 'invalid_scorer', message: '当前评分人信息不存在，请重新登录' });
    if (!targetRecord) return res.json({ status: 'target_not_found', message: '未找到被评分人' });

    const scorer = normalizeHrPerson(hrRecord, lookups);
    const scorerKey = makeOrgRuleKey(scorer.departmentId, scorer.identityId);

    const rule = await rateRuleModel.getByKey(activityId, scorerKey);
    if (!rule || !rule.is_active) {
      return res.json({ status: 'missing_rule', message: '当前评分规则不存在' });
    }

    const ruleFull = await loadRuleFull(rule.id);

    // Validate target is in scope — check only the target person, not all HR
    const targetPerson = normalizeHrPerson(targetRecord, lookups);
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
      return res.json({ status: 'target_not_allowed', message: '当前被评分人不在你的评分范围内' });
    }
    if (!matchedClause) {
      return res.json({ status: 'missing_rule', message: '未匹配到当前评分规则子句' });
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
        return res.json({ status: 'missing_template', message: '当前评分模板不存在' });
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
      return res.json({ status: 'template_mismatch', message: '评分模板配置已变更，请重新进入评分页' });
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
        return res.json({ status: 'invalid_score', message: `第 ${i + 1} 题未填写` });
      }
      if (score < question.minValue || score > question.maxValue) {
        return res.json({ status: 'invalid_score', message: `第 ${i + 1} 题超出分值范围` });
      }
      if (!isStepAligned(score, question.startValue, question.stepValue)) {
        return res.json({ status: 'invalid_score', message: `第 ${i + 1} 题不符合起评分和步进值要求` });
      }

      normalizedAnswers.push({ questionIndex: i + 1, score });
    }

    // Save record — update existing or create new, then insert answers — all in a transaction
    const { withTransaction } = require('../config/db');
    const { getCurrentOrgId } = require('../utils/orgContext');
    const orgId = await getCurrentOrgId();
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let resultRecordId;

    await withTransaction(async (conn) => {
      const [existingRecords] = await conn.query(
        'SELECT * FROM score_records WHERE scorer_id = ? AND target_id = ? AND activity_id = ? AND org_id = ?',
        [scorer.id, targetId, activityId, orgId]
      );

      let recordId;
      if (existingRecords.length) {
        recordId = existingRecords[0].id;
        await conn.query(
          'UPDATE score_records SET activity_id = ?, rule_id = ?, scorer_id = ?, target_id = ?, template_config_signature = ?, submitted_at = ? WHERE id = ? AND org_id = ?',
          [activityId, rule.id, scorer.id, targetRecord.id, templateConfigSignature, nowUtc, recordId, orgId]
        );
        await conn.query('DELETE FROM score_answers WHERE record_id = ? AND org_id = ?', [recordId, orgId]);
      } else {
        recordId = generateId();
        await conn.query(
          'INSERT INTO score_records (id, activity_id, rule_id, scorer_id, target_id, template_config_signature, submitted_at, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [recordId, activityId, rule.id, scorer.id, targetRecord.id, templateConfigSignature, nowUtc, orgId]
        );
      }

      // Insert answers
      for (const answer of normalizedAnswers) {
        await conn.query(
          'INSERT INTO score_answers (id, record_id, question_index, score, org_id) VALUES (?, ?, ?, ?, ?)',
          [generateId(), recordId, answer.questionIndex, answer.score, orgId]
        );
      }

      resultRecordId = recordId;
    });

    // Invalidate publication score cache so next viewer sees fresh results
    await pubCache.invalidate(activityId, orgId);

    res.json({ status: 'success', recordId: resultRecordId });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '提交评分失败' });
  }
});

// ──────────────────── getScorerTaskStatus ────────────────────

router.post('/getScorerTaskStatus', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const activityId = safeString(req.body.activityId);
    const filters = req.body.filters || {};
    const offset = Math.max(0, Math.floor(toNumber(req.body.offset, 0)));
    const scorerKey = safeString(req.body.scorerKey);

    if (!activityId) return res.json({ status: 'invalid_params', message: '请先选择评分活动' });

    const [activity, allMembers, allRules, allRecords, lookups] = await Promise.all([
      scoreActivityModel.getById(activityId),
      hrInfoModel.getAll(),
      rateRuleModel.getByActivity(activityId),
      scoreRecordModel.getByActivity(activityId),
      fetchOrgLookups()
    ]);

    if (!activity) return res.json({ status: 'activity_not_found', message: '未找到对应的评分活动' });

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
            if (match) sr.expectedTargets.set(target.id, target);
          });
        });
      });
    });

    // Mark submitted
    allRecords.forEach(record => {
      const sk = safeString(record.scorer_id);
      const sr = scorerMap.get(sk);
      if (sr && sr.expectedTargets.has(record.target_id)) {
        sr.submittedTargetIds.add(record.target_id);
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
          identity: item.identity, workGroup: item.workGroup,
          expectedCount, submittedCount, pendingCount: Math.max(expectedCount - submittedCount, 0),
          completionRate: expectedCount ? Number(((submittedCount / expectedCount) * 100).toFixed(2)) : 100
        };
      })
      .filter(item => {
        if (scorerKey) return item.scorerKey === scorerKey;
        return item.pendingCount > 0;
      });

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
    if (wgFilter && wgFilter !== '全部' && wgFilter !== '全部工作分工') {
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
      pagination: { offset, nextOffset: offset + 50, total: rows.length, hasMore: offset + 50 < rows.length, returnedCount: Math.min(50, Math.max(0, rows.length - offset)) }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '获取评分任务状态失败' });
  }
});

// ──────────────────── exportScorerTaskStatus ────────────────────

const XLSX = require('xlsx');

function buildExportCsv(headers, rows) {
  var escapeCsv = function (v) { var t = String(v == null ? '' : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  var csvText = '﻿' + headers.map(function (h) { return escapeCsv(h.label); }).join(',') + '\r\n' +
    rows.map(function (r) { return headers.map(function (h) { return escapeCsv(r[h.key]); }).join(','); }).join('\r\n');
  return Buffer.from(csvText, 'utf-8').toString('base64');
}

function buildExportXlsx(sheetName, headers, rows) {
  var headerLabels = headers.map(function (h) { return h.label; });
  var dataRows = rows.map(function (row) { return headers.map(function (h) { return row[h.key]; }); });
  var ws = XLSX.utils.aoa_to_sheet([headerLabels].concat(dataRows));
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
}

function buildTaskExportReport(activityName, reportType, rows) {
  if (reportType === 'detail') {
    return {
      fileName: activityName + '_未完成评分明细',
      sheetName: '未完成评分明细',
      headers: [
        { key: 'scorerName', label: '评分人姓名' },
        { key: 'scorerStudentId', label: '评分人学号' },
        { key: 'department', label: '所属部门' },
        { key: 'identity', label: '身份' },
        { key: 'workGroup', label: '工作分工（职能组）' },
        { key: 'targetName', label: '未完成被评分人姓名' },
        { key: 'targetStudentId', label: '未完成被评分人学号' },
        { key: 'targetDepartment', label: '被评分人所属部门' },
        { key: 'targetIdentity', label: '被评分人身份' },
        { key: 'targetWorkGroup', label: '被评分人工作分工（职能组）' }
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
    fileName: activityName + '_未完成评分概览',
    sheetName: '未完成评分概览',
    headers: [
      { key: 'scorerName', label: '评分人姓名' },
      { key: 'scorerStudentId', label: '评分人学号' },
      { key: 'department', label: '所属部门' },
      { key: 'identity', label: '身份' },
      { key: 'workGroup', label: '工作分工（职能组）' },
      { key: 'expectedCount', label: '应评分人数' },
      { key: 'submittedCount', label: '已评分人数' },
      { key: 'pendingCount', label: '未评分人数' },
      { key: 'completionRate', label: '完成率(%)' }
    ],
    rows: rows
  };
}

router.post('/exportScorerTaskStatus', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const activityId = safeString(req.body.activityId);
    const reportType = safeString(req.body.reportType) || 'summary';
    const format = safeString(req.body.format) || 'csv';
    const filters = req.body.filters || {};

    if (!activityId) return res.json({ status: 'invalid_params', message: '请先选择评分活动' });

    const [activity, allMembers, allRules, allRecords, lookups] = await Promise.all([
      scoreActivityModel.getById(activityId),
      hrInfoModel.getAll(),
      rateRuleModel.getByActivity(activityId),
      scoreRecordModel.getByActivity(activityId),
      fetchOrgLookups()
    ]);

    if (!activity) return res.json({ status: 'activity_not_found', message: '未找到对应的评分活动' });

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
            if (match) sr.expectedTargets.set(target.id, target);
          });
        });
      });
    });

    allRecords.forEach(record => {
      const sk = safeString(record.scorer_id);
      const sr = scorerMap.get(sk);
      if (sr && sr.expectedTargets.has(record.target_id)) {
        sr.submittedTargetIds.add(record.target_id);
      }
    });

    var rows = Array.from(scorerMap.values())
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
    if (wgFilter && wgFilter !== '全部' && wgFilter !== '全部工作分工' && wgFilter !== '全部工作分工（职能组）') {
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
        message: `导出数据量过大（${rows.length} 行），请缩小筛选范围或联系管理员分批导出`,
        rowCount: rows.length,
        maxAllowed: EXPORT_MAX_ROWS
      });
    }

    const activityName = safeString(activity.name) || '评分活动';
    const report = buildTaskExportReport(activityName, reportType, rows);
    // All exports produce XLSX — wx.openDocument only supports Excel formats for save-to-path
    const fileContent = buildExportXlsx(report.sheetName, report.headers, report.rows);
    const extension = 'xlsx';

    res.json({ status: 'success', fileContent, fileName: report.fileName, extension });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '导出未完成评分任务失败' });
  }
});

module.exports = router;
