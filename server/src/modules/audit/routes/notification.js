const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/routes/notification');
const express = require('express');
const router = express.Router();
const { safeString } = require('../../../utils/helpers');
const { getCurrentOrgId, orgStorage } = require('../../../utils/orgContext');
const { listAccessibleActorContexts } = require('../../../core/services/accessibleOrganizations');
const notificationModel = require('../models/notification');
const todoService = require('../services/todoService');
const { getAuthenticatedContext } = require('../../../core/services/authenticatedContext');
const messageCache = require('../services/messageCache');
const messageCopy = require('../../../locales/zh-CN/modules/messagePerformance');
const { getState } = require('../../../utils/requestWork');
const { referenceFromRequest } = require('../../../core/services/authorizationReference');

const AGGREGATION_CONCURRENCY = 4;

function parseLimit(value) {
  return Math.max(1, Math.min(parseInt(value, 10) || 20, 50));
}

function encodeCursor(offset) {
  return offset > 0 ? Buffer.from(String(offset)).toString('base64url') : '';
}

function encodeNotificationCursor(item) {
  if (!item || !item.createdAt || !item.id) return '';
  const time = new Date(item.createdAt);
  if (Number.isNaN(time.getTime())) return '';
  return Buffer.from(JSON.stringify({
    v: 1,
    createdAt: time.toISOString(),
    id: safeString(item.id)
  })).toString('base64url');
}

function decodeNotificationCursor(value) {
  if (!value) return null;
  if (String(value).length > 512) {
    const error = new Error('invalid_notification_cursor');
    error.code = 'INVALID_NOTIFICATION_CURSOR';
    throw error;
  }
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const id = safeString(parsed && parsed.id);
    const createdAt = safeString(parsed && parsed.createdAt);
    const time = new Date(createdAt);
    if (!parsed || parsed.v !== 1 || !id || id.length > 64 || !createdAt || Number.isNaN(time.getTime())) {
      throw new Error('invalid');
    }
    return { beforeCreatedAt: time.toISOString(), beforeId: id };
  } catch (_) {
    const error = new Error('invalid_notification_cursor');
    error.code = 'INVALID_NOTIFICATION_CURSOR';
    throw error;
  }
}

function decodeCursor(value) {
  if (!value) return 0;
  try {
    const offset = parseInt(Buffer.from(String(value), 'base64url').toString('utf8'), 10);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch (_) {
    return 0;
  }
}

function getOffset(body) {
  return decodeCursor(body.cursor) || Math.max(0, parseInt(body.offset, 10) || 0);
}

function organizationMetadata(context) {
  return {
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    isCurrentOrganization: context.isCurrentOrganization,
    contextId: context.contextId || '',
    identityId: context.authIdentityId || '',
    identityType: context.identityType || context.role || '',
    role: context.role || '',
    adminLevel: context.adminLevel || '',
    assignmentLabel: context.assignmentLabel || '',
    identityName: context.identityName || (context.role === 'admin' ? messageCopy.adminRole : messageCopy.userRole),
    identityScope: context.identityScope || 'organization',
    isCurrentContext: Boolean(context.isCurrentContext),
    _identityPriority: identityPriority(context)
  };
}

function identityPriority(context) {
  if (context.isCurrentContext) return -1;
  if (context.identityType === 'assignment') return 0;
  return context.adminLevel === 'super_admin' ? 2 : 1;
}

function withoutIdentityPriority(item) {
  const value = Object.assign({}, item);
  delete value._identityPriority;
  return value;
}

function notificationRoute(targetType, targetId, row, context) {
  switch (targetType) {
    case 'calendar': {
      if (targetId) {
        const date = new URLSearchParams(safeString(row.target_url).split('?')[1] || '').get('date');
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return '/subpackages/workspace/pages/calendarDetail/calendarDetail?id=' + encodeURIComponent(targetId) + '&date=' + date;
        }
      }
      return '/subpackages/workspace/pages/calendar/calendar';
    }
    case 'submission':
      return targetId ? '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + targetId : '';
    case 'booking':
      return '/subpackages/venue/pages/myVenueBookings/myVenueBookings' + (targetId ? '?bookingId=' + encodeURIComponent(targetId) : '');
    case 'score_activity':
    case 'result_publication':
      return '/subpackages/workspace/pages/home/home?subApp=scoring';
    case 'hr_profile':
      return context.role === 'admin' || context.actor.type === 'admin'
        ? '/subpackages/scoring/pages/admin/admin?subApp=hr&tab=hrInfo'
        : '/subpackages/workspace/pages/home/home?subApp=hr';
    case 'account':
      return '/subpackages/main/pages/portal/portal';
    case 'account_security':
      return '/subpackages/org/pages/accountSecurity/accountSecurity';
    default:
      return '';
  }
}

