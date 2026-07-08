const express = require('express');
const router = express.Router();
const { safeString } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const submissionStepModel = require('../models/auditSubmissionStep');
const notificationModel = require('../models/notification');

/**
 * Resolve hrId from the authenticated user's openid.
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
// Unified query: audit uses real-time query (submission steps), venue uses
// persistent notifications table. Both are merged and sorted by time DESC.
router.post('/listNotifications', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    // ── Audit: real-time query from submission steps ──
    const steps = await submissionStepModel.getPendingByApprover(hrId);

    // Load submitter names for display
    const submitterIds = [...new Set(steps.map(s => s.submitted_by))];
    const hrMap = {};
    if (submitterIds.length) {
      const orgId = await getCurrentOrgId();
      const [hrRows] = await pool.query(
        'SELECT id, name FROM hr_info WHERE id IN (?) AND org_id = ?',
        [submitterIds, orgId]
      );
      for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
    }

    const auditItems = steps.map(s => ({
      type: 'pending_approval',
      title: safeString(s.title || s.submission_number),
      description: '提交人: ' + (hrMap[s.submitted_by] || '未知') + ' | 步骤 ' + s.sort_order,
      category: 'audit',
      targetType: 'submission',
      targetId: safeString(s.submission_id),
      targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + safeString(s.submission_id),
      createdAt: s.created_at
    }));

    // ── Venue: persistent notifications from notifications table ──
    const [venueRows] = await pool.query(
      'SELECT * FROM notifications WHERE hr_id = ? AND is_read = 0 AND category = ? ORDER BY created_at DESC',
      [hrId, 'venue']
    );
    const venueItems = venueRows.map(r => ({
      type: safeString(r.type),
      title: safeString(r.title),
      description: safeString(r.description),
      category: safeString(r.category || 'venue'),
      targetType: safeString(r.target_type),
      targetId: safeString(r.target_id),
      targetUrl: safeString(r.target_url),
      createdAt: r.created_at
    }));

    // ── Merge & sort by createdAt DESC ──
    const items = [...auditItems, ...venueItems].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    res.json({ status: 'success', items, total: items.length });
  } catch (e) {
    console.error('[notification:list] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── getNotificationUnreadCount ───
// Unified count: audit pending steps + venue unread notifications.
router.post('/getNotificationUnreadCount', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    // Audit: real-time pending step count
    const steps = await submissionStepModel.getPendingByApprover(hrId);
    const auditCount = steps.length;

    // Venue: unread persistent notifications count
    const [[{ count: venueCount }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE hr_id = ? AND is_read = 0',
      [hrId]
    );

    res.json({ status: 'success', count: auditCount + venueCount });
  } catch (e) {
    console.error('[notification:count] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── dismissNotification ───
// Optimistic-update sync: frontend calls this after locally removing a
// notification, to clean up the DB row in the background.
router.post('/dismissNotification', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const targetType = safeString(req.body.targetType);
    const targetId = safeString(req.body.targetId);
    if (!targetType || !targetId) {
      return res.json({ status: 'invalid_params', message: '请提供 targetType 和 targetId' });
    }

    await notificationModel.deleteByTargetAndHrId(targetType, targetId, hrId);
    res.json({ status: 'success' });
  } catch (e) {
    console.error('[notification:dismiss] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
