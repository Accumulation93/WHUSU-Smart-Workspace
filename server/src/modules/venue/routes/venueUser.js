const localeCopy = require('../../../locales/zh-CN/generated/modules/venue/routes/venueUser');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const { resolveCurrentActor } = require('../../../core/services/currentActor');
const { resolveVenueViewerScope, canViewBookingDetails, resolveVenueOrgNames } = require('../services/venueViewerScope');
const venueModel = require('../models/venue');
const venueOpenRuleModel = require('../models/venueOpenRule');
const venueActivityRuleModel = require('../models/venueActivityRule');
const venueBookingRuleModel = require('../models/venueBookingRule');
const venueBookingPolicyModel = require('../models/venueBookingPolicy');
const venueBookingModel = require('../models/venueBooking');
const venueApprovalFlowModel = require('../models/venueApprovalFlow');
const venueApprovalFlowStepModel = require('../models/venueApprovalFlowStep');
const { createVenueApprovalNotifications } = require('../utils/venueNotificationHelper');
const notificationModel = require('../../audit/models/notification');
const requestDeduplication = require('../../../utils/requestDeduplication');
const venueApprovalMultiFlow = require('../services/venueApprovalMultiFlow');
const {
  toRuleProfile,
  toAssignmentSnapshot,
  resolveCurrentActorAssignment,
  resolveBookingApplicantAssignment,
  resolveBookingApplicantAssignments,
  listAccountWorkActors,
  listApproverCandidates
} = require('../services/venueAssignmentContext');
const { fromRow, validateBookingWindow } = require('../services/venueBookingWindow');
const { findMyVenueApproval, matchesApprovalContext } = require('../services/venueApprovalHistory');
const { getActivitySlots: buildActivitySlots } = require('../services/venueActivitySchedule');
const { evaluateBookingRuleWorkContexts } = require('../services/venueBookingRuleAuthorization');

