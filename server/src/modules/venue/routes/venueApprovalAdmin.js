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
const venueBookingPolicyModel = require('../models/venueBookingPolicy');
const { normalizeBookingWindow } = require('../services/venueBookingWindow');
const venueBookingModel = require('../models/venueBooking');
const venueBookingRuleModel = require('../models/venueBookingRule');
const { createVenueApprovalNotifications, createVenueBookingStatusNotification } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');
const { normalizeRule, normalizeFlowSteps } = require('../utils/approvalFlowValidation');
const {
  authorizeCurrentVenueApproval
} = require('../services/venueApprovalAuthorization');
const venueApprovalMultiFlow = require('../services/venueApprovalMultiFlow');

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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });

    const flow = await flowModel.getByVenueId(venueId);
    if (!flow) return res.json({ status: 'success', flow: null, steps: [] });

    const steps = await stepModel.getByFlowId(flow.id);
    res.json({ status: 'success', flow, steps });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// listVenueApprovalFlows — 返回场地全部审批流（含步骤与规则）
router.post('/listVenueApprovalFlows', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
    const flows = await flowModel.listByVenueId(venueId);
    const result = [];
    for (const flow of flows) {
      const steps = await stepModel.getByFlowId(flow.id);
      result.push(Object.assign({}, flow, { steps }));
    }
    res.json({ status: 'success', flows: result });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueApprovalFlowMeta — 创建/更新审批流元信息（名称与三个开关）
router.post('/saveVenueApprovalFlowMeta', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    const flowId = safeString(req.body.flowId);
    const name = safeString(req.body.name) || '场地审批流程';
    const allowUserSelect = req.body.allowUserSelect === true || req.body.allowUserSelect === 'true' || req.body.allowUserSelect === 1;
    const allowDesignateFirst = req.body.allowDesignateFirst === true || req.body.allowDesignateFirst === 'true' || req.body.allowDesignateFirst === 1;
    const allowDesignateNext = req.body.allowDesignateNext === true || req.body.allowDesignateNext === 'true' || req.body.allowDesignateNext === 1;
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });

    let flow = null;
    if (flowId) {
      flow = await flowModel.getById(flowId);
      if (flow && flow.venue_id !== venueId) {
        return res.json({ status: 'invalid_params', message: '请刷新审批流程后重试' });
      }
    }
    if (flow) {
      await flowModel.update(flow.id, { name, allowUserSelect, allowDesignateFirst, allowDesignateNext });
    } else {
      flow = { id: generateId() };
      await flowModel.create(flow.id, {
        venueId,
        name,
        allowUserSelect,
        allowDesignateFirst,
        allowDesignateNext
      });
    }
    res.json({ status: 'success', flowId: flow.id, message: '审批流程已保存' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueApprovalFlow — create or update a flow (upsert)
router.post('/saveVenueApprovalFlow', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    const name = safeString(req.body.name);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });

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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    const flowId = safeString(req.body.flowId);
    if (!venueId && !flowId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
    const flow = flowId
      ? await flowModel.getById(flowId)
      : await flowModel.getByVenueId(venueId);
    if (!flow) return res.json({ status: 'not_found', message: '请刷新审批设置后重试' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const flowId = safeString(req.body.flowId);
    const name = safeString(req.body.name);
    const sortOrder = parseInt(req.body.sortOrder) || 1;
    const approvalMode = safeString(req.body.approvalMode) === 'admin_any' ? 'admin_any' : 'hr_rule';
    if (!flowId) return res.json({ status: 'invalid_params', message: '请重新打开审批设置' });

    const id = safeString(req.body.id) || generateId();
    const flow = await flowModel.getById(flowId);
    if (!flow) return res.json({ status: 'not_found', message: '请刷新审批设置后重试' });
    const existing = await stepModel.getById(id);
    if (existing) {
      if (existing.flow_id !== flowId) return res.json({ status: 'invalid_params', message: '请刷新审批设置后重试' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const venueId = safeString(req.body.venueId);
    const flowName = safeString(req.body.flowName) || '场地审批流程';
    const flowIdParam = safeString(req.body.flowId);
    const allowUserSelect = req.body.allowUserSelect === true || req.body.allowUserSelect === 'true' || req.body.allowUserSelect === 1;
    const allowDesignateFirst = req.body.allowDesignateFirst === true || req.body.allowDesignateFirst === 'true' || req.body.allowDesignateFirst === 1;
    const allowDesignateNext = req.body.allowDesignateNext === true || req.body.allowDesignateNext === 'true' || req.body.allowDesignateNext === 1;
    const stepsData = normalizeFlowSteps(req.body.steps);

    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });

    await conn.beginTransaction();

    // Clean up conflicting 'direct' booking rules when saving a flow
    // (user is explicitly choosing flow-based approval over direct)
    const bookingRules = await venueBookingRuleModel.getByVenueId(venueId);
    for (const rule of bookingRules) {
      if (rule.rule_type === 'direct') {
        await venueBookingRuleModel.remove(rule.id, conn);
      }
    }

    // Upsert flow（多流程：flowId 优先，无 flowId 时兼容旧的单流程场地）
    let flow = null;
    if (flowIdParam) {
      flow = await flowModel.getById(flowIdParam);
      if (flow && flow.venue_id !== venueId) {
        await conn.rollback();
        return res.json({ status: 'invalid_params', message: '请刷新审批流程后重试' });
      }
    }
    if (!flow) flow = await flowModel.getByVenueId(venueId);
    if (flow) {
      await flowModel.update(flow.id, {
        name: flowName,
        allowUserSelect,
        allowDesignateFirst,
        allowDesignateNext
      }, conn);
    } else {
      flow = { id: generateId() };
      await flowModel.create(flow.id, {
        venueId,
        name: flowName,
        allowUserSelect,
        allowDesignateFirst,
        allowDesignateNext
      }, conn);
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

    if (req.body.bookingWindow !== undefined) {
      const currentPolicy = await venueBookingPolicyModel.getByVenueId(venueId);
      const bookingWindow = normalizeBookingWindow(Object.assign({}, req.body.bookingWindow, {
        id: currentPolicy ? currentPolicy.id : generateId()
      }));
      await venueBookingPolicyModel.upsert(venueId, bookingWindow, conn);
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择审批步骤' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const stepId = safeString(req.body.stepId);
    if (!stepId) return res.json({ status: 'invalid_params', message: '请重新选择审批步骤' });
    const step = await stepModel.getById(stepId);
    if (!step) return res.json({ status: 'not_found', message: '请刷新审批步骤后重试' });

    const id = safeString(req.body.id) || generateId();
    const normalized = normalizeRule(req.body);
    const data = {
      stepId,
      sortOrder: parseInt(req.body.sortOrder) || 1,
      ...normalized
    };

    const existing = await ruleModel.getById(id);
    if (existing) {
      if (existing.step_id !== stepId) return res.json({ status: 'invalid_params', message: '请刷新审批步骤后重试' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择审批规则' });
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
    if (!id) return res.json({ status: 'invalid_params', message: '请重新打开借用记录' });
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
      return res.json({ status: 'not_found', message: '请刷新借用记录' });
    }
    if (booking.status !== 'pending') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该借用已处理', bookingStatus: booking.status, idempotent: true });
    }
    if ((!booking.approval_flow_id && !booking.approval_flow_state_json) || Number(booking.approval_total_steps) <= 0) {
      await conn.rollback();
      return res.json({ status: 'invalid_state', message: '请联系管理员补充审批设置' });
    }

    const nextDesignation = req.body.nextApproverHrId
      ? { hrId: safeString(req.body.nextApproverHrId) }
      : null;
    let prepared;
    try {
      prepared = await venueApprovalMultiFlow.prepareApproval(
        booking,
        actor,
        comment,
        nextDesignation,
        orgId
      );
    } catch (e) {
      await conn.rollback();
      return res.json({ status: 'invalid_params', message: safeString(e.message) || '请重新选择审批人' });
    }
    if (!prepared.ok) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: prepared.reason });
    }
    const completed = Boolean(prepared.completed);
    const snapshots = prepared.snapshots;
    const state = prepared.state;
    const totalSteps = prepared.totalSteps;

    // Check time conflict + adjust time_start based on approval time (only for final approval)
    if (completed) {
      const approvedAt = new Date();
      const bookingTimeEnd = new Date(booking.time_end);

      // If approved after booking end, cancel instead
      if (approvedAt > bookingTimeEnd) {
        await venueBookingModel.updateStatus(
          id,
          'cancelled',
          approverActorId,
          '审批时借用已结束，自动取消',
          conn,
          actor
        );
        await createVenueBookingStatusNotification(
          booking, 'booking_cancelled', '场地借用已自动取消',
          '您申请的「' + (booking.title || '场地借用') + '」因借用时间已结束，已自动取消。', conn
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

    const newStatus = completed ? 'approved' : 'pending';
    const legacy = venueApprovalMultiFlow.legacyColumnsFromState(state, totalSteps, newStatus);
    await venueBookingModel.updateStatus(
      id,
      newStatus,
      actor.id,
      completed ? (comment || booking.approval_comment) : booking.approval_comment,
      conn,
      actor
    );
    await venueBookingModel.updateApprovalFlowState(id, {
      approvalFlowState: state,
      approvalFlowId: legacy.approvalFlowId,
      currentStep: legacy.currentStep,
      totalSteps: legacy.totalSteps,
      snapshotsJson: JSON.stringify(snapshots)
    }, conn);

    if (completed) {
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
    if (!completed) {
      await createVenueApprovalNotifications(id).catch(function(error) {
        console.error('[venueApprovalAdmin] notification cleanup failed:', error.message);
      });
    }

    res.json({
      status: 'success',
      message: completed ? '所有步骤审批完成，借用已通过' : '审批完成，等待下一步审批',
      approvalProgress: {
        currentStep: legacy.currentStep,
        totalSteps: totalSteps,
        isApproved: completed,
        isRejected: false
      },
      completed: completed,
      activeFlowIds: prepared.summary.activeFlowIds,
      flowSummary: prepared.summary.flowSummary,
      candidateMissing: Boolean(prepared.candidateMissing)
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
    if (!id) return res.json({ status: 'invalid_params', message: '请重新打开借用记录' });
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
      return res.json({ status: 'not_found', message: '请刷新借用记录' });
    }
    if (booking.status !== 'pending') {
      await conn.rollback();
      return res.json({ status: 'success', message: '该借用已处理', bookingStatus: booking.status, idempotent: true });
    }

    const eligibility = await venueApprovalMultiFlow.evaluateActorEligibility(booking, actor, orgId);
    if (!eligibility.ok) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: eligibility.reason });
    }
    const approverActorId = actor.id;
    const totalSteps = Number(booking.approval_total_steps) || 0;
    const rejectStepItem = eligibility.summary.flowSummary.find(function(item) { return item.active && !item.completed; });
    const rejectStep = rejectStepItem ? Number(rejectStepItem.stepIndex) : Number(booking.approval_current_step) || 0;

    // Reject: set step to -1, update status atomically within transaction
    await venueBookingModel.updateStatus(
      id,
      'rejected',
      approverActorId,
      comment || '驳回',
      conn,
      actor
    );

    // Update approval tracking (same transaction)
    const legacy = venueApprovalMultiFlow.legacyColumnsFromState(eligibility.state, totalSteps, 'rejected');
    await venueBookingModel.updateApprovalFlowState(id, {
      approvalFlowState: eligibility.state,
      approvalFlowId: legacy.approvalFlowId,
      currentStep: -1,
      totalSteps: totalSteps,
      rejectStep: rejectStep,
      snapshotsJson: JSON.stringify(venueApprovalMultiFlow.parseSnapshots(booking.approval_snapshots_json))
    }, conn);

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
