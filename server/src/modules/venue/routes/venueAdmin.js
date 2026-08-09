const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const adminInfoModel = require('../../../core/models/adminInfo');
const hrInfoModel = require('../../../core/models/hrInfo');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const { resolveVenueViewerScope, canViewBookingDetails, resolveVenueOrgNames } = require('../services/venueViewerScope');
const venueModel = require('../models/venue');
const venueOpenRuleModel = require('../models/venueOpenRule');
const venueActivityRuleModel = require('../models/venueActivityRule');
const venueBookingRuleModel = require('../models/venueBookingRule');
const venueBookingModel = require('../models/venueBooking');
const venueBookingPurposeModel = require('../models/venueBookingPurpose');
const venueApprovalFlowModel = require('../models/venueApprovalFlow');
const venueApprovalFlowStepModel = require('../models/venueApprovalFlowStep');
const { createVenueApprovalNotifications, createVenueBookingStatusNotification } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');
const requestDeduplication = require('../../../utils/requestDeduplication');
const {
  authorizeCurrentVenueApproval
} = require('../services/venueApprovalAuthorization');
const { evaluateVenueApprovalStep } = require('../services/venueApprovalPolicy');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  // Only resolve from user_info — admin and regular user identities are strictly separate
  const [userRows] = await pool.query('SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?', [openid, orgId]);
  return (userRows[0] && userRows[0].hr_id) || null;
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

async function canReviewVenueBooking(req, booking) {
  const actorResult = await resolveCurrentActor(req);
  if (!actorResult.ok) {
    return { ok: false, admin: null, hrId: null, reason: actorResult.message };
  }
  const actor = actorResult.actor;
  const admin = actor.type === 'admin' ? actor.profile : null;
  const hrId = actor.type === 'user' ? actor.id : null;

  // 流程审批统一使用共享授权器，确保查询、待办和写操作结论一致。
  if (booking.approval_flow_id && booking.approval_total_steps > 0) {
    const authorization = await authorizeCurrentVenueApproval(booking, actor);
    return { ...authorization, admin, hrId, actor };
  }

  // Legacy rule-based approval
  const rules = await venueBookingRuleModel.getByVenueId(booking.venue_id);
  if (!rules.length) return { ok: !!admin, admin, hrId, actor };

  for (const rule of rules) {
    if (rule.rule_type === 'direct') return { ok: false, admin, hrId, actor, reason: '该场地为直接通过，无需审批' };
    if (rule.rule_type === 'admin' && admin) return { ok: true, admin, hrId, actor };
    if (await matchesBookingRule(rule, hrId)) return { ok: true, admin, hrId, actor };
  }
  return { ok: false, admin, hrId, actor };
}

function fmtLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDatetime(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function parseAdminBookingDatetime(value) {
  const normalized = safeString(value).replace('T', ' ');
  const [datePart, timePart] = normalized.split(' ');
  const [year, month, day] = (datePart || '').split('-').map(Number);
  const [hour, minute] = (timePart || '').split(':').map(Number);
  const date = new Date(year, month - 1, day, hour || 0, minute || 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function venueRuleMatchesDate(rule, dateText) {
  let values = rule.cycle_values || [];
  if (typeof values === 'string') {
    try { values = JSON.parse(values); } catch (_) { values = []; }
  }
  if (rule.cycle_type === 'daily') return true;
  if (rule.cycle_type === 'range') return !!values && dateText >= values.startDate && dateText <= values.endDate;
  const date = new Date(dateText + 'T00:00:00');
  if (rule.cycle_type === 'weekly') return values.indexOf(date.getDay() === 0 ? 7 : date.getDay()) !== -1;
  if (rule.cycle_type === 'monthly') return values.indexOf(date.getDate()) !== -1;
  if (rule.cycle_type === 'yearly') {
    return values.some((item) => Number(item.m) === date.getMonth() + 1 && date.getDate() >= Number(item.dStart !== undefined ? item.dStart : item.d) && date.getDate() <= Number(item.dEnd !== undefined ? item.dEnd : item.d));
  }
  return false;
}

function minutesOf(value) {
  const parts = safeString(value).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

// ═══════════════════════════════════════════════════
// Venue CRUD
// ═══════════════════════════════════════════════════

// listVenues
router.post('/listVenues', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id) || generateId();
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择开放时间' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id) || generateId();
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择活动时间' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id) || generateId();
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: '请重新选择场地' });
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
      return res.json({ status: 'invalid_params', message: '选择“直接通过”时，请清除其他规则' });
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
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择借用规则' });
    await venueBookingRuleModel.remove(id);
    res.json({ status: 'success', message: '规则已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Booking Management
// ═══════════════════════════════════════════════════

// createAdminVenueBooking — 管理员从排期表创建免审借用
router.post('/createAdminVenueBooking', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const venueId = safeString(req.body.venueId);
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const start = parseAdminBookingDatetime(req.body.timeStart);
    const end = parseAdminBookingDatetime(req.body.timeEnd);
    if (!venueId || !title || !start || !end) return res.json({ status: 'invalid_params', message: '请填写完整借用信息' });
    if (fmtLocalDate(start) !== fmtLocalDate(end)) return res.json({ status: 'invalid_params', message: '请选择同一天的开始和结束时间' });
    if (end <= start) return res.json({ status: 'invalid_params', message: '请将结束时间设在开始时间之后' });
    if (start < new Date()) return res.json({ status: 'invalid_params', message: '请选择当前时间之后' });
    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: '请选择其他场地' });

    const dateText = fmtLocalDate(start);
    const rangeStart = start.getHours() * 60 + start.getMinutes();
    const rangeEnd = end.getHours() * 60 + end.getMinutes();
    const [openRules, activityRules] = await Promise.all([
      venueOpenRuleModel.getByVenueId(venueId),
      venueActivityRuleModel.getByVenueId(venueId)
    ]);
    const matchingOpen = openRules.filter((rule) => rule.is_active && venueRuleMatchesDate(rule, dateText));
    const covered = matchingOpen.some((rule) => minutesOf(rule.time_start) <= rangeStart && minutesOf(rule.time_end) >= rangeEnd);
    if (!covered) return res.json({ status: 'conflict', message: '所选时段不在场地开放时间内' });
    const activityConflict = activityRules.some((rule) => rule.is_active && venueRuleMatchesDate(rule, dateText) && minutesOf(rule.time_start) < rangeEnd && minutesOf(rule.time_end) > rangeStart);
    if (activityConflict) return res.json({ status: 'conflict', message: '所选时段已有活动占用' });

    await conn.beginTransaction();
    const id = generateId();
    const orgId = await getCurrentOrgId();
    const dedupClaim = await requestDeduplication.claim(conn, {
      orgId,
      actorKey: 'admin:' + admin.id,
      operationType: 'create_admin_venue_booking',
      clientRequestId: req.body.clientRequestId,
      resourceId: id
    });
    if (!dedupClaim.claimed) {
      await conn.commit();
      return res.json(dedupClaim.response || {
        status: 'success', id: dedupClaim.resourceId, bookingStatus: 'approved', message: '场地使用已创建', idempotent: true
      });
    }
    const dbStart = fmtDatetime(start);
    const dbEnd = fmtDatetime(end);
    const conflict = await venueBookingModel.findConflict(venueId, dbStart, dbEnd, null, conn, true);
    if (conflict) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: '所选时段已被借用' });
    }
    await venueBookingModel.create(id, {
      venueId,
      creatorType: 'admin',
      creatorAdminId: admin.id,
      creatorPersonId: req.authContext && req.authContext.personId,
      creatorAdminGrantId: req.authContext && req.authContext.adminGrantId,
      creatorContextSnapshot: req.authContext ? {
        contextId: req.authContext.contextId,
        organizationId: req.authContext.organizationId,
        role: req.authContext.role,
        identityName: req.authContext.identityName,
        adminLevel: req.authContext.adminLevel
      } : null,
      creatorOrgId: orgId,
      approvalOrgId: orgId,
      title,
      description,
      timeStart: dbStart,
      timeEnd: dbEnd,
      status: 'approved'
    }, conn);
    const response = { status: 'success', id, bookingStatus: 'approved', message: '场地使用已创建' };
    await requestDeduplication.complete(conn, {
      ...dedupClaim,
      resourceId: id,
      orgId,
      actorKey: 'admin:' + admin.id,
      operationType: 'create_admin_venue_booking'
    }, response);
    await conn.commit();
    res.json(response);
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    if (e && e.code === 'INVALID_CLIENT_REQUEST_ID') {
      return res.json({ status: 'invalid_params', message: '请重新提交借用' });
    }
    console.error('[venue:createAdminVenueBooking]', req.requestId || '-', e);
    res.json({ status: 'error', message: '未创建，请重试' });
  } finally {
    conn.release();
  }
});

