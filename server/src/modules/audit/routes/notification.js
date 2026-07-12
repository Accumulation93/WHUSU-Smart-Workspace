const express = require('express');
const router = express.Router();
const { safeString } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const submissionStepModel = require('../models/auditSubmissionStep');
const notificationModel = require('../models/notification');
const hrInfoModel = require('../../../core/models/hrInfo');
const venueApprovalFlowStepRuleModel = require('../../venue/models/venueApprovalFlowStepRule');

async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] ? rows[0].hr_id : null;
}

async function listPendingVenueTodoItems(hrId, orgId) {
  const approverHrInfo = await hrInfoModel.getById(hrId);
  if (!approverHrInfo) return [];

  const [bookings] = await pool.query(
    `SELECT b.*, v.name AS venue_name, v.location AS venue_location
     FROM venue_bookings b
     JOIN venues v ON v.id = b.venue_id
     WHERE b.status = 'pending'
       AND b.approval_flow_id IS NOT NULL
       AND b.approval_total_steps > 0
     ORDER BY b.created_at DESC`
  );
  if (!bookings.length) return [];

  const applicantHrIds = [...new Set(bookings.map(b => b.user_hr_id).filter(Boolean))];
  const applicantMap = {};
  if (applicantHrIds.length) {
    const hrList = await hrInfoModel.getByIds(applicantHrIds);
    (hrList || []).forEach(h => { applicantMap[h.id] = h; });
  }

  const items = [];
  for (const booking of bookings) {
    const currentStep = booking.approval_current_step;
    if (currentStep < 0 || currentStep >= booking.approval_total_steps) continue;

    const [flowSteps] = await pool.query(
      'SELECT * FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
      [booking.approval_flow_id, orgId]
    );
    if (!flowSteps.length || currentStep >= flowSteps.length) continue;

    const step = flowSteps[currentStep];
    if (!step) continue;

    const [stepRules] = await pool.query(
      'SELECT * FROM venue_approval_flow_step_rules WHERE step_id = ? AND org_id = ? ORDER BY sort_order',
      [step.id, orgId]
    );

    const applicantHrInfo = applicantMap[booking.user_hr_id] || null;
    const canApprove = !stepRules.length || venueApprovalFlowStepRuleModel.matchesAnyRule(
      stepRules,
      approverHrInfo,
      applicantHrInfo
    );
    if (!canApprove) continue;

    const venueName = safeString(booking.venue_name || '');
    const applicantName = safeString((applicantHrInfo && applicantHrInfo.name) || booking.user_hr_id || '');
    items.push({
      type: 'todo',
      sourceType: 'venue_approval',
      title: safeString(booking.title || '场地借用'),
      description: '场地' + (venueName ? '：' + venueName : '') + ' | 提交人 ' + (applicantName || '未知') + ' | ' + safeString(step.name || ('第' + (currentStep + 1) + '步')),
      category: 'venue',
      targetType: 'booking',
      targetId: safeString(booking.id),
      targetUrl: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals',
      createdAt: booking.created_at
    });
  }

  return items;
}

async function listAuditTodoItems(hrId, orgId) {
  const steps = await submissionStepModel.getPendingByApprover(hrId);
  const submitterIds = [...new Set(steps.map(s => s.submitted_by).filter(Boolean))];
  const hrMap = {};
  if (submitterIds.length) {
    const [hrRows] = await pool.query(
      'SELECT id, name FROM hr_info WHERE id IN (?) AND org_id = ?',
      [submitterIds, orgId]
    );
    for (const hr of hrRows) hrMap[hr.id] = safeString(hr.name);
  }

  return steps.map(s => ({
    type: 'todo',
    sourceType: 'audit_approval',
    title: safeString(s.title || s.submission_number),
    description: '提交人 ' + (hrMap[s.submitted_by] || '未知') + ' | 步骤 ' + safeString(s.sort_order),
    category: 'audit',
    targetType: 'submission',
    targetId: safeString(s.submission_id),
    targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + safeString(s.submission_id),
    createdAt: s.created_at
  }));
}

async function listTodoItems(hrId, orgId) {
  const [auditItems, venueItems] = await Promise.all([
    listAuditTodoItems(hrId, orgId),
    listPendingVenueTodoItems(hrId, orgId)
  ]);
  return [...auditItems, ...venueItems].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

router.post('/listTodos', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const limit = Math.max(1, Math.min(parseInt(req.body.limit, 10) || 20, 50));
    const orgId = await getCurrentOrgId();
    const items = await listTodoItems(hrId, orgId);
    res.json({ status: 'success', items: items.slice(0, limit), total: items.length });
  } catch (e) {
    console.error('[todo:list] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/getTodoCount', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const orgId = await getCurrentOrgId();
    const items = await listTodoItems(hrId, orgId);
    res.json({ status: 'success', count: items.length });
  } catch (e) {
    console.error('[todo:count] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/listNotifications', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const limit = Math.max(1, Math.min(parseInt(req.body.limit, 10) || 20, 50));
    const offset = Math.max(0, parseInt(req.body.offset, 10) || 0);
    await notificationModel.cleanupOld(14);

    const [rows] = await pool.query(
      `SELECT *
       FROM notifications
       WHERE hr_id = ?
         AND type <> ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [hrId, 'pending_approval', limit, offset]
    );

    const items = rows.map(r => ({
      id: safeString(r.id),
      type: safeString(r.type),
      title: safeString(r.title),
      description: safeString(r.description),
      category: safeString(r.category || 'system'),
      targetType: safeString(r.target_type),
      targetId: safeString(r.target_id),
      targetUrl: safeString(r.target_url),
      isRead: !!r.is_read,
      createdAt: r.created_at
    }));

    res.json({ status: 'success', items, total: items.length });
  } catch (e) {
    console.error('[notification:list] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/getNotificationUnreadCount', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    await notificationModel.cleanupOld(14);
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE hr_id = ? AND is_read = 0 AND type <> ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)`,
      [hrId, 'pending_approval']
    );
    res.json({ status: 'success', count });
  } catch (e) {
    console.error('[notification:count] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/markNotificationRead', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供通知ID' });
    await notificationModel.markRead(id, hrId);
    res.json({ status: 'success' });
  } catch (e) {
    console.error('[notification:markRead] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/deleteNotification', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供通知ID' });
    await notificationModel.deleteById(id, hrId);
    res.json({ status: 'success' });
  } catch (e) {
    console.error('[notification:delete] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/dismissNotification', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
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
