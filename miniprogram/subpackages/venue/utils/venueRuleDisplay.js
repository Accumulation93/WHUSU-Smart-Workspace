'use strict';

const localeCopy = require('../../../locales/zh-CN/generated/subpackages/venue/utils/venueRuleDisplay');
const BOOKING_RULE_LABELS = {
  admin: localeCopy.copy_af20193574,
  direct: localeCopy.copy_4f15bb9939,
  flow: localeCopy.copy_c5b4f4062e
};

function buildBookingRuleDisplayList(rules, approvalFlow, approvalFlowSteps) {
  const displayRules = (Array.isArray(rules) ? rules : []).map((rule) => ({
    ...rule,
    _ruleTypeLabel: BOOKING_RULE_LABELS[rule.rule_type] || rule.rule_type || localeCopy.copy_af20193574
  }));

  if (!approvalFlow) return displayRules;

  return [{
    id: '__flow__',
    rule_type: 'flow',
    _ruleTypeLabel: BOOKING_RULE_LABELS.flow,
    _flowSteps: (Array.isArray(approvalFlowSteps) ? approvalFlowSteps : []).length + localeCopy.copy_493a127a99
  }, ...displayRules];
}

module.exports = { buildBookingRuleDisplayList };