function mapNotification(row, context, metadata) {
  const targetId = safeString(row.target_id);
  const targetType = safeString(row.target_type);
  return Object.assign({
    id: safeString(row.id),
    type: safeString(row.type),
    displayFacts: row.displayFacts || {},
    title: safeString(row.title),
    description: safeString(row.description),
    category: safeString(row.category || 'system'),
    targetType,
    targetId,
    targetUrl: notificationRoute(targetType, targetId, row, context),
    isRead: !!row.is_read,
    createdAt: row.created_at
  }, metadata);
}

function compareNotifications(left, right) {
  const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  const leftId = String(left.id || '').toLowerCase();
  const rightId = String(right.id || '').toLowerCase();
  if (leftId === rightId) return 0;
  return rightId > leftId ? 1 : -1;
}

async function settleWithConcurrency(contexts, loader) {
  const results = new Array(contexts.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < contexts.length) {
      const index = nextIndex;
      nextIndex += 1;
      const context = contexts[index];
      try {
        const value = await orgStorage.run(
          context.organizationId,
          () => loader(context)
        );
        results[index] = { ok: true, context, value };
      } catch (error) {
        results[index] = { ok: false, context, error };
      }
    }
  }

  const workerCount = Math.min(AGGREGATION_CONCURRENCY, contexts.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function collectFailures(results) {
  return results
    .filter((item) => item && !item.ok)
    .map((item) => ({
      organizationId: item.context.organizationId,
      organizationName: item.context.organizationName
    }));
}

function mergeFailures() {
  const map = new Map();
  for (const list of arguments) {
    for (const item of list || []) map.set(item.organizationId, item);
  }
  return Array.from(map.values());
}

function scopeMetadata(scope, failures) {
  const organizationMap = new Map();
  scope.allContexts.forEach((context) => {
    if (!organizationMap.has(context.organizationId)) {
      organizationMap.set(context.organizationId, {
        id: context.organizationId,
        name: context.organizationName,
        isCurrentOrganization: context.isCurrentOrganization
      });
    }
  });
  return {
    organizations: Array.from(organizationMap.values()),
    selectedOrganizationId: scope.selectedOrganizationId,
    partial: failures.length > 0,
    failedOrganizations: failures
  };
}

async function resolveScope(req, body, defaultToCurrent = false) {
  if (!getAuthenticatedContext(req)) {
    return { ok: false, status: 'auth_failed', message: localeCopy.copy_c22a252e97 };
  }
  const requestedOrganizationId = safeString(body.organizationId)
    || (defaultToCurrent ? await getCurrentOrgId() : '');
  const allContexts = await listAccessibleActorContexts(req);
  const contexts = requestedOrganizationId
    ? allContexts.filter((context) => context.organizationId === requestedOrganizationId)
    : allContexts;
  if (requestedOrganizationId && !contexts.length) {
    return { ok: false, status: 'org_access_denied', message: localeCopy.copy_a805235eb4 };
  }
  if (!allContexts.length) {
    return { ok: false, status: 'forbidden', message: localeCopy.copy_10d3269bb4 };
  }
  return {
    ok: true,
    accountId: req.authAccount.id,
    authorizationReference: referenceFromRequest(req),
    allContexts,
    contexts,
    selectedOrganizationId: requestedOrganizationId
  };
}

function respondScopeError(res, scope) {
  res.json({ status: scope.status, message: scope.message });
}

async function computeTodos(scope, body) {
  const results = await settleWithConcurrency(scope.contexts, (context) =>
    todoService.listAll(context.actor, context.organizationId, {
      unsorted: true, countOnly: body.countOnly === true, authorizationReference: scope.authorizationReference
    }));
  const todoMap = new Map();
  for (const result of results) {
    if (!result.ok) continue;
    const { context, value } = result;
    const metadata = body.countOnly || !value.length ? null : organizationMetadata(context);
    for (const item of value) {
      const key = context.organizationId + '::' + item.category + '::' + item.id;
      if (body.countOnly) {
        todoMap.set(key, null);
      } else {
        const existing = todoMap.get(key);
        if (!existing || metadata._identityPriority < existing._identityPriority) {
          todoMap.set(key, Object.assign({}, item, metadata));
        }
      }
    }
  }
  const uniqueItems = body.countOnly ? [] : Array.from(todoMap.values()).sort(todoService.compareTodo);
  return {
    contentVersion: body.countOnly ? '' : messageCache.digest(uniqueItems.map(item => [item.organizationId, item.id, item.dueAt, item.createdAt])),
    expiresAt: getState()?.nextBusinessBoundary || null,
    data: {
      items: uniqueItems.map(withoutIdentityPriority),
      total: todoMap.size,
      unreadCount: 0,
      nextCursor: ''
    },
    failures: collectFailures(results)
  };
}

async function loadTodos(scope, body) {
  const snapshot = await messageCache.load(scope, 'todos', { refresh: body.refresh, countOnly: body.countOnly }, () => computeTodos(scope, body));
  if (body.countOnly) return snapshot;
  const scopeKey = messageCache.digest([scope.accountId, scope.selectedOrganizationId, scope.contexts.map(c => c.contextId || c.actor.id)]);
  const revision = messageCache.digest([snapshot.dependencyVersion || '', snapshot.contentVersion]);
  let offset = getOffset(body);
  if (body.cursor) {
    if (String(body.cursor).length > 512) throw Object.assign(new Error('INVALID_TODO_CURSOR'), { code: 'INVALID_TODO_CURSOR' });
    const raw = Buffer.from(String(body.cursor), 'base64url').toString();
    if (raw.startsWith('{')) {
      let cursor;
      try { cursor = JSON.parse(raw); } catch (_) { throw Object.assign(new Error('INVALID_TODO_CURSOR'), { code: 'INVALID_TODO_CURSOR' }); }
      if (cursor.v !== 2 || cursor.scope !== scopeKey || cursor.revision !== revision || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
        throw Object.assign(new Error('TODO_CURSOR_STALE'), { code: 'TODO_CURSOR_STALE' });
      }
      offset = cursor.offset;
    }
  }
  const limit = parseLimit(body.limit);
  const items = snapshot.data.items.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    data: Object.assign({}, snapshot.data, { items, nextCursor: nextOffset < snapshot.data.total
      ? Buffer.from(JSON.stringify({ v: 2, scope: scopeKey, revision, offset: nextOffset })).toString('base64url') : '' }),
    failures: snapshot.failures
  };
}

