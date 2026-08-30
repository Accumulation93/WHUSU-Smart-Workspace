const localeCopy = require('../../../locales/zh-CN/generated/modules/scoring/routes/rules');
const scoringCopy = require('../../../locales/zh-CN/modules/scoring');
const { format: localeFormat } = require('../../../locales/runtime');
const express = require('express');
const router = express.Router();
const { safeString, toNumber, generateId, buildNameMap, makeOrgRuleKey } = require('../../../utils/helpers');
const { nowMysqlUtc } = require('../../../utils/dateTime');
const adminInfoModel = require('../../../core/models/adminInfo');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const departmentModel = require('../../../core/models/department');
const identityModel = require('../../../core/models/identity');
const activityModel = require('../models/scoreActivity');
const templateModel = require('../models/scoreTemplate');
const questionModel = require('../models/scoreQuestion');
const participantService = require('../services/participants');
const pool = require('../../../config/db');
const { withTransaction } = pool;
const { getCurrentOrgId } = require('../../../utils/orgContext');
const dictionaryUsage = require('../../../core/services/dictionaryUsage');

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
const MAX_BATCH_RULES = 200;

class RateRuleRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function rejectRateRule(status, message) {
  throw new RateRuleRequestError(status, message);
}

function respondRateRuleError(res, error, fallbackMessage = scoringCopy.ruleOperationFailed) {
  return res.json({
    status: error instanceof RateRuleRequestError ? error.status : 'error',
    message: error instanceof RateRuleRequestError ? error.message : fallbackMessage
  });
}

async function loadRateRuleReference(connection, sql, params, message, status = 'invalid_params') {
  const [rows] = await connection.query(sql, params);
  if (!rows[0]) rejectRateRule(status, message);
  return rows[0];
}

async function normalizeRateRuleInput(connection, orgId, body) {
  const source = body || {};
  const id = safeString(source.id);
  const activityId = safeString(source.activityId);
  const scorerDepartmentId = safeString(source.scorerDepartmentId);
  const scorerIdentityId = safeString(source.scorerIdentityId);
  const allowSelfAssessment = source.allowSelfAssessment !== false;
  const clauses = Array.isArray(source.clauses) ? source.clauses : [];
  const mode = safeString(source.mode) === 'replace' ? 'replace' : 'strict';

  if (!activityId || !scorerDepartmentId || !scorerIdentityId) {
    rejectRateRule('invalid_params', localeCopy.copy_aee0e7df2d);
  }

  const activity = await loadRateRuleReference(
    connection,
    'SELECT id, name FROM score_activities WHERE id = ? AND org_id = ? FOR UPDATE',
    [activityId, orgId],
    localeCopy.copy_4f0d449737
  );
  const scorerDepartment = await loadRateRuleReference(
    connection,
    'SELECT id, name FROM departments WHERE id = ? AND org_id = ? FOR UPDATE',
    [scorerDepartmentId, orgId],
    localeCopy.copy_c66dd9a783
  );
  const scorerIdentity = await loadRateRuleReference(
    connection,
    'SELECT id, name FROM identities WHERE id = ? AND org_id = ? FOR UPDATE',
    [scorerIdentityId, orgId],
    localeCopy.copy_c66dd9a783
  );
  if (id) {
    await loadRateRuleReference(
      connection,
      'SELECT id FROM rate_target_rules WHERE id = ? AND org_id = ? FOR UPDATE',
      [id, orgId],
      scoringCopy.scoringRuleNotFound,
      'rule_not_found'
    );
  }

  const normalizedClauses = [];
  const targetIdentityIds = [];
  for (const clause of clauses) {
    const scopeType = safeString(clause.scopeType);
    if (!VALID_SCOPES.includes(scopeType)) {
      rejectRateRule('invalid_params', localeCopy.copy_1ddbd16012);
    }

    const targetIdentityId = IDENTITY_REQUIRED_SCOPES.includes(scopeType)
      ? safeString(clause.targetIdentityId)
      : '';
    if (IDENTITY_REQUIRED_SCOPES.includes(scopeType) && !targetIdentityId) {
      rejectRateRule('invalid_params', localeCopy.copy_ed94482d7f);
    }
    if (targetIdentityId) {
      await loadRateRuleReference(
        connection,
        'SELECT id FROM identities WHERE id = ? AND org_id = ? FOR UPDATE',
        [targetIdentityId, orgId],
        localeCopy.copy_ecdaddc1eb
      );
      targetIdentityIds.push(targetIdentityId);
    }

    const templateConfigs = [];
    const rawConfigs = Array.isArray(clause.templateConfigs)
      ? clause.templateConfigs
      : (clause.templateId
        ? [{ templateId: clause.templateId, weight: clause.weight || 1, sortOrder: clause.sortOrder || 1 }]
        : []);
    for (const item of rawConfigs) {
      const templateId = safeString(item.templateId);
      if (!templateId) continue;
      await loadRateRuleReference(
        connection,
        'SELECT id FROM score_question_templates WHERE id = ? FOR UPDATE',
        [templateId],
        localeCopy.copy_785b6d700c
      );
      const weight = Number(item.weight);
      const sortOrder = Number(item.sortOrder);
      if (!Number.isFinite(weight) || weight <= 0 || !Number.isInteger(sortOrder) || sortOrder <= 0) {
        rejectRateRule('invalid_params', localeCopy.copy_cd5cb36ed6);
      }
      templateConfigs.push({
        templateId,
        weight,
        sortOrder,
        calculationMethod: safeString(item.calculationMethod) || 'weighted_average',
        trimHighCount: Number(item.trimHighCount || 0),
        trimLowCount: Number(item.trimLowCount || 0)
      });
    }
    templateConfigs.sort((left, right) => left.sortOrder - right.sortOrder);
    normalizedClauses.push({
      scopeType,
      targetIdentityId,
      requireAllComplete: clause.requireAllComplete === true,
      templateConfigs
    });
  }

  const dedupedClauses = [];
  const seenKeys = new Map();
  for (const clause of normalizedClauses) {
    const clauseKey = clause.scopeType + '::' + clause.targetIdentityId;
    const existingIndex = seenKeys.get(clauseKey);
    if (existingIndex !== undefined) {
      if (mode === 'replace') dedupedClauses[existingIndex] = clause;
      else rejectRateRule('duplicate_clause', localeCopy.copy_7fab232951);
    } else {
      seenKeys.set(clauseKey, dedupedClauses.length);
      dedupedClauses.push(clause);
    }
  }

  await dictionaryUsage.assertDictionaryReferences({
    organizationId: orgId,
    departmentIds: [scorerDepartmentId],
    identityCategoryIds: [scorerIdentityId].concat(targetIdentityIds),
    workGroupIds: [],
    connection
  });

  return {
    id,
    activityId,
    activityName: safeString(activity.name),
    scorerDepartmentId,
    scorerDepartmentName: safeString(scorerDepartment.name),
    scorerIdentityId,
    scorerIdentityName: safeString(scorerIdentity.name),
    scorerKey: scorerDepartmentId + '::' + scorerIdentityId,
    allowSelfAssessment,
    clauses: dedupedClauses,
    mode
  };
}