function assignmentDisplay(assignment) {
  const hasHistoricalSnapshot = Boolean(assignment && assignment.historicalSnapshotComplete);
  return {
    name: safeString(assignment && assignment.personName),
    department: hasHistoricalSnapshot ? safeString(assignment.departmentName) : '',
    identity: hasHistoricalSnapshot ? safeString(assignment.identityCategoryName) : '',
    workGroup: hasHistoricalSnapshot ? safeString(assignment.workGroupName) : '',
    departmentId: hasHistoricalSnapshot ? safeString(assignment.departmentId) : '',
    identityCategoryId: hasHistoricalSnapshot ? safeString(assignment.identityCategoryId) : '',
    workGroupId: hasHistoricalSnapshot ? safeString(assignment.workGroupId) : '',
    assignmentId: safeString(assignment && assignment.assignmentId),
    assignmentLabel: hasHistoricalSnapshot ? safeString(assignment.assignmentLabel) : ''
  };
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

function getVenueDisplayStatus(booking) {
  const status = safeString(booking && booking.status);
  if (status === 'pending' || status === 'rejected' || status === 'cancelled') return status;
  if (status === 'approved') {
    const now = new Date();
    const timeStart = new Date(booking.time_start);
    const timeEnd = new Date(booking.time_end);
    if (now < timeStart) return 'approved';
    if (now >= timeEnd) return 'completed';
    return 'inUse';
  }
  return status;
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
        ruleName: rule.name || localeCopy.copy_6e6ee2b747,
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
    if (!req.openid) return res.json({ status: 'forbidden', message: localeCopy.copy_20ca49e5e7 });
    const venues = await venueModel.getAll();
    const venueList = [];
    for (const v of venues) {
      const rules = await venueBookingRuleModel.getByVenueId(v.id);
      const bookingWindow = fromRow(await venueBookingPolicyModel.getByVenueId(v.id));
      let approvalType = 'unknown';
      if (!rules.length) approvalType = 'admin';
      else if (rules.some(r => r.rule_type === 'direct')) approvalType = 'direct';
      else approvalType = 'approval';
      venueList.push({
        id: v.id, name: v.name, location: v.location,
        description: v.description, imageUrl: v.image_url, approvalType, bookingWindow
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
    if (!req.openid) return res.json({ status: 'forbidden', message: localeCopy.copy_20ca49e5e7 });
    const venueId = safeString(req.body.venueId);
    const dateFrom = safeString(req.body.dateFrom);
    const dateTo = safeString(req.body.dateTo);
    if (!venueId || !dateFrom) return res.json({ status: 'invalid_params', message: localeCopy.copy_334da572b2 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo))) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_ab5ebc56e8 });
    }

    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: localeCopy.copy_04ab0b03d0 });

    const openRules = await venueOpenRuleModel.getByVenueId(venueId);
    const activityRules = await venueActivityRuleModel.getByVenueId(venueId);
    const endDate = dateTo || dateFrom;
    if (daysBetweenInclusive(dateFrom, endDate) < 1 || daysBetweenInclusive(dateFrom, endDate) > 31) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_d333186648 });
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
    const viewerScope = await resolveVenueViewerScope(
      req.openid,
      req.authContext && req.authContext.personId
    );
    const canViewDetails = (booking) => canViewBookingDetails(booking, viewerScope);
    const detailBookings = activeBookings.filter(canViewDetails);
    const applicantAssignments = await resolveBookingApplicantAssignments(detailBookings);
    const orgNameMap = await resolveVenueOrgNames(
      detailBookings.map(b => safeString(b.creator_org_id) || safeString(b.approval_org_id))
    );

    // 与借用记录列表一致：为可见借用补充审批进度（流程步骤、快照）与审批人姓名
    const flowStepsMap = {};
    const approvalBookings = detailBookings.filter(b => b.approval_flow_id && b.approval_total_steps > 0);
    if (approvalBookings.length) {
      const stepKeys = [...new Set(
        approvalBookings.map(b => b.approval_flow_id + '|' + safeString(b.approval_org_id))
      )];
      for (const key of stepKeys) {
        const sep = key.indexOf('|');
        const flowId = key.slice(0, sep);
        const flowOrg = key.slice(sep + 1);
        const [steps] = await pool.query(
          'SELECT sort_order, name FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
          [flowId, flowOrg]
        );
        flowStepsMap[key] = (steps || []).map(s => ({
          sortOrder: s.sort_order,
          name: s.name,
          actionType: ''
        }));
      }
    }
    const snapshotHrIds = new Set();
    approvalBookings.forEach(b => {
      try {
        const snaps = b.approval_snapshots_json ? JSON.parse(b.approval_snapshots_json) : [];
        snaps.forEach(s => { if (s.approverHrId) snapshotHrIds.add(s.approverHrId); });
      } catch (_) {}
    });
    const approverNameMap = {};
    if (snapshotHrIds.size) {
      const snapIds = [...snapshotHrIds];
      const snapPlaceholders = snapIds.map(() => '?').join(',');
      const [approverRows] = await pool.query(
        `SELECT id, name FROM hr_info WHERE id IN (${snapPlaceholders})`,
        snapIds
      );
      (approverRows || []).forEach(r => { approverNameMap[r.id] = r.name || ''; });
    }

    // Resolve user names + department / identity / workGroup
    const hrIds = [...new Set(detailBookings.map(b => b.user_hr_id).filter(Boolean))];
    const userMap = {};
    const adminIds = [...new Set(detailBookings.filter(b => b.creator_type === 'admin').map(b => b.creator_admin_id).filter(Boolean))];
    const adminMap = {};
    if (adminIds.length) {
      const [adminRows] = await pool.query('SELECT id, name FROM admin_info WHERE id IN (?)', [adminIds]);
      adminRows.forEach(item => { adminMap[item.id] = item.name || localeCopy.copy_c01a9aef59; });
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
            name: h.name || localeCopy.copy_de00c3e48a,
            department: deptMap[org + '|' + h.department_id] || '',
            identity: identMap[org + '|' + h.identity_id] || '',
            workGroup: wgMap[org + '|' + h.work_group_id] || ''
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
      const activitySlots = buildActivitySlots(dateStr, activityRules);

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
        if (!canViewDetails(b)) {
          return {
            id: b.id,
            visibility: 'occupancy_only',
            title: localeCopy.copy_181feafbe5,
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
        const applicant = assignmentDisplay(applicantAssignments.get(safeString(b.id)));
        return {
          id: b.id,
          visibility: 'details',
          venueName: venue.name,
          venueLocation: venue.location,
          title: b.title,
          description: b.description,
          orgName: orgNameMap[safeString(b.creator_org_id)] || orgNameMap[safeString(b.approval_org_id)] || '',
          status: b.status,
          timeStart: displayStart,
          timeEnd: displayEnd,
          fullTimeStart: ts,
          fullTimeEnd: te,
          type: 'booked',
          userId: b.user_hr_id,
          userHrId: b.user_hr_id,
          creatorType: b.creator_type || 'user',
          creatorName: b.creator_type === 'admin' ? (adminMap[b.creator_admin_id] || localeCopy.copy_c01a9aef59) : (applicant.name || (userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || localeCopy.copy_e075eae47d),
          creatorLabel: b.creator_type === 'admin' ? '管理员创建' : '用户申请',
          userName: b.creator_type === 'admin' ? (adminMap[b.creator_admin_id] || localeCopy.copy_c01a9aef59) : (applicant.name || (userMap[b.user_hr_id] && userMap[b.user_hr_id].name) || localeCopy.copy_e075eae47d),
          userDept: applicant.department,
          userIdentity: applicant.identity,
          userWorkGroup: applicant.workGroup,
          creatorAssignmentId: applicant.assignmentId,
          creatorAssignmentLabel: b.creator_type === 'admin'
            ? ''
            : (applicant.assignmentLabel || localeCopy.historicalAssignmentMissing),
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
              try {
                const snaps = b.approval_snapshots_json ? JSON.parse(b.approval_snapshots_json) : [];
                snaps.forEach(s => { s.approverName = s.approverName || approverNameMap[s.approverHrId] || ''; });
                return snaps;
              } catch (_) { return []; }
            })(),
            flowSteps: flowStepsMap[b.approval_flow_id + '|' + safeString(b.approval_org_id)] || []
          } : null
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

// 用户端：返回场地审批流选项（可选择的流程与指定开关）
router.post('/getVenueApprovalFlowOptions', async (req, res) => {
  try {
    const venueId = safeString(req.body.venueId);
    if (!venueId) return res.json({ status: 'invalid_params', message: localeCopy.copy_3458928c55 });
    const flows = await venueApprovalFlowModel.listByVenueId(venueId);
    const options = flows.map(function(flow) {
      return {
        id: flow.id,
        name: flow.name || localeCopy.copy_890d7f4874,
        allowUserSelect: Number(flow.allow_user_select) === 1,
        allowDesignateFirst: Number(flow.allow_designate_first) === 1,
        allowDesignateNext: Number(flow.allow_designate_next) === 1
      };
    });
    const allowUserSelect = options.some(function(option) { return option.allowUserSelect; });
    res.json({ status: 'success', allowUserSelect, flows: options });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// 用户端：返回当前组织可用于指定审批人的成员候选
router.post('/listVenueApproverCandidates', async (req, res) => {
  try {
    const orgId = await getCurrentOrgId();
    const candidates = await listApproverCandidates(orgId, req.body.excludeHrId);
    res.json({
      status: 'success',
      candidates
    });
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
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || localeCopy.copy_bba7f8b8ba });
    }
    const orgId = await getCurrentOrgId();
    const applicantAssignment = await resolveCurrentActorAssignment(actorResult.actor, orgId);
    if (!applicantAssignment) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_bba7f8b8ba });
    }
    const hrId = applicantAssignment.legacyHrId;

    const venueId = safeString(req.body.venueId);
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const timeStartStr = safeString(req.body.timeStart); // "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM"
    const timeEndStr = safeString(req.body.timeEnd);

    if (!venueId || !timeStartStr || !timeEndStr) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_9dc5c7d79f });
    }
    if (!title) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_7db68605c6 });
    }

    if (title.length > 100 || description.length > 1000) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_ea94858596 });
    }

    const startDate = parseDatetime(timeStartStr);
    const endDate = parseDatetime(timeEndStr);
    if (!startDate || !endDate) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_7873aabe9e });
    }
    if (startDate >= endDate) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_0b091cba77 });
    }

    // Reject cross-day bookings
    if (fmtLocalDate(startDate) !== fmtLocalDate(endDate)) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_f450f21538 });
    }

    // Check venue
    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: localeCopy.copy_04ab0b03d0 });

    const bookingPolicy = await venueBookingPolicyModel.getByVenueId(venueId);
    const windowError = validateBookingWindow(bookingPolicy, startDate, new Date());
    if (windowError) return res.json({ status: 'invalid_state', message: windowError.message });

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
        return res.json({ status: 'invalid_state', message: seg.date + localeCopy.copy_96d1893745 });
      }
      const mergedOpen = mergeIntervals(slotsToIntervals(openSlots));
      const gap = findOpenGap(segStart, segEnd, mergedOpen);
      if (gap >= 0) {
        const hh = String(Math.floor(gap / 60)).padStart(2, '0');
        const mm = String(gap % 60).padStart(2, '0');
        return res.json({ status: 'invalid_state', message: seg.date + ' ' + hh + ':' + mm + localeCopy.copy_70d4911767 });
      }

      // Check activity conflicts — any overlap with activity slots is rejected
      const actSlots = buildActivitySlots(seg.date, activityRules);
      if (actSlots.length) {
        const mergedActivity = mergeIntervals(slotsToIntervals(actSlots));
        const actConflict = findBlockedOverlap(segStart, segEnd, mergedActivity);
        if (actConflict) {
          return res.json({ status: 'conflict', message: seg.date + ' ' + seg.timeStart + '-' + seg.timeEnd + localeCopy.copy_c615bb412f });
        }
      }
    }

    await conn.beginTransaction();

    const id = generateId();
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
        status: 'success', id: dedupClaim.resourceId, message: localeCopy.copy_02339c7f77, idempotent: true
      });
    }

    // Check booking conflicts (across full datetime range)
    const conflict = await venueBookingModel.findConflict(venueId, dbTimeStart, dbTimeEnd, null, conn, true);
    if (conflict) {
      await conn.rollback();
      return res.json({ status: 'conflict', message: localeCopy.copy_dcd1184a46 });
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
    let approvalFlowState = null;

    if (hasDirect) {
      // Direct: no approval needed at all
      autoApprove = true;
    } else {
      // 多审批流：允许用户选择时必选；否则全部流程并行
      const approvalFlows = await venueApprovalFlowModel.listByVenueId(venueId);
      if (approvalFlows.length) {
        const allowUserSelect = approvalFlows.some(function(flow) { return Number(flow.allow_user_select) === 1; });
        let selectedFlowId = null;
        if (allowUserSelect) {
          selectedFlowId = safeString(req.body.flowId);
          const selectable = approvalFlows.find(function(flow) {
            return String(flow.id) === selectedFlowId && Number(flow.allow_user_select) === 1;
          });
          if (!selectable) {
            await conn.rollback();
            return res.json({ status: 'invalid_params', message: localeCopy.copy_29ea17e75c });
          }
        }
        const stepsByFlow = {};
        for (const flow of approvalFlows) {
          stepsByFlow[flow.id] = await venueApprovalFlowStepModel.getByFlowId(flow.id, flow.org_id || orgId);
        }
        const activeFlows = approvalFlows.filter(function(flow) {
          return (stepsByFlow[flow.id] || []).length > 0;
        });
        if (activeFlows.length) {
          const applicantHrInfo = toRuleProfile(applicantAssignment);
          const singleSelected = selectedFlowId
            ? approvalFlows.find(function(flow) { return String(flow.id) === selectedFlowId; })
            : (activeFlows.length === 1 ? activeFlows[0] : null);
          let firstDesignation = null;
          if (singleSelected && Number(singleSelected.allow_designate_first) === 1) {
            const firstStep = (stepsByFlow[singleSelected.id] || [])[0];
            if (req.body.firstApproverHrId && !req.body.firstApproverAssignmentId) {
              await conn.rollback();
              return res.json({ status: 'invalid_params', message: localeCopy.copy_legacyApproverSelection });
            }
            if (firstStep && safeString(firstStep.approval_mode) !== 'admin_any' && req.body.firstApproverAssignmentId) {
              const validatedDesignation = await venueApprovalMultiFlow.validateDesignation(
                orgId,
                req.body.firstApproverAssignmentId,
                firstStep,
                applicantHrInfo
              );
              firstDesignation = validatedDesignation;
            }
          }
          approvalFlowState = venueApprovalMultiFlow.buildInitialFlowState(activeFlows, selectedFlowId, firstDesignation);
          approvalFlowId = selectedFlowId || activeFlows[0].id;
          approvalTotalSteps = selectedFlowId
            ? (stepsByFlow[selectedFlowId] || []).length
            : Math.max.apply(null, activeFlows.map(function(flow) { return (stepsByFlow[flow.id] || []).length; }));
        }
      }
    }

    const status = autoApprove ? 'approved' : 'pending';

    await venueBookingModel.create(id, {
      venueId, userHrId: hrId, title, description,
      creatorPersonId: applicantAssignment.personId,
      creatorAssignmentId: applicantAssignment.assignmentId,
      creatorContextSnapshot: Object.assign({ role: 'user' }, toAssignmentSnapshot(Object.assign(
        {},
        applicantAssignment,
        { contextId: actorResult.actor.contextId }
      ))),
      creatorOrgId: orgId, approvalOrgId: orgId,
      timeStart: dbTimeStart, timeEnd: dbTimeEnd, status,
      approvalFlowId, approvalFlowState, approvalTotalSteps
    }, conn);

    const response = {
      status: 'success', id, bookingStatus: status,
      message: autoApprove ? '借用已通过'
        : (approvalFlowId ? ('借用申请已提交，等待 ' + approvalTotalSteps + localeCopy.copy_1648a1e6e4) : '借用申请已提交，等待审批')
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
      return res.json({ status: 'invalid_params', message: localeCopy.copy_6fb89690d9 });
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
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || localeCopy.copy_bba7f8b8ba });
    }
    const orgId = await getCurrentOrgId();
    const currentAssignment = await resolveCurrentActorAssignment(actorResult.actor, orgId);
    if (!currentAssignment) return res.json({ status: 'forbidden', message: localeCopy.copy_bba7f8b8ba });
    const hrId = currentAssignment.legacyHrId;
    const bookings = await venueBookingModel.getByUserId(hrId);
    const applicantAssignments = await resolveBookingApplicantAssignments(bookings);
    const orgNameMap = await resolveVenueOrgNames(
      bookings.map(b => safeString(b.creator_org_id) || safeString(b.approval_org_id))
    );
    const list = bookings.map(b => {
      const display = assignmentDisplay(applicantAssignments.get(safeString(b.id)));
      return {
      id: b.id,
      venueId: b.venue_id,
      venueName: b.venue_name,
      venueLocation: b.venue_location,
      orgName: orgNameMap[safeString(b.creator_org_id)] || orgNameMap[safeString(b.approval_org_id)] || '',
      approvalOrgId: safeString(b.approval_org_id),
      title: b.title,
      description: b.description,
      userName: display.name || b.user_name || localeCopy.copy_de00c3e48a,
      userDept: display.department,
      userIdentity: display.identity,
      userWorkGroup: display.workGroup,
      creatorAssignmentId: display.assignmentId,
      creatorAssignmentLabel: display.assignmentLabel || localeCopy.historicalAssignmentMissing,
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
    };
    });
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
        const snapshotHrIds = [...approverHrIdSet];
        const approverPlaceholders = snapshotHrIds.map(() => '?').join(',');
        const [approverHrList] = await pool.query(
          `SELECT id, name FROM hr_info WHERE id IN (${approverPlaceholders})`,
          snapshotHrIds
        );
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
        const flowKeys = [...new Set(flowBookings.map(function(booking) {
          return booking.approvalProgress.flowId + '|' + booking.approvalOrgId;
        }))];
        const flowStepsMap = {};
        for (const flowKey of flowKeys) {
          const separator = flowKey.indexOf('|');
          const flowId = flowKey.slice(0, separator);
          const flowOrgId = flowKey.slice(separator + 1);
          try {
            const steps = await venueApprovalFlowStepModel.getByFlowId(flowId, flowOrgId);
            flowStepsMap[flowKey] = steps.map(s => ({
              sortOrder: s.sort_order,
              name: s.name,
              actionType: s.action_type
            }));
          } catch (_) { flowStepsMap[flowKey] = []; }
        }
        for (const b of flowBookings) {
          const flowKey = b.approvalProgress.flowId + '|' + b.approvalOrgId;
          b.approvalProgress.flowSteps = flowStepsMap[flowKey] || [];
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
    let actor = actorResult.actor;
    const orgId = await getCurrentOrgId();
    if (actor.type === 'user') {
      const assignment = await resolveCurrentActorAssignment(actor, orgId);
      if (!assignment) return res.json({ status: 'forbidden', message: localeCopy.copy_bba7f8b8ba });
      actor = Object.assign({}, actor, { assignment, profile: toRuleProfile(assignment) });
    }
    let workActors = req.authAccount && req.authAccount.id
      ? await listAccountWorkActors(req.authAccount.id)
      : [];
    if (!workActors.length) {
      if (actor.type === 'user') {
        const assignment = await resolveCurrentActorAssignment(actor, orgId);
        workActors = [Object.assign({}, actor, {
          organizationId: orgId,
          assignment,
          profile: assignment ? toRuleProfile(assignment) : null
        })];
      } else {
        workActors = [Object.assign({}, actor, { organizationId: orgId })];
      }
    }
    const approvalOrgIds = [...new Set(workActors.map(function(item) {
      return safeString(item.organizationId);
    }).filter(Boolean))];
    if (!approvalOrgIds.length) {
      return res.json({ status: 'success', pending: [] });
    }

    // 待办跨组织聚合；实际审批写接口仍强制当前服务端上下文命中目标组织和岗位。
    const [bookings] = await pool.query(
      `SELECT b.*, v.name AS venue_name, v.location AS venue_location
       FROM venue_bookings b
       JOIN venues v ON v.id = b.venue_id
       WHERE b.status = 'pending'
         AND b.approval_org_id IN (?)
       ORDER BY b.created_at DESC`,
      [approvalOrgIds]
    );

    if (!bookings.length) {
      return res.json({ status: 'success', pending: [] });
    }
    const orgNameMap = await resolveVenueOrgNames(
      bookings.map(b => safeString(b.creator_org_id) || safeString(b.approval_org_id))
    );

    const pending = [];
    for (const booking of bookings) {
      const targetOrgId = safeString(booking.approval_org_id);
      const isFlowBooking = Boolean(
        (booking.approval_flow_id || booking.approval_flow_state_json)
        && Number(booking.approval_total_steps) > 0
      );
      let canProcessInCurrentContext = false;
      let eligibleActors = [];
      let applicantHrInfo = null;
      let summary = { activeFlowIds: [], flowSummary: [] };
      let candidateMissing = false;
      if (isFlowBooking) {
        const contextEligibility = await venueApprovalMultiFlow.evaluateWorkContextEligibility(
          booking,
          workActors,
          actor.contextId,
          orgId
        );
        if (!contextEligibility.visible) continue;
        canProcessInCurrentContext = contextEligibility.canProcessInCurrentContext;
        eligibleActors = contextEligibility.eligible.map(function(item) { return item.actor; });
        applicantHrInfo = contextEligibility.selected.eligibility.applicantHrInfo;
        summary = contextEligibility.selected.eligibility.summary;
        candidateMissing = Boolean(contextEligibility.selected.eligibility.candidateMissing);
      } else {
        const applicantAssignment = await resolveBookingApplicantAssignment(booking);
        if (!applicantAssignment) continue;
        const rules = await venueBookingRuleModel.getByVenueIdForOrg(booking.venue_id, targetOrgId);
        const ruleEligibility = evaluateBookingRuleWorkContexts(
          rules,
          workActors,
          targetOrgId,
          actor.contextId,
          orgId
        );
        if (!ruleEligibility.visible) continue;
        canProcessInCurrentContext = ruleEligibility.canProcessInCurrentContext;
        eligibleActors = ruleEligibility.eligible;
        applicantHrInfo = applicantAssignment ? toRuleProfile(applicantAssignment) : null;
      }
      const snapshots = venueApprovalMultiFlow.parseSnapshots(booking.approval_snapshots_json);
      const firstActive = summary.flowSummary.find(function(item) { return item.active && !item.completed; });

      pending.push({
        id: booking.id,
        venueId: booking.venue_id,
        venueName: booking.venue_name,
        venueLocation: booking.venue_location,
        orgName: orgNameMap[safeString(booking.creator_org_id)] || orgNameMap[safeString(booking.approval_org_id)] || '',
        approvalOrgId: targetOrgId,
        canProcessInCurrentContext,
        requiredWorkContexts: eligibleActors.map(function(workActor) {
          return {
            contextId: safeString(workActor.contextId),
            organizationId: safeString(workActor.organizationId),
            role: safeString(workActor.type),
            assignmentId: safeString(workActor.assignmentId),
            assignmentLabel: safeString(workActor.assignment && workActor.assignment.assignmentLabel)
          };
        }),
        title: booking.title,
        description: booking.description,
        userName: (applicantHrInfo && applicantHrInfo.name) || localeCopy.copy_de00c3e48a,
        userDept: (applicantHrInfo && applicantHrInfo.department_name) || '',
        userIdentity: (applicantHrInfo && applicantHrInfo.identity_name) || '',
        userWorkGroup: (applicantHrInfo && applicantHrInfo.work_group_name) || '',
        creatorAssignmentId: (applicantHrInfo && applicantHrInfo.assignment_id) || '',
        creatorAssignmentLabel: (applicantHrInfo && applicantHrInfo.assignment_label) || '',
        timeStart: fmtDatetime(new Date(booking.time_start)),
        timeEnd: fmtDatetime(new Date(booking.time_end)),
        status: booking.status,
        approvalFlowId: booking.approval_flow_id,
        approvalCurrentStep: booking.approval_current_step,
        approvalTotalSteps: booking.approval_total_steps,
        currentStepName: (firstActive && firstActive.stepName) || '',
        currentStepIndex: (firstActive && firstActive.stepIndex) || 0,
        flowSteps: summary.flowSummary.map(function(item) {
          return {
            sortOrder: item.stepIndex + 1,
            name: item.stepName,
            actionType: '',
            active: item.active
          };
        }),
        activeFlowCount: summary.activeFlowIds.length,
        flowSummary: summary.flowSummary,
        candidateMissing,
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
        const snapshotHrIds = [...pendingSnapshotHrIds];
        const approverPlaceholders = snapshotHrIds.map(() => '?').join(',');
        const [approverHrList] = await pool.query(
          `SELECT id, name FROM hr_info WHERE id IN (${approverPlaceholders})`,
          snapshotHrIds
        );
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
      if (!notificationRecipientId || !p.canProcessInCurrentContext) continue;
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

// ═══════════════════════════════════════════════════
// 审批历史（当前操作者、当前组织与当前身份上下文）
// ═══════════════════════════════════════════════════

router.post('/listVenueApprovalHistory', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok) {
      return res.json({ status: actorResult.status, message: actorResult.message });
    }
    let actor = actorResult.actor;
    const orgId = await getCurrentOrgId();
    if (actor.type === 'user') {
      const assignment = await resolveCurrentActorAssignment(actor, orgId);
      if (!assignment) return res.json({ status: 'forbidden', message: localeCopy.copy_bba7f8b8ba });
      actor = Object.assign({}, actor, { assignment, profile: toRuleProfile(assignment) });
    }
    const [bookings] = await pool.query(
      `SELECT b.*, v.name AS venue_name, v.location AS venue_location,
              h.name AS applicant_name, h.department_id AS applicant_department_id
         FROM venue_bookings b
         LEFT JOIN venues v ON v.id = b.venue_id
         LEFT JOIN hr_info h ON h.id = b.user_hr_id AND h.org_id = b.creator_org_id
        WHERE b.approval_org_id = ?
        ORDER BY b.updated_at DESC`,
      [orgId]
    );
    const applicantAssignments = await resolveBookingApplicantAssignments(bookings);

    const history = [];
    for (const booking of bookings) {
      const approval = findMyVenueApproval(booking, actor, fmtDatetime);
      if (!approval) continue;
      const applicant = assignmentDisplay(applicantAssignments.get(safeString(booking.id)));
      history.push({
        id: booking.id,
        venueId: booking.venue_id,
        venueName: booking.venue_name,
        venueLocation: booking.venue_location,
        title: booking.title,
        description: booking.description,
        applicantName: applicant.name || booking.applicant_name || localeCopy.copy_de00c3e48a,
        applicantDepartmentId: applicant.departmentId,
        applicantAssignmentId: applicant.assignmentId,
        applicantAssignmentLabel: applicant.assignmentLabel || localeCopy.historicalAssignmentMissing,
        timeStart: fmtDatetime(new Date(booking.time_start)),
        timeEnd: fmtDatetime(new Date(booking.time_end)),
        status: booking.status,
        displayStatus: getVenueDisplayStatus(booking),
        myAction: approval.action,
        myActionLabel: approval.actionLabel,
        myApprovalAt: approval.approvedAt,
        myApprovalComment: approval.comment,
        myApprovalStepName: approval.stepName,
        myApprovalStepIndex: approval.stepIndex,
        createdAt: booking.created_at
      });
    }

    history.sort((left, right) => String(right.myApprovalAt || '').localeCompare(String(left.myApprovalAt || '')));
    res.json({ status: 'success', history });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/getVenueApprovalHistoryDetail', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok) {
      return res.json({ status: actorResult.status, message: actorResult.message });
    }
    let actor = actorResult.actor;
    const orgId = await getCurrentOrgId();
    if (actor.type === 'user') {
      const assignment = await resolveCurrentActorAssignment(actor, orgId);
      if (!assignment) return res.json({ status: 'forbidden', message: localeCopy.copy_bba7f8b8ba });
      actor = Object.assign({}, actor, { assignment, profile: toRuleProfile(assignment) });
    }
    const bookingId = safeString(req.body.id);
    if (!bookingId) return res.json({ status: 'invalid_params', message: localeCopy.copy_754113ad21 });

    const [rows] = await pool.query(
      `SELECT b.*, v.name AS venue_name, v.location AS venue_location,
              h.name AS applicant_name, h.department_id AS applicant_department_id,
              d.name AS applicant_department_name, i.name AS applicant_identity_name,
              wg.name AS applicant_work_group_name
         FROM venue_bookings b
         LEFT JOIN venues v ON v.id = b.venue_id
         LEFT JOIN hr_info h ON h.id = b.user_hr_id AND h.org_id = b.creator_org_id
         LEFT JOIN departments d ON d.id = h.department_id AND d.org_id = h.org_id
         LEFT JOIN identities i ON i.id = h.identity_id AND i.org_id = h.org_id
         LEFT JOIN work_groups wg ON wg.id = h.work_group_id AND wg.org_id = h.org_id
        WHERE b.id = ? AND b.approval_org_id = ?
        LIMIT 1`,
      [bookingId, orgId]
    );
    const booking = rows[0];
    if (!booking) return res.json({ status: 'not_found', message: localeCopy.copy_80886b8642 });
    const applicantAssignment = await resolveBookingApplicantAssignment(booking);
    const applicant = assignmentDisplay(applicantAssignment);

    const approval = findMyVenueApproval(booking, actor, fmtDatetime);
    if (!approval) return res.json({ status: 'forbidden', message: localeCopy.copy_c4a87d8e1c });

    const snapshots = venueApprovalMultiFlow.parseSnapshots(booking.approval_snapshots_json);
    const snapshotHrIds = [...new Set(snapshots.map(item => safeString(item.approverHrId)).filter(Boolean))];
    const approverNameMap = {};
    if (snapshotHrIds.length) {
      const [approverRows] = await pool.query(
        'SELECT id, name FROM hr_info WHERE id IN (?) AND org_id = ?',
        [snapshotHrIds, orgId]
      );
      approverRows.forEach(row => { approverNameMap[row.id] = safeString(row.name); });
    }

    let flowSteps = [];
    if (booking.approval_flow_id) {
      const stepRows = await venueApprovalFlowStepModel.getByFlowId(booking.approval_flow_id, orgId);
      flowSteps = stepRows.map((step, index) => ({
        stepIndex: index,
        stepName: safeString(step.name) || ('第' + (index + 1) + localeCopy.copy_493a127a99)
      }));
    }

    const approvalEvents = snapshots.map((snapshot, index) => {
      const stepIndex = Number(snapshot.stepIndex);
      const flowStep = flowSteps[stepIndex];
      return {
        id: String(booking.id) + '-approval-' + index,
        stepIndex: Number.isFinite(stepIndex) ? stepIndex : 0,
        stepName: safeString(snapshot.stepName) || (flowStep && flowStep.stepName) || localeCopy.copy_28b6b31abf,
        approverName: safeString(snapshot.approverName) || approverNameMap[safeString(snapshot.approverHrId)] || (snapshot.approverIdentityType === 'admin' ? '管理员' : '审批人'),
        approvedAt: safeString(snapshot.approvedAt),
        comment: safeString(snapshot.comment),
        isMine: Boolean(matchesApprovalContext(snapshot, actor)),
        approverAssignmentId: safeString(snapshot.approverAssignmentId),
        approverAssignmentLabel: safeString(snapshot.approverAssignmentSnapshot && snapshot.approverAssignmentSnapshot.assignmentLabel)
          || (snapshot.approverIdentityType === 'user' ? localeCopy.historicalAssignmentMissing : '')
      };
    });

    const orgNameMap = await resolveVenueOrgNames([
      safeString(booking.creator_org_id),
      safeString(booking.approval_org_id)
    ]);
    const totalSteps = Number(booking.approval_total_steps) || 0;
    const storedCurrentStep = Number(booking.approval_current_step);
    const snapshotCompletedSteps = snapshots.reduce((max, snapshot) => {
      const stepIndex = Number(snapshot && snapshot.stepIndex);
      return Number.isFinite(stepIndex) && stepIndex >= 0 ? Math.max(max, stepIndex + 1) : max;
    }, 0);
    const isRejected = storedCurrentStep < 0;
    const currentStep = isRejected
      ? -1
      : Math.min(totalSteps, Math.max(0, Number.isFinite(storedCurrentStep) ? storedCurrentStep : 0, snapshotCompletedSteps));
    const isApproved = !isRejected && currentStep >= totalSteps;

    res.json({
      status: 'success',
      detail: {
        id: booking.id,
        venueName: safeString(booking.venue_name) || localeCopy.copy_bbcf12ed5f,
        venueLocation: safeString(booking.venue_location),
        orgName: orgNameMap[safeString(booking.creator_org_id)] || orgNameMap[safeString(booking.approval_org_id)] || '',
        title: safeString(booking.title),
        description: safeString(booking.description),
        userName: applicant.name || safeString(booking.applicant_name) || localeCopy.copy_de00c3e48a,
        userDept: applicant.department,
        userIdentity: applicant.identity,
        userWorkGroup: applicant.workGroup,
        applicantName: applicant.name || safeString(booking.applicant_name) || localeCopy.copy_de00c3e48a,
        applicantDepartmentId: applicant.departmentId,
        applicantAssignmentId: applicant.assignmentId,
        applicantAssignmentLabel: applicant.assignmentLabel || localeCopy.historicalAssignmentMissing,
        timeStart: fmtDatetime(new Date(booking.time_start)),
        timeEnd: fmtDatetime(new Date(booking.time_end)),
        status: safeString(booking.status),
        displayStatus: getVenueDisplayStatus(booking),
        approvalComment: safeString(booking.approval_comment),
        myAction: approval.action,
        myActionLabel: approval.actionLabel,
        myApprovalAt: approval.approvedAt,
        approvalProgress: booking.approval_flow_id && Number(booking.approval_total_steps) > 0 ? {
          flowId: booking.approval_flow_id,
          currentStep: currentStep,
          totalSteps: totalSteps,
          isApproved: isApproved,
          isRejected: isRejected,
          rejectStep: booking.approval_reject_step,
          flowSteps: flowSteps,
          snapshots: snapshots,
          events: approvalEvents
        } : null,
        approvalEvents: approvalEvents
      }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

router.post('/cancelVenueBooking', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || localeCopy.copy_4e84385ce1 });
    }
    const actor = actorResult.actor;
    const currentOrgId = await getCurrentOrgId();
    const assignment = await resolveCurrentActorAssignment(actor, currentOrgId);
    if (!assignment) return res.json({ status: 'forbidden', message: localeCopy.copy_4e84385ce1 });
    actor.assignment = assignment;
    actor.profile = toRuleProfile(assignment);
    const hrId = assignment.legacyHrId;
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_62d2cac4df });
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: localeCopy.copy_3508043e2a });
    const isOwner = safeString(booking.creator_person_id)
      ? safeString(booking.creator_person_id) === safeString(actor.personId)
      : safeString(booking.user_hr_id) === hrId;
    if (!isOwner) return res.json({ status: 'forbidden', message: localeCopy.copy_31c8162e6d });
    if (safeString(booking.creator_org_id) !== currentOrgId && safeString(booking.approval_org_id) !== currentOrgId) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_d76adefd6d });
    }
    if (booking.status === 'cancelled') return res.json({ status: 'invalid_state', message: localeCopy.copy_f65527e76d });
    if (booking.status === 'rejected') return res.json({ status: 'invalid_state', message: localeCopy.copy_c16837c5f9 });
    // 已通过的借用，如果已经开始（now >= timeStart），不能取消
    if (booking.status === 'approved') {
      const now = new Date();
      const timeStart = new Date(booking.time_start);
      if (now >= timeStart) {
        return res.json({ status: 'invalid_state', message: localeCopy.copy_22b06082e1 });
      }
    }
    await venueBookingModel.updateStatus(id, 'cancelled', hrId, '申请人取消', null, actor);
    await notificationModel.deleteByTarget('booking', id);
    res.json({ status: 'success', message: localeCopy.copy_e92ecaf2f5 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// End Use (提前结束使用)
// ═══════════════════════════════════════════════════

router.post('/endVenueBooking', async (req, res) => {
  try {
    const actorResult = await resolveCurrentActor(req);
    if (!actorResult.ok || actorResult.actor.type !== 'user') {
      return res.json({ status: actorResult.status || 'forbidden', message: actorResult.message || localeCopy.copy_bba7f8b8ba });
    }
    const actor = actorResult.actor;
    const currentOrgId = await getCurrentOrgId();
    const assignment = await resolveCurrentActorAssignment(actor, currentOrgId);
    if (!assignment) return res.json({ status: 'forbidden', message: localeCopy.copy_bba7f8b8ba });
    const hrId = assignment.legacyHrId;
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_62d2cac4df });
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: localeCopy.copy_3508043e2a });
    const isOwner = safeString(booking.creator_person_id)
      ? safeString(booking.creator_person_id) === safeString(actor.personId)
      : safeString(booking.user_hr_id) === hrId;
    if (!isOwner) return res.json({ status: 'forbidden', message: localeCopy.copy_31c8162e6d });
    if (safeString(booking.creator_org_id) !== currentOrgId && safeString(booking.approval_org_id) !== currentOrgId) {
      return res.json({ status: 'forbidden', message: localeCopy.copy_d76adefd6d });
    }
    if (booking.status !== 'approved') return res.json({ status: 'invalid_state', message: localeCopy.copy_38b3e3a11c });

    const now = new Date();
    const timeStart = new Date(booking.time_start);
    const timeEnd = new Date(booking.time_end);

    if (now < timeStart) {
      return res.json({ status: 'invalid_state', message: localeCopy.copy_9aa2375ba5 });
    }
    if (now >= timeEnd) {
      return res.json({ status: 'invalid_state', message: localeCopy.copy_2012c1a0a5 });
    }

    // Set time_end to now (early end)
    const dbTimeEnd = fmtDatetime(now);
    await venueBookingModel.updateTimeEnd(id, dbTimeEnd);
    res.json({ status: 'success', message: localeCopy.copy_26f5cb7f15 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