function recipientContexts(contexts) {
  const recipients = new Map();
  for (const context of contexts) {
    const key = JSON.stringify([context.organizationId, context.actor.type, context.actor.id]);
    const previous = recipients.get(key);
    if (!previous || identityPriority(context) < identityPriority(previous)) recipients.set(key, context);
  }
  return Array.from(recipients.values());
}

async function computeNotifications(scope, body) {
  const limit = parseLimit(body.limit);
  const boundary = decodeNotificationCursor(body.cursor);
  const fetchLimit = limit + 1;
  const results = await settleWithConcurrency(recipientContexts(scope.contexts), async (context) => {
    const result = await notificationModel.listForRecipient(context.actor, {
      limit: fetchLimit,
      maxLimit: fetchLimit,
      authorizationReference: scope.authorizationReference,
      beforeCreatedAt: boundary && boundary.beforeCreatedAt,
      beforeId: boundary && boundary.beforeId,
      countOnly: body.countOnly === true
    });
    const metadata = result.items.length ? organizationMetadata(context) : null;
    return {
      items: result.items.map((row) => mapNotification(row, context, metadata)),
      total: result.total,
      unreadCount: result.unreadCount,
      expiresAt: result.expiresAt
    };
  });
  const notificationMap = new Map();
  let total = 0;
  let unreadCount = 0;
  let expiresAt = Infinity;
  // recipientContexts 已按组织、角色类型与收件人去重，每条成功结果可直接计入。
  for (const result of results) {
    if (!result.ok) continue;
    const value = result.value;
    total += Number(value.total || 0);
    unreadCount += Number(value.unreadCount || 0);
    expiresAt = Math.min(expiresAt, value.expiresAt || Infinity);
    for (const item of value.items) {
      const key = item.organizationId + '::' + item.id;
      const existing = notificationMap.get(key);
      if (!existing || item._identityPriority < existing._identityPriority) {
        notificationMap.set(key, item);
      }
    }
  }
  const allItems = Array.from(notificationMap.values()).sort(compareNotifications);
  const items = allItems.slice(0, limit).map(withoutIdentityPriority);
  return {
    expiresAt,
    data: {
      items,
      total,
      unreadCount,
      nextCursor: allItems.length > limit && items.length
        ? encodeNotificationCursor(items[items.length - 1])
        : ''
    },
    failures: collectFailures(results)
  };
}

