const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const adminInfoModel = require('../../../core/models/adminInfo');
const hrInfoModel = require('../../../core/models/hrInfo');
const venueModel = require('../models/venue');
const venueOpenRuleModel = require('../models/venueOpenRule');
const venueActivityRuleModel = require('../models/venueActivityRule');
const venueBookingRuleModel = require('../models/venueBookingRule');
const venueBookingModel = require('../models/venueBooking');
const venueBookingPurposeModel = require('../models/venueBookingPurpose');
const venueApprovalFlowModel = require('../models/venueApprovalFlow');
const venueApprovalFlowStepModel = require('../models/venueApprovalFlowStep');
const venueApprovalFlowStepRuleModel = require('../models/venueApprovalFlowStepRule');
const { createVenueApprovalNotifications, createVenueBookingStatusNotification } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  const [userRows] = await pool.query('SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?', [openid, orgId]);
  if (userRows[0] && userRows[0].hr_id) return userRows[0].hr_id;
  const admin = await ensureAdmin(openid);
  if (admin && admin.student_id) {
    const [hrRows] = await pool.query('SELECT id FROM hr_info WHERE student_id = ? AND org_id = ? LIMIT 1', [admin.student_id, orgId]);
    if (hrRows[0]) return hrRows[0].id;
  }
  return null;
}

async function matchesBookingRule(rule, hrId) {
  if (!hrId) return false;
  if (rule.rule_type === 'person') return safeString(rule.approver_hr_id) === hrId;
  if (rule.rule_type !== 'identity') return false;

  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
    [hrId, orgId]
  );
  const hr = rows[0];
  if (!hr) return false;
  if (rule.approver_identity_id && safeString(hr.identity_id) !== safeString(rule.approver_identity_id)) return false;
  if (rule.scope_department_id && safeString(hr.department_id) !== safeString(rule.scope_department_id)) return false;
  if (rule.scope_work_group_id && safeString(hr.work_group_id) !== safeString(rule.scope_work_group_id)) return false;
  return !!rule.approver_identity_id;
}

async function canReviewVenueBooking(openid, booking) {
  const admin = await ensureAdmin(openid);
  const hrId = await resolveHrId(openid);

  // Flow-based approval — only users matching step rules can approve (no admin bypass)
  if (booking.approval_flow_id && booking.approval_total_steps > 0) {
    const currentStep = booking.approval_current_step;
    if (currentStep < 0) return { ok: false, admin, hrId, reason: '该借用已被驳回' };
    if (currentStep >= booking.approval_total_steps) return { ok: false, admin, hrId, reason: '该借用已完成所有审批步骤' };

    // Get current step rules and check if hrId matches
    const steps = await venueApprovalFlowStepModel.getByFlowId(booking.approval_flow_id);
    if (!steps.length || currentStep >= steps.length) {
      return { ok: false, admin, hrId, reason: '审批步骤配置异常' };
    }
    const step = steps[currentStep];
    if (!step || !step.rules || !step.rules.length) {
      return { ok: false, admin, hrId, reason: '当前步骤未配置审批规则，请联系管理员配置' };
    }

    const approverHrInfo = await hrInfoModel.getById(hrId);
    if (!approverHrInfo) return { ok: false, admin, hrId, reason: '找不到审批人人事信息' };

    // Load applicant's HR info for 'same' scope matching
    let applicantHrInfo = null;
    if (booking.user_hr_id) {
      applicantHrInfo = await hrInfoModel.getById(booking.user_hr_id);
    }

    const matches = venueApprovalFlowStepRuleModel.matchesAnyRule(step.rules, approverHrInfo, applicantHrInfo);
    return { ok: matches, admin, hrId, reason: matches ? null : '您不符合当前审批步骤的条件（需要匹配部门/职能组/身份）' };
  }

  // Legacy rule-based approval
  const rules = await venueBookingRuleModel.getByVenueId(booking.venue_id);
  if (!rules.length) return { ok: !!admin, admin, hrId };

  for (const rule of rules) {
    if (rule.rule_type === 'direct') return { ok: false, admin, hrId, reason: '该场地为直接通过，无需审批' };
    if (rule.rule_type === 'admin' && admin) return { ok: true, admin, hrId };
    if (await matchesBookingRule(rule, hrId)) return { ok: true, admin, hrId };
  }
  return { ok: false, admin, hrId };
}

