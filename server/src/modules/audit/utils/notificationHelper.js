const pool = require('../../../config/db');
const { generateId, safeString } = require('../../../utils/helpers');
const notificationModel = require('../models/notification');

/**
 * Unified notification creation function for other modules (venue, scoring, etc.).
 * Pending-approval notifications for audit are handled via real-time query
 * (submissionStepModel.getPendingByApprover) — no persistent records needed.
 *
 * @param {object} opts — { hrId, type, title, description, category, targetType, targetId, targetUrl }
 *
 * Example (venue booking):
 *   await createNotification({
 *     hrId: adminHrId,
 *     type: 'booking_pending',
 *     title: '新的场地借用申请',
 *     description: '张三申请借用会议室A',
 *     category: 'venue',
 *     targetType: 'booking',
 *     targetId: bookingId,
 *     targetUrl: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals?id=' + bookingId
 *   });
 */
async function createNotification(opts) {
  const id = generateId();
  try {
    await notificationModel.create(id, opts);
  } catch (e) {
    console.error('[notificationHelper] createNotification failed:', e.message);
  }
}

module.exports = {
  createNotification
};