function loadNotifications(scope, body) {
  return messageCache.load(scope, 'notifications', body, () => computeNotifications(scope, body));
}

router.post('/getMessageOverview', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {});
    if (!scope.ok) return respondScopeError(res, scope);
    const limit = parseLimit(req.body.limit || 10);
    const [todos, notifications] = await Promise.all([
      loadTodos(scope, { limit, refresh: req.body.refresh }),
      loadNotifications(scope, { limit, refresh: req.body.refresh })
    ]);
    const failures = mergeFailures(todos.failures, notifications.failures);
    res.json(Object.assign(
      { status: 'success', todos: todos.data, notifications: notifications.data },
      scopeMetadata(scope, failures)
    ));
  } catch (error) {
    console.error('[message:overview] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_e52119b17e });
  }
});

router.post('/listTodos', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {});
    if (!scope.ok) return respondScopeError(res, scope);
    const result = await loadTodos(scope, req.body || {});
    res.json(Object.assign(
      { status: 'success' },
      result.data,
      scopeMetadata(scope, result.failures)
    ));
  } catch (error) {
    console.error('[todo:list] failed:', error);
    if (error.code === 'TODO_CURSOR_STALE' || error.code === 'INVALID_TODO_CURSOR') {
      return res.json({ status: 'cursor_expired', message: messageCopy.cursorExpired });
    }
    res.json({ status: 'error', message: localeCopy.copy_e52119b17e });
  }
});

router.post('/getTodoCount', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {});
    if (!scope.ok) return respondScopeError(res, scope);
    const result = await loadTodos(scope, { countOnly: true, refresh: req.body.refresh });
    res.json(Object.assign(
      { status: 'success', count: result.data.total },
      scopeMetadata(scope, result.failures)
    ));
  } catch (error) {
    console.error('[todo:count] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_e52119b17e });
  }
});

router.post('/listNotifications', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {});
    if (!scope.ok) return respondScopeError(res, scope);
    const result = await loadNotifications(scope, req.body || {});
    res.json(Object.assign(
      { status: 'success' },
      result.data,
      scopeMetadata(scope, result.failures)
    ));
  } catch (error) {
    if (error.code === 'INVALID_NOTIFICATION_CURSOR') {
      return res.json({
        status: 'invalid_params',
        message: localeCopy.copy_3d25d623ad
      });
    }
    console.error('[notification:list] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_e52119b17e });
  }
});