function fmtDatetime(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ═══════════════════════════════════════════════════
// Venue CRUD
// ═══════════════════════════════════════════════════

// listVenues
router.post('/listVenues', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venues = await venueModel.getAll();
    res.json({ status: 'success', venues });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenue
router.post('/saveVenue', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id) || generateId();
    const name = safeString(req.body.name);
    if (!name) return res.json({ status: 'invalid_params', message: '请输入场地名称' });
    const data = {
      name,
      location: safeString(req.body.location),
      description: safeString(req.body.description),
      imageUrl: safeString(req.body.imageUrl)
    };
    const existing = await venueModel.getById(id);
    if (existing) {
      await venueModel.update(id, data);
    } else {
      await venueModel.create(id, data);
    }
    res.json({ status: 'success', id, message: existing ? '场地已更新' : '场地已创建' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenue
router.post('/deleteVenue', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    await venueModel.remove(id);
    res.json({ status: 'success', message: '场地已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Open Time Rules
// ═══════════════════════════════════════════════════

// listVenueOpenRules
router.post('/listVenueOpenRules', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const rules = await venueOpenRuleModel.getByVenueId(venueId);
    res.json({ status: 'success', rules: rules.map(r => ({ ...r, time_start: (r.time_start||'').substring(0,5), time_end: (r.time_end||'').substring(0,5) })) });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueOpenRule
router.post('/saveVenueOpenRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id) || generateId();
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const data = {
      venueId,
      name: safeString(req.body.name),
      cycleType: safeString(req.body.cycleType) || 'weekly',
      cycleValues: req.body.cycleValues || [],
      timeStart: safeString(req.body.timeStart) || '09:00',
      timeEnd: safeString(req.body.timeEnd) || '18:00'
    };
    const existing = await venueOpenRuleModel.getById(id);
    if (existing) {
      await venueOpenRuleModel.update(id, data);
    } else {
      await venueOpenRuleModel.create(id, data);
    }
    res.json({ status: 'success', id, message: existing ? '规则已更新' : '规则已创建' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenueOpenRule
router.post('/deleteVenueOpenRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供规则ID' });
    await venueOpenRuleModel.remove(id);
    res.json({ status: 'success', message: '规则已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Activity Rules
// ═══════════════════════════════════════════════════

// listVenueActivityRules
router.post('/listVenueActivityRules', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const rules = await venueActivityRuleModel.getByVenueId(venueId);
    res.json({ status: 'success', rules: rules.map(r => ({ ...r, time_start: (r.time_start||'').substring(0,5), time_end: (r.time_end||'').substring(0,5) })) });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueActivityRule
router.post('/saveVenueActivityRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id) || generateId();
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const data = {
      venueId,
      activityName: safeString(req.body.activityName),
      cycleType: safeString(req.body.cycleType) || 'weekly',
      cycleValues: req.body.cycleValues || [],
      timeStart: safeString(req.body.timeStart) || '09:00',
      timeEnd: safeString(req.body.timeEnd) || '18:00'
    };
    const existing = await venueActivityRuleModel.getById(id);
    if (existing) {
      await venueActivityRuleModel.update(id, data);
    } else {
      await venueActivityRuleModel.create(id, data);
    }
    res.json({ status: 'success', id, message: existing ? '规则已更新' : '规则已创建' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenueActivityRule
router.post('/deleteVenueActivityRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供规则ID' });
    await venueActivityRuleModel.remove(id);
    res.json({ status: 'success', message: '规则已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Booking Approval Rules
// ═══════════════════════════════════════════════════

// listVenueBookingRules
router.post('/listVenueBookingRules', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const rules = await venueBookingRuleModel.getByVenueId(venueId);
    res.json({ status: 'success', rules });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueBookingRule
router.post('/saveVenueBookingRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id) || generateId();
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请提供场地ID' });
    const ruleType = safeString(req.body.ruleType) || 'admin';

    // Mutual exclusion + auto-cleanup
    const allRules = await venueBookingRuleModel.getByVenueId(venueId);
    const otherRules = allRules.filter(r => r.id !== id);

    if (ruleType === 'direct') {
      // User chose direct — auto-delete other rules and any existing flow
      for (const r of otherRules) {
        await venueBookingRuleModel.remove(r.id);
      }
      const existingFlow = await venueApprovalFlowModel.getByVenueId(venueId);
      if (existingFlow) {
        await venueApprovalFlowModel.remove(existingFlow.id);
      }
    } else if (otherRules.some(r => r.rule_type === 'direct')) {
      // Adding a new non-direct rule alongside an existing direct rule — blocked
      return res.json({ status: 'invalid_params', message: '该场地已设置「直接通过」，不能同时添加其他规则。如需切换类型，请编辑现有规则' });
    }

    const data = {
      venueId,
      ruleType,
      approverIdentityId: safeString(req.body.approverIdentityId),
      approverHrId: safeString(req.body.approverHrId),
      scopeDepartmentId: safeString(req.body.scopeDepartmentId),
      scopeWorkGroupId: safeString(req.body.scopeWorkGroupId),
      sortOrder: parseInt(req.body.sortOrder) || 1
    };
    const existing = await venueBookingRuleModel.getById(id);
    if (existing) {
      await venueBookingRuleModel.update(id, data);
    } else {
      await venueBookingRuleModel.create(id, data);
    }
    res.json({ status: 'success', id, message: existing ? '规则已更新' : '规则已创建' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenueBookingRule
router.post('/deleteVenueBookingRule', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供规则ID' });
    await venueBookingRuleModel.remove(id);
    res.json({ status: 'success', message: '规则已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Booking Management
// ═══════════════════════════════════════════════════

// listAllVenueBookings
router.post('/listAllVenueBookings', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const filters = {
      venueId: safeString(req.body.venueId),
      status: safeString(req.body.status),
      userHrId: safeString(req.body.userHrId)
    };
    // Datetime range filters
    const timeFrom = safeString(req.body.timeFrom);
    const timeTo = safeString(req.body.timeTo);
    if (timeFrom) filters.timeFrom = timeFrom;
    if (timeTo) filters.timeTo = timeTo;
    const bookings = await venueBookingModel.getAll(filters);
    // Build user info map
    const hrIds = [...new Set(bookings.map(b => b.user_hr_id).filter(Boolean))];
    const userMap = {};
    if (hrIds.length) {
      try {
        const hrList = await hrInfoModel.getByIds(hrIds);
        const deptIds = [...new Set(hrList.map(h => h.department_id).filter(Boolean))];
        const identIds = [...new Set(hrList.map(h => h.identity_id).filter(Boolean))];
        const wgIds = [...new Set(hrList.map(h => h.work_group_id).filter(Boolean))];
        const orgId = await getCurrentOrgId();
        const [deptRows, identRows, wgRows] = await Promise.all([
          deptIds.length ? pool.query('SELECT id, name FROM departments WHERE id IN (?) AND org_id = ?', [deptIds, orgId]) : Promise.resolve([[]]),
          identIds.length ? pool.query('SELECT id, name FROM identities WHERE id IN (?) AND org_id = ?', [identIds, orgId]) : Promise.resolve([[]]),
          wgIds.length ? pool.query('SELECT id, name FROM work_groups WHERE id IN (?) AND org_id = ?', [wgIds, orgId]) : Promise.resolve([[]])
        ]);
        const deptMap = {}; (deptRows[0] || []).forEach(r => { deptMap[r.id] = r.name; });
        const identMap = {}; (identRows[0] || []).forEach(r => { identMap[r.id] = r.name; });
        const wgMap = {}; (wgRows[0] || []).forEach(r => { wgMap[r.id] = r.name; });
        (hrList || []).forEach(h => {
          userMap[h.id] = {
            name: h.name || h.id,
            department: deptMap[h.department_id] || '',
            identity: identMap[h.identity_id] || '',
            workGroup: wgMap[h.work_group_id] || ''
          };
        });
      } catch (_) {}
    }
    const list = bookings.map(b => ({
      id: b.id,
      venueId: b.venue_id,
      venueName: b.venue_name,
      venueLocation: b.venue_location,
      userHrId: b.user_hr_id,
      userName: (userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || b.user_hr_id,
      userDept: (userMap[b.user_hr_id] && userMap[b.user_hr_id].department) || '',
      userIdentity: (userMap[b.user_hr_id] && userMap[b.user_hr_id].identity) || '',
      userWorkGroup: (userMap[b.user_hr_id] && userMap[b.user_hr_id].workGroup) || '',
      title: b.title,
      description: b.description,
      timeStart: fmtDatetime(new Date(b.time_start)),
      timeEnd: fmtDatetime(new Date(b.time_end)),
      status: b.status,
      approverHrId: b.approver_hr_id,
      approvalComment: b.approval_comment,
      createdAt: b.created_at,
      approvalProgress: (b.approval_flow_id && b.approval_total_steps > 0) ? {
        flowId: b.approval_flow_id,
        currentStep: b.approval_current_step,
        totalSteps: b.approval_total_steps,
        isApproved: b.approval_current_step >= b.approval_total_steps,
        isRejected: b.approval_current_step < 0,
        rejectStep: b.approval_reject_step,
        snapshots: (() => {
          try { return b.approval_snapshots_json ? JSON.parse(b.approval_snapshots_json) : []; }
          catch (_) { return []; }
        })()
      } : null
    }));

    // ── Batch-resolve approver names from snapshots ──
    const allSnapshotHrIds = new Set();
    for (const item of list) {
      if (item.approvalProgress && item.approvalProgress.snapshots) {
        for (const snap of item.approvalProgress.snapshots) {
          if (snap.approverHrId) allSnapshotHrIds.add(snap.approverHrId);
        }
      }
    }
    if (allSnapshotHrIds.size) {
      try {
        const approverHrList = await hrInfoModel.getByIds([...allSnapshotHrIds]);
        const approverNameMap = {};
        (approverHrList || []).forEach(h => { approverNameMap[h.id] = h.name || ''; });
        for (const item of list) {
          if (item.approvalProgress && item.approvalProgress.snapshots) {
            for (const snap of item.approvalProgress.snapshots) {
              snap.approverName = snap.approverName || approverNameMap[snap.approverHrId] || '';
            }
          }
        }
      } catch (_) {}
    }

    // ── Load flow step definitions for ALL flow-based bookings ──
    const allFlowBookings = list.filter(lb => lb.approvalProgress && lb.approvalProgress.flowId);
    const flowStepsMap = {}; // flowId → [{sort_order, name, action_type, rules}]
    if (allFlowBookings.length) {
      try {
        const orgId = await getCurrentOrgId();
        const flowIds = [...new Set(allFlowBookings.map(b => b.approvalProgress.flowId))];
        for (const flowId of flowIds) {
          const [steps] = await pool.query(
            'SELECT * FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
            [flowId, orgId]
          );
          // Load rules for all steps in this flow (needed for userCanApprove later)
          const stepIds = steps.map(s => s.id);
          if (stepIds.length) {
            const [allRules] = await pool.query(
              'SELECT * FROM venue_approval_flow_step_rules WHERE step_id IN (?) AND org_id = ? ORDER BY sort_order',
              [stepIds, orgId]
            );
            const ruleMap = {};
            for (const r of allRules) {
              if (!ruleMap[r.step_id]) ruleMap[r.step_id] = [];
              ruleMap[r.step_id].push(r);
            }
            for (const step of steps) { step.rules = ruleMap[step.id] || []; }
          }
          flowStepsMap[flowId] = steps;
        }
        // Attach display-only flowSteps to each booking's approvalProgress
        for (const lb of allFlowBookings) {
          const steps = flowStepsMap[lb.approvalProgress.flowId] || [];
          lb.approvalProgress.flowSteps = steps.map(s => ({
            sortOrder: s.sort_order,
            name: s.name,
            actionType: s.action_type
          }));
        }
      } catch (_) { /* silently ignore — flowSteps won't be attached */ }
    }

    // ── Determine userCanApprove for each pending flow-based booking ──
    try {
      const orgId = await getCurrentOrgId();

      // Resolve admin's HR ID
      const [userRows] = await pool.query(
        'SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?',
        [req.openid, orgId]
      );
      let approverHrId = (userRows[0] && userRows[0].hr_id) || null;
      if (!approverHrId && admin && admin.student_id) {
        const [hrRows] = await pool.query(
          'SELECT id FROM hr_info WHERE student_id = ? AND org_id = ? LIMIT 1',
          [admin.student_id, orgId]
        );
        if (hrRows[0]) approverHrId = hrRows[0].id;
      }

      if (approverHrId) {
        const approverHrInfo = await hrInfoModel.getById(approverHrId);
        if (approverHrInfo) {
          const pendingFlowBookings = list.filter(
            lb => lb.status === 'pending' && lb.approvalProgress && lb.approvalProgress.flowId
          );

          if (pendingFlowBookings.length) {
            // Bulk-load applicant HR info (needed for 'same' scope matching)
            const applicantIds = [...new Set(pendingFlowBookings.map(b => b.userHrId).filter(Boolean))];
            const applicantMap = {};
            if (applicantIds.length) {
              const hrList = await hrInfoModel.getByIds(applicantIds);
              (hrList || []).forEach(h => { applicantMap[h.id] = h; });
            }

            // Check each pending booking using already-loaded flow steps
            for (const lb of pendingFlowBookings) {
              const prog = lb.approvalProgress;
              const steps = flowStepsMap[prog.flowId] || [];
              const curIdx = prog.currentStep;

              if (curIdx >= 0 && curIdx < steps.length) {
                const step = steps[curIdx];
                if (step.rules && step.rules.length) {
                  const applicantHr = applicantMap[lb.userHrId] || null;
                  lb.userCanApprove = venueApprovalFlowStepRuleModel.matchesAnyRule(
                    step.rules, approverHrInfo, applicantHr
                  );
                } else {
                  lb.userCanApprove = true;
                }
              } else {
                lb.userCanApprove = false;
              }
            }
          }
        }
      }
    } catch (_) {
      // Silently ignore — userCanApprove stays undefined/falsy, buttons hidden
    }

    // For non-flow pending bookings, admin can always approve (legacy behavior)
    for (const lb of list) {
      if (lb.status === 'pending' && lb.userCanApprove === undefined
        && !(lb.approvalProgress && lb.approvalProgress.flowId)) {
        lb.userCanApprove = true;
      }
    }

    res.json({ status: 'success', bookings: list });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/approveVenueBooking', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.status !== 'pending') return res.json({ status: 'invalid_state', message: '当前状态不能审批' });

    const review = await canReviewVenueBooking(req.openid, booking);
    if (!review.ok) return res.json({ status: 'forbidden', message: review.reason || '没有该场地借用审批权限' });

    await conn.beginTransaction();

    // Flow-based approval
    if (booking.approval_flow_id && booking.approval_total_steps > 0) {
      const currentStep = booking.approval_current_step;
      const newStepIndex = currentStep + 1;
      const isLastStep = newStepIndex >= booking.approval_total_steps;

      if (isLastStep) {
        const approvedAt = new Date();
        const bookingTimeEnd = new Date(booking.time_end);

        // If approved after booking end, cancel instead
        if (approvedAt > bookingTimeEnd) {
          await venueBookingModel.updateStatus(id, 'cancelled', review.hrId, '审批通过时已超过借用结束时间，自动取消', conn);
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

      // Build approval snapshot
      let snapshots = [];
      try { snapshots = booking.approval_snapshots_json ? JSON.parse(booking.approval_snapshots_json) : []; } catch (_) {}
      const steps = await venueApprovalFlowStepModel.getByFlowId(booking.approval_flow_id);
      const stepName = (steps[currentStep] && steps[currentStep].name) || ('步骤' + (currentStep + 1));
      // Resolve approver name
      let snapApproverName = '';
      try {
        const approverHrInfoForSnap = await hrInfoModel.getById(review.hrId);
        snapApproverName = approverHrInfoForSnap ? (approverHrInfoForSnap.name || '') : '';
      } catch (_) {}

      snapshots.push({
        stepIndex: currentStep,
        stepName,
        approverHrId: review.hrId,
        approverName: snapApproverName,
        comment: comment || '',
        approvedAt: fmtDatetime(new Date())
      });

      const newStatus = isLastStep ? 'approved' : 'pending';
      await conn.query(
        `UPDATE venue_bookings SET approval_current_step = ?, approval_snapshots_json = ?, status = ?, approver_hr_id = ?, approval_comment = ? WHERE id = ?`,
        [newStepIndex, JSON.stringify(snapshots), newStatus,
         isLastStep ? review.hrId : booking.approver_hr_id,
         isLastStep ? (comment || booking.approval_comment) : booking.approval_comment,
         id]
      );

      await conn.commit();

      // Clear old pending_approval notifications for this booking (true DELETE)
      notificationModel.deleteByTarget('booking', id).catch(e => console.error('[venueAdmin] notification cleanup failed:', e.message));

      // Fire-and-forget: create notifications for next step or submitter
      if (isLastStep) {
        const venueName = booking.venue_name || '';
        createVenueBookingStatusNotification(
          booking,
          'booking_approved',
          '场地借用已通过',
          '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已审批通过'
        ).catch(e => console.error('[venueAdmin] status notification failed:', e.message));
      } else {
        createVenueApprovalNotifications(id, newStepIndex).catch(e =>
          console.error('[venueAdmin] approval notification failed:', e.message));
      }

      res.json({
        status: 'success',
        message: isLastStep ? '所有步骤审批完成，借用已通过' : ('步骤 ' + (currentStep + 1) + ' 审批通过，进入下一步'),
        approvalProgress: { currentStep: newStepIndex, totalSteps: booking.approval_total_steps, isApproved: isLastStep }
      });
      return;
    }

    // Legacy approval
    const approvedAt = new Date();
    const bookingTimeEnd = new Date(booking.time_end);
    const approverId = review.hrId || (review.admin && review.admin.id);

    // If approved after booking end, cancel instead
    if (approvedAt > bookingTimeEnd) {
      await venueBookingModel.updateStatus(id, 'cancelled', approverId, '审批通过时已超过借用结束时间，自动取消', conn);
      await conn.commit();
      return res.json({ status: 'expired', message: '审批通过时已超过借用结束时间，借用已自动取消' });
    }

    // Approval within booking window - adjust start time
    await venueBookingModel.updateTimeStart(id, fmtDatetime(approvedAt), conn);

    const timeStart = fmtDatetime(approvedAt);
    const timeEnd = fmtDatetime(new Date(booking.time_end));
    const conflict = await venueBookingModel.findConflict(booking.venue_id, timeStart, timeEnd, id, conn, true);
    if (conflict) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: '该时段已被其他借用占用' });
    }
    await venueBookingModel.updateStatus(id, 'approved', approverId, comment, conn);
    await conn.commit();

    // Clear old pending_approval notifications + notify submitter
    notificationModel.deleteByTarget('booking', id).catch(e => console.error('[venueAdmin] legacy approve notification cleanup failed:', e.message));
    const venueName = booking.venue_name || '';
    createVenueBookingStatusNotification(
      booking,
      'booking_approved',
      '场地借用已通过',
      '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已审批通过'
    ).catch(e => console.error('[venueAdmin] legacy approve status notification failed:', e.message));

    res.json({ status: 'success', message: '借用已通过' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

router.post('/rejectVenueBooking', async (req, res) => {
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.status !== 'pending') return res.json({ status: 'invalid_state', message: '当前状态不能审批' });

    const review = await canReviewVenueBooking(req.openid, booking);
    if (!review.ok) return res.json({ status: 'forbidden', message: review.reason || '没有该场地借用审批权限' });

    // Flow-based rejection: record which step was rejected
    if (booking.approval_flow_id && booking.approval_total_steps > 0) {
      await pool.query(
        'UPDATE venue_bookings SET status = ?, approver_hr_id = ?, approval_comment = ?, approval_current_step = -1, approval_reject_step = ? WHERE id = ?',
        ['rejected', review.hrId || (review.admin && review.admin.id), comment, booking.approval_current_step, id]
      );
    } else {
      await venueBookingModel.updateStatus(id, 'rejected', review.hrId || (review.admin && review.admin.id), comment);
    }

    // Clear old pending_approval notifications + notify submitter
    notificationModel.deleteByTarget('booking', id).catch(e => console.error('[venueAdmin] reject notification cleanup failed:', e.message));
    const venueNameRej = booking.venue_name || '';
    createVenueBookingStatusNotification(
      booking,
      'booking_rejected',
      '场地借用被驳回',
      '您申请的「' + (booking.title || '场地借用') + '」' + (venueNameRej ? '（' + venueNameRej + '）' : '') + '已被驳回' +
        (comment ? '，原因：' + comment : '')
    ).catch(e => console.error('[venueAdmin] rejection notification failed:', e.message));

    res.json({ status: 'success', message: '借用已驳回' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// approveVenueBooking (admin-only fallback — delegates to flow-based when applicable)
router.post('/approveVenueBookingAdmin', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.status !== 'pending') return res.json({ status: 'invalid_state', message: '当前状态不能审批' });
    // Re-check conflict
    const timeStart = fmtDatetime(new Date(booking.time_start));
    const timeEnd = fmtDatetime(new Date(booking.time_end));
    const conflict = await venueBookingModel.findConflict(booking.venue_id, timeStart, timeEnd, id);
    if (conflict) return res.json({ status: 'conflict', message: '该时段已被其他借用占用' });
    await venueBookingModel.updateStatus(id, 'approved', admin.hr_id || admin.id, comment);

    // Clear old pending_approval notifications + notify submitter
    notificationModel.deleteByTarget('booking', id).catch(e => console.error('[venueAdmin] admin approve notification cleanup failed:', e.message));
    const vnAdmin = booking.venue_name || '';
    createVenueBookingStatusNotification(
      booking,
      'booking_approved',
      '场地借用已通过',
      '您申请的「' + (booking.title || '场地借用') + '」' + (vnAdmin ? '（' + vnAdmin + '）' : '') + '已审批通过（管理员审批）'
    ).catch(e => console.error('[venueAdmin] admin approve status notification failed:', e.message));

    res.json({ status: 'success', message: '借用已通过' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// rejectVenueBookingAdmin
router.post('/rejectVenueBookingAdmin', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const comment = safeString(req.body.comment);
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.status !== 'pending') return res.json({ status: 'invalid_state', message: '当前状态不能审批' });
    await venueBookingModel.updateStatus(id, 'rejected', admin.hr_id || admin.id, comment);

    // Clear old pending_approval notifications + notify submitter
    notificationModel.deleteByTarget('booking', id).catch(e => console.error('[venueAdmin] admin reject notification cleanup failed:', e.message));
    const vnRejAdmin = booking.venue_name || '';
    createVenueBookingStatusNotification(
      booking,
      'booking_rejected',
      '场地借用被驳回',
      '您申请的「' + (booking.title || '场地借用') + '」' + (vnRejAdmin ? '（' + vnRejAdmin + '）' : '') + '已被驳回（管理员审批）' +
        (comment ? '，原因：' + comment : '')
    ).catch(e => console.error('[venueAdmin] admin reject notification failed:', e.message));

    res.json({ status: 'success', message: '借用已驳回' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Booking Purposes (事由管理)
// ═══════════════════════════════════════════════════

// listVenueBookingPurposes (public — any authenticated user can read purposes)
router.post('/listVenueBookingPurposes', async (req, res) => {
  try {
    const purposes = await venueBookingPurposeModel.getAll();
    res.json({ status: 'success', purposes });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveVenueBookingPurpose
router.post('/saveVenueBookingPurpose', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id) || generateId();
    const text = safeString(req.body.text);
    if (!text) return res.json({ status: 'invalid_params', message: '请输入事由内容' });
    const data = { text, sortOrder: parseInt(req.body.sortOrder) || 1 };
    const existing = await venueBookingPurposeModel.getById(id);
    if (existing) {
      await venueBookingPurposeModel.update(id, data);
    } else {
      await venueBookingPurposeModel.create(id, data);
    }
    res.json({ status: 'success', id, message: existing ? '事由已更新' : '事由已创建' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteVenueBookingPurpose
router.post('/deleteVenueBookingPurpose', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供事由ID' });
    await venueBookingPurposeModel.remove(id);
    res.json({ status: 'success', message: '事由已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
