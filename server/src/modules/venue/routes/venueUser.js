const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const adminInfoModel = require('../../../core/models/adminInfo');
const hrInfoModel = require('../../../core/models/hrInfo');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const venueModel = require('../models/venue');
const venueOpenRuleModel = require('../models/venueOpenRule');
const venueActivityRuleModel = require('../models/venueActivityRule');
const venueBookingRuleModel = require('../models/venueBookingRule');
const venueBookingModel = require('../models/venueBooking');
const venueApprovalFlowModel = require('../models/venueApprovalFlow');
const venueApprovalFlowStepModel = require('../models/venueApprovalFlowStep');
const { createVenueApprovalNotifications } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');
const requestDeduplication = require('../../../utils/requestDeduplication');
const { evaluateVenueApprovalStep } = require('../services/venueApprovalPolicy');

async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] ? rows[0].hr_id : null;
}

/** Format a Date to "YYYY-MM-DD" in local time */
function fmtLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Format a Date to "HH:MM" in local time */
function fmtLocalTime(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** Format a Date to "YYYY-MM-DD HH:MM" for display and MySQL DATETIME */
function fmtDatetime(d) {
  return fmtLocalDate(d) + ' ' + fmtLocalTime(d);
}

/** Parse a date string "YYYY-MM-DD" as local midnight */
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Parse an ISO-like datetime string "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM" */
function parseDatetime(str) {
  if (!str) return null;
  const normalized = str.replace('T', ' ');
  const [datePart, timePart] = normalized.split(' ');
  const [y, m, d] = (datePart || '').split('-').map(Number);
  const [hh, mm] = (timePart || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0);
}

function daysBetweenInclusive(dateFrom, dateTo) {
  const start = parseLocalDate(dateFrom);
  const end = parseLocalDate(dateTo);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

/**
 * Check if a given date matches a cycle rule.
 */
function dateMatchesCycle(dateStr, cycleType, cycleValues) {
  // daily always matches, even without cycleValues
  if (cycleType === 'daily') return true;
  if (!cycleValues) return false;

  // range: date range (inclusive)
  if (cycleType === 'range') {
    let cvRange = cycleValues;
    if (typeof cvRange === 'string') {
      try { cvRange = JSON.parse(cvRange); } catch (_) { cvRange = {}; }
    }
    let rangeStart = cvRange && cvRange.startDate;
    let rangeEnd = cvRange && cvRange.endDate;
    if (!rangeStart || !rangeEnd) return false;
    return dateStr >= rangeStart && dateStr <= rangeEnd;
  }

  if (!Array.isArray(cycleValues) || !cycleValues.length) {
    return false;
  }
  // Parse date as local time (timezone-safe: uses local getters, not ISO strings)
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  switch (cycleType) {
    case 'daily':
      return true;
    case 'weekly': {
      const dow = date.getDay(); // 0=Sun
      const adjusted = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
      return cycleValues.includes(adjusted);
    }
    case 'monthly': {
      return cycleValues.includes(date.getDate());
    }
    case 'yearly': {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return cycleValues.some(v => {
        if (!v) return false;
        const m = Number(v.m);
        if (m !== month) return false;
        // Date range: dStart to dEnd (inclusive)
        if (v.dEnd !== undefined) {
          return day >= Number(v.dStart) && day <= Number(v.dEnd);
        }
        // Legacy individual date
        if (v.d !== undefined) {
          return day === Number(v.d);
        }
        return false;
      });
    }
    default:
      return false;
  }
}

/**
 * Get all open time slots for a venue on a given date.
 */
function getOpenSlots(dateStr, openRules) {
  const slots = [];
  for (const rule of openRules) {
    if (!rule.is_active) continue;
    let cv = [];
    try { cv = typeof rule.cycle_values === 'string' ? JSON.parse(rule.cycle_values) : (rule.cycle_values || []); } catch (_) {}
    if (dateMatchesCycle(dateStr, rule.cycle_type, cv)) {
      slots.push({
        ruleId: rule.id,
        ruleName: rule.name || '开放时间',
        timeStart: rule.time_start && rule.time_start.length >= 5 ? rule.time_start.substring(0, 5) : '09:00',
        timeEnd: rule.time_end && rule.time_end.length >= 5 ? rule.time_end.substring(0, 5) : '18:00'
      });
    }
  }
  return slots;
}

function getActivitySlots(dateStr, activityRules) {
  const slots = [];
  for (const rule of activityRules) {
    if (!rule.is_active) continue;
    let cv = [];
    try { cv = typeof rule.cycle_values === 'string' ? JSON.parse(rule.cycle_values) : (rule.cycle_values || []); } catch (_) {}
    if (dateMatchesCycle(dateStr, rule.cycle_type, cv)) {
      slots.push({
        ruleId: rule.id,
        ruleName: rule.activity_name || '活动',
        timeStart: rule.time_start && rule.time_start.length >= 5 ? rule.time_start.substring(0, 5) : '09:00',
        timeEnd: rule.time_end && rule.time_end.length >= 5 ? rule.time_end.substring(0, 5) : '18:00'
      });
    }
  }
  return slots;
}

/** Convert "HH:MM" to minutes since midnight */
function timeToMin(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
}

/** Convert slot objects to {start, end} minute intervals */
function slotsToIntervals(slots) {
  return (slots || []).map(s => ({
    start: timeToMin(s.timeStart),
    end: timeToMin(s.timeEnd)
  }));
}

/** Merge overlapping/adjacent intervals. Returns sorted merged list. */
function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

/** Find first minute gap in [rangeStart, rangeEnd] not covered by mergedOpen.
 *  Returns gap minute, or -1 if fully covered. */
function findOpenGap(rangeStart, rangeEnd, mergedOpen) {
  let cursor = rangeStart;
  for (const iv of mergedOpen) {
    if (iv.start > cursor) return cursor;
    if (iv.end > cursor) cursor = iv.end;
    if (cursor >= rangeEnd) return -1;
  }
  return cursor < rangeEnd ? cursor : -1;
}

/** Check if [rangeStart, rangeEnd] overlaps any blocked interval.
 *  Returns the blocked interval that overlaps, or null. */
function findBlockedOverlap(rangeStart, rangeEnd, mergedBlocked) {
  for (const iv of mergedBlocked) {
    if (iv.start < rangeEnd && iv.end > rangeStart) return iv;
  }
  return null;
}

/**
 * Split a datetime range into per-date segments for open-hours/activity validation.
 * Returns [{date: "YYYY-MM-DD", timeStart: "HH:MM", timeEnd: "HH:MM"}]
 */
function splitByDate(startDate, endDate) {
  const segments = [];
  const cur = new Date(startDate);
  while (cur < endDate) {
    const segDate = fmtLocalDate(cur);
    const dayEnd = new Date(cur);
    dayEnd.setHours(23, 59, 59, 999);
    const segStart = cur > startDate ? '00:00' : fmtLocalTime(startDate);
    const segEnd = dayEnd < endDate ? '23:59' : fmtLocalTime(endDate);
    segments.push({ date: segDate, timeStart: segStart, timeEnd: segEnd });
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
  }
  return segments;
}

// ═══════════════════════════════════════════════════
// Browse venues
// ═══════════════════════════════════════════════════

router.post('/listVenuesForBooking', async (req, res) => {
  try {
    if (!req.openid) return res.json({ status: 'forbidden', message: '请先登录' });
    const venues = await venueModel.getAll();
    const venueList = [];
    for (const v of venues) {
      const rules = await venueBookingRuleModel.getByVenueId(v.id);
      let approvalType = 'unknown';
      if (!rules.length) approvalType = 'admin';
      else if (rules.some(r => r.rule_type === 'direct')) approvalType = 'direct';
      else approvalType = 'approval';
      venueList.push({
        id: v.id, name: v.name, location: v.location,
        description: v.description, imageUrl: v.image_url, approvalType
      });
    }
    res.json({ status: 'success', venues: venueList });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Schedule
// ═══════════════════════════════════════════════════

router.post('/getVenueSchedule', async (req, res) => {
  try {
    if (!req.openid) return res.json({ status: 'forbidden', message: '请先登录' });
    const venueId = safeString(req.body.venueId);
    const dateFrom = safeString(req.body.dateFrom);
    const dateTo = safeString(req.body.dateTo);
    if (!venueId || !dateFrom) return res.json({ status: 'invalid_params', message: '请提供场地ID和日期' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo))) {
      return res.json({ status: 'invalid_params', message: '日期格式不正确' });
    }

    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: '场地不存在或已停用' });

    const openRules = await venueOpenRuleModel.getByVenueId(venueId);
    const activityRules = await venueActivityRuleModel.getByVenueId(venueId);
    const endDate = dateTo || dateFrom;
    if (daysBetweenInclusive(dateFrom, endDate) < 1 || daysBetweenInclusive(dateFrom, endDate) > 31) {
      return res.json({ status: 'invalid_params', message: '一次最多查询31天' });
    }

    // Fetch ALL bookings that overlap with the week range
    const weekStart = dateFrom + ' 00:00';
    const weekEnd = endDate + ' 23:59';
    const allBookings = await venueBookingModel.getByVenueId(venueId, {
      statuses: ['approved', 'pending'],
      timeFrom: weekStart,
      timeTo: weekEnd
    });
    const activeBookings = allBookings;
    const orgId = await getCurrentOrgId();
    const currentHrId = await resolveHrId(req.openid);
    const currentAdmin = await adminInfoModel.getByOpenidGlobal(req.openid);
    const canViewBooking = (booking) => booking.creator_org_id === orgId || booking.approval_org_id === orgId
      || (!!currentHrId && booking.user_hr_id === currentHrId)
      || (!!currentAdmin && booking.creator_admin_id === currentAdmin.id);
    const detailBookings = activeBookings.filter(canViewBooking);

    // Resolve user names + department / identity / workGroup
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
        const hrList = await hrInfoModel.getByIds(hrIds);
        const deptIds = [...new Set(hrList.map(h => h.department_id).filter(Boolean))];
        const identIds = [...new Set(hrList.map(h => h.identity_id).filter(Boolean))];
        const wgIds = [...new Set(hrList.map(h => h.work_group_id).filter(Boolean))];

        // Fetch names in parallel
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
            name: h.name || '信息已失效',
            department: deptMap[h.department_id] || '',
            identity: identMap[h.identity_id] || '',
            workGroup: wgMap[h.work_group_id] || ''
          };
        });
      } catch (_) {}
    }

    const dailySchedules = [];
    const cur = parseLocalDate(dateFrom);
    const end = parseLocalDate(endDate);

    while (cur <= end) {
      const dateStr = fmtLocalDate(cur);
      const openSlots = getOpenSlots(dateStr, openRules);
      const activitySlots = getActivitySlots(dateStr, activityRules);

      // Filter bookings that overlap with this date
      const dayStart = dateStr + ' 00:00';
      const dayEnd = dateStr + ' 23:59';
      const dayBookings = activeBookings.filter(b => {
        const bs = fmtDatetime(new Date(b.time_start));
        const be = fmtDatetime(new Date(b.time_end));
        return bs < dayEnd && be > dayStart;
      });

      const bookedSlots = dayBookings.map(b => {
        const ts = fmtDatetime(new Date(b.time_start));
        const te = fmtDatetime(new Date(b.time_end));
        // Extract just the time portion if the booking is on this date, otherwise clip
        let displayStart = ts.substring(11, 16);
        let displayEnd = te.substring(11, 16);
        // If booking starts before this day, show 00:00
        if (ts < dayStart) displayStart = '00:00';
        // If booking ends after this day, show 24:00
        if (te > dayEnd) displayEnd = '24:00';
        if (!canViewBooking(b)) {
          return {
            id: b.id,
            visibility: 'occupancy_only',
            title: '已占用',
            description: '',
            status: 'occupied',
            timeStart: displayStart,
            timeEnd: displayEnd,
            fullTimeStart: ts,
            fullTimeEnd: te,
            type: 'booked',
            creatorType: 'anonymous',
            creatorName: '其他组织借用',
            creatorLabel: '跨组织占用',
            userName: '其他组织借用'
          };
        }
        return {
          id: b.id,
          visibility: 'details',
          title: b.title,
          description: b.description,
          status: b.status,
          timeStart: displayStart,
          timeEnd: displayEnd,
          fullTimeStart: ts,
          fullTimeEnd: te,
          type: 'booked',
          userId: b.user_hr_id,
          creatorType: b.creator_type || 'user',
          creatorName: b.creator_type === 'admin' ? (adminMap[b.creator_admin_id] || '管理员') : ((userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || '普通用户'),
          creatorLabel: b.creator_type === 'admin' ? '管理员创建' : '用户申请',
          userName: b.creator_type === 'admin' ? (adminMap[b.creator_admin_id] || '管理员') : ((userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || '普通用户'),
          userDept: (userMap[b.user_hr_id] && userMap[b.user_hr_id].department) || '',
          userIdentity: (userMap[b.user_hr_id] && userMap[b.user_hr_id].identity) || '',
          userWorkGroup: (userMap[b.user_hr_id] && userMap[b.user_hr_id].workGroup) || ''
        };
      });

      dailySchedules.push({ date: dateStr, openSlots, activitySlots, bookedSlots });
      cur.setDate(cur.getDate() + 1);
    }

    res.json({ status: 'success', venueId, venueName: venue.name, dailySchedules });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Create Booking
// ═══════════════════════════════════════════════════

router.post('/createVenueBooking', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const venueId = safeString(req.body.venueId);
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const timeStartStr = safeString(req.body.timeStart); // "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM"
    const timeEndStr = safeString(req.body.timeEnd);

    if (!venueId || !timeStartStr || !timeEndStr) {
      return res.json({ status: 'invalid_params', message: '请填写完整信息' });
    }
    if (!title) {
      return res.json({ status: 'invalid_params', message: '请填写借用事由' });
    }

    if (title.length > 100 || description.length > 1000) {
      return res.json({ status: 'invalid_params', message: '借用事由或说明过长' });
    }

    const startDate = parseDatetime(timeStartStr);
    const endDate = parseDatetime(timeEndStr);
    if (!startDate || !endDate) {
      return res.json({ status: 'invalid_params', message: '时间格式不正确' });
    }
    if (startDate >= endDate) {
      return res.json({ status: 'invalid_params', message: '结束时间必须晚于开始时间' });
    }

    // Reject cross-day bookings
    if (fmtLocalDate(startDate) !== fmtLocalDate(endDate)) {
      return res.json({ status: 'invalid_params', message: '借用时间不能跨天' });
    }

    // Check venue
    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: '场地不存在或已停用' });

    const dbTimeStart = fmtDatetime(startDate);
    const dbTimeEnd = fmtDatetime(endDate);

    // Cross-day validation: split into per-date segments, validate with interval merging
    const openRules = await venueOpenRuleModel.getByVenueId(venueId);
    const activityRules = await venueActivityRuleModel.getByVenueId(venueId);
    const segments = splitByDate(startDate, endDate);

    for (const seg of segments) {
      const segStart = timeToMin(seg.timeStart);
      const segEnd = timeToMin(seg.timeEnd);

      // Check open hours — MUST have open slots covering the entire segment
      const openSlots = getOpenSlots(seg.date, openRules);
      if (!openSlots.length) {
        return res.json({ status: 'invalid_state', message: seg.date + ' 场地全天不开放' });
      }
      const mergedOpen = mergeIntervals(slotsToIntervals(openSlots));
      const gap = findOpenGap(segStart, segEnd, mergedOpen);
      if (gap >= 0) {
        const hh = String(Math.floor(gap / 60)).padStart(2, '0');
        const mm = String(gap % 60).padStart(2, '0');
        return res.json({ status: 'invalid_state', message: seg.date + ' ' + hh + ':' + mm + ' 场地不开放' });
      }

      // Check activity conflicts — any overlap with activity slots is rejected
      const actSlots = getActivitySlots(seg.date, activityRules);
      if (actSlots.length) {
        const mergedActivity = mergeIntervals(slotsToIntervals(actSlots));
        const actConflict = findBlockedOverlap(segStart, segEnd, mergedActivity);
        if (actConflict) {
          return res.json({ status: 'conflict', message: seg.date + ' ' + seg.timeStart + '-' + seg.timeEnd + ' 有活动占用' });
        }
      }
    }

    await conn.beginTransaction();

    const id = generateId();
    const orgId = await getCurrentOrgId();
    const dedupClaim = await requestDeduplication.claim(conn, {
      orgId,
      actorKey: 'user:' + hrId,
      operationType: 'create_venue_booking',
      clientRequestId: req.body.clientRequestId,
      resourceId: id
    });
    if (!dedupClaim.claimed) {
      await conn.commit();
      return res.json(dedupClaim.response || {
        status: 'success', id: dedupClaim.resourceId, message: '借用申请已提交', idempotent: true
      });
    }

    // Check booking conflicts (across full datetime range)
    const conflict = await venueBookingModel.findConflict(venueId, dbTimeStart, dbTimeEnd, null, conn, true);
    if (conflict) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: '该时段已被其他借用占用' });
    }

    // Determine approval priority:
    //   1. direct rule → auto-approve (highest priority)
    //   2. approval flow → multi-step user approval
    //   3. admin rule or no rules → admin approval (default)
    const bookingRules = await venueBookingRuleModel.getByVenueId(venueId);
    const hasDirect = bookingRules.some(r => r.rule_type === 'direct');

    let autoApprove = false;
    let approvalFlowId = null;
    let approvalTotalSteps = 0;

    if (hasDirect) {
      // Direct: no approval needed at all
      autoApprove = true;
    } else {
      // Check for approval flow (user review)
      const approvalFlow = await venueApprovalFlowModel.getByVenueId(venueId);
      if (approvalFlow) {
        const steps = await venueApprovalFlowStepModel.getByFlowId(approvalFlow.id);
        if (steps.length) {
          approvalFlowId = approvalFlow.id;
          approvalTotalSteps = steps.length;
        }
        // If flow has no steps, fall through to admin default
      }
      // If no flow or empty flow → admin approval (autoApprove stays false)
    }

    const status = autoApprove ? 'approved' : 'pending';

    await venueBookingModel.create(id, {
      venueId, userHrId: hrId, title, description,
      creatorPersonId: req.authContext && req.authContext.personId,
      creatorAssignmentId: req.authContext && req.authContext.assignmentId,
      creatorContextSnapshot: req.authContext ? {
        contextId: req.authContext.contextId,
        organizationId: req.authContext.organizationId,
        role: req.authContext.role,
        identityName: req.authContext.identityName,
        department: req.authContext.department,
        identity: req.authContext.identity,
        workGroup: req.authContext.workGroup
      } : null,
      creatorOrgId: orgId, approvalOrgId: orgId,
      timeStart: dbTimeStart, timeEnd: dbTimeEnd, status,
      approvalFlowId, approvalTotalSteps
    }, conn);

    const response = {
      status: 'success', id, bookingStatus: status,
      message: autoApprove ? '借用成功（直接通过）'
        : (approvalFlowId ? ('借用申请已提交，共 ' + approvalTotalSteps + ' 步审批') : '借用申请已提交，等待审核')
    };
    await requestDeduplication.complete(conn, {
      ...dedupClaim,
      resourceId: id,
      orgId,
      actorKey: 'user:' + hrId,
      operationType: 'create_venue_booking'
    }, response);
    await conn.commit();

    // Fire-and-forget: notify step 1 approvers
    if (approvalFlowId && approvalTotalSteps > 0) {
      createVenueApprovalNotifications(id, 0).catch(e =>
        console.error('[venueUser] notification creation failed:', e.message));
    }

    res.json(response);
  } catch (e) {
    await conn.rollback();
    if (e && e.code === 'INVALID_CLIENT_REQUEST_ID') {
      return res.json({ status: 'invalid_params', message: '请求标识格式不正确' });
    }
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

// ═══════════════════════════════════════════════════
// My Bookings
// ═══════════════════════════════════════════════════

router.post('/listMyVenueBookings', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const bookings = await venueBookingModel.getByUserId(hrId);
    const list = bookings.map(b => ({
      id: b.id,
      venueId: b.venue_id,
      venueName: b.venue_name,
      venueLocation: b.venue_location,
      title: b.title,
      description: b.description,
      timeStart: fmtDatetime(new Date(b.time_start)),
      timeEnd: fmtDatetime(new Date(b.time_end)),
      status: b.status,
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
    const approverHrIdSet = new Set();
    for (const item of list) {
      if (item.approvalProgress && item.approvalProgress.snapshots) {
        for (const snap of item.approvalProgress.snapshots) {
          if (snap.approverHrId) approverHrIdSet.add(snap.approverHrId);
        }
      }
    }
    if (approverHrIdSet.size) {
      try {
        const approverHrList = await hrInfoModel.getByIds([...approverHrIdSet]);
        const nameMap = {};
        (approverHrList || []).forEach(h => { nameMap[h.id] = h.name || ''; });
        for (const item of list) {
          if (item.approvalProgress && item.approvalProgress.snapshots) {
            for (const snap of item.approvalProgress.snapshots) {
              snap.approverName = snap.approverName || nameMap[snap.approverHrId] || '';
            }
          }
        }
      } catch (_) {}
    }

    // Attach flow step definitions to each booking's approvalProgress
    try {
      const flowBookings = list.filter(b => b.approvalProgress && b.approvalProgress.flowId);
      if (flowBookings.length) {
        const flowIds = [...new Set(flowBookings.map(b => b.approvalProgress.flowId))];
        const flowStepsMap = {};
        for (const flowId of flowIds) {
          try {
            const steps = await venueApprovalFlowStepModel.getByFlowId(flowId);
            flowStepsMap[flowId] = steps.map(s => ({
              sortOrder: s.sort_order,
              name: s.name,
              actionType: s.action_type
            }));
          } catch (_) { flowStepsMap[flowId] = []; }
        }
        for (const b of flowBookings) {
          b.approvalProgress.flowSteps = flowStepsMap[b.approvalProgress.flowId] || [];
        }
      }
    } catch (_) { /* silently ignore — flow timeline won't render full step names */ }

    res.json({ status: 'success', bookings: list });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Pending Approvals (for current user)
// ═══════════════════════════════════════════════════

router.post('/listPendingVenueApprovals', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok) {
      return res.json({ status: actorResult.status, message: actorResult.message });
    }
    const actor = actorResult.actor;

    const orgId = await getCurrentOrgId();

    // 仅加载当前审批组织的待办；其他组织只能在排期中看到匿名占用。
    const [bookings] = await pool.query(
      `SELECT b.*, v.name AS venue_name, v.location AS venue_location
       FROM venue_bookings b
       JOIN venues v ON v.id = b.venue_id
       WHERE b.status = 'pending'
         AND b.approval_org_id = ?
         AND b.approval_flow_id IS NOT NULL
         AND b.approval_total_steps > 0
       ORDER BY b.created_at DESC`,
      [orgId]
    );

    if (!bookings.length) {
      return res.json({ status: 'success', pending: [] });
    }

    // Get the applicant HR info for all bookings
    const applicantHrIds = [...new Set(bookings.map(b => b.user_hr_id).filter(Boolean))];
    const applicantMap = {};
    if (applicantHrIds.length) {
      const hrList = await hrInfoModel.getByIds(applicantHrIds);
      (hrList || []).forEach(h => { applicantMap[h.id] = h; });
    }

    // For each booking, check if the current step's rules match the approver
    const pending = [];
    for (const booking of bookings) {
      const currentStep = booking.approval_current_step;
      if (currentStep < 0 || currentStep >= booking.approval_total_steps) continue;

      // Get flow steps
      const [flowSteps] = await pool.query(
        'SELECT * FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
        [booking.approval_flow_id, orgId]
      );

      if (!flowSteps.length || currentStep >= flowSteps.length) continue;

      const step = flowSteps[currentStep];
      if (!step) continue;

      // Get rules for this step
      const [stepRules] = await pool.query(
        'SELECT * FROM venue_approval_flow_step_rules WHERE step_id = ? AND org_id = ? ORDER BY sort_order',
        [step.id, orgId]
      );

      const applicantHrInfo = applicantMap[booking.user_hr_id] || null;

      step.rules = stepRules;
      const authorization = evaluateVenueApprovalStep({
        booking,
        actor,
        steps: flowSteps,
        applicantHrInfo
      });
      if (!authorization.ok) continue;

      // Build snapshot info
      let snapshots = [];
      try {
        snapshots = booking.approval_snapshots_json ? JSON.parse(booking.approval_snapshots_json) : [];
      } catch (_) {}

      // Build flowSteps array for timeline rendering
      const flowStepNames = flowSteps.map(s => ({
        sortOrder: s.sort_order,
        name: s.name,
        actionType: s.action_type
      }));

      pending.push({
        id: booking.id,
        venueId: booking.venue_id,
        venueName: booking.venue_name,
        venueLocation: booking.venue_location,
        title: booking.title,
        description: booking.description,
        userName: (applicantHrInfo && applicantHrInfo.name) || '信息已失效',
        userDept: (applicantHrInfo && applicantHrInfo.department_id) || '',
        timeStart: fmtDatetime(new Date(booking.time_start)),
        timeEnd: fmtDatetime(new Date(booking.time_end)),
        status: booking.status,
        approvalFlowId: booking.approval_flow_id,
        approvalCurrentStep: booking.approval_current_step,
        approvalTotalSteps: booking.approval_total_steps,
        currentStepName: step.name || ('第' + (currentStep + 1) + '步'),
        currentStepIndex: currentStep,
        flowSteps: flowStepNames,
        snapshots: snapshots,
        createdAt: booking.created_at
      });
    }

    // ── Batch-resolve approver names from snapshots ──
    const pendingSnapshotHrIds = new Set();
    for (const item of pending) {
      if (item.snapshots) {
        for (const snap of item.snapshots) {
          if (snap.approverHrId) pendingSnapshotHrIds.add(snap.approverHrId);
        }
      }
    }
    if (pendingSnapshotHrIds.size) {
      try {
        const approverHrList = await hrInfoModel.getByIds([...pendingSnapshotHrIds]);
        const nameMap = {};
        (approverHrList || []).forEach(h => { nameMap[h.id] = h.name || ''; });
        for (const item of pending) {
          if (item.snapshots) {
            for (const snap of item.snapshots) {
              snap.approverName = snap.approverName || nameMap[snap.approverHrId] || '';
            }
          }
        }
      } catch (_) {}
    }

    // Self-healing: ensure notifications exist for found pending bookings (fire-and-forget)
    const notificationRecipientId = actor.type === 'user' ? actor.id : '';
    for (const p of pending) {
      if (!notificationRecipientId) continue;
      notificationModel.hasPendingApprovalNotification('booking', p.id, notificationRecipientId).then(has => {
        if (!has) {
          createVenueApprovalNotifications(p.id, p.currentStepIndex).catch(e =>
            console.error('[venueUser:reconcile] notification creation failed:', e.message));
        }
      }).catch(() => {});
    }

    res.json({ status: 'success', pending });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/cancelVenueBooking', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || '请先选择普通岗位身份' });
    }
    const actor = actorResult.actor;
    const hrId = actor.id;
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.user_hr_id !== hrId) return res.json({ status: 'forbidden', message: '只能取消自己的借用' });
    if (booking.status === 'cancelled') return res.json({ status: 'invalid_state', message: '该借用已被取消' });
    if (booking.status === 'rejected') return res.json({ status: 'invalid_state', message: '已驳回的借用不能取消' });
    // 已通过的借用，如果已经开始（now >= timeStart），不能取消
    if (booking.status === 'approved') {
      const now = new Date();
      const timeStart = new Date(booking.time_start);
      if (now >= timeStart) {
        return res.json({ status: 'invalid_state', message: '借用已开始，请结束使用' });
      }
    }
    await venueBookingModel.updateStatus(id, 'cancelled', hrId, '申请人取消', null, actor);
    await notificationModel.deleteByTarget('booking', id);
    res.json({ status: 'success', message: '借用已取消' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// End Use (提前结束使用)
// ═══════════════════════════════════════════════════

router.post('/endVenueBooking', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.user_hr_id !== hrId) return res.json({ status: 'forbidden', message: '只能结束自己的借用' });
    if (booking.status !== 'approved') return res.json({ status: 'invalid_state', message: '当前借用不能结束使用' });

    const now = new Date();
    const timeStart = new Date(booking.time_start);
    const timeEnd = new Date(booking.time_end);

    if (now < timeStart) {
      return res.json({ status: 'invalid_state', message: '借用尚未开始，请取消借用' });
    }
    if (now >= timeEnd) {
      return res.json({ status: 'invalid_state', message: '借用已经结束' });
    }

    // Set time_end to now (early end)
    const dbTimeEnd = fmtDatetime(now);
    await venueBookingModel.updateTimeEnd(id, dbTimeEnd);
    res.json({ status: 'success', message: '使用已结束' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
