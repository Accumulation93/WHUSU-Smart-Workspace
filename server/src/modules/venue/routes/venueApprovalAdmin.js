const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const pool = require('../../../config/db');
const hrInfoModel = require('../../../core/models/hrInfo');
const adminInfoModel = require('../../../core/models/adminInfo');
const flowModel = require('../models/venueApprovalFlow');
const stepModel = require('../models/venueApprovalFlowStep');
const ruleModel = require('../models/venueApprovalFlowStepRule');
const venueBookingModel = require('../models/venueBooking');
const venueBookingRuleModel = require('../models/venueBookingRule');
const { createVenueApprovalNotifications, createVenueBookingStatusNotification } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

function fmtDatetime(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ═══════════════════════════════════════════════════
// Approval Flow CRUD
// ═══════════════════════════════════════════════════

// getVenueApprovalFlow — returns the active flow with all steps and rules
router.post('/getVenueApprovalFlow', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });

    const flow = await flowModel.getByVenueId(venueId);
    if (!flow) return res.json({ status: 'success', flow: null, steps: [] });

    const steps = await stepModel.getByFlowId(flow.id);
    res.json({ status: 'success', flow, steps });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueApprovalFlow — create or update a flow (upsert)
router.post('/saveVenueApprovalFlow', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venueId = safeString(req.body.venueId);
    const name = safeString(req.body.name);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });

    const existing = await flowModel.getByVenueId(venueId);
    if (existing) {
      await flowModel.update(existing.id, { name });
      return res.json({ status: 'success', id: existing.id, message: '审批流已更新' });
    } else {
      const id = generateId();
      await flowModel.create(id, { venueId, name: name || '场地审批流程' });
      return res.json({ status: 'success', id, message: '审批流已创建' });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenueApprovalFlow
router.post('/deleteVenueApprovalFlow', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const flow = await flowModel.getByVenueId(venueId);
    if (!flow) return res.json({ status: 'not_found', message: '审批流不存在' });
    await flowModel.remove(flow.id);
    res.json({ status: 'success', message: '审批流已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Approval Flow Steps CRUD
// ═══════════════════════════════════════════════════

// saveVenueApprovalStep
router.post('/saveVenueApprovalStep', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const flowId = safeString(req.body.flowId);
    const name = safeString(req.body.name);
    const sortOrder = parseInt(req.body.sortOrder) || 1;
    if (!flowId) return res.json({ status: 'invalid_params', message: '请提供流程ID' });

    const id = safeString(req.body.id) || generateId();
    // Check if step exists
    const existing = await stepModel.getById(id);
    if (existing) {
      // For existing steps, we can only update name
      // Removing and re-creating is handled by saveWholeFlow
    }
    await stepModel.create(id, { flowId, sortOrder, name });
    res.json({ status: 'success', id, message: '步骤已保存' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueApprovalWholeFlow — save the entire flow with steps and rules atomically
router.post('/saveVenueApprovalWholeFlow', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });

    const venueId = safeString(req.body.venueId);
    const flowName = safeString(req.body.flowName) || '场地审批流程';
    const stepsData = req.body.steps || []; // [{ name, sortOrder, rules: [{ deptScope, deptId, wgScope, wgId, identScope, identId }] }]

    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });

    await conn.beginTransaction();

    // Clean up conflicting 'direct' booking rules when saving a flow
    // (user is explicitly choosing flow-based approval over direct)
    const bookingRules = await venueBookingRuleModel.getByVenueId(venueId);
    for (const rule of bookingRules) {
      if (rule.rule_type === 'direct') {
        await venueBookingRuleModel.remove(rule.id, conn);
      }
    }

    // Upsert flow
    let flow = await flowModel.getByVenueId(venueId);
    if (flow) {
      await flowModel.update(flow.id, { name: flowName }, conn);
    } else {
      flow = { id: generateId() };
      await flowModel.create(flow.id, { venueId, name: flowName }, conn);
    }

    // Remove old steps (CASCADE removes rules)
    await stepModel.removeByFlowId(flow.id, conn);

    // Create new steps and rules
    for (let i = 0; i < stepsData.length; i++) {
      const sd = stepsData[i];
      const stepId = generateId();
      await stepModel.create(stepId, {
        flowId: flow.id,
        sortOrder: i + 1,
        name: sd.name || ('第' + (i + 1) + '步')
      }, conn);

      const rules = sd.rules || [];
      for (let j = 0; j < rules.length; j++) {
        const rd = rules[j];
        await ruleModel.create(generateId(), {
          stepId,
          sortOrder: j + 1,
          departmentScope: rd.departmentScope || 'all',
          specificDepartmentId: rd.specificDepartmentId || null,
          workGroupScope: rd.workGroupScope || 'all',
          specificWorkGroupId: rd.specificWorkGroupId || null,
          identityScope: rd.identityScope || 'all',
          specificIdentityId: rd.specificIdentityId || null
        }, conn);
      }
    }

    await conn.commit();
    res.json({ status: 'success', flowId: flow.id, message: '审批流程已保存' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

// deleteVenueApprovalStep
router.post('/deleteVenueApprovalStep', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供步骤ID' });
    await stepModel.remove(id);
    res.json({ status: 'success', message: '步骤已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Approval Flow Step Rules CRUD
// ═══════════════════════════════════════════════════

// saveVenueApprovalStepRule
router.post('/saveVenueApprovalStepRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const stepId = safeString(req.body.stepId);
    if (!stepId) return res.json({ status: 'invalid_params', message: '请提供步骤ID' });

    const id = safeString(req.body.id) || generateId();
    const data = {
      stepId,
      sortOrder: parseInt(req.body.sortOrder) || 1,
      departmentScope: safeString(req.body.departmentScope) || 'all',
      specificDepartmentId: safeString(req.body.specificDepartmentId) || null,
      workGroupScope: safeString(req.body.workGroupScope) || 'all',
      specificWorkGroupId: safeString(req.body.specificWorkGroupId) || null,
      identityScope: safeString(req.body.identityScope) || 'all',
      specificIdentityId: safeString(req.body.specificIdentityId) || null
    };

    const existing = await ruleModel.getById(id);
    if (existing) {
      await ruleModel.update(id, data);
    } else {
      await ruleModel.create(id, data);
    }
    res.json({ status: 'success', id, message: existing ? '规则已更新' : '规则已创建' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenueApprovalStepRule
router.post('/deleteVenueApprovalStepRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供规则ID' });
    await ruleModel.remove(id);
    res.json({ status: 'success', message: '规则已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Flow-based Approval / Rejection
// ═══════════════════════════════════════════════════

/**
 * Check if a person (by hrId) can approve the current step of a booking.
 * Returns { ok: boolean, stepIndex: number, stepName: string }
 */
async function canApproveCurrentStep(booking, approverHrId) {
  if (!booking.approval_flow_id || booking.approval_total_steps <= 0) {
    return { ok: false, reason: '该借用没有配置审批流程' };
  }
  const currentStep = booking.approval_current_step;
  if (currentStep < 0) {
    return { ok: false, reason: '该借用已被驳回' };
  }
  if (currentStep >= booking.approval_total_steps) {
    return { ok: false, reason: '该借用已完成所有审批步骤' };
  }

  // Get the flow steps
  const steps = await stepModel.getByFlowId(booking.approval_flow_id);
  if (!steps.length || currentStep >= steps.length) {
    return { ok: false, reason: '审批步骤配置异常' };
  }

  const step = steps[currentStep];
  if (!step || !step.rules || !step.rules.length) {
    // No rules defined — anyone can approve (backward compat)
    return { ok: true, stepIndex: currentStep, stepName: step ? step.name : '', totalSteps: steps.length };
  }

  // Get the approver's HR info
  const approverHrInfo = await hrInfoModel.getById(approverHrId);
  if (!approverHrInfo) {
    return { ok: false, reason: '找不到审批人的人事信息' };
  }

  // Load applicant's HR info for 'same' scope matching
  let applicantHrInfo = null;
  if (booking.user_hr_id) {
    applicantHrInfo = await hrInfoModel.getById(booking.user_hr_id);
  }

  // Check if any rule matches
  const matches = ruleModel.matchesAnyRule(step.rules, approverHrInfo, applicantHrInfo);
  if (!matches) {
    return { ok: false, reason: '您不符合当前审批步骤的审批条件' };
  }

  return { ok: true, stepIndex: currentStep, stepName: step.name, totalSteps: steps.length };
}

/**
 * Build approval progress info for display
 */
function buildApprovalProgress(booking) {
  if (!booking.approval_flow_id || booking.approval_total_steps <= 0) {
    return null;
  }
  return {
    flowId: booking.approval_flow_id,
    currentStep: booking.approval_current_step,
    totalSteps: booking.approval_total_steps,
    isApproved: booking.approval_current_step >= booking.approval_total_steps,
    isRejected: booking.approval_current_step < 0,
    rejectStep: booking.approval_reject_step
  };
}

// approveVenueBookingStep — approve at the current step
router.post('/approveVenueBookingStep', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);

    // Resolve approver hrId
    const admin = await ensureAdmin(req.openid);
    const orgId = await require('../../../utils/orgContext').getCurrentOrgId();
    // Get hrId from user_info join
    const [userRows] = await pool.query('SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?', [req.openid, orgId]);
    let approverHrId = (userRows[0] && userRows[0].hr_id) || null;
    if (!approverHrId && admin && admin.student_id) {
      const [hrRows] = await pool.query('SELECT id FROM hr_info WHERE student_id = ? AND org_id = ? LIMIT 1', [admin.student_id, orgId]);
      if (hrRows[0]) approverHrId = hrRows[0].id;
    }
    if (!approverHrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.status !== 'pending') return res.json({ status: 'invalid_state', message: '当前状态不能审批' });
    if (!booking.approval_flow_id || booking.approval_total_steps <= 0) {
      return res.json({ status: 'invalid_state', message: '该借用没有配置审批流程，请使用普通审批' });
    }

    // Check if approver can approve current step
    const check = await canApproveCurrentStep(booking, approverHrId);
    if (!check.ok) {
      return res.json({ status: 'forbidden', message: check.reason });
    }

    const currentStep = check.stepIndex;
    const newStepIndex = currentStep + 1;
    const isLastStep = newStepIndex >= booking.approval_total_steps;

    await conn.beginTransaction();

    // Check time conflict + adjust time_start based on approval time (only for final approval)
    if (isLastStep) {
      const approvedAt = new Date();
      const bookingTimeEnd = new Date(booking.time_end);

      // If approved after booking end, cancel instead
      if (approvedAt > bookingTimeEnd) {
        await venueBookingModel.updateStatus(id, 'cancelled', approverHrId, '审批通过时已超过借用结束时间，自动取消', conn);
        await conn.commit();
        return res.json({ status: 'expired', message: '审批通过时已超过借用结束时间，借用已自动取消' });
      }

      // Approval within booking window - adjust start time to approval moment
      await venueBookingModel.updateTimeStart(id, fmtDatetime(approvedAt), conn);

      const timeStart = fmtDatetime(approvedAt);
      const timeEnd = fmtDatetime(new Date(booking.time_end));
      const conflict = await venueBookingModel.findConflict(booking.venue_id, timeStart, timeEnd, id, conn, true);
      if (conflict) {
        await conn.rollback();
        return res.json({ status: 'conflict', message: '该时段已被其他借用占用' });
      }
    }

    // Build approval snapshot for this step
    let snapshots = [];
    try {
      snapshots = booking.approval_snapshots_json ? JSON.parse(booking.approval_snapshots_json) : [];
    } catch (_) {}
    // Resolve approver name
    let approverName = '';
    try {
      const approverHrInfo = await hrInfoModel.getById(approverHrId);
      approverName = approverHrInfo ? (approverHrInfo.name || '') : '';
    } catch (_) {}

    snapshots.push({
      stepIndex: currentStep,
      stepName: check.stepName,
      approverHrId,
      approverName,
      comment: comment || '',
      approvedAt: fmtDatetime(new Date())
    });

    // Update booking
    const newStatus = isLastStep ? 'approved' : 'pending';
    const sql = `UPDATE venue_bookings
      SET approval_current_step = ?, approval_snapshots_json = ?, status = ?, approver_hr_id = ?, approval_comment = ?
      WHERE id = ? AND org_id = ?`;
    await conn.query(sql, [
      newStepIndex,
      JSON.stringify(snapshots),
      newStatus,
      isLastStep ? approverHrId : booking.approver_hr_id,
      isLastStep ? (comment || booking.approval_comment) : booking.approval_comment,
      id, booking.org_id || orgId
    ]);

    await conn.commit();

    // Clear old pending_approval notifications for this booking
    notificationModel.markReadByTarget('booking', id).catch(e => console.error('[venueApproval] cleanup failed:', e.message));

    // Fire-and-forget: create notifications for next step or submitter
    if (isLastStep) {
      const venueName = booking.venue_name || '';
      createVenueBookingStatusNotification(
        booking,
        'booking_approved',
        '场地借用已通过',
        '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已审批通过'
      ).catch(e => console.error('[venueApproval] status notification failed:', e.message));
    } else {
      createVenueApprovalNotifications(id, newStepIndex).catch(e =>
        console.error('[venueApproval] approval notification failed:', e.message));
    }

    res.json({
      status: 'success',
      message: isLastStep ? '所有步骤审批完成，借用已通过' : ('步骤 ' + (currentStep + 1) + ' 审批完成，进入下一步'),
      approvalProgress: {
        currentStep: newStepIndex,
        totalSteps: booking.approval_total_steps,
        isApproved: isLastStep
      }
    });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

// rejectVenueBookingStep — reject at the current step
router.post('/rejectVenueBookingStep', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);

    const orgId = await require('../../../utils/orgContext').getCurrentOrgId();
    const [userRows] = await pool.query('SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?', [req.openid, orgId]);
    let approverHrId = (userRows[0] && userRows[0].hr_id) || null;
    if (!approverHrId) {
      const admin = await ensureAdmin(req.openid);
      if (admin && admin.student_id) {
        const [hrRows] = await pool.query('SELECT id FROM hr_info WHERE student_id = ? AND org_id = ? LIMIT 1', [admin.student_id, orgId]);
        if (hrRows[0]) approverHrId = hrRows[0].id;
      }
    }
    if (!approverHrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.status !== 'pending') return res.json({ status: 'invalid_state', message: '当前状态不能审批' });

    // Check permission
    const check = await canApproveCurrentStep(booking, approverHrId);
    if (!check.ok) {
      return res.json({ status: 'forbidden', message: check.reason });
    }

    // Reject: set step to -1
    await venueBookingModel.updateStatus(id, 'rejected', approverHrId, comment || '驳回');

    // Update approval tracking
    const setSql = `UPDATE venue_bookings
      SET approval_current_step = -1, approval_reject_step = ?, approval_comment = ?
      WHERE id = ?`;
    await pool.query(setSql, [check.stepIndex, comment || '驳回', id]);

    // Clear old pending_approval notifications for this booking
    notificationModel.markReadByTarget('booking', id).catch(e => console.error('[venueApproval] reject cleanup failed:', e.message));

    // Fire-and-forget: notify submitter of rejection
    const venueName = booking.venue_name || '';
    createVenueBookingStatusNotification(
      booking,
      'booking_rejected',
      '场地借用被驳回',
      '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已被驳回' +
        (comment ? '，原因：' + comment : '')
    ).catch(e => console.error('[venueApproval] rejection notification failed:', e.message));

    res.json({ status: 'success', message: '借用已驳回' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
module.exports.canApproveCurrentStep = canApproveCurrentStep;
module.exports.buildApprovalProgress = buildApprovalProgress;