// listAllVenueBookings
router.post('/listAllVenueBookings', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
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
    const orgId = await getCurrentOrgId();
    const viewerScope = await resolveVenueViewerScope(
      req.openid,
      req.authContext && req.authContext.personId
    );
    const canViewDetails = (booking) => canViewBookingDetails(booking, viewerScope);
    // 跨组织记录不在管理端借用列表出现，只在日程图中显示占用
    const detailBookings = bookings.filter(canViewDetails);
    const orgNameMap = await resolveVenueOrgNames(
      detailBookings.map(b => safeString(b.creator_org_id) || safeString(b.approval_org_id))
    );
    // Build user info map
    const hrIds = [...new Set(detailBookings.map(b => b.user_hr_id).filter(Boolean))];
    const userMap = {};
    const adminIds = [...new Set(detailBookings.filter(b => b.creator_type === 'admin').map(b => b.creator_admin_id).filter(Boolean))];
    const adminMap = {};
    if (adminIds.length) {
      const [adminRows] = await pool.query('SELECT id, name FROM admin_info WHERE id IN (?)', [adminIds]);
      adminRows.forEach(item => { adminMap[item.id] = item.name || '管理员'; });
    }
    if (hrIds.length) {
      try {
        // 跨组织借用记录的人事信息按各 hr 自身所属组织解析
        const placeholders = hrIds.map(() => '?').join(',');
        const [hrList] = await pool.query(
          `SELECT * FROM hr_info WHERE id IN (${placeholders})`,
          hrIds
        );
        const deptIdsByOrg = {};
        const identIdsByOrg = {};
        const wgIdsByOrg = {};
        (hrList || []).forEach(h => {
          const org = safeString(h.org_id);
          if (!deptIdsByOrg[org]) deptIdsByOrg[org] = new Set();
          if (!identIdsByOrg[org]) identIdsByOrg[org] = new Set();
          if (!wgIdsByOrg[org]) wgIdsByOrg[org] = new Set();
          if (h.department_id) deptIdsByOrg[org].add(h.department_id);
          if (h.identity_id) identIdsByOrg[org].add(h.identity_id);
          if (h.work_group_id) wgIdsByOrg[org].add(h.work_group_id);
        });
        const deptMap = {};
        const identMap = {};
        const wgMap = {};
        for (const org of Object.keys(deptIdsByOrg)) {
          const deptIds = [...deptIdsByOrg[org]];
          const identIds = [...identIdsByOrg[org]];
          const wgIds = [...wgIdsByOrg[org]];
          const [deptRows, identRows, wgRows] = await Promise.all([
            deptIds.length ? pool.query('SELECT id, name FROM departments WHERE id IN (?) AND org_id = ?', [deptIds, org]) : Promise.resolve([[]]),
            identIds.length ? pool.query('SELECT id, name FROM identities WHERE id IN (?) AND org_id = ?', [identIds, org]) : Promise.resolve([[]]),
            wgIds.length ? pool.query('SELECT id, name FROM work_groups WHERE id IN (?) AND org_id = ?', [wgIds, org]) : Promise.resolve([[]])
          ]);
          (deptRows[0] || []).forEach(r => { deptMap[org + '|' + r.id] = r.name; });
          (identRows[0] || []).forEach(r => { identMap[org + '|' + r.id] = r.name; });
          (wgRows[0] || []).forEach(r => { wgMap[org + '|' + r.id] = r.name; });
        }
        (hrList || []).forEach(h => {
          const org = safeString(h.org_id);
          userMap[h.id] = {
            name: h.name || '信息已失效',
            department: deptMap[org + '|' + h.department_id] || '',
            identity: identMap[org + '|' + h.identity_id] || '',
            workGroup: wgMap[org + '|' + h.work_group_id] || ''
          };
        });
      } catch (_) {}
    }
    const list = detailBookings.map(b => {
      return {
      id: b.id,
      venueId: b.venue_id,
      venueName: b.venue_name,
      venueLocation: b.venue_location,
      visibility: 'details',
      creatorOrgId: b.creator_org_id,
      approvalOrgId: b.approval_org_id,
      orgName: orgNameMap[safeString(b.creator_org_id)] || orgNameMap[safeString(b.approval_org_id)] || '',
      userHrId: b.user_hr_id,
      creatorType: b.creator_type || 'user',
      creatorName: b.creator_type === 'admin' ? (adminMap[b.creator_admin_id] || '管理员') : ((userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || '普通用户'),
      creatorLabel: b.creator_type === 'admin' ? '管理员创建' : '用户申请',
      userName: b.creator_type === 'admin' ? (adminMap[b.creator_admin_id] || '管理员') : ((userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || '普通用户'),
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
      };
    });

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
        const snapshotHrIds = [...allSnapshotHrIds];
        const approverPlaceholders = snapshotHrIds.map(() => '?').join(',');
        const [approverHrList] = await pool.query(
          `SELECT id, name FROM hr_info WHERE id IN (${approverPlaceholders})`,
          snapshotHrIds
        );
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
    const flowStepsMap = {}; // flowId|approvalOrgId → [{sort_order, name, action_type, rules}]
    if (allFlowBookings.length) {
      try {
        const flowStepKeys = [...new Set(
          allFlowBookings.map(b => b.approvalProgress.flowId + '|' + safeString(b.approvalOrgId))
        )];
        for (const key of flowStepKeys) {
          const sep = key.indexOf('|');
          const flowId = key.slice(0, sep);
          const flowOrg = key.slice(sep + 1);
          const [steps] = await pool.query(
            'SELECT * FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
            [flowId, flowOrg]
          );
          // Load rules for all steps in this flow (needed for userCanApprove later)
          const stepIds = steps.map(s => s.id);
          if (stepIds.length) {
            const [allRules] = await pool.query(
              'SELECT * FROM venue_approval_flow_step_rules WHERE step_id IN (?) AND org_id = ? ORDER BY sort_order',
              [stepIds, flowOrg]
            );
            const ruleMap = {};
            for (const r of allRules) {
              if (!ruleMap[r.step_id]) ruleMap[r.step_id] = [];
              ruleMap[r.step_id].push(r);
            }
            for (const step of steps) { step.rules = ruleMap[step.id] || []; }
          }
          flowStepsMap[key] = steps;
        }
        // Attach display-only flowSteps to each booking's approvalProgress
        for (const lb of allFlowBookings) {
          const steps = flowStepsMap[lb.approvalProgress.flowId + '|' + safeString(lb.approvalOrgId)] || [];
          lb.approvalProgress.flowSteps = steps.map(s => ({
            sortOrder: s.sort_order,
            name: s.name,
            actionType: s.action_type
          }));
        }
      } catch (_) { /* silently ignore — flowSteps won't be attached */ }
    }

    // 管理端只按管理员身份判断，不复用同一微信的普通用户人事身份。
    const bookingMap = new Map(bookings.map(booking => [booking.id, booking]));
    const adminActor = {
      type: 'admin',
      id: safeString(admin.id),
      name: safeString(admin.name),
      profile: admin
    };
    for (const listBooking of allFlowBookings) {
      if (listBooking.status !== 'pending') continue;
      const booking = bookingMap.get(listBooking.id);
      // 跨组织可见记录只读：仅当当前组织为审批组织时才计算审批资格
      if (!booking || safeString(booking.approval_org_id) !== orgId) {
        listBooking.userCanApprove = false;
        continue;
      }
      const steps = flowStepsMap[listBooking.approvalProgress.flowId + '|' + safeString(listBooking.approvalOrgId)] || [];
      const authorization = evaluateVenueApprovalStep({
        booking,
        actor: adminActor,
        steps,
        applicantHrInfo: null
      });
      listBooking.userCanApprove = authorization.ok;
    }

    // For non-flow pending bookings, admin can always approve (legacy behavior)
    for (const lb of list) {
      if (lb.status === 'pending' && lb.userCanApprove === undefined
        && lb.visibility === 'details'
        && !(lb.approvalProgress && lb.approvalProgress.flowId)) {
        lb.userCanApprove = safeString(lb.approvalOrgId) === orgId;
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
    if (!id) return res.json({ status: 'invalid_params', message: '请重新打开借用记录' });
    const comment = safeString(req.body.comment);
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

    const review = await canReviewVenueBooking(req, booking);
    if (!review.ok) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: review.reason || '请使用对应的审批身份' });
    }

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
          await venueBookingModel.updateStatus(id, 'cancelled', review.hrId, '审批时借用已结束，自动取消', conn, review.actor);
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
        approverPersonId: review.actor && review.actor.personId || '',
        approverAssignmentId: review.actor && review.actor.assignmentId || '',
        approverAdminGrantId: review.actor && review.actor.adminGrantId || '',
        approverContextId: review.actor && review.actor.contextId || '',
        approverName: snapApproverName,
        comment: comment || '',
        approvedAt: fmtDatetime(new Date())
      });

      const newStatus = isLastStep ? 'approved' : 'pending';
      const approvalContextSnapshot = JSON.stringify({
        contextId: review.actor && review.actor.contextId || '',
        role: review.actor && review.actor.type || '',
        identityName: review.actor && review.actor.name || '',
        adminLevel: review.actor && review.actor.adminLevel || ''
      });
      const [updateResult] = await conn.query(
        `UPDATE venue_bookings
            SET approval_current_step = ?, approval_snapshots_json = ?, status = ?,
                approver_hr_id = ?, approver_person_id = ?, approver_assignment_id = ?,
                approver_admin_grant_id = ?, approver_context_snapshot = ?, approval_comment = ?
          WHERE id = ?`,
        [newStepIndex, JSON.stringify(snapshots), newStatus, review.hrId || (review.admin && review.admin.id),
         review.actor && review.actor.personId || null,
         review.actor && review.actor.assignmentId || null,
         review.actor && review.actor.adminGrantId || null,
         approvalContextSnapshot,
         isLastStep ? (comment || booking.approval_comment) : booking.approval_comment,
         id]
      );
      if (updateResult.affectedRows !== 1) throw new Error('审批状态已变化，请刷新');

      if (isLastStep) {
        const venueName = booking.venue_name || '';
        await createVenueBookingStatusNotification(
          booking, 'booking_approved', '场地借用已通过',
          '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已审批通过', conn
        );
      }

      await conn.commit();

      // Clear old pending_approval notifications for this booking (true DELETE)
      await notificationModel.deleteByTarget('booking', id);

      // 下一步骤待办由业务状态实时计算。
      if (!isLastStep) {
        await createVenueApprovalNotifications(id, newStepIndex);
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
      await venueBookingModel.updateStatus(id, 'cancelled', approverId, '审批时借用已结束，自动取消', conn, review.actor);
      await createVenueBookingStatusNotification(
        booking, 'booking_cancelled', '场地借用已自动取消',
        '您申请的「' + (booking.title || '场地借用') + '」因借用时间已结束，已自动取消。', conn
      );
      await conn.commit();
      return res.json({ status: 'expired', message: '审批时借用已结束，已自动取消' });
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
    await venueBookingModel.updateStatus(id, 'approved', approverId, comment, conn, review.actor);
    const venueName = booking.venue_name || '';
    await createVenueBookingStatusNotification(
      booking, 'booking_approved', '场地借用已通过',
      '您申请的「' + (booking.title || '场地借用') + '」' + (venueName ? '（' + venueName + '）' : '') + '已审批通过', conn
    );
    await conn.commit();

    // Clear old pending_approval notifications + notify submitter
    await notificationModel.deleteByTarget('booking', id);
    res.json({ status: 'success', message: '借用已通过' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

router.post('/rejectVenueBooking', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新打开借用记录' });
    const comment = safeString(req.body.comment);
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

    const review = await canReviewVenueBooking(req, booking);
    if (!review.ok) {
      await conn.rollback();
      return res.json({ status: 'forbidden', message: review.reason || '请使用对应的审批身份' });
    }

    // Flow-based rejection: record which step was rejected
    if (booking.approval_flow_id && booking.approval_total_steps > 0) {
      await venueBookingModel.updateStatus(
        id,
        'rejected',
        review.hrId || (review.admin && review.admin.id),
        comment,
        conn,
        review.actor
      );
      await conn.query(
        'UPDATE venue_bookings SET approval_current_step = -1, approval_reject_step = ? WHERE id = ?',
        [booking.approval_current_step, id]
      );
    } else {
      await venueBookingModel.updateStatus(
        id,
        'rejected',
        review.hrId || (review.admin && review.admin.id),
        comment,
        conn,
        review.actor
      );
    }
    const venueNameRej = booking.venue_name || '';
    await createVenueBookingStatusNotification(
      booking, 'booking_rejected', '场地借用被驳回',
      '您申请的「' + (booking.title || '场地借用') + '」' + (venueNameRej ? '（' + venueNameRej + '）' : '') + '已被驳回' +
        (comment ? '，原因：' + comment : ''), conn
    );
    await conn.commit();

    // Clear old pending_approval notifications + notify submitter
    await notificationModel.deleteByTarget('booking', id);
    res.json({ status: 'success', message: '借用已驳回' });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

// 旧的管理员直通端点会绕过流程权限，保留明确的升级响应而不再执行写入。
router.post(['/approveVenueBookingAdmin', '/rejectVenueBookingAdmin'], (req, res) => {
  res.status(410).json({
    status: 'client_upgrade_required',
    message: '请重新打开小程序',
    requestId: req.requestId
  });
});

// ═══════════════════════════════════════════════════
// Booking Purposes (事由管理)
// ═══════════════════════════════════════════════════

// listVenueBookingPurposes (public — any authenticated user can read purposes)
router.post('/listVenueBookingPurposes', async (req, res) => {
  try {
    if (!req.openid) return res.json({ status: 'forbidden', message: '请微信登录' });
    const purposes = await venueBookingPurposeModel.getAll();
    res.json({ status: 'success', purposes });
  } catch (e) {
    console.error('[venue:listVenueBookingPurposes]', req.requestId || '-', e);
    res.json({ status: 'error', message: '请稍后刷新' });
  }
});

// saveVenueBookingPurpose
router.post('/saveVenueBookingPurpose', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id) || generateId();
    const text = safeString(req.body.text).trim();
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
    if (e && e.code === 'ER_DUP_ENTRY') return res.json({ status: 'duplicate', message: '请使用其他事由内容' });
    console.error('[venue:saveVenueBookingPurpose]', req.requestId || '-', e);
    res.json({ status: 'error', message: '未保存，请重试' });
  }
});

// deleteVenueBookingPurpose
router.post('/deleteVenueBookingPurpose', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择事由' });
    await venueBookingPurposeModel.remove(id);
    res.json({ status: 'success', message: '事由已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
