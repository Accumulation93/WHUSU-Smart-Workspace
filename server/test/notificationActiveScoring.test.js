'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
let pending = 2, dueAt = new Date(Date.now() + 60000).toISOString();
const checked = [];
Module._load = function(name, parent, main) {
  if (name === '../../../config/db') return { query: async () => [[{ type: 'score_activity_started' }]] };
  if (name === '../../../utils/requestWork') return { memo: (key, run) => run() };
  if (name === './messageData') return { listBoundUsersInOrg: async () => [
    { id: 'hr', person_id: 'person', assignment_id: 'job1' },
    { id: 'hr', person_id: 'person', assignment_id: 'job2' },
    { id: 'other', person_id: 'other', assignment_id: 'private' }
  ] };
  if (name === '../../scoring/services/scoringTaskService') return { getUserScoringTask: async (user, unused, now, actor) => {
    checked.push(actor.assignmentId);
    return { pendingCount: pending, activity: { id: 'activity' }, dueAt };
  } };
  return original.call(this, name, parent, main);
};
const lifecycle = require('../src/modules/audit/models/notificationLifecycle');
(async () => {
  try {
    const actor = { id: 'hr', type: 'user', personId: 'person' };
    const active = await lifecycle.prepare(actor, 'org');
    assert.deepEqual(active.scoring, ['activity']);
    assert.deepEqual(checked, ['job1', 'job2']);
    assert.equal(active.expiresAt, Date.parse(dueAt) + 1);
    pending = 0;
    assert.deepEqual((await lifecycle.prepare(actor, 'org')).scoring, []);
    assert.deepEqual((await lifecycle.prepare({ ...actor, id: 'unknown' }, 'org')).scoring, []);
    console.log('PASS 评分通知按本人有效岗位合并，完成后消失，截止时间限制缓存');
  } finally { Module._load = original; }
})().catch(error => { console.error(error); process.exitCode = 1; });
