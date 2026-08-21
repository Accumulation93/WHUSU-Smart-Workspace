const { safeString } = require('../../../utils/helpers');
const { toRuleProfile } = require('./venueAssignmentContext');

function matchesBookingRule(rule, actor) {
  if (!rule || !actor) return false;
  if (rule.rule_type === 'direct') return false;
  if (rule.rule_type === 'admin') return actor.type === 'admin';
  if (actor.type !== 'user' || !actor.assignment) return false;
  if (rule.rule_type === 'person') {
    return Boolean(safeString(rule.approver_hr_id)
      && safeString(rule.approver_hr_id) === safeString(actor.id));
  }
  if (rule.rule_type !== 'identity') return false;
  const assignment = toRuleProfile(actor.assignment);
  if (!safeString(rule.approver_identity_id)
    || safeString(assignment.identity_id) !== safeString(rule.approver_identity_id)) return false;
  if (safeString(rule.scope_department_id)
    && safeString(assignment.department_id) !== safeString(rule.scope_department_id)) return false;
  if (safeString(rule.scope_work_group_id)
    && safeString(assignment.work_group_id) !== safeString(rule.scope_work_group_id)) return false;
  return true;
}

function evaluateBookingRules(rules, actor) {
  const activeRules = Array.isArray(rules) ? rules : [];
  if (!activeRules.length) return Boolean(actor && actor.type === 'admin');
  return activeRules.some(function(rule) { return matchesBookingRule(rule, actor); });
}

function evaluateBookingRuleWorkContexts(rules, workActors, targetOrgId, currentContextId, currentOrgId) {
  const eligible = (workActors || []).filter(function(actor) {
    return safeString(actor && actor.organizationId) === safeString(targetOrgId)
      && evaluateBookingRules(rules, actor);
  });
  const current = eligible.find(function(actor) {
    return safeString(actor.contextId) === safeString(currentContextId)
      && safeString(targetOrgId) === safeString(currentOrgId);
  }) || null;
  return {
    visible: eligible.length > 0,
    canProcessInCurrentContext: Boolean(current),
    eligible,
    selected: current || eligible[0] || null
  };
}

module.exports = {
  matchesBookingRule,
  evaluateBookingRules,
  evaluateBookingRuleWorkContexts
};
