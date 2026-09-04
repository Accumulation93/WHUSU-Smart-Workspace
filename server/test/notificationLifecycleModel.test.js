'use strict';

const assert = require('assert');
const Module = require('module');

const calls = [];
const pool = {
  async query(sql, params) {
    calls.push({ sql: String(sql), params: params || [] });
    if (/SELECT COUNT\(\*\) AS total/.test(sql)) return [[{ total: 1, unread_count: 1 }]];
    if (/SELECT id, type, title/.test(sql)) return [[]];
    return [{ affectedRows: 2 }];
  }
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../../../config/db') return pool;
  if (request === '../../../utils/orgContext') return { async getCurrentOrgId() { return 'org-a'; } };
  return originalLoad.call(this, request, parent, isMain);
};
const notificationModel = require('../src/modules/audit/models/notification');
Module._load = originalLoad;

(async function run() {
  const actor = { type: 'user', id: 'hr-a' };

  calls.length = 0;
  const listed = await notificationModel.listForRecipient(actor, { limit: 20 });
  assert.strictEqual(listed.total, 1);
  assert.strictEqual(listed.unreadCount, 1);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls.every((item) => item.sql.includes('type <> ?')));
  assert.ok(calls.every((item) => item.params.includes('pending_approval')),
    '消息列表必须排除已由实时待办替代的旧审批通知');

  calls.length = 0;
  await notificationModel.markAllRead(actor);
  assert.match(calls[0].sql, /type <> \?/);
  assert.ok(calls[0].params.includes('pending_approval'), '全部已读不得改写旧待办通知');

  calls.length = 0;
  await notificationModel.deleteAll(actor);
  assert.match(calls[0].sql, /type <> \?/);
  assert.ok(calls[0].params.includes('pending_approval'), '清除全部不得影响待我审批事项');

  calls.length = 0;
  await notificationModel.cleanupOld();
  assert.deepStrictEqual(calls[0].params, [30], '普通通知按统一 30 天生命周期维护');

  calls.length = 0;
  let invalidRecipientError = null;
  try {
    await notificationModel.create('notice-a', {
      orgId: 'org-a',
      recipientType: 'unknown',
      recipientId: 'member-a',
      type: 'system',
      title: '测试'
    });
  } catch (error) {
    invalidRecipientError = error;
  }
  assert(invalidRecipientError, '未知接收者类型必须被拒绝');
  assert.strictEqual(calls.length, 0, '无效通知不得写入数据库');

  console.log('通知可见范围、待办分离、清除与保留周期测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
