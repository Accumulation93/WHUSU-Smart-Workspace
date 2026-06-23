const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const hrInfoModel = require('../../../core/models/hrInfo');
const venueModel = require('../models/venue');
const venueOpenRuleModel = require('../models/venueOpenRule');
const venueActivityRuleModel = require('../models/venueActivityRule');
const venueBookingRuleModel = require('../models/venueBookingRule');
const venueBookingModel = require('../models/venueBooking');

async function resolveHrId(openid) {
  if (!openid) return null;
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT hr_id FROM user_info WHERE openid = ? AND org_id = ?',
    [openid, orgId]
  );
  return rows[0] ? rows[0].hr_id : null;
}

/**
 * Check if a given date matches a cycle rule.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} cycleType - 'daily'|'weekly'|'monthly'|'yearly'
 * @param {Array} cycleValues - parsed JSON array
 */
function dateMatchesCycle(dateStr, cycleType, cycleValues) {
  if (!cycleValues || !Array.isArray(cycleValues) || !cycleValues.length) {
    return cycleType === 'daily';
  }
  const d = new Date(dateStr + 'T00:00:00');
  switch (cycleType) {
    case 'daily':
      return true;
    case 'weekly': {
      // cycleValues: [1,3,5] = Mon, Wed, Fri (JS: 0=Sun, 1=Mon, ...)
      const dow = d.getDay(); // 0=Sun
      const adjusted = dow === 0 ? 7 : dow; // Convert to 1=Mon..7=Sun
      return cycleValues.includes(adjusted);
    }
    case 'monthly': {
      // cycleValues: [1, 15] = 1st and 15th of each month
      const dom = d.getDate();
      return cycleValues.includes(dom);
    }
    case 'yearly': {
      // cycleValues: [{m:1,d:1}, {m:7,d:1}]
      const month = d.getMonth() + 1;
      const day = d.getDate();
      return cycleValues.some(v => v && Number(v.m) === month && Number(v.d) === day);
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
        timeEnd: rule.time_end && rule.time_end.length >= 5 ? rule.time_end.substring(0, 5) : '18:00',
        type: 'open'
      });
    }
  }
  return slots;
}

/**
 * Get activity blocked slots for a venue on a given date.
 */
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
        timeEnd: rule.time_end && rule.time_end.length >= 5 ? rule.time_end.substring(0, 5) : '18:00',
        type: 'activity'
      });
    }
  }
  return slots;
}

/** Convert "HH:MM" to minutes since midnight for comparison */
function timeToMin(t) {
  if (!t) return 0;
  const parts = String(t).split(':');
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
}

// ═══════════════════════════════════════════════════
// User: Browse venues
// ═══════════════════════════════════════════════════

