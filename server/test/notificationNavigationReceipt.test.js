'use strict';

const assert = require('assert');

const app = { globalData: {} };
global.getApp = function() { return app; };

const receipt = require('../../miniprogram/utils/notificationNavigationReceipt');

const item = {
  id: 'notice-1',
  organizationId: 'org-43',
  targetUrl: '/subpackages/workspace/pages/home/home?subApp=hr'
};
const session = {
  orgId: 'org-43',
  contextId: 'admin:root:org-43',
  role: 'admin'
};

assert.strictEqual(receipt.stage(item, session), true);
let consumed = receipt.take(item.targetUrl, session);
assert.strictEqual(consumed.id, item.id);
assert.strictEqual(consumed.organizationId, item.organizationId);
assert.strictEqual(consumed.targetUrl, item.targetUrl);
assert.strictEqual(consumed.contextId, session.contextId);
assert.strictEqual(consumed.role, session.role);
assert.ok(Number.isFinite(consumed.stagedAt));
assert.strictEqual(receipt.take(item.targetUrl, session), null, '导航回执只能消费一次');

assert.strictEqual(receipt.stage(item, session), true);
assert.strictEqual(receipt.take(item.targetUrl, Object.assign({}, session, {
  contextId: 'assignment:other:org-43',
  role: 'user'
})), null, '工作角色不一致时不得把通知标为已打开');

assert.strictEqual(receipt.stage(item, session), true);
receipt.clear(item.id);
assert.strictEqual(receipt.take(item.targetUrl, session), null, '导航失败必须清理回执');

assert.strictEqual(receipt.stage(item, session), true);
app.globalData.__pendingNotificationNavigationReceipt.stagedAt = Date.now() - 3 * 60 * 1000;
assert.strictEqual(receipt.take(item.targetUrl, session), null, '过期导航回执不得补记已读');

delete global.getApp;
console.log('通知导航成功回执与工作角色隔离测试通过');
