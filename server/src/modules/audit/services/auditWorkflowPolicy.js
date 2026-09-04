'use strict';

const { safeString } = require('../../../utils/helpers');

const STEP_ACTION_TYPES = new Set(['pass', 'sign', 'estamp', 'both']);
const RESUBMIT_MODES = new Set(['fresh', 'from_rejector']);
const CONDITION_TYPES = new Set(['identity_scope', 'person']);
const CONDITION_SCOPES = new Set(['all', 'own', 'specific']);

function normalizeConditionType(value) {
  return safeString(value) || 'identity_scope';
}

function normalizeConditionScope(value) {
  return safeString(value) || 'all';
}

function validateConditionShape(condition) {
  const item = condition || {};
  const conditionType = normalizeConditionType(item.conditionType);
  if (!CONDITION_TYPES.has(conditionType)) {
    return { ok: false, reason: 'condition_type_invalid' };
  }
  if (conditionType === 'person') {
    const personHrIds = safeString(item.personHrIds || item.person_hr_ids);
    const assignmentIds = safeString(item.assignmentIds || item.assignment_ids || item.personAssignmentIds);
    return personHrIds && assignmentIds
      ? { ok: true }
      : { ok: false, reason: personHrIds ? 'assignment_binding_required' : 'person_required' };
  }

  const dimensions = [
    ['departmentScope', 'specificDepartmentId'],
    ['workGroupScope', 'specificWorkGroupId'],
    ['identityScope', 'specificIdentityId']
  ];
  for (const [scopeField, targetField] of dimensions) {
    const scope = normalizeConditionScope(item[scopeField]);
    if (!CONDITION_SCOPES.has(scope)) {
      return { ok: false, reason: 'condition_scope_invalid', field: scopeField };
    }
    if (scope === 'specific' && !safeString(item[targetField])) {
      return { ok: false, reason: 'condition_target_required', field: targetField };
    }
  }
  return { ok: true };
}

function validateStepShape(step) {
  const item = step || {};
  const actionType = safeString(item.actionType || item.action_type) || 'sign';
  if (!STEP_ACTION_TYPES.has(actionType)) {
    return { ok: false, reason: 'step_action_invalid' };
  }
  const conditions = Array.isArray(item.conditions) ? item.conditions : [];
  if (!conditions.length) {
    return { ok: false, reason: 'step_conditions_required' };
  }
  for (let index = 0; index < conditions.length; index += 1) {
    const result = validateConditionShape(conditions[index]);
    if (!result.ok) return Object.assign({ conditionIndex: index }, result);
  }
  return { ok: true };
}

function isValidResubmitMode(value) {
  return RESUBMIT_MODES.has(safeString(value));
}

function stripDesignationOverrides(conditions) {
  return (Array.isArray(conditions) ? conditions : [])
    .filter(function(condition) {
      return !(condition && condition.designationOverride === true);
    })
    .map(function(condition) { return Object.assign({}, condition); });
}

function applyDesignationOverride(baseConditions, personConditions) {
  const originalConditions = stripDesignationOverrides(baseConditions);
  const overrides = (Array.isArray(personConditions) ? personConditions : []).map(function(condition) {
    return Object.assign({}, condition, { designationOverride: true });
  });
  return originalConditions.concat(overrides);
}

function effectiveConditionsForAuthorization(conditions) {
  const source = Array.isArray(conditions) ? conditions : [];
  const designationOverrides = source.filter(function(condition) {
    return condition && condition.conditionType === 'person' && condition.designationOverride === true;
  });
  if (designationOverrides.length) return designationOverrides;
  // 模板条件本身是 OR 关系。只有带 designationOverride 的运行时指定才能
  // 收窄原始范围；普通固定人员条件不得吞掉并列的身份/部门条件。
  return source;
}

module.exports = {
  STEP_ACTION_TYPES,
  RESUBMIT_MODES,
  validateConditionShape,
  validateStepShape,
  isValidResubmitMode,
  stripDesignationOverrides,
  applyDesignationOverride,
  effectiveConditionsForAuthorization
};
