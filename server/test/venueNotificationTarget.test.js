'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const mine = '/subpackages/venue/pages/myVenueBookings/myVenueBookings';

function loadWithFixtures(relativePath, fixtures) {
  const filename = path.join(__dirname, '..', relativePath);
  const requireFromFile = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Buffer, URLSearchParams, console,
    require: name => Object.hasOwn(fixtures, name) ? fixtures[name] : requireFromFile(name)
  }, { filename });
  return module.exports;
}

function assertTarget(value, id) {
  const target = new URL(value, 'https://example.test');
  assert.equal(target.origin, 'https://example.test');
  assert.equal(target.pathname, mine);
  assert.equal(target.searchParams.get('bookingId'), id || null);
  assert.equal([...target.searchParams].length, id ? 1 : 0);
}

test('新建场地通知向持久化层提交同一条预约编号和安全跳转地址', async () => {
  const persisted = [];
  const connection = {};
  const { createVenueBookingStatusNotification } = loadWithFixtures('src/modules/venue/utils/venueNotificationHelper.js', {
    '../../audit/models/notification': {},
    '../../audit/utils/notificationHelper': {
      createNotification(input, transaction) { persisted.push({ input, transaction }); return { created: true }; }
    },
    '../services/venueAssignmentContext': { resolveBookingApplicantAssignment: async () => ({ legacyHrId: 'recipient' }) }
  });
  const booking = { id: 'booking A/?&', status: 'approved', user_hr_id: 'fallback-recipient' };
  assert.equal((await createVenueBookingStatusNotification(booking, 'booking_approved', '', '', connection)).created, true);
  assert.equal(persisted.length, 1);
  const { input, transaction } = persisted[0];
  assert.equal(transaction, connection);
  assert.equal(input.hrId, 'recipient');
  assert.equal(input.targetType, 'booking');
  assert.equal(input.targetId, booking.id);
  assertTarget(input.targetUrl, booking.id);
});

test('场地通知列表从记录编号重建新旧跳转地址，并保留授权组织和工作角色', async () => {
  const orgStorage = new (require('node:async_hooks').AsyncLocalStorage)();
  const context = { organizationId: 'org-a', organizationName: '测试组织', contextId: 'work-role',
    role: 'user', identityType: 'assignment', isCurrentContext: true, actor: { type: 'user', id: 'recipient' } };
  const rows = [
    { id: 'old', target_id: 'old booking/?&', target_url: mine },
    { id: 'new', target_id: 'new booking', target_url: 'https://untrusted.example/?bookingId=other' },
    { id: 'no-target', target_id: '', target_url: mine + '?bookingId=wrong' }
  ];
  let queried = 0;
  const router = loadWithFixtures('src/modules/audit/routes/notification.js', {
    '../../../utils/orgContext': { orgStorage },
    '../../../core/services/accessibleOrganizations': { listAccessibleActorContexts: async () => [context] },
    '../models/notification': {
      async listForRecipient(actor, options) {
        queried++;
        assert.equal(orgStorage.getStore(), context.organizationId);
        assert.equal(actor.id, context.actor.id);
        assert.equal(options.authorizationReference.contextId, context.contextId);
        return { total: rows.length, unreadCount: rows.length, items: rows.map(row => ({
          ...row, target_type: 'booking', category: 'venue', type: 'booking_approved', is_read: 0
        })) };
      }
    },
    '../services/todoService': {},
    '../services/messageCache': { load: (_scope, _kind, _query, compute) => compute() }
  });
  const handler = router.stack.find(layer => layer.route?.path === '/listNotifications').route.stack[0].handle;
  const invoke = async body => {
    let result;
    await handler({ body, authAccount: { id: 'account', personId: 'person' }, authSession: { id: 'session' },
      authContext: { personId: 'person', organizationId: context.organizationId, contextId: context.contextId, role: 'user' } },
    { json(value) { result = value; } });
    return result;
  };
  const result = await invoke({});
  assert.equal(result.status, 'success');
  assert.equal(result.items.length, rows.length);
  assert.equal(result.unreadCount, rows.length);
  for (const row of rows) {
    const notification = result.items.find(value => value.id === row.id);
    assert.equal(notification.contextId, context.contextId);
    assert.equal(notification.organizationId, context.organizationId);
    assert.equal(notification.targetType, 'booking');
    assert.equal(notification.targetId, row.target_id);
    assert.equal(notification.isRead, false);
    assertTarget(notification.targetUrl, row.target_id);
  }
  assert.equal((await invoke({ organizationId: 'org-forbidden' })).status, 'org_access_denied');
  assert.equal(queried, 1);
});
