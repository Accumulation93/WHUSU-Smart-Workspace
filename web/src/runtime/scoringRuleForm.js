import localeCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/adminUtils.js';
const RULE_SCOPE_OPTIONS = [
  { value: 'same_department_identity', label: localeCopy.copy_e315078ee8 },
  { value: 'same_department_all', label: localeCopy.copy_2603ee59e5 },
  { value: 'same_work_group_identity', label: localeCopy.copy_f9444318ff },
  { value: 'same_work_group_all', label: localeCopy.copy_12771a58c9 },
  { value: 'identity_only', label: localeCopy.copy_22676ecf45 },
  { value: 'all_people', label: localeCopy.copy_76d431a4dc }
];
const RULE_SCOPE_LABEL_MAP = Object.fromEntries(RULE_SCOPE_OPTIONS.map(item => [item.value,item.label]));
function emptyRuleForm() {
  return {
    id: '',
    scorerDepartmentId: '',
    scorerDepartment: '',
    scorerIdentityId: '',
    scorerIdentity: '',
    allowSelfAssessment: true,
    clauseScope: RULE_SCOPE_OPTIONS[0].value,
    clauseScopeLabel: RULE_SCOPE_OPTIONS[0].label,
    clauseTargetIdentityId: '',
    clauseTargetIdentity: '',
    clauseRequireAllComplete: false,
    clauseTemplateId: '',
    clauseTemplateName: '',
    clauseTemplateWeight: '1',
    clauseTemplateOrder: '',
    clauseCalculationMethod: 'weighted_average',
    clauseTrimHighCount: 0,
    clauseTrimLowCount: 0,
    clauseTemplateConfigEditingIndex: -1,
    clauseEditingIndex: -1,
    isRuleClauseEditorVisible: false,
    isTemplateConfigEditorVisible: false,
    clauseTemplateConfigs: [],
    clauses: []
  };
}

function createTemplateConfig(config = {}) {
  return {
    templateId: config.templateId || '',
    templateName: config.templateName || '',
    weight: config.weight == null ? '1' : String(config.weight),
    sortOrder: config.sortOrder == null ? '' : String(config.sortOrder),
    calculationMethod: config.calculationMethod || 'weighted_average',
    trimHighCount: Number(config.trimHighCount || 0),
    trimLowCount: Number(config.trimLowCount || 0)
  };
}

function normalizeClauseForEdit(clause = {}) {
  const templateConfigs = Array.isArray(clause.templateConfigs) && clause.templateConfigs.length
    ? clause.templateConfigs.map((item) => createTemplateConfig(item))
    : [];

  return {
    scopeType: clause.scopeType || RULE_SCOPE_OPTIONS[0].value,
    scopeLabel: getScopeLabel(clause.scopeType || RULE_SCOPE_OPTIONS[0].value),
    targetIdentityId: String(clause.targetIdentityId || '').trim(),
    targetIdentity: String(clause.targetIdentity || '').trim(),
    requireAllComplete: clause.requireAllComplete === true,
    templateConfigs
  };
}

function moveItem(list, fromIndex, toIndex) {
  const nextList = [...list];
  const [moved] = nextList.splice(fromIndex, 1);
  nextList.splice(toIndex, 0, moved);
  return nextList;
}

function refreshTemplateConfigSortOrder(templateConfigs = []) {
  return templateConfigs.map((item, index) => ({
    ...item,
    sortOrder: String(index + 1)
  }));
}

function getScopeLabel(value) {
  return RULE_SCOPE_LABEL_MAP[value] || value || '';
}

function normalizeTemplateConfigsForSave(templateConfigs = []) {
  return refreshTemplateConfigSortOrder((templateConfigs || [])
    .map((item) => ({
      templateId: String(item.templateId || '').trim(),
      templateName: String(item.templateName || '').trim(),
      weight: String(item.weight == null ? '1' : item.weight).trim(),
      sortOrder: String(item.sortOrder || '').trim(),
      calculationMethod: item.calculationMethod || 'weighted_average',
      trimHighCount: Number(item.trimHighCount || 0),
      trimLowCount: Number(item.trimLowCount || 0)
    }))
    .filter((item) => item.templateId));
}

