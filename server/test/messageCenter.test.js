const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dbPath = require.resolve('../src/config/db');
const orgPath = require.resolve('../src/utils/orgContext');
const notificationPath = require.resolve('../src/modules/audit/models/notification');
const accessibleOrganizationsPath = require.resolve('../src/core/services/accessibleOrganizations');
const organizationModelPath = require.resolve('../src/core/models/organization');

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

async function testCrossOrganizationActorResolution() {
  calls.length = 0;
  responses.length = 0;
  responses.push([[
    { id: 'org-a', name: '甲组织' },
    { id: 'org-b', name: '乙组织' }
  ], []]);
  responses.push([[
    {
      user_info_id: 'binding-a',
      id: 'hr-a',
      name: '张三',
      student_id: '20260001',
      department_id: 'dept-a',
      identity_id: 'identity-a',
      work_group_id: '',
      org_id: 'org-a'
    }
  ], []]);
  responses.push([[
    {
      id: 'hr-a',
      name: '张三',
      student_id: '20260001',
      department_id: 'dept-a',
      identity_id: 'identity-a',
      work_group_id: '',
      org_id: 'org-a'
    },
    {
      id: 'hr-b',
      name: '张三',
      student_id: '20260001',
      department_id: 'dept-b',
      identity_id: 'identity-b',
      work_group_id: '',
      org_id: 'org-b'
    }
  ], []]);
  delete require.cache[organizationModelPath];
  delete require.cache[accessibleOrganizationsPath];
  const accessibleOrganizations = require(accessibleOrganizationsPath);
  const contexts = await accessibleOrganizations.listAccessibleActorContexts({
    openid: 'openid-1',
    role: 'user',
    currentOrgId: 'org-a'
  });
  assert.deepStrictEqual(contexts.map((item) => item.organizationId), ['org-a', 'org-b']);
  assert.deepStrictEqual(contexts.map((item) => item.actor.id), ['hr-a', 'hr-b']);
  assert.strictEqual(contexts[0].isCurrentOrganization, true);
  assert.strictEqual(contexts[1].actor.userInfoId, '', '未激活组织不得伪造绑定记录');
  assert.ok(calls.some((call) => /FROM hr_info/.test(call.sql)), '应通过人事身份只读匹配跨组织用户');
  assert.ok(!calls.some((call) => /^\s*(INSERT|UPDATE)/i.test(call.sql)), '聚合查询不得创建或更新用户绑定');
}

async function testAdminActorResolution() {
  calls.length = 0;
  responses.length = 0;
  responses.push([[
    { id: 'org-a', name: '甲组织' },
    { id: 'org-b', name: '乙组织' }
  ], []]);
  responses.push([[
    {
      id: 'super-1',
      name: '超级管理员',
      openid: 'openid-admin',
      admin_level: 'super_admin',
      bind_status: 'active',
      org_id: ''
    }
  ], []]);
  const accessibleOrganizations = require(accessibleOrganizationsPath);
  const contexts = await accessibleOrganizations.listAccessibleActorContexts({
    openid: 'openid-admin',
    role: 'admin',
    currentOrgId: 'org-b'
  });
  assert.deepStrictEqual(contexts.map((item) => item.organizationId), ['org-a', 'org-b']);
  assert.ok(contexts.every((item) => item.actor.type === 'admin'));
  assert.ok(contexts.every((item) => item.actor.id === 'super-1'));
  assert.strictEqual(contexts[1].isCurrentOrganization, true);
  assert.ok(calls.every((call) => !/user_info/.test(call.sql)), '管理员身份不得读取普通用户绑定范围');
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
  assert.match(portal, /limit: 5/);
  assert.match(portal, /activateOrganization/);
  assert.doesNotMatch(portal, /loadNotificationUnreadCount/);
  const portalView = fs.readFileSync(path.join(root, '../miniprogram/pages/portal/portal.wxml'), 'utf8');
  assert.match(portalView, /portal-organization-meta/);
  assert.match(portalView, /切换组织后查看/);
  assert.doesNotMatch(portalView, /length \* 102/);

  const messageCenter = fs.readFileSync(path.join(root, '../miniprogram/pages/messageCenter/messageCenter.js'), 'utf8');
  const messageCenterView = fs.readFileSync(path.join(root, '../miniprogram/pages/messageCenter/messageCenter.wxml'), 'utf8');
  assert.match(messageCenter, /messageScope/);
  assert.match(messageCenter, /organizationId/);
  assert.match(messageCenterView, /organization-filter/);
  assert.match(messageCenterView, /organization-meta-name/);
  assert.match(messageCenterView, /部分组织暂未加载/);
}

(async function run() {
  await testNotificationIsolationAndAwait();
  await testReadAffectedRowsContract();
  await testCrossOrganizationActorResolution();
  await testAdminActorResolution();
  testMigrationAndFrontendContract();
  console.log('跨组织消息中心隔离、身份解析、销记和前端契约测试通过');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
