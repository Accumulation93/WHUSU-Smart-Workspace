'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { readFileSync } = require('node:fs');
const path = require('node:path');

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
  for (const migration of ['20261102193000_authorization_runtime_transition.sql',
    '20261122153000_unified_identity_assignment_links.sql', '20261122170000_authorization_grant_sources.sql']) {
    await db.query(readFileSync(path.join(__dirname, '../../db/deploy', migration), 'utf8'));
  }
  await db.query("UPDATE authorization_runtime_transition SET phase='enforced', minimum_protocol=3 WHERE id=1");
  try {
    await orgStorage.run('dir-auth', async () => {
      await model.create('notice-unified', { recipientType: 'user', recipientId: 'dir-hr', type: 'system', title: '通知', eventKey: 'notice-unified' });
      assert.equal((await model.listForRecipient(actor, options)).total, 1);
      await db.query("INSERT INTO authorization_basic_role_exclusions(org_id,capability_key) VALUES ('dir-auth','notifications.items.read')");
      assert.equal((await model.listForRecipient(actor, options)).total, 0);
      assert.equal(await model.getUnreadCountForRecipient(actor, options), 0);
      assert.equal((await model.markRead('notice-unified', actor, options)).found, false);
      const explicitRule = { ...policy, id: 'notice-unified-allow', effect: 'allow', capabilities: ['notifications.items.read'],
        scopes: [{ kind: 'records', ids: ['notice-unified'] }] };
      await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?, 'dir-auth', '授权读取通知', ?)",
        [explicitRule.id, JSON.stringify(explicitRule)]);
      assert.equal((await model.listForRecipient(actor, options)).total, 1);
      await db.query("INSERT INTO authorization_grant_sources(org_id,object_kind,object_id,parent_delegation_id) VALUES ('dir-auth','rule',?,'revoked-delegation')",
        [explicitRule.id]);
      assert.equal((await model.listForRecipient(actor, options)).total, 0);
      assert.equal((await model.markRead('notice-unified', actor, options)).found, false);
      await db.query("DELETE FROM authorization_grant_sources WHERE org_id='dir-auth' AND object_id=?", [explicitRule.id]);
      await db.query("DELETE FROM authorization_rules WHERE id=?", [explicitRule.id]);
      await db.query("DELETE FROM authorization_basic_role_exclusions WHERE org_id='dir-auth'");
    });
    await db.query(`INSERT INTO audit_submissions(id,submission_number,submitted_by,submitted_assignment_id,title,status,current_step_index,org_id)
      VALUES ('notice-todo','NOTICE-TODO','dir-hr','dir-assignment','待办权限复核','in_progress',1,'dir-auth')`);
    await db.query(`INSERT INTO audit_submission_steps(id,submission_id,sort_order,action_type,step_conditions_json,org_id)
      VALUES ('notice-todo-step','notice-todo',1,'pass',?,'dir-auth')`, [JSON.stringify([{ conditionType: 'submitter' }])]);
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const reference = options.authorizationReference;
      req.authAccount = { id: reference.accountId, personId: reference.personId };
      req.authSession = { id: reference.sessionId };
      req.authContext = { ...reference, role: 'user', assignmentId: 'dir-assignment', membershipId: 'dir-membership', legacyHrId: 'dir-hr' };
      orgStorage.run(reference.organizationId, next);
    });
    app.use(require('../../src/modules/audit/routes/notification'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      async function readTodo(name) {
        const response = await fetch('http://127.0.0.1:' + server.address().port + '/' + name, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh: true })
        });
        const result = await response.json();
        assert.equal(result.status, 'success', JSON.stringify(result));
        assert.equal(result.partial, false, JSON.stringify(result));
        return result;
      }
      async function expectTodo(visible) {
        const expected = visible ? ['notice-todo'] : [];
        const list = await readTodo('listTodos');
        assert.deepEqual(list.items.map(row => row.targetId), expected);
        assert.equal(list.total, expected.length);
        assert.equal((await readTodo('getTodoCount')).count, expected.length);
      }
      await expectTodo(true);
      await db.query("INSERT INTO authorization_basic_role_exclusions(org_id,capability_key) VALUES ('dir-auth','audit.submissions.approve')");
      await expectTodo(false);
      const explicitRule = { ...policy, id: 'notice-todo-allow', effect: 'allow', capabilities: ['audit.submissions.approve'],
        scopes: [{ kind: 'records', ids: ['notice-todo'] }] };
      await db.query("INSERT INTO authorization_rules(id,org_id,name,policy_json) VALUES (?, 'dir-auth', '同岗办理待办', ?)",
        [explicitRule.id, JSON.stringify(explicitRule)]);
      await expectTodo(true);
      await db.query("INSERT INTO authorization_grant_sources(org_id,object_kind,object_id,parent_delegation_id) VALUES ('dir-auth','rule',?,'revoked-delegation')",
        [explicitRule.id]);
      await expectTodo(false);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await db.query("DELETE FROM authorization_grant_sources WHERE org_id='dir-auth' AND object_id='notice-todo-allow'");
      await db.query("DELETE FROM authorization_rules WHERE id='notice-todo-allow'");
      await db.query("DELETE FROM authorization_basic_role_exclusions WHERE org_id='dir-auth' AND capability_key='audit.submissions.approve'");
      await db.query("DELETE FROM audit_submission_steps WHERE id='notice-todo-step'");
      await db.query("DELETE FROM audit_submissions WHERE id='notice-todo'");
    }
  } finally {
    await db.query("UPDATE authorization_runtime_transition SET phase='shadow', minimum_protocol=0 WHERE id=1");
  }
};
