'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

const reference = { accountId: 'account', sessionId: 'session', contextId: 'context',
  organizationId: 'org', personId: 'person' };
const actor = { role: 'user', assignment: { id: 'assignment', organizationId: 'org', natureId: 'staff',
  departmentId: 'main-department', identityCategoryId: 'main-identity', workGroupId: '' } };
const candidates = [
  { id: 'latest-activity', name: '最新但无权查看', publication_id: 'latest-publication' },
  { id: 'main-activity', name: '本人可查看的活动', publication_id: 'main-publication' }
];
const queryRows = sql => {
  if (sql.includes('FROM pub_view_rule_clauses')) return [{ rule_id: 'latest-view', count: 1 }, { rule_id: 'main-view', count: 1 }];
  if (sql.includes('FROM pub_merit_rule_clauses')) return [];
  if (sql.includes('FROM pub_merit_rules')) return [];
  if (sql.includes('FROM pub_view_rules')) return [{ id: 'latest-view', publication_id: 'latest-publication',
    grantee_department_id: 'other-department', grantee_identity_id: 'main-identity', nature_ids: null },
  { id: 'main-view', publication_id: 'main-publication', grantee_department_id: 'main-department',
    grantee_identity_id: 'main-identity', nature_ids: JSON.stringify(['staff']) }];
  throw new Error('Unexpected SQL: ' + sql);
};

const mocks = {
  '../../../config/db': {
    withTransaction: callback => callback({ query: async (sql, params) => [queryRows(sql, params), []] })
  },
  '../../../core/services/authorizationSession': {
    createAuthorizationSession: async () => ({
      mode: 'enforced', revision: 1,
      check: () => ({ allowed: true }),
      project: data => data
    })
  },
  '../../../core/models/authorizationIdentity': { loadActor: async () => actor },
  './scoreActivity': {
    listPublished: async () => candidates,
    getCurrent: async () => null
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
const authorization = require('../src/modules/scoring/models/scoreActivityAuthorization');
Module._load = originalLoad;

(async () => {
  const selected = await authorization.selected(reference, true);
  assert.equal(selected.id, 'main-activity', '必须选择本人岗位有权查看的最近公示活动');
  assert.equal(selected.name, '本人可查看的活动');
  actor.assignment.departmentId = 'unmatched-department';
  assert.equal(await authorization.selected(reference, true), null, '没有匹配公示规则时不得回退到全局最新活动');
  console.log('评分公示活动按当前岗位选择最近可访问记录');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