function buildPendingTemplateConfigForSave(form = {}) {
  const templateId = String(form.clauseTemplateId || '').trim();
  if (!templateId) {
    return {
      status: 'empty'
    };
  }

  const weight = Number(form.clauseTemplateWeight);
  if (!Number.isFinite(weight) || weight <= 0) {
    return {
      status: 'invalid',
      message: localeCopy.copy_ba359df757
    };
  }

  const currentConfigs = Array.isArray(form.clauseTemplateConfigs) ? form.clauseTemplateConfigs : [];
  const editingIndex = Number(form.clauseTemplateConfigEditingIndex);
  const sortOrderValue = editingIndex >= 0 && currentConfigs[editingIndex]
    ? Number(currentConfigs[editingIndex].sortOrder) || (editingIndex + 1)
    : currentConfigs.length + 1;

  return {
    status: 'ready',
    config: {
      templateId,
      templateName: String(form.clauseTemplateName || '').trim(),
      weight: String(weight),
      sortOrder: String(sortOrderValue),
      calculationMethod: form.clauseCalculationMethod || 'weighted_average',
      trimHighCount: Number(form.clauseTrimHighCount || 0),
      trimLowCount: Number(form.clauseTrimLowCount || 0)
    }
  };
}

function mergePendingTemplateConfig(form = {}) {
  const templateConfigs = [...(form.clauseTemplateConfigs || [])];
  const pending = buildPendingTemplateConfigForSave(form);
  if (pending.status !== 'ready') {
    return {
      ok: pending.status !== 'invalid',
      message: pending.message || '',
      templateConfigs: normalizeTemplateConfigsForSave(templateConfigs)
    };
  }

  const editingIndex = Number(form.clauseTemplateConfigEditingIndex);
  if (editingIndex >= 0 && templateConfigs[editingIndex]) {
    templateConfigs[editingIndex] = pending.config;
  } else {
    const exists = templateConfigs.some((item) => (
      String(item.templateId || '') === pending.config.templateId
    ));
    if (!exists) {
      templateConfigs.push(pending.config);
    }
  }

  return {
    ok: true,
    message: '',
    templateConfigs: normalizeTemplateConfigsForSave(templateConfigs)
  };
}

function hasPendingRuleClauseDraft(form = {}) {
  return Number(form.clauseEditingIndex) >= 0
    || String(form.clauseTargetIdentityId || '').trim()
    || form.clauseRequireAllComplete === true
    || String(form.clauseTemplateId || '').trim()
    || (Array.isArray(form.clauseTemplateConfigs) && form.clauseTemplateConfigs.length > 0)
    || String(form.clauseScope || RULE_SCOPE_OPTIONS[0].value) !== RULE_SCOPE_OPTIONS[0].value;
}

function buildRuleClausesForSave(form = {}) {
  const clauses = Array.isArray(form.clauses)
    ? form.clauses.map((item) => normalizeClauseForEdit(item))
    : [];
  if (!hasPendingRuleClauseDraft(form)) {
    return {
      ok: true,
      clauses,
      message: ''
    };
  }

  const mergedConfigResult = mergePendingTemplateConfig(form);
  if (!mergedConfigResult.ok) {
    return {
      ok: false,
      clauses,
      message: mergedConfigResult.message
    };
  }

  const clauseScope = String(form.clauseScope || RULE_SCOPE_OPTIONS[0].value);
  const targetIdentityId = String(form.clauseTargetIdentityId || '').trim();
  const targetIdentity = String(form.clauseTargetIdentity || '').trim();
  if (clauseScope !== 'all_people' && clauseScope.indexOf('_all') === -1 && !targetIdentityId) {
    return {
      ok: false,
      clauses,
      message: localeCopy.copy_7151fd51a0
    };
  }

  const nextClause = {
    scopeType: clauseScope,
    scopeLabel: getScopeLabel(clauseScope),
    targetIdentityId,
    targetIdentity,
    requireAllComplete: form.clauseRequireAllComplete === true,
    templateConfigs: mergedConfigResult.templateConfigs
  };
  const editingIndex = Number(form.clauseEditingIndex);
  if (editingIndex >= 0 && clauses[editingIndex]) {
    clauses[editingIndex] = nextClause;
  } else {
    const exists = clauses.some((item) => (
      item.scopeType === nextClause.scopeType
      && item.targetIdentityId === nextClause.targetIdentityId
      && item.requireAllComplete === nextClause.requireAllComplete
      && JSON.stringify(item.templateConfigs || []) === JSON.stringify(nextClause.templateConfigs)
    ));
    if (!exists) {
      clauses.push(nextClause);
    }
  }

  return {
    ok: true,
    clauses,
    message: ''
  };
}

function buildRuleClausesForBatchApply(form = {}) {
  const clauses = Array.isArray(form.clauses)
    ? form.clauses.map((item) => normalizeClauseForEdit(item))
    : [];
  return {
    ok: clauses.length > 0,
    clauses,
    message: clauses.length ? '' : localeCopy.copy_30a324d851
  };
}

export { RULE_SCOPE_OPTIONS, emptyRuleForm, createTemplateConfig, normalizeClauseForEdit, refreshTemplateConfigSortOrder, getScopeLabel, normalizeTemplateConfigsForSave, buildPendingTemplateConfigForSave, mergePendingTemplateConfig, buildRuleClausesForSave, buildRuleClausesForBatchApply };
