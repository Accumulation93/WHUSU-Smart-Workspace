'use strict';

const BOOKING_RULE_LABELS = {
  admin: '管理员审核',
  direct: '直接通过',
  flow: '用户审核（多步审批流程）'
};

function buildBookingRuleDisplayList(rules, approvalFlow, approvalFlowSteps) {
  const displayRules = (Array.isArray(rules) ? rules : []).map((rule) => ({
    ...rule,
    _ruleTypeLabel: BOOKING_RULE_LABELS[rule.rule_type] || rule.rule_type || '管理员审核'
  }));

  if (!approvalFlow) return displayRules;

  return [{
    id: '__flow__',
    rule_type: 'flow',
    _ruleTypeLabel: BOOKING_RULE_LABELS.flow,
    _flowSteps: (Array.isArray(approvalFlowSteps) ? approvalFlowSteps : []).length + '步'
  }, ...displayRules];
}

module.exports = { buildBookingRuleDisplayList };