// listVenuesForBooking
router.post('/listVenuesForBooking', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const venues = await venueModel.getAll();
    // For each venue, get booking rules for current org to show approval type
    const orgId = await getCurrentOrgId();
    const venueList = [];
    for (const v of venues) {
      const rules = await venueBookingRuleModel.getByVenueId(v.id);
      let approvalType = 'unknown';
      if (!rules.length) approvalType = 'admin'; // default: admin approval
      else if (rules.some(r => r.rule_type === 'direct')) approvalType = 'direct';
      else approvalType = 'approval'; // needs some form of approval
      venueList.push({
        id: v.id,
        name: v.name,
        location: v.location,
        description: v.description,
        imageUrl: v.image_url,
        approvalType
      });
    }
    res.json({ status: 'success', venues: venueList });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// getVenueSchedule
router.post('/getVenueSchedule', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const venueId = safeString(req.body.venueId);
    const dateFrom = safeString(req.body.dateFrom); // YYYY-MM-DD
    const dateTo = safeString(req.body.dateTo);
    if (!venueId || !dateFrom) return res.json({ status: 'invalid_params', message: '请提供场地ID和日期' });

    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: '场地不存在或已停用' });

    const openRules = await venueOpenRuleModel.getByVenueId(venueId);
    const activityRules = await venueActivityRuleModel.getByVenueId(venueId);
    const endDate = dateTo || dateFrom;

    // Generate daily schedule
    const dailySchedules = [];
    const current = new Date(dateFrom + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    while (current <= end) {
      const dateStr = current.toISOString().substring(0, 10);
      const openSlots = getOpenSlots(dateStr, openRules);
      const activitySlots = getActivitySlots(dateStr, activityRules);

      // Get bookings for this date (both approved and pending are blocking)
      const allBookings = await venueBookingModel.getByVenueId(venueId, { date: dateStr });
      // Filter to approved + pending only (exclude rejected/cancelled)
      const activeBookings = allBookings.filter(b => b.status === 'approved' || b.status === 'pending');

      // Resolve user names from hr_ids
      const hrIds = [...new Set(activeBookings.map(b => b.user_hr_id).filter(Boolean))];
      const nameMap = {};
      if (hrIds.length) {
        try {
          const hrList = await hrInfoModel.getByIds(hrIds);
          (hrList || []).forEach(h => { nameMap[h.id] = h.name || h.id; });
        } catch (_) {}
      }

      const bookedSlots = activeBookings.map(b => ({
        id: b.id,
        title: b.title,
        status: b.status,
        timeStart: b.time_start && b.time_start.length >= 5 ? b.time_start.substring(0, 5) : '',
        timeEnd: b.time_end && b.time_end.length >= 5 ? b.time_end.substring(0, 5) : '',
        type: 'booked',
        userId: b.user_hr_id,
        userName: nameMap[b.user_hr_id] || b.user_hr_id
      }));

      dailySchedules.push({
        date: dateStr,
        openSlots,
        activitySlots,
        bookedSlots
      });

      current.setDate(current.getDate() + 1);
    }

    res.json({ status: 'success', venueId, venueName: venue.name, dailySchedules });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// User: Create Booking
// ═══════════════════════════════════════════════════

// createVenueBooking
router.post('/createVenueBooking', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });

    const venueId = safeString(req.body.venueId);
    const title = safeString(req.body.title);
    const description = safeString(req.body.description);
    const bookingDate = safeString(req.body.bookingDate);
    const timeStart = safeString(req.body.timeStart);
    const timeEnd = safeString(req.body.timeEnd);

    if (!venueId || !bookingDate || !timeStart || !timeEnd) {
      return res.json({ status: 'invalid_params', message: '请填写完整信息' });
    }
    if (timeToMin(timeStart) >= timeToMin(timeEnd)) {
      return res.json({ status: 'invalid_params', message: '结束时间必须晚于开始时间' });
    }

    // Check venue
    const venue = await venueModel.getById(venueId);
    if (!venue || !venue.is_active) return res.json({ status: 'not_found', message: '场地不存在或已停用' });

    // Check open rules — venue must be open at this time
    const openRules = await venueOpenRuleModel.getByVenueId(venueId);
    const openSlots = getOpenSlots(bookingDate, openRules);
    let isOpen = false;
    for (const slot of openSlots) {
      if (timeToMin(timeStart) >= timeToMin(slot.timeStart) && timeToMin(timeEnd) <= timeToMin(slot.timeEnd)) {
        isOpen = true;
        break;
      }
    }
    if (!isOpen && openSlots.length > 0) {
      return res.json({ status: 'invalid_state', message: '该时段场地不开放' });
    }

    // Check activity conflicts
    const activityRules = await venueActivityRuleModel.getByVenueId(venueId);
    const activitySlots = getActivitySlots(bookingDate, activityRules);
    for (const slot of activitySlots) {
      if (timeToMin(timeStart) < timeToMin(slot.timeEnd) && timeToMin(timeEnd) > timeToMin(slot.timeStart)) {
        return res.json({ status: 'conflict', message: '该时段有活动占用：' + slot.ruleName });
      }
    }

    // Check booking conflicts
    const conflict = await venueBookingModel.findConflict(venueId, bookingDate, timeStart, timeEnd, null, conn);
    if (conflict) {
      return res.json({ status: 'conflict', message: '该时段已被其他借用占用' });
    }

    // Determine approval status
    const bookingRules = await venueBookingRuleModel.getByVenueId(venueId);
    let autoApprove = false;
    if (!bookingRules.length) {
      // Default: admin approval required
      autoApprove = false;
    } else if (bookingRules.some(r => r.rule_type === 'direct')) {
      autoApprove = true;
    }

    const id = generateId();
    const status = autoApprove ? 'approved' : 'pending';

    await venueBookingModel.create(id, {
      venueId, userHrId: hrId, title, description,
      bookingDate, timeStart, timeEnd, status
    }, conn);

    await conn.commit();
    res.json({ status: 'success', id, bookingStatus: status, message: autoApprove ? '借用成功（直接通过）' : '借用申请已提交，等待审核' });
  } catch (e) {
    await conn.rollback();
    res.json({ status: 'error', message: safeString(e.message) });
  } finally {
    conn.release();
  }
});

// ═══════════════════════════════════════════════════
// User: My Bookings
// ═══════════════════════════════════════════════════

// listMyVenueBookings
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
      bookingDate: b.booking_date,
      timeStart: b.time_start && b.time_start.length >= 5 ? b.time_start.substring(0, 5) : '',
      timeEnd: b.time_end && b.time_end.length >= 5 ? b.time_end.substring(0, 5) : '',
      status: b.status,
      approvalComment: b.approval_comment,
      createdAt: b.created_at
    }));
    res.json({ status: 'success', bookings: list });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// cancelVenueBooking
router.post('/cancelVenueBooking', async (req, res) => {
  try {
    const hrId = await resolveHrId(req.openid);
    if (!hrId) return res.json({ status: 'forbidden', message: '请先绑定人事信息' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供借用ID' });
    const booking = await venueBookingModel.getById(id);
    if (!booking) return res.json({ status: 'not_found', message: '借用记录不存在' });
    if (booking.user_hr_id !== hrId) return res.json({ status: 'forbidden', message: '只能取消自己的借用' });
    if (booking.status === 'cancelled') return res.json({ status: 'invalid_state', message: '该借用已被取消' });
    await venueBookingModel.updateStatus(id, 'cancelled', null, null);
    res.json({ status: 'success', message: '借用已取消' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
