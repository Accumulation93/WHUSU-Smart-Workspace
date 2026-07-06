const express = require('express');
const router = express.Router();
const { safeString } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const notificationModel = require('../models/notification');

/**
 * Resolve hrId from the authenticated user's openid.
 * Same pattern as auditUser.js.
 */
async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] ? rows[0].hr_id : null;
}

// ─── listNotifications ───
router.post('/listNotifications', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const limit = parseInt(req.body.limit) || 20;
    const offset = parseInt(req.body.offset) || 0;
    const { items, total } = await notificationModel.listByHrId(hrId, { limit, offset });

    const result = items.map(n => ({
      id: safeString(n.id),
      type: safeString(n.type),
      title: safeString(n.title),
      description: safeString(n.description || ''),
      category: safeString(n.category),
      targetType: safeString(n.target_type || ''),
      targetId: safeString(n.target_id || ''),
      targetUrl: safeString(n.target_url || ''),
      isRead: !!n.is_read,
      createdAt: n.created_at
    }));

    res.json({ status: 'success', items: result, total });
  } catch (e) {
    console.error('[notification:list] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── getNotificationUnreadCount ───
router.post('/getNotificationUnreadCount', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const count = await notificationModel.getUnreadCount(hrId);
    res.json({ status: 'success', count });
  } catch (e) {
    console.error('[notification:unreadCount] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── markNotificationRead ───
router.post('/markNotificationRead', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const notificationId = safeString(req.body.notificationId);
    if (!notificationId) return res.json({ status: 'invalid_params', message: '缺少通知ID' });

    await notificationModel.markRead(notificationId, hrId);
    res.json({ status: 'success' });
  } catch (e) {
    console.error('[notification:markRead] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── markAllNotificationsRead ───
router.post('/markAllNotificationsRead', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    await notificationModel.markAllRead(hrId);
    res.json({ status: 'success' });
  } catch (e) {
    console.error('[notification:markAllRead] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