async function clearRateRuleClauses(connection, orgId, ruleId) {
  const [oldClauses] = await connection.query(
    'SELECT id FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ? FOR UPDATE',
    [ruleId, orgId]
  );
  if (oldClauses.length) {
    await connection.query(
      'DELETE FROM clause_template_configs WHERE clause_id IN (?) AND org_id = ?',
      [oldClauses.map((clause) => clause.id), orgId]
    );
  }
  await connection.query('DELETE FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [ruleId, orgId]);
}

async function saveRateRuleWithConnection(connection, orgId, input) {
  const nowUtc = nowMysqlUtc();
  let ruleId = input.id;
  if (input.id) {
    const [rows] = await connection.query(
      'SELECT id FROM rate_target_rules WHERE id = ? AND org_id = ? FOR UPDATE',
      [input.id, orgId]
    );
    if (!rows[0]) rejectRateRule('rule_not_found', scoringCopy.scoringRuleNotFound);
    await connection.query(
      'UPDATE rate_target_rules SET activity_id = ?, scorer_department_id = ?, scorer_identity_id = ?, scorer_key = ?, is_active = 1, allow_self_assessment = ?, updated_at = ? WHERE id = ? AND org_id = ?',
      [input.activityId, input.scorerDepartmentId, input.scorerIdentityId, input.scorerKey, input.allowSelfAssessment ? 1 : 0, nowUtc, ruleId, orgId]
    );
    await clearRateRuleClauses(connection, orgId, ruleId);
  } else {
    const [existingRows] = await connection.query(
      'SELECT id FROM rate_target_rules WHERE activity_id = ? AND scorer_key = ? AND org_id = ? FOR UPDATE',
      [input.activityId, input.scorerKey, orgId]
    );
    if (existingRows[0]) {
      if (input.mode !== 'replace') {
        rejectRateRule('duplicate_category', localeCopy.copy_b92191d8ca);
      }
      ruleId = existingRows[0].id;
      await connection.query(
        'UPDATE rate_target_rules SET activity_id = ?, scorer_department_id = ?, scorer_identity_id = ?, scorer_key = ?, is_active = 1, allow_self_assessment = ?, updated_at = ? WHERE id = ? AND org_id = ?',
        [input.activityId, input.scorerDepartmentId, input.scorerIdentityId, input.scorerKey, input.allowSelfAssessment ? 1 : 0, nowUtc, ruleId, orgId]
      );
      await clearRateRuleClauses(connection, orgId, ruleId);
    } else {
      ruleId = generateId();
      await connection.query(
        'INSERT INTO rate_target_rules (id, activity_id, scorer_department_id, scorer_identity_id, scorer_key, is_active, allow_self_assessment, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
        [ruleId, input.activityId, input.scorerDepartmentId, input.scorerIdentityId, input.scorerKey, input.allowSelfAssessment ? 1 : 0, orgId, nowUtc, nowUtc]
      );
    }
  }

  for (const clause of input.clauses) {
    const clauseId = generateId();
    await connection.query(
      'INSERT INTO rate_rule_clauses (id, rule_id, scope_type, target_identity_id, require_all_complete, org_id) VALUES (?, ?, ?, ?, ?, ?)',
      [clauseId, ruleId, clause.scopeType, clause.targetIdentityId, clause.requireAllComplete ? 1 : 0, orgId]
    );
    for (let index = 0; index < clause.templateConfigs.length; index++) {
      const config = clause.templateConfigs[index];
      await connection.query(
        'INSERT INTO clause_template_configs (id, clause_id, sort_order, template_id, weight, calculation_method, trim_high_count, trim_low_count, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [generateId(), clauseId, index + 1, config.templateId, config.weight, config.calculationMethod, config.trimHighCount || 0, config.trimLowCount || 0, orgId]
      );
    }
  }

  return {
    id: ruleId,
    rule: {
      id: ruleId,
      activityId: input.activityId,
      activityName: input.activityName,
      scorerDepartmentId: input.scorerDepartmentId,
      scorerDepartment: input.scorerDepartmentName,
      scorerIdentityId: input.scorerIdentityId,
      scorerIdentity: input.scorerIdentityName,
      allowSelfAssessment: input.allowSelfAssessment,
      clauses: input.clauses.map((clause) => ({ ...clause, targetIdentity: '' }))
    }
  };
}

function assertUniqueRateRuleBatch(items) {
  const ids = new Set();
  const keys = new Set();
  for (const item of items) {
    const key = item.activityId + '::' + item.scorerKey;
    if ((item.id && ids.has(item.id)) || keys.has(key)) {
      rejectRateRule('duplicate_batch_item', scoringCopy.batchDuplicateItem);
    }
    if (item.id) ids.add(item.id);
    keys.add(key);
  }
}

function getRateRuleBatch(body) {
  const rules = Array.isArray(body && body.rules) ? body.rules : [];
  if (!rules.length) rejectRateRule('invalid_params', scoringCopy.batchItemsRequired);
  if (rules.length > MAX_BATCH_RULES) {
    rejectRateRule('batch_limit_exceeded', localeFormat(scoringCopy.batchLimitExceeded, [MAX_BATCH_RULES]));
  }
  return rules;
}

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
    ? clause.templateConfigs.map((cfg) => (cfg.templateName || localeCopy.copy_a3c996a525) + localeCopy.copy_de6991a9f2 + cfg.weight + localeCopy.copy_97abe52b9d + cfg.sortOrder + '）').join('、')
    : '暂未选择评分问题';
  return (clause.scopeLabel || localeCopy.copy_f8d4dcaa31) + identityText + completeText + ' [' + questionText + ']';
}

