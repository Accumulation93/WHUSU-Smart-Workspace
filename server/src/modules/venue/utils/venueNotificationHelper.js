const notificationModel = require('../../audit/models/notification');
const { createNotification } = require('../../audit/utils/notificationHelper');
const { resolveBookingApplicantAssignment } = require('../services/venueAssignmentContext');

/**
 * 待办改为实时按业务状态计算，不再为每个审批人持久化 pending_approval 通知。
 * 此兼容函数只清理旧记录，保留现有调用链而不制造重复消息。
 */
async function createVenueApprovalNotifications(bookingId) {
  await notificationModel.deleteByTarget('booking', bookingId);
}

async function createVenueBookingStatusNotification(booking, type, title, description, conn) {
  const applicant = await resolveBookingApplicantAssignment(booking);
  const recipientHrId = applicant && applicant.legacyHrId || booking.user_hr_id;
  if (!recipientHrId) return { created: false };
  return createNotification({
    hrId: recipientHrId,
    eventKey: [type, booking.id, booking.status || 'status'].join(':'),
    type,
    title,
    description,
    category: 'venue',
    targetType: 'booking',
    targetId: booking.id,
    targetUrl: '/subpackages/venue/pages/myVenueBookings/myVenueBookings'
  }, conn);
}

module.exports = {
  createVenueApprovalNotifications,
  createVenueBookingStatusNotification
};
