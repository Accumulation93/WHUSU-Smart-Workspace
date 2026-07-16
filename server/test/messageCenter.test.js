const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dbPath = require.resolve('../src/config/db');
const orgPath = require.resolve('../src/utils/orgContext');
const notificationPath = require.resolve('../src/modules/audit/models/notification');

const calls = [];
const responses = [];
const mockPool = {
  async query(sql, params) {
    calls.push({ sql: String(sql), params });
    if (!responses.length) throw new Error('缺少模拟查询响应');
    return responses.shift();
  }
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockPool };
require.cache[orgPath] = {
  id: orgPath,
  filename: orgPath,
  loaded: true,
  exports: { getCurrentOrgId: async function() { return 'org-44'; } }
};
delete require.cache[notificationPath];
const notificationModel = require(notificationPath);

async function testNotificationIsolationAndAwait() {
  calls.length = 0;
  responses.push([[{ total: 2, unread_count: 1 }], []]);
  responses.push([[{ id: 'notice-1', is_read: 0 }], []]);
  const result = await notificationModel.listForRecipient({ type: 'admin', id: 'admin-1' }, { limit: 20 });
  assert.strictEqual(result.total, 2);
  assert.strictEqual(result.unreadCount, 1);
  assert.strictEqual(result.items.length, 1);
  assert.deepStrictEqual(calls[0].params.slice(0, 3), ['org-44', 'admin', 'admin-1']);
  assert.ok(!calls[0].params.some((value) => value && typeof value.then === 'function'), 'SQL 参数中不得出现 Promise');
}

async function testReadAffectedRowsContract() {
  calls.length = 0;
  responses.push([{ affectedRows: 0 }, []]);
  responses.push([[], []]);
  const missing = await notificationModel.markRead('foreign-id', { type: 'user', id: 'hr-1' });
  assert.deepStrictEqual(missing, { found: false, changed: false, unreadCount: null });
  assert.deepStrictEqual(calls[0].params, ['foreign-id', 'org-44', 'user', 'hr-1']);
}

function testMigrationAndFrontendContract() {
  const migration = fs.readFileSync(path.join(root, 'db/migrate_message_center.sql'), 'utf8');
  assert.match(migration, /notification_outbox/);
  assert.match(migration, /recipient_type/);
  assert.match(migration, /notification_pending_approval_archive/);
  assert.match(migration, /DELETE FROM notifications WHERE type = 'pending_approval'/);
  assert.match(migration, /approval_mode/);
  assert.match(migration, /SIGNAL SQLSTATE '45000'/);

  const portal = fs.readFileSync(path.join(root, '../miniprogram/pages/portal/portal.js'), 'utf8');
  assert.match(portal, /getMessageOverview/);
  assert.match(portal, /markAllNotificationsRead/);
  assert.doesNotMatch(portal, /loadNotificationUnreadCount/);
  const portalView = fs.readFileSync(path.join(root, '../miniprogram/pages/portal/portal.wxml'), 'utf8');
  assert.match(portalView, /bindscrolltolower="loadMoreTodos"/);
  assert.match(portalView, /bindscrolltolower="loadMoreNotifications"/);
}

(async function run() {
  await testNotificationIsolationAndAwait();
  await testReadAffectedRowsContract();
  testMigrationAndFrontendContract();
  console.log('消息中心隔离、销记和迁移契约测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
