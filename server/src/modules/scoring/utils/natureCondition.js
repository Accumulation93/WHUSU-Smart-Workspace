'use strict';

const policy = require('../../../core/services/natureRulePolicy');

function matches(condition, participant) {
  const item = participant || {};
  return policy.matches(condition, item.assignmentNature || item.assignmentKind || item.assignment_kind);
}

module.exports = { matches, normalize: policy.normalize };
