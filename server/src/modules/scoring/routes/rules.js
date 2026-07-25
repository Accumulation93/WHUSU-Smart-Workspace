const express = require('express');
const router = express.Router();
const { safeString, toNumber, generateId, buildNameMap, makeOrgRuleKey } = require('../../../utils/helpers');
const adminInfoModel = require('../../../core/models/adminInfo');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const departmentModel = require('../../../core/models/department');
const identityModel = require('../../../core/models/identity');
const hrInfoModel = require('../../../core/models/hrInfo');
const activityModel = require('../models/scoreActivity');
const templateModel = require('../models/scoreTemplate');
const questionModel = require('../models/scoreQuestion');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');

const RULE_SCOPE_LABEL_MAP = {
  same_department_identity: '同一部门内的指定身份成员',
  same_department_all: '同一部门内的所有成员',
  same_work_group_identity: '同一部门同一职能组内的指定身份成员',
  same_work_group_all: '同一部门同一职能组内的所有成员',
  identity_only: '全体成员中的指定身份',
  all_people: '全体成员'
};

const VALID_SCOPES = ['same_department_identity', 'same_department_all', 'same_work_group_identity', 'same_work_group_all', 'identity_only', 'all_people'];
const IDENTITY_REQUIRED_SCOPES = ['same_department_identity', 'same_work_group_identity', 'identity_only'];

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

async function fetchOrgLookups() {
  const [departments, identities, templates, activities] = await Promise.all([
    departmentModel.getAll(), identityModel.getAll(), templateModel.getAll(), activityModel.getAll()
  ]);
  return {
    departmentsById: buildNameMap(departments),
    identitiesById: buildNameMap(identities),
    templatesById: buildNameMap(templates),
    activitiesById: buildNameMap(activities)
  };
}

function normalizeClause(clause, lookups) {
  const scopeType = safeString(clause.scopeType);
  const targetIdentityId = safeString(clause.targetIdentityId);
  const templateConfigs = Array.isArray(clause.templateConfigs) ? clause.templateConfigs : [];
  return {
    scopeType,
    scopeLabel: RULE_SCOPE_LABEL_MAP[scopeType] || scopeType,
    targetIdentityId,
    targetIdentity: targetIdentityId ? safeString(lookups.identitiesById.get(targetIdentityId)) : '',
    requireAllComplete: clause.requireAllComplete === true,
    templateConfigs: templateConfigs.map((item) => ({
      templateId: safeString(item.templateId),
      templateName: safeString(lookups.templatesById.get(safeString(item.templateId))),
      weight: Number(item.weight),
      sortOrder: Number(item.sortOrder),
      calculationMethod: safeString(item.calculationMethod) || 'weighted_average',
      trimHighCount: Number(item.trimHighCount || 0),
      trimLowCount: Number(item.trimLowCount || 0)
    })).sort((a, b) => a.sortOrder - b.sortOrder)
  };
}

function buildClauseText(clause) {
  const identityText = clause.targetIdentity ? '，被评分人身份：' + clause.targetIdentity : '';
  const completeText = clause.requireAllComplete ? '，要求全评后计入核算' : '，不要求全评';
  const questionText = clause.templateConfigs.length
    ? clause.templateConfigs.map((cfg) => (cfg.templateName || '未命名评分问题') + '（权重：' + cfg.weight + '，顺序：' + cfg.sortOrder + '）').join('、')
    : '未配置评分问题';
  return (clause.scopeLabel || '未设置被评分范围') + identityText + completeText + ' [' + questionText + ']';
}

