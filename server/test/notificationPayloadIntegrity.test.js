'use strict';

const assert = require('assert');
const Module = require('module');

const created = [];
const recipients = [];
const checkedActors = [];
let failRecipient = '';
let currentActivity = { id: 'activity-a', is_current: 1, is_paused: 0 };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../utils/orgContext') {
    return { orgStorage: { async run(orgId, callback) { return callback(); } } };
  }
  if (request === '../models/notification') {
    return { async batchCreate(items) { for (const payload of items) created.push({ id: payload.id, payload }); } };
  }
  if (request === '../models/notificationOutbox') return {};
  if (request === '../models/messageData') return {
    async listBoundUsersInOrg(orgId) { assert.strictEqual(orgId, 'org-a'); return recipients; },
    async getScoringActivityForEvent(id, orgId) { assert.strictEqual(id, 'activity-a'); assert.strictEqual(orgId, 'org-a'); return currentActivity; }
  };
  if (request === '../../scoring/services/scoringTaskService') {
    return { async getUserScoringTask(user, activity, now, actor) {
      checkedActors.push(actor);
      assert.strictEqual(actor.assignmentId, user.assignment_id);
      assert.strictEqual(actor.personId, user.person_id);
      if (user.id === failRecipient) throw new Error('RECIPIENT_LOOKUP_FAILED');
      return { activity: { id: 'activity-a' }, pendingCount: user.pending };
    } };
  }
  if (request === '../../../utils/logger') return { logger: { error() {} } };
  return originalLoad.call(this, request, parent, isMain);
};
const { processJob } = require('../src/modules/audit/services/notificationOutboxService');
Module._load = originalLoad;

async function rejectsWith(job, pattern) {
  let error = null;
  try {
    await processJob(job);
  } catch (caught) {
    error = caught;
  }
  assert(error, '无效通知任务必须失败');
  assert.match(error.message, pattern);
}

(async function run() {
  await rejectsWith({
    id: 'job-broken-json',
    org_id: 'org-a',
    event_key: 'event-a',
    event_type: 'system',
    recipient_type: 'user',
    recipient_id: 'person-a',
    payload_json: '{'
  }, /notification_payload_invalid/);
  assert.strictEqual(created.length, 0, '损坏载荷不得创建空通知');

  await rejectsWith({
    id: 'job-invalid-recipient',
    org_id: 'org-a',
    event_key: 'event-b',
    event_type: 'system',
    recipient_type: 'operator',
    recipient_id: 'person-a',
    payload_json: JSON.stringify({ title: '测试通知' })
  }, /notification_recipient_invalid/);
  assert.strictEqual(created.length, 0, '未知接收者类型不得生成孤立通知');

  await processJob({
    id: 'job-valid',
    org_id: 'org-a',
    event_key: 'event-c',
    event_type: 'system',
    recipient_type: 'user',
    recipient_id: 'person-a',
    payload_json: JSON.stringify({ title: '测试通知', targetType: 'submission', targetId: 'submission-a' })
  });
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].payload.eventKey, 'event-c:user:person-a');
  assert.strictEqual(created[0].payload.orgId, 'org-a');

  recipients.push(
    { id: 'hr-a', person_id: 'person-a', assignment_id: 'post-a', pending: 2 },
    { id: 'hr-a', person_id: 'person-a', assignment_id: 'post-b', pending: 3 },
    { id: 'hr-b', person_id: 'person-b', assignment_id: 'post-c', pending: 0 }
  );
  const scoringJob = { org_id: 'org-a', event_key: 'score-event', event_type: 'score_activity_started', payload_json: { title: '评分测试', targetId: 'activity-a' } };
  await processJob(scoringJob);
  assert.strictEqual(checkedActors.length, 3, '所有有效岗位分别校验，不能按人员提前去重');
  assert.strictEqual(created.length, 2, '同一收件人的多个岗位合并为一条通知，零待办不投递');
  assert.strictEqual(created[1].payload.recipientId, 'hr-a');
  assert.strictEqual(created[1].payload.targetId, 'activity-a');
  assert(created[1].payload.description.includes('5'));
  failRecipient = 'hr-b';
  await rejectsWith(scoringJob, /RECIPIENT_LOOKUP_FAILED/);
  assert.strictEqual(created.length, 2, '资格计算部分失败时不得批量投递部分结果');
  currentActivity = { id: 'activity-a', is_current: 1, is_paused: 1 };
  await processJob(scoringJob);
  assert.strictEqual(created.length, 2, '暂停后的活动不能用旧任务载荷投递');

  console.log('通知出箱载荷、接收者与幂等键完整性测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
