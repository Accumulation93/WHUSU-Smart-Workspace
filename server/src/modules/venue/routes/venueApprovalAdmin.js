const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const adminInfoModel = require('../../../core/models/adminInfo');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const flowModel = require('../models/venueApprovalFlow');
const stepModel = require('../models/venueApprovalFlowStep');
const ruleModel = require('../models/venueApprovalFlowStepRule');
const venueBookingModel = require('../models/venueBooking');
const venueBookingRuleModel = require('../models/venueBookingRule');
const { createVenueApprovalNotifications, createVenueBookingStatusNotification } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');
const { normalizeRule, normalizeFlowSteps } = require('../utils/approvalFlowValidation');
const {
  authorizeCurrentVenueApproval
} = require('../services/venueApprovalAuthorization');

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
    const approvalMode = safeString(req.body.approvalMode) === 'admin_any' ? 'admin_any' : 'hr_rule';
    if (!flowId) return res.json({ status: 'invalid_params', message: '请提供流程ID' });

    const id = safeString(req.body.id) || generateId();
    const flow = await flowModel.getById(flowId);
    if (!flow) return res.json({ status: 'not_found', message: '审批流程不存在' });
    const existing = await stepModel.getById(id);
    if (existing) {
      if (existing.flow_id !== flowId) return res.json({ status: 'invalid_params', message: '审批步骤不属于当前流程' });
      await stepModel.update(id, { sortOrder, name, approvalMode });
    } else {
      await stepModel.create(id, { flowId, sortOrder, name, approvalMode });
    }
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
    const stepsData = normalizeFlowSteps(req.body.steps);

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
      const rules = sd.rules;
      const approvalMode = sd.approvalMode;
      await stepModel.create(stepId, {
        flowId: flow.id,
        sortOrder: i + 1,
        name: sd.name || ('第' + (i + 1) + '步'),
        approvalMode
      }, conn);

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
    const step = await stepModel.getById(stepId);
    if (!step) return res.json({ status: 'not_found', message: '审批步骤不存在' });

    const id = safeString(req.body.id) || generateId();
    const normalized = normalizeRule(req.body);
    const data = {
      stepId,
      sortOrder: parseInt(req.body.sortOrder) || 1,
      ...normalized
    };

    const existing = await ruleModel.getById(id);
    if (existing) {
      if (existing.step_id !== stepId) return res.json({ status: 'invalid_params', message: '审批规则不属于当前步骤' });
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

    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok) {
      return res.json({ status: actorResult.status, message: actorResult.message });
    }
    const actor = actorResult.actor;
    const orgId = await getCurrentOrgId();

    await conn.beginTransaction();
    const booking = await venueBookingModel.getByIdForUpdate(id, conn);
    if (!booking || booking.approval_org_id !== orgId) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '借用记录不存在' });
    }
    if (booking.status !== 'pending') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该借用已处理', bookingStatus: booking.status, idempotent: true });
    }
    if (!booking.approval_flow_id || booking.approval_total_steps <= 0) {
      await conn.rollback();
      return res.json({ status: 'invalid_state', message: '该借用没有审批流程' });
    }

    // Check if approver can approve current step
    const check = await authorizeCurrentVenueApproval(booking, actor);
    if (!check.ok) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: check.reason });
    }
    const approverActorId = actor.id;

    const currentStep = check.stepIndex;
    const newStepIndex = currentStep + 1;
    const isLastStep = newStepIndex >= booking.approval_total_steps;

    // Check time conflict + adjust time_start based on approval time (only for final approval)
    if (isLastStep) {
      const approvedAt = new Date();
      const bookingTimeEnd = new Date(booking.time_end);

      // If approved after booking end, cancel instead
      if (approvedAt > bookingTimeEnd) {
        await venueBookingModel.updateStatus(id, 'cancelled', approverActorId, '审批时借用已结束，自动取消', conn);
        await createVenueBookingStatusNotification(
          booking, 'booking_cancelled', '场地借用已自动取消',
          '您申请的「' + (booking.title || '场地借用') + '」审批时已超过结束时间，系统已自动取消。', conn
        );
        await conn.commit();
        return res.json({ status: 'expired', message: '审批时借用已结束，已自动取消' });
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
    const approverName = actor.name || (actor.type === 'admin' ? '管理员' : '');

    snapshots.push({
      stepIndex: currentStep,
      stepName: check.stepName,
      approverHrId: approverActorId,
      approverName,
      comment: comment || '',
      approvedAt: fmtDatetime(new Date())
    });

    // Update booking
    const newStatus = isLastStep ? 'approved' : 'pending';
    const sql = `UPDATE venue_bookings
      SET approval_current_step = ?, approval_snapshots_json = ?, status = ?, approver_hr_id = ?, approval_comment = ?
      WHERE id = ?`;
    const [updateResult] = await conn.query(sql, [
      newStepIndex,
      JSON.stringify(snapshots),
      newStatus,
      isLastStep ? approverActorId : booking.approver_hr_id,
      isLastStep ? (comment || booking.approval_comment) : booking.approval_comment,
      id
    ]);
    if (updateResult.affectedRows !== 1) throw new Error('审批状态已变化，请刷新');

    if (isLastStep) {
      const venueName = booking.venue_name || '';
      await createVenueBookingStatusNotification(
        booking, 'booking_approved', '场地借用已通过',
        '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已审批通过', conn
      );
    }

    await conn.commit();

    // Clear old pending_approval notifications for this booking (true DELETE, not markRead)
    await notificationModel.deleteByTarget('booking', id);

    // 下一步骤待办由业务状态实时计算。
    if (!isLastStep) {
      await createVenueApprovalNotifications(id, newStepIndex);
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
  const conn = await pool.getConnection();
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);

    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok) {
      return res.json({ status: actorResult.status, message: actorResult.message });
    }
    const actor = actorResult.actor;
    const orgId = await getCurrentOrgId();

    await conn.beginTransaction();
    const booking = await venueBookingModel.getByIdForUpdate(id, conn);
    if (!booking || booking.approval_org_id !== orgId) {
      await conn.rollback();
      return res.json({ status: 'not_found', message: '借用记录不存在' });
    }
    if (booking.status !== 'pending') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该借用已处理', bookingStatus: booking.status, idempotent: true });
    }

    // Check permission
    const check = await authorizeCurrentVenueApproval(booking, actor);
    if (!check.ok) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: check.reason });
    }
    const approverActorId = actor.id;

    // Reject: set step to -1, update status atomically within transaction
    await venueBookingModel.updateStatus(id, 'rejected', approverActorId, comment || '驳回', conn);

    // Update approval tracking (same transaction)
    const setSql = `UPDATE venue_bookings
      SET approval_current_step = -1, approval_reject_step = ?, approval_comment = ?
      WHERE id = ?`;
    await conn.query(setSql, [check.stepIndex, comment || '驳回', id]);

    const venueName = booking.venue_name || '';
    await createVenueBookingStatusNotification(
      booking, 'booking_rejected', '场地借用被驳回',
      '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已被驳回' +
        (comment ? '，原因：' + comment : ''), conn
    );

    await conn.commit();

    // Clear old pending_approval notifications for this booking (true DELETE)
    await notificationModel.deleteByTarget('booking', id);

    res.json({ status: 'success', message: '借用已驳回' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

module.exports = router;
module.exports.authorizeCurrentVenueApproval = authorizeCurrentVenueApproval;
module.exports.buildApprovalProgress = buildApprovalProgress;