// listRateRules
router.post('/listRateRules', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });

    const activityId = safeString(req.body.activityId);
    const lookups = await fetchOrgLookups();

    const rules = activityId
      ? await rateRuleModel.getByActivity(activityId)
      : await rateRuleModel.getAll();

    const ruleIds = rules.map((r) => r.id);
    const allClauses = ruleIds.length ? await rateRuleClauseModel.getByRuleIds(ruleIds) : [];
    const clauseIds = allClauses.map((c) => c.id);
    const allConfigs = clauseIds.length ? await clauseTemplateConfigModel.getByClauseIds(clauseIds) : [];

    const clausesByRule = new Map();
    allClauses.forEach((c) => {
      if (!clausesByRule.has(c.rule_id)) clausesByRule.set(c.rule_id, []);
      clausesByRule.get(c.rule_id).push(c);
    });
    const configsByClause = new Map();
    allConfigs.forEach((cfg) => {
      if (!configsByClause.has(cfg.clause_id)) configsByClause.set(cfg.clause_id, []);
      configsByClause.get(cfg.clause_id).push(cfg);
    });

    const result = rules.map((item) => {
      const rawClauses = (clausesByRule.get(item.id) || []).map((c) => {
        const configs = (configsByClause.get(c.id) || []).map((cfg) => ({
          templateId: cfg.template_id,
          templateName: safeString(lookups.templatesById.get(cfg.template_id)),
          weight: Number(cfg.weight),
          sortOrder: Number(cfg.sort_order),
          calculationMethod: safeString(cfg.calculation_method) || 'weighted_average',
          trimHighCount: Number(cfg.trim_high_count || 0),
          trimLowCount: Number(cfg.trim_low_count || 0)
        })).sort((a, b) => a.sortOrder - b.sortOrder);
        return { scopeType: c.scope_type, targetIdentityId: c.target_identity_id, requireAllComplete: !!c.require_all_complete, templateConfigs: configs };
      });

      const clauses = rawClauses.map((clause) => normalizeClause(clause, lookups));
      return {
        id: item.id,
        activityId: item.activity_id,
        activityName: safeString(lookups.activitiesById.get(item.activity_id)),
        scorerDepartmentId: item.scorer_department_id,
        scorerDepartment: safeString(lookups.departmentsById.get(item.scorer_department_id)),
        scorerIdentityId: item.scorer_identity_id,
        scorerIdentity: safeString(lookups.identitiesById.get(item.scorer_identity_id)),
        allowSelfAssessment: item.allow_self_assessment !== 0,
        clauses,
        clausesText: clauses.length ? clauses.map((c) => buildClauseText(c)).join(' | ') : '未配置被评分人规则'
      };
    }).sort((a, b) => {
      if (a.scorerDepartment !== b.scorerDepartment) return a.scorerDepartment.localeCompare(b.scorerDepartment, 'zh-CN');
      return a.scorerIdentity.localeCompare(b.scorerIdentity, 'zh-CN');
    });

    res.json({ status: 'success', rules: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveRateRule
router.post('/saveRateRule', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });

    const id = safeString(req.body.id);
    const activityId = safeString(req.body.activityId);
    const scorerDepartmentId = safeString(req.body.scorerDepartmentId);
    const scorerIdentityId = safeString(req.body.scorerIdentityId);
    const allowSelfAssessment = req.body.allowSelfAssessment !== false;
    const clauses = Array.isArray(req.body.clauses) ? req.body.clauses : [];
    const mode = safeString(req.body.mode) === 'replace' ? 'replace' : 'strict';

    if (!activityId || !scorerDepartmentId || !scorerIdentityId) {
      return res.json({ status: 'invalid_params', message: '请填写完整评分人类别' });
    }

    const [activity, scorerDepartment, scorerIdentity] = await Promise.all([
      activityModel.getById(activityId),
      departmentModel.getById(scorerDepartmentId),
      identityModel.getById(scorerIdentityId)
    ]);
    if (!activity) return res.json({ status: 'invalid_params', message: '评分活动不存在' });
    if (!scorerDepartment || !scorerIdentity) return res.json({ status: 'invalid_params', message: '评分人部门或身份不存在' });

    const normalizedClauses = [];
    for (const clause of clauses) {
      const scopeType = safeString(clause.scopeType);
      if (!VALID_SCOPES.includes(scopeType)) return res.json({ status: 'invalid_params', message: '无效的被评分范围' });

      const targetIdentityId = IDENTITY_REQUIRED_SCOPES.includes(scopeType) ? safeString(clause.targetIdentityId) : '';
      if (targetIdentityId) {
        const targetIdentity = await identityModel.getById(targetIdentityId);
        if (!targetIdentity) return res.json({ status: 'invalid_params', message: '被评分人身份不存在' });
      } else if (IDENTITY_REQUIRED_SCOPES.includes(scopeType)) {
        return res.json({ status: 'invalid_params', message: '请提供被评分人身份ID' });
      }

      const templateConfigs = [];
      const rawConfigs = Array.isArray(clause.templateConfigs) ? clause.templateConfigs
        : (clause.templateId ? [{ templateId: clause.templateId, weight: clause.weight || 1, sortOrder: clause.sortOrder || 1 }] : []);
      for (const item of rawConfigs) {
        const templateId = safeString(item.templateId);
        if (!templateId) continue;
        const tpl = await templateModel.getById(templateId);
        if (!tpl) return res.json({ status: 'invalid_params', message: '评分问题模板不存在' });
        const weight = Number(item.weight);
        const sortOrder = Number(item.sortOrder);
        if (!Number.isFinite(weight) || weight <= 0 || !Number.isInteger(sortOrder) || sortOrder <= 0) {
          return res.json({ status: 'invalid_params', message: '权重和顺序必须为正整数' });
        }
        const calculationMethod = safeString(item.calculationMethod) || 'weighted_average';
        const trimHighCount = Number(item.trimHighCount || 0);
        const trimLowCount = Number(item.trimLowCount || 0);
        templateConfigs.push({ templateId, weight, sortOrder, calculationMethod, trimHighCount, trimLowCount });
      }
      templateConfigs.sort((a, b) => a.sortOrder - b.sortOrder);

      normalizedClauses.push({
        scopeType, targetIdentityId,
        requireAllComplete: clause.requireAllComplete === true,
        templateConfigs
      });
    }

    // Deduplicate clauses
    const dedupedClauses = [];
    const seenKeys = new Map();
    for (const clause of normalizedClauses) {
      const clauseKey = clause.scopeType + '::' + clause.targetIdentityId;
      const existingIndex = seenKeys.get(clauseKey);
      if (existingIndex !== undefined) {
        if (mode === 'replace') {
          dedupedClauses[existingIndex] = clause;
        } else {
          return res.json({ status: 'duplicate_clause', message: '同一评分人类别中，被评分范围和身份不能重复' });
        }
      } else {
        seenKeys.set(clauseKey, dedupedClauses.length);
        dedupedClauses.push(clause);
      }
    }

    const scorerKey = scorerDepartmentId + '::' + scorerIdentityId;
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const orgId = await getCurrentOrgId();
    let ruleId = id;

    // Delete old clauses/configs and recreate new ones — all in a transaction
    const { withTransaction } = require('../../../config/db');
    await withTransaction(async (conn) => {
      if (id) {
        await conn.query(
          'UPDATE rate_target_rules SET activity_id = ?, scorer_department_id = ?, scorer_identity_id = ?, scorer_key = ?, is_active = 1, allow_self_assessment = ?, updated_at = ? WHERE id = ? AND org_id = ?',
          [activityId, scorerDepartmentId, scorerIdentityId, scorerKey, allowSelfAssessment ? 1 : 0, nowUtc, id, orgId]
        );
        // Delete old clauses and configs
        const [oldClauses] = await conn.query('SELECT * FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [id, orgId]);
        for (const oc of oldClauses) {
          await conn.query('DELETE FROM clause_template_configs WHERE clause_id = ? AND org_id = ?', [oc.id, orgId]);
        }
        await conn.query('DELETE FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [id, orgId]);
      } else {
        const [existing] = await conn.query(
          'SELECT * FROM rate_target_rules WHERE activity_id = ? AND scorer_key = ? AND org_id = ?',
          [activityId, scorerKey, orgId]
        );
        if (existing.length) {
          if (mode === 'replace') {
            ruleId = existing[0].id;
            await conn.query(
              'UPDATE rate_target_rules SET activity_id = ?, scorer_department_id = ?, scorer_identity_id = ?, scorer_key = ?, is_active = 1, allow_self_assessment = ?, updated_at = ? WHERE id = ? AND org_id = ?',
              [activityId, scorerDepartmentId, scorerIdentityId, scorerKey, allowSelfAssessment ? 1 : 0, nowUtc, ruleId, orgId]
            );
            const [oldClauses] = await conn.query('SELECT * FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [ruleId, orgId]);
            for (const oc of oldClauses) {
              await conn.query('DELETE FROM clause_template_configs WHERE clause_id = ? AND org_id = ?', [oc.id, orgId]);
            }
            await conn.query('DELETE FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [ruleId, orgId]);
          } else {
            throw Object.assign(new Error('duplicate_category'), { status: 'duplicate_category', message: '该评分人类别已存在' });
          }
        } else {
          ruleId = generateId();
          await conn.query(
            'INSERT INTO rate_target_rules (id, activity_id, scorer_department_id, scorer_identity_id, scorer_key, is_active, allow_self_assessment, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
            [ruleId, activityId, scorerDepartmentId, scorerIdentityId, scorerKey, allowSelfAssessment ? 1 : 0, orgId, nowUtc, nowUtc]
          );
        }
      }

      // Insert clauses and configs
      for (let ci = 0; ci < dedupedClauses.length; ci++) {
        const clause = dedupedClauses[ci];
        const clauseId = generateId();
        await conn.query(
          'INSERT INTO rate_rule_clauses (id, rule_id, scope_type, target_identity_id, require_all_complete, org_id) VALUES (?, ?, ?, ?, ?, ?)',
          [clauseId, ruleId, clause.scopeType, clause.targetIdentityId, clause.requireAllComplete ? 1 : 0, orgId]
        );
        for (let ti = 0; ti < clause.templateConfigs.length; ti++) {
          const cfg = clause.templateConfigs[ti];
          await conn.query(
            'INSERT INTO clause_template_configs (id, clause_id, sort_order, template_id, weight, calculation_method, trim_high_count, trim_low_count, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [generateId(), clauseId, ti + 1, cfg.templateId, cfg.weight, cfg.calculationMethod || 'weighted_average', cfg.trimHighCount || 0, cfg.trimLowCount || 0, orgId]
          );
        }
      }
    });

    res.json({
      status: 'success',
      id: ruleId,
      rule: {
        id: ruleId, activityId, scorerDepartmentId,
        scorerDepartment: safeString(scorerDepartment.name),
        scorerIdentityId, scorerIdentity: safeString(scorerIdentity.name),
        clauses: dedupedClauses.map((clause) => ({ ...clause, targetIdentity: '' }))
      }
    });
  } catch (e) {
    res.json({ status: e.status || 'error', message: safeString(e.message) });
  }
});

// deleteRateRule
router.post('/deleteRateRule', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params' });

    // Delete child-first for FK constraints within a transaction:
    // clause_template_configs → rate_rule_clauses → rate_target_rules
    const { withTransaction } = require('../../../config/db');
    const orgId = await getCurrentOrgId();
    await withTransaction(async (conn) => {
      const [clauses] = await conn.query('SELECT * FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [id, orgId]);
      for (const c of clauses) {
        await conn.query('DELETE FROM clause_template_configs WHERE clause_id = ? AND org_id = ?', [c.id, orgId]);
      }
      await conn.query('DELETE FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [id, orgId]);
      await conn.query('DELETE FROM rate_target_rules WHERE id = ? AND org_id = ?', [id, orgId]);
    });

    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// generateRateTargetRules
router.post('/generateRateTargetRules', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });

    const activityId = safeString(req.body.activityId);
    if (!activityId) return res.json({ status: 'invalid_params', message: '请提供评分活动ID' });
    const activity = await activityModel.getById(activityId);
    if (!activity) return res.json({ status: 'invalid_params', message: '评分活动不存在' });

    const [hrRows, existingRules, departments, identities] = await Promise.all([
      hrInfoModel.getAll(), rateRuleModel.getByActivity(activityId), departmentModel.getAll(), identityModel.getAll()
    ]);

    const deptMap = buildNameMap(departments);
    const identityMap = buildNameMap(identities);

    const categories = new Map();
    hrRows.forEach((item) => {
      const depId = safeString(item.department_id);
      const idId = safeString(item.identity_id);
      if (!depId || !idId) return;
      const scorerKey = depId + '::' + idId;
      if (!categories.has(scorerKey)) {
        categories.set(scorerKey, { activityId, scorerKey, scorerDepartmentId: depId, scorerIdentityId: idId, isActive: true });
      }
    });

    const existingRuleMap = new Map();
    const duplicateRuleIds = [];
    existingRules.forEach((item) => {
      const key = safeString(item.scorer_key);
      if (!key) { duplicateRuleIds.push(item.id); return; }
      if (!existingRuleMap.has(key)) existingRuleMap.set(key, item);
      else duplicateRuleIds.push(item.id);
    });

    const rulesToAdd = [];
    for (const rule of categories.values()) {
      if (!existingRuleMap.has(rule.scorerKey)) rulesToAdd.push(rule);
    }

    // Remove duplicates
    for (const dupId of duplicateRuleIds) {
      const clauses = await rateRuleClauseModel.getByRuleId(dupId);
      for (const c of clauses) await clauseTemplateConfigModel.removeByClauseId(c.id);
      await rateRuleClauseModel.removeByRuleId(dupId);
      await rateRuleModel.remove(dupId);
    }

    // Create new rules
    for (const rule of rulesToAdd) {
      const newId = generateId();
      await rateRuleModel.create(newId, { ...rule, allowSelfAssessment: true });
    }

    res.json({
      status: 'success',
      collectionName: 'rate_target_rules',
      ruleCount: categories.size,
      createdCount: rulesToAdd.length,
      keptCount: categories.size - rulesToAdd.length,
      removedDuplicateCount: duplicateRuleIds.length,
      departmentsResolved: Array.from(categories.values()).filter((r) => deptMap.has(r.scorerDepartmentId)).length,
      identitiesResolved: Array.from(categories.values()).filter((r) => identityMap.has(r.scorerIdentityId)).length
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
