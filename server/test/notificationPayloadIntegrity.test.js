'use strict';

const assert = require('assert');
const Module = require('module');

const created = [];
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../utils/orgContext') {
    return { orgStorage: { async run(orgId, callback) { return callback(); } } };
  }
  if (request === '../models/notification') {
    return { async create(id, payload) { created.push({ id, payload }); } };
  }
  if (request === '../models/notificationOutbox') return {};
  if (request === '../models/messageData') return {};
  if (request === '../../scoring/services/scoringTaskService') {
    return { async getUserScoringTask() { return null; } };
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

  console.log('通知出箱载荷、接收者与幂等键完整性测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
