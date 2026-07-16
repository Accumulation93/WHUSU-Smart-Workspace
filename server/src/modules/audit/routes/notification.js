const express = require('express');
const router = express.Router();
const { safeString } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const notificationModel = require('../models/notification');
const todoService = require('../services/todoService');

function parseLimit(value) {
  return Math.max(1, Math.min(parseInt(value, 10) || 20, 50));
}

function encodeCursor(offset) {
  return offset > 0 ? Buffer.from(String(offset)).toString('base64url') : '';
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

function mapNotification(row) {
  const targetId = safeString(row.target_id);
  const routes = {
    submission: targetId ? '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + targetId : '',
    booking: '/subpackages/venue/pages/myVenueBookings/myVenueBookings',
    score_activity: '/pages/home/home?subApp=scoring',
    result_publication: '/pages/home/home?subApp=scoring',
    hr_profile: '/pages/home/home?subApp=hr',
    account: '/pages/portal/portal'
  };
  return {
    id: safeString(row.id),
    type: safeString(row.type),
    title: safeString(row.title),
    description: safeString(row.description),
    category: safeString(row.category || 'system'),
    targetType: safeString(row.target_type),
    targetId,
    targetUrl: routes[safeString(row.target_type)] || '',
    isRead: !!row.is_read,
    createdAt: row.created_at
  };
}

async function requireActor(req, res) {
  const result = await resolveCurrentActor(req);
  if (!result.ok) {
    res.json({ status: result.status, message: result.message });
    return null;
  }
  return result.actor;
}

async function loadTodos(actor, body) {
  const orgId = await getCurrentOrgId();
  const allItems = await todoService.listAll(actor, orgId);
  const limit = parseLimit(body.limit);
  const offset = decodeCursor(body.cursor) || Math.max(0, parseInt(body.offset, 10) || 0);
  const items = allItems.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    total: allItems.length,
    unreadCount: 0,
    nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : ''
  };
}

async function loadNotifications(actor, body) {
  const limit = parseLimit(body.limit);
  const offset = decodeCursor(body.cursor) || Math.max(0, parseInt(body.offset, 10) || 0);
  const result = await notificationModel.listForRecipient(actor, { limit, offset });
  const nextOffset = offset + result.items.length;
  return {
    items: result.items.map(mapNotification),
    total: result.total,
    unreadCount: result.unreadCount,
    nextCursor: nextOffset < result.total ? encodeCursor(nextOffset) : ''
  };
}

router.post('/getMessageOverview', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const limit = parseLimit(req.body.limit || 10);
    const [todos, notifications] = await Promise.all([
      loadTodos(actor, { limit }),
      loadNotifications(actor, { limit })
    ]);
    res.json({ status: 'success', todos, notifications });
  } catch (error) {
    console.error('[message:overview] failed:', error);
    res.json({ status: 'error', message: '消息加载失败，请稍后重试' });
  }
});

router.post('/listTodos', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    res.json(Object.assign({ status: 'success' }, await loadTodos(actor, req.body || {})));
  } catch (error) {
    console.error('[todo:list] failed:', error);
    res.json({ status: 'error', message: '待办加载失败，请稍后重试' });
  }
});

router.post('/getTodoCount', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const result = await loadTodos(actor, { limit: 1 });
    res.json({ status: 'success', count: result.total });
  } catch (error) {
    console.error('[todo:count] failed:', error);
    res.json({ status: 'error', message: '待办数量加载失败' });
  }
});

router.post('/listNotifications', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    res.json(Object.assign({ status: 'success' }, await loadNotifications(actor, req.body || {})));
  } catch (error) {
    console.error('[notification:list] failed:', error);
    res.json({ status: 'error', message: '通知加载失败，请稍后重试' });
  }
});

router.post('/getNotificationUnreadCount', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const count = await notificationModel.getUnreadCountForRecipient(actor);
    res.json({ status: 'success', count });
  } catch (error) {
    console.error('[notification:count] failed:', error);
    res.json({ status: 'error', message: '未读数量加载失败' });
  }
});

router.post('/markNotificationRead', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '缺少通知标识' });
    const result = await notificationModel.markRead(id, actor);
    if (!result.found) return res.json({ status: 'not_found', message: '通知不存在或已失效' });
    res.json({ status: 'success', changed: result.changed, unreadCount: result.unreadCount });
  } catch (error) {
    console.error('[notification:markRead] failed:', error);
    res.json({ status: 'error', message: '通知销记失败，请稍后重试' });
  }
});

router.post('/markAllNotificationsRead', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const result = await notificationModel.markAllRead(actor);
    res.json({ status: 'success', changedCount: result.changedCount, unreadCount: 0 });
  } catch (error) {
    console.error('[notification:markAllRead] failed:', error);
    res.json({ status: 'error', message: '全部销记失败，请稍后重试' });
  }
});

router.post('/deleteNotification', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '缺少通知标识' });
    const result = await notificationModel.deleteById(id, actor);
    if (!result.found) return res.json({ status: 'not_found', message: '通知不存在或已删除' });
    res.json({ status: 'success', unreadCount: result.unreadCount });
  } catch (error) {
    console.error('[notification:delete] failed:', error);
    res.json({ status: 'error', message: '通知删除失败，请稍后重试' });
  }
});

module.exports = router;