router.post('/getNotificationUnreadCount', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {});
    if (!scope.ok) return respondScopeError(res, scope);
    const result = await loadNotifications(scope, { countOnly: true, refresh: req.body.refresh });
    res.json(Object.assign(
      { status: 'success', count: result.data.unreadCount },
      scopeMetadata(scope, result.failures)
    ));
  } catch (error) {
    console.error('[notification:count] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_e52119b17e });
  }
});

router.post('/markNotificationRead', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_3d25d623ad });
    const scope = await resolveScope(req, req.body || {}, true);
    if (!scope.ok) return respondScopeError(res, scope);
    const attempts = await settleWithConcurrency(scope.contexts, (context) => notificationModel.markRead(id, context.actor, { authorizationReference: scope.authorizationReference }));
    const result = attempts.filter((item) => item.ok).map((item) => item.value).find((item) => item.found)
      || { found: false };
    const failures = collectFailures(attempts);
    if (!result.found && failures.length) {
      return res.json(Object.assign(
        { status: 'error', message: localeCopy.copy_6c3f2c0f17 },
        scopeMetadata(scope, failures)
      ));
    }
    if (!result.found) return res.json({ status: 'not_found', message: localeCopy.copy_3d25d623ad });
    res.json({ status: 'success', changed: result.changed, unreadCount: result.unreadCount });
  } catch (error) {
    console.error('[notification:markRead] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_6c3f2c0f17 });
  }
});

router.post('/markAllNotificationsRead', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {}, false);
    if (!scope.ok) return respondScopeError(res, scope);
    const results = await settleWithConcurrency(
      recipientContexts(scope.contexts),
      (context) => notificationModel.markAllRead(context.actor, { authorizationReference: scope.authorizationReference })
    );
    const failures = collectFailures(results);
    const changedCount = results
      .filter((item) => item.ok)
      .reduce((sum, item) => sum + Number(item.value.changedCount || 0), 0);
    res.json(Object.assign(
      { status: 'success', changedCount, unreadCount: results.filter(item => item.ok).reduce((sum, item) => sum + Number(item.value.unreadCount || 0), 0) },
      scopeMetadata(scope, failures)
    ));
  } catch (error) {
    console.error('[notification:markAllRead] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_6c3f2c0f17 });
  }
});

router.post('/deleteAllNotifications', async (req, res) => {
  try {
    const scope = await resolveScope(req, req.body || {}, false);
    if (!scope.ok) return respondScopeError(res, scope);
    const results = await settleWithConcurrency(
      recipientContexts(scope.contexts),
      (context) => notificationModel.deleteAll(context.actor, { authorizationReference: scope.authorizationReference })
    );
    const failures = collectFailures(results);
    const deletedCount = results
      .filter((item) => item.ok)
      .reduce((sum, item) => sum + Number(item.value.deletedCount || 0), 0);
    res.json(Object.assign(
      { status: 'success', deletedCount, unreadCount: results.filter(item => item.ok).reduce((sum, item) => sum + Number(item.value.unreadCount || 0), 0) },
      scopeMetadata(scope, failures)
    ));
  } catch (error) {
    console.error('[notification:deleteAll] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_d696cb9250 });
  }
});

router.post('/deleteNotification', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_3d25d623ad });
    const scope = await resolveScope(req, req.body || {}, true);
    if (!scope.ok) return respondScopeError(res, scope);
    const attempts = await settleWithConcurrency(scope.contexts, (context) => notificationModel.deleteById(id, context.actor, { authorizationReference: scope.authorizationReference }));
    const result = attempts.filter((item) => item.ok).map((item) => item.value).find((item) => item.found)
      || { found: false };
    const failures = collectFailures(attempts);
    if (!result.found && failures.length) {
      return res.json(Object.assign(
        { status: 'error', message: localeCopy.copy_076bb5d383 },
        scopeMetadata(scope, failures)
      ));
    }
    if (!result.found) return res.json({ status: 'not_found', message: localeCopy.copy_3d25d623ad });
    res.json({ status: 'success', unreadCount: result.unreadCount });
  } catch (error) {
    console.error('[notification:delete] failed:', error);
    res.json({ status: 'error', message: localeCopy.copy_076bb5d383 });
  }
});

module.exports = router;
