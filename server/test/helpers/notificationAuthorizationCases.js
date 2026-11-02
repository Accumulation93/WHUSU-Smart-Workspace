'use strict';

const assert = require('node:assert/strict');

module.exports = async function notificationAuthorizationCases(db) {
  const model = require('../../src/modules/audit/models/notification');
  const { orgStorage } = require('../../src/utils/orgContext');
  const actor = { type: 'user', id: 'dir-hr', personId: 'dir-person', contextId: 'dir-context' };
  const options = { authorizationReference: { accountId: 'dir-account', personId: 'dir-person', sessionId: 'dir-session', contextId: 'dir-context', organizationId: 'dir-auth' } };
  const policy = { id: 'notice-deny', organizationId: 'dir-auth', effect: 'deny', enabled: true,
    subjects: [{ kind: 'assignments', ids: ['dir-assignment'] }], capabilities: ['notifications.items.read', 'notifications.items.delete'],
    scopes: [{ kind: 'records', ids: ['notice-a'] }], fields: null };
  await orgStorage.run('dir-auth', async () => {
    await model.create('notice-a', { recipientType: 'user', recipientId: 'dir-hr', type: 'system', title: '通知甲', eventKey: 'notice-a' });
    await model.create('notice-b', { recipientType: 'user', recipientId: 'dir-hr', type: 'system', title: '通知乙', eventKey: 'notice-b' });
    await db.query("UPDATE notifications SET created_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE id='notice-b'");
    assert.equal((await model.listForRecipient(actor, { ...options, limit: 1 })).total, 2);
    await require('../../src/core/models/authorizationReferences').validateReferences(db, policy);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('notice-deny','dir-auth','通知限制',?)", [JSON.stringify(policy)]);
    const first = await model.listForRecipient(actor, { ...options, limit: 1 });
    assert.equal(first.total, 1); assert.equal(first.unreadCount, 1); assert.equal(first.items[0].id, 'notice-b');
    assert.equal((await model.markRead('notice-a', actor, options)).found, false);
    assert.equal((await model.deleteById('notice-a', actor, options)).found, false);
    const marked = await model.markAllRead(actor, options);
    assert.equal(marked.changedCount, 1);
    assert.equal((await db.query("SELECT is_read FROM notifications WHERE id='notice-a'"))[0][0].is_read, 0);
    const deleted = await model.deleteAll(actor, options);
    assert.equal(deleted.deletedCount, 1);
    await db.query("DELETE FROM authorization_rules WHERE id='notice-deny'");
    const restored = await model.listForRecipient(actor, { ...options, limit: 1 });
    assert.equal(restored.total, 1); assert.equal(restored.items[0].id, 'notice-a'); assert.equal(restored.unreadCount, 1);
    assert.equal((await model.markRead('notice-a', actor, options)).changed, true);
    assert.equal((await model.getUnreadCountForRecipient(actor, options)), 0);
    assert.equal((await model.deleteById('notice-a', actor, options)).found, true);
    assert.equal((await model.listForRecipient(actor, options)).total, 0);
    await model.create('notice-audit', { recipientType: 'user', recipientId: 'dir-hr', type: 'system', title: '申请消息',
      targetType: 'submission', targetId: 'notice-submission', eventKey: 'notice-audit' });
    // batchCreate 拒绝不存在的申请，隔离夹具直接建立历史投递行验证读取条件。
    await db.query("INSERT INTO notifications(id,org_id,recipient_type,recipient_id,type,title,target_type,target_id) VALUES ('notice-audit','dir-auth','user','dir-hr','system','申请消息','submission','notice-submission')");
    assert.equal((await model.listForRecipient(actor, options)).total, 1);
    await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES ('notice-deny','dir-auth','申请读取限制',?)", [JSON.stringify({ ...policy,
      capabilities: ['audit.submissions.read'], scopes: [{ kind: 'records', ids: ['notice-submission'] }] })]);
    assert.equal((await model.listForRecipient(actor, options)).total, 0);
    assert.equal((await model.markRead('notice-audit', actor, options)).found, false);
    await db.query("DELETE FROM authorization_rules WHERE id='notice-deny'");
    assert.equal((await model.listForRecipient(actor, options)).total, 1);
    assert.equal((await model.deleteById('notice-audit', actor, options)).found, true);
    await assert.rejects(model.listForRecipient(actor, { ...options, authorizationReference: null }), error => error.code === 'authorization_forbidden');
  });
};
