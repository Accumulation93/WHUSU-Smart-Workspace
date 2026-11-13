'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
const targets = [
  { id: 'a', assignment_kind: 'staff', department_id: 'd', identity_id: 'i', person_id: 'a' },
  { id: 'b', assignment_kind: 'liaison', department_id: 'd', identity_id: 'i', person_id: 'b' }
];
const rule = { id: 'rule', is_active: 1, allow_self_assessment: 1, nature_ids: ['staff'] };
let clauses = [{ id: 'clause', scope_type: 'all_people', nature_ids: ['staff'] }];
const mocks = {
  '../models/rateRule': { getByKey: async () => rule },
  '../models/scoreActivity': {},
  '../models/rateRuleClause': { getByRuleId: async () => clauses },
  '../models/clauseTemplateConfig': { getByClauseIds: async () => clauses.map(item => ({ clause_id: item.id })) },
  '../models/scoreRecord': { getCompletionTargets: async () => [] },
  './participants': { normalizeGranularity: () => 'assignment', resolveActorParticipant: async () => targets[0],
    listParticipants: async () => targets, isSameNaturalPerson: () => false },
  '../../../utils/orgContext': { getCurrentOrgId: async () => 'org' },
  '../../../utils/requestWork': { memo: (_key, run) => run(), getState: () => null },
  '../../../core/models/systemConfig': { get: async () => ({ timezone: 8 }) }
};
Module._load = function(name, parent, main) {
  return mocks[name] || original.call(this, name, parent, main);
};
const service = require('../src/modules/scoring/services/scoringTaskService');
Module._load = original;
const read = () => service.getUserScoringTask({ id: 'hr' }, { id: 'activity' }, new Date(), { assignmentId: 'a' });

test('评分待办仅计算当前性质及各条目标性质，不被全员索引扩大', async () => {
  assert.equal((await read()).expectedCount, 1);
  clauses.push({ id: 'second', scope_type: 'same_department_all', nature_ids: ['liaison'] });
  assert.equal((await read()).expectedCount, 2);
  rule.nature_ids = ['liaison'];
  assert.equal(await read(), null);
  rule.nature_ids = null;
  clauses = [{ id: 'old', scope_type: 'all_people' }];
  assert.equal((await read()).expectedCount, 2);
});