// listRateRules
router.post('/listRateRules', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

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
        clausesText: clauses.length ? clauses.map((c) => buildClauseText(c)).join(' | ') : '暂无被评分人范围'
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
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const orgId = await getCurrentOrgId();
    const result = await withTransaction(async (connection) => {
      const input = await normalizeRateRuleInput(connection, orgId, req.body);
      return saveRateRuleWithConnection(connection, orgId, input);
    });
    res.json({ status: 'success', id: result.id, rule: result.rule });
  } catch (e) {
    respondRateRuleError(res, e);
  }
});

// batchSaveRateRules
router.post('/batchSaveRateRules', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const rules = getRateRuleBatch(req.body);

    const orgId = await getCurrentOrgId();
    const results = await withTransaction(async (connection) => {
      const inputs = [];
      for (const rule of rules) inputs.push(await normalizeRateRuleInput(connection, orgId, rule));
      assertUniqueRateRuleBatch(inputs);
      const saved = [];
      for (const input of inputs) saved.push(await saveRateRuleWithConnection(connection, orgId, input));
      return saved;
    });
    res.json({ status: 'success', count: results.length, ids: results.map((item) => item.id) });
  } catch (e) {
    respondRateRuleError(res, e, scoringCopy.batchOperationFailed);
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
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const activityId = safeString(req.body.activityId);
    if (!activityId) return res.json({ status: 'invalid_params', message: localeCopy.copy_21368b3e76 });
    const activity = await activityModel.getById(activityId);
    if (!activity) return res.json({ status: 'invalid_params', message: localeCopy.copy_4f0d449737 });

    const orgId = await getCurrentOrgId();
    const [assignmentRows, existingRules, departments, identities] = await Promise.all([
      participantService.listParticipants(orgId, 'assignment'),
      rateRuleModel.getByActivity(activityId),
      departmentModel.getAll(),
      identityModel.getAll()
    ]);

    const deptMap = buildNameMap(departments);
    const identityMap = buildNameMap(identities);

    const categories = new Map();
    assignmentRows.forEach((item) => {
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
