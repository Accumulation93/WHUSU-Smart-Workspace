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

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
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
    res.json({ status: 'success', rules });
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
    res.json({ status: 'success', rules });
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
    const data = {
      venueId,
      ruleType: safeString(req.body.ruleType) || 'admin',
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
    // Build user name map
    const hrIds = [...new Set(bookings.map(b => b.user_hr_id).filter(Boolean))];
    const nameMap = {};
    if (hrIds.length) {
      try {
        const hrList = await hrInfoModel.getByIds(hrIds);
        (hrList || []).forEach(h => { nameMap[h.id] = h.name || h.id; });
      } catch (_) {}
    }
    const list = bookings.map(b => ({
      id: b.id,
      venueId: b.venue_id,
      venueName: b.venue_name,
      venueLocation: b.venue_location,
      userHrId: b.user_hr_id,
      userName: nameMap[b.user_hr_id] || b.user_hr_id,
      title: b.title,
      description: b.description,
      timeStart: fmtDatetime(new Date(b.time_start)),
      timeEnd: fmtDatetime(new Date(b.time_end)),
      status: b.status,
      approverHrId: b.approver_hr_id,
      approvalComment: b.approval_comment,
      createdAt: b.created_at
    }));
    res.json({ status: 'success', bookings: list });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// approveVenueBooking
router.post('/approveVenueBooking', async (req, res) => {
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
    res.json({ status: 'success', message: '借用已通过' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// rejectVenueBooking
router.post('/rejectVenueBooking', async (req, res) => {
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
    res.json({ status: 'success', message: '借用已驳回' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ═══════════════════════════════════════════════════
// Booking Purposes (事由管理)
// ═══════════════════════════════════════════════════

// listVenueBookingPurposes
router.post('/listVenueBookingPurposes', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '仅管理员可操作' });
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
