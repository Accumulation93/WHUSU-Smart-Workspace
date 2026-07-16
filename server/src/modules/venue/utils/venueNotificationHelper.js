const { generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pool = require('../../../config/db');
const notificationModel = require('../../audit/models/notification');
const venueBookingModel = require('../models/venueBooking');
const venueApprovalFlowStepModel = require('../models/venueApprovalFlowStep');
const venueApprovalFlowStepRuleModel = require('../models/venueApprovalFlowStepRule');
const hrInfoModel = require('../../../core/models/hrInfo');

/**
 * Find all HR IDs eligible to approve a given step of a venue booking.
 * Reuses the same condition-matching logic as listPendingVenueApprovals.
 *
 * @param {object} booking — venue booking row
 * @param {number} stepIndex — 0-based step index
 * @param {string} orgId
 * @returns {Promise<string[]>} array of hr_id strings
 */
async function findEligibleApprovers(booking, stepIndex, orgId) {
  // Get flow steps
  const [flowSteps] = await pool.query(
    'SELECT * FROM venue_approval_flow_steps WHERE flow_id = ? AND org_id = ? ORDER BY sort_order',
    [booking.approval_flow_id, orgId]
  );

  if (!flowSteps.length || stepIndex >= flowSteps.length) return [];

  const step = flowSteps[stepIndex];
  if (!step) return [];

  // Get rules for this step
  const [stepRules] = await pool.query(
    'SELECT * FROM venue_approval_flow_step_rules WHERE step_id = ? AND org_id = ? ORDER BY sort_order',
    [step.id, orgId]
  );

  // 无条件兼容步骤仅允许管理员处理；用户通知列表不再向所有人广播。
  if (!stepRules.length) {
    return [];
  }

  // Check if all rules are open (all scopes = 'all')
  const allAreOpen = stepRules.every(r =>
    (r.department_scope || 'all') === 'all' &&
    (r.work_group_scope || 'all') === 'all' &&
    (r.identity_scope || 'all') === 'all'
  );
  if (allAreOpen) {
    const [allHr] = await pool.query(
      'SELECT id FROM hr_info WHERE org_id = ? ORDER BY name',
      [orgId]
    );
    return allHr.map(h => h.id);
  }

  // Get applicant info (for 'same' scope matching)
  let applicantHrInfo = null;
  if (booking.user_hr_id) {
    const [appRows] = await pool.query(
      'SELECT department_id, work_group_id, identity_id FROM hr_info WHERE id = ? AND org_id = ?',
      [booking.user_hr_id, orgId]
    );
    applicantHrInfo = appRows[0] || null;
  }

  // Load all HR and filter by matchesAnyRule
  const [allHr] = await pool.query(
    'SELECT id, department_id, work_group_id, identity_id FROM hr_info WHERE org_id = ? ORDER BY name',
    [orgId]
  );

  const { matchesAnyRule } = venueApprovalFlowStepRuleModel;
  return allHr
    .filter(hr => matchesAnyRule(stepRules, {
      department_id: hr.department_id || '',
      work_group_id: hr.work_group_id || '',
      identity_id: hr.identity_id || ''
    }, applicantHrInfo))
    .map(hr => hr.id);
}

/**
 * Create pending_approval notifications for all eligible approvers of a venue booking step.
 * Errors are logged and not re-thrown so callers can use it synchronously
 * without failing the approval transaction after commit.
 *
 * @param {string} bookingId
 * @param {number} stepIndex — 0-based step index
 */
async function createVenueApprovalNotifications(bookingId, stepIndex) {
  try {
    const orgId = await getCurrentOrgId();
    const booking = await venueBookingModel.getById(bookingId);
    if (!booking) {
      console.error('[venueNotification] booking not found:', bookingId);
      return;
    }

    if (!booking.approval_flow_id || booking.approval_total_steps <= 0) {
      return; // No approval flow — no notifications needed
    }

    const eligibleHrIds = await findEligibleApprovers(booking, stepIndex, orgId);
    if (!eligibleHrIds.length) {
      console.log('[venueNotification] no eligible approvers for booking', bookingId, 'step', stepIndex);
      return;
    }

    // Cap at 200
    if (eligibleHrIds.length > 200) {
      console.warn('[venueNotification] capping from ' + eligibleHrIds.length + ' to 200');
      eligibleHrIds.splice(200);
    }

    // Resolve venue name
    let venueName = '';
    try {
      const [venueRows] = await pool.query(
        'SELECT name FROM venues WHERE id = ?',
        [booking.venue_id]
      );
      venueName = (venueRows[0] && venueRows[0].name) || '';
    } catch (_) {}

    const stepLabel = stepIndex + 1;
    const title = '新的场地借用待审批';
    const desc = '「' + (booking.title || '场地借用') + '」' +
      (venueName ? '（' + venueName + '）' : '') +
      '需要您审批（第' + stepLabel + '步）';
    const targetUrl = '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals';

    const items = eligibleHrIds.map(hrId => ({
      id: generateId(),
      hrId,
      type: 'pending_approval',
      title,
      description: desc,
      category: 'venue',
      targetType: 'booking',
      targetId: bookingId,
      targetUrl
    }));

    await notificationModel.deleteByTarget('booking', bookingId);
    await notificationModel.batchCreate(items);
    console.log('[venueNotification] created ' + items.length + ' notifications for booking ' + bookingId + ' step ' + stepLabel);
  } catch (e) {
    console.error('[venueNotification] createVenueApprovalNotifications failed:', e.message);
  }
}

/**
 * Create a notification for the booking submitter (approved/rejected).
 * Fire-and-forget.
 *
 * @param {object} booking — venue booking row
 * @param {string} type — 'booking_approved' | 'booking_rejected'
 * @param {string} title
 * @param {string} description
 */
async function createVenueBookingStatusNotification(booking, type, title, description) {
  try {
    const targetUrl = '/subpackages/venue/pages/myVenueBookings/myVenueBookings';
    await notificationModel.create(generateId(), {
      hrId: booking.user_hr_id,
      type,
      title,
      description,
      category: 'venue',
      targetType: 'booking',
      targetId: booking.id,
      targetUrl
    });
  } catch (e) {
    console.error('[venueNotification] createVenueBookingStatusNotification failed:', e.message);
  }
}

module.exports = {
  findEligibleApprovers,
  createVenueApprovalNotifications,
  createVenueBookingStatusNotification
};
