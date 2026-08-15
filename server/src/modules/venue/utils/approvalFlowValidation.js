const localeCopy = require('../../../locales/zh-CN/generated/modules/venue/utils/approvalFlowValidation');
const { format: localeFormat } = require('../../../locales/runtime');
const { safeString } = require('../../../utils/helpers');

const MAX_FLOW_STEPS = 12;
const MAX_STEP_RULES = 20;
const VALID_SCOPES = new Set(['all', 'same', 'specific']);
const CSV_IDS_PATTERN = /^[A-Za-z0-9_-]{1,64}(,[A-Za-z0-9_-]{1,64})*$/;

function normalizeScope(value) {
  const scope = safeString(value) || 'all';
  if (!VALID_SCOPES.has(scope)) throw new Error(localeCopy.copy_71536f7f02);
  return scope;
}

function normalizeSpecificIds(scope, value, label) {
  if (scope !== 'specific') return null;
  const ids = [...new Set(safeString(value).split(',').map(item => item.trim()).filter(Boolean))];
  const serialized = ids.join(',');
  if (!serialized || serialized.length > 1000 || !CSV_IDS_PATTERN.test(serialized)) {
    throw new Error(localeFormat(localeCopy.copy_02808711c5, [label]));
  }
  return serialized;
}

function normalizeRule(rawRule) {
  const raw = rawRule && typeof rawRule === 'object' ? rawRule : {};
  const departmentScope = normalizeScope(raw.departmentScope);
  const workGroupScope = normalizeScope(raw.workGroupScope);
  const identityScope = normalizeScope(raw.identityScope);
  return {
    departmentScope,
    specificDepartmentId: normalizeSpecificIds(departmentScope, raw.specificDepartmentId, '部门'),
    workGroupScope,
    specificWorkGroupId: normalizeSpecificIds(workGroupScope, raw.specificWorkGroupId, '职能组'),
    identityScope,
    specificIdentityId: normalizeSpecificIds(identityScope, raw.specificIdentityId, '身份')
  };
}

function normalizeFlowSteps(rawSteps) {
  if (!Array.isArray(rawSteps) || !rawSteps.length) throw new Error(localeCopy.copy_9167c33257);
  if (rawSteps.length > MAX_FLOW_STEPS) throw new Error(localeFormat(localeCopy.copy_4d018c2e45, [MAX_FLOW_STEPS]));
  return rawSteps.map((rawStep, stepIndex) => {
    const step = rawStep && typeof rawStep === 'object' ? rawStep : {};
    const name = safeString(step.name).trim() || `第${stepIndex + 1}步`;
    if (name.length > 200) throw new Error(localeCopy.copy_7b57cdbae6);
    const rules = Array.isArray(step.rules) ? step.rules : [];
    if (rules.length > MAX_STEP_RULES) throw new Error(localeFormat(localeCopy.copy_66abbe2cc1, [MAX_STEP_RULES]));
    const approvalMode = safeString(step.approvalMode) === 'admin_any' ? 'admin_any' : 'hr_rule';
    if (approvalMode === 'admin_any' && rules.length) throw new Error(localeCopy.copy_0b8291b447);
    if (approvalMode === 'hr_rule' && !rules.length) throw new Error(localeCopy.copy_a68c875488);
    return {
      name,
      approvalMode,
      rules: rules.map(normalizeRule)
    };
  });
}

module.exports = {
  MAX_FLOW_STEPS,
  MAX_STEP_RULES,
  normalizeRule,
  normalizeFlowSteps
};
