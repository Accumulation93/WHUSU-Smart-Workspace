const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/utils/notificationHelper');
const { safeString } = require('../../../utils/helpers');
const crypto = require('crypto');
const notificationOutboxModel = require('../models/notificationOutbox');

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
async function createNotification(opts, conn) {
  const recipientId = safeString(opts.recipientId || opts.hrId);
  if (!recipientId) throw new Error(localeCopy.copy_5991beb931);
  const contentFingerprint = crypto.createHash('sha256')
    .update([opts.title, opts.description].map(safeString).join('\n'))
    .digest('hex').slice(0, 16);
  const eventKey = safeString(opts.eventKey) || [
    opts.type, opts.targetType, opts.targetId, opts.recipientType || 'user', recipientId, contentFingerprint
  ].map(safeString).join(':');
  return notificationOutboxModel.enqueue({
    orgId: opts.orgId,
    eventType: safeString(opts.type || 'system'),
    eventKey,
    recipientType: safeString(opts.recipientType || 'user'),
    recipientId,
    payload: {
      type: safeString(opts.type || 'system'),
      title: safeString(opts.title || '通知'),
      description: safeString(opts.description),
      category: safeString(opts.category || 'system'),
      targetType: safeString(opts.targetType),
      targetId: safeString(opts.targetId),
      targetUrl: safeString(opts.targetUrl)
    }
  }, conn);
}

module.exports = {
  createNotification
};
