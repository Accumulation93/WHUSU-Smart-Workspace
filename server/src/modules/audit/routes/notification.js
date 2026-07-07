const express = require('express');
const router = express.Router();
const { safeString } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const submissionStepModel = require('../models/auditSubmissionStep');

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
// Real-time query: return submissions where the current pending step
// includes the current user as an approver. No persistent storage.
// "已处理就自动消失" — if the step advances or the submission completes,
// it naturally disappears from the results.
router.post('/listNotifications', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

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

    const items = steps.map(s => ({
      type: 'pending_approval',
      title: safeString(s.title || s.submission_number),
      description: '提交人: ' + (hrMap[s.submitted_by] || '未知') + ' | 步骤 ' + s.sort_order,
      category: 'audit',
      targetType: 'submission',
      targetId: safeString(s.submission_id),
      targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + safeString(s.submission_id),
      createdAt: s.created_at
    }));

    res.json({ status: 'success', items, total: items.length });
  } catch (e) {
    console.error('[notification:list] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── getNotificationUnreadCount ───
// Real-time pending count. No "unread" concept — just "how many
// submissions need my action right now."
router.post('/getNotificationUnreadCount', async (req, res) => {
  try {
    const openid = req.openid;
    const hrId = await resolveHrId(openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const steps = await submissionStepModel.getPendingByApprover(hrId);
    res.json({ status: 'success', count: steps.length });
  } catch (e) {
    console.error('[notification:count] error:', e);
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
