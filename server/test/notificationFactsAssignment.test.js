'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const calls = [];
const connection = { async query() { return [[{ type: 'score_activity_started' }]]; } };
const original = Module._load;
Module._load = function(request, parent, main) {
  if (request === '../../../config/db') return connection;
  if (request === './messageData') return { async listBoundUsersInOrg() {
    return ['a', 'b'].map(assignment_id => ({ assignment_id, id: 'hr', person_id: 'person' }));
  } };
  if (request === '../../scoring/services/scoringTaskService') return { async getUserScoringTask(user, unused, now, actor) {
    calls.push(actor.assignmentId);
    assert.equal(user.assignment_id, actor.assignmentId);
    return actor.assignmentId === 'b' ? { pendingCount: 1, activity: { id: 'activity', name: '评分' } } : null;
  } };
  return original.call(this, request, parent, main);
};
(async () => {
  try {
    const lifecycle = require('../src/modules/audit/models/notificationLifecycle');
    const first = await lifecycle.prepare({ type: 'user', id: 'hr', personId: 'person', assignmentId: 'a' }, 'org', {}, connection);
    assert.deepEqual(calls, ['a']);
    assert.deepEqual(first.scoring, []);
    assert.equal(first.scoringFacts.size, 0);
    calls.length = 0;
    const second = await lifecycle.prepare({ type: 'user', id: 'hr', personId: 'person', assignmentId: 'b' }, 'org', {}, connection);
    assert.deepEqual(calls, ['b']);
    assert.deepEqual(second.scoring, ['activity']);
    assert.equal(second.scoringFacts.get('activity').businessTitle, '评分');
    console.log('PASS 同一自然人另一岗位的评分任务不扩散到当前岗位通知');
  } finally { Module._load = original; }
})().catch(error => { console.error(error); process.exitCode = 1; });
