// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_adminPersonnel from './shared/adminPersonnel.js';
import src_auditVerification from './shared/auditVerification.js';
import src_signaturePad from './shared/generated/subpackages/audit/components/signaturePad/signaturePad.js';
import src_myApprovalHistory from './shared/generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory.js';
import src_pendingApprovals from './shared/generated/subpackages/audit/pages/pendingApprovals/pendingApprovals.js';
import src_submissionDetail from './shared/generated/subpackages/audit/pages/submissionDetail/submissionDetail.js';
import src_venueBookingDetail from './shared/generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js';
import src_myVenueBookings from './shared/generated/subpackages/venue/pages/myVenueBookings/myVenueBookings.js';
import src_pendingVenueApprovals from './shared/generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals.js';
import src_venueBooking from './shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import src_venueManage from './shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import src_web from './shared/web.js';

export default Object.freeze({
  navigationTitle: src_venueBooking.navigationTitle,
  title: src_myVenueBookings.copy_9ba3b8c8a9,
  createTitle: src_myVenueBookings.copy_9639901862,
  mineTitle: src_myVenueBookings.copy_b40ec83bc1,
  pendingTitle: src_pendingApprovals.copy_5aaf844f1e,
  historyTitle: src_pendingVenueApprovals.copy_8650ae5bf6,
  detailTitle: src_myVenueBookings.bookingDetailTitle,
  emptyBookings: src_myVenueBookings.copy_28981b382e,
  timeSeparator: src_venueBookingDetail.copy_e8d9493a44,
  bookingAssignment: src_myVenueBookings.bookingAssignment,
  approvalCommentLabel: src_submissionDetail.copy_3b3b392755,
  statusPending: src_adminPersonnel.hrTemplateSwitchIncompatiblePending,
  statusApproved: src_auditVerification.text.status.approved,
  statusRejected: src_auditVerification.text.status.rejected,
  statusCancelled: src_myVenueBookings.copy_fd4601c1f9,
  statusInUse: src_venueBooking.copy_1c5bbf664c,
  cancelAction: src_myVenueBookings.copy_059dd7bc2c,
  cancelConfirm: src_myVenueBookings.copy_589d645596,
  cancelConfirmAction: src_myVenueBookings.copy_10bd4c9a19,
  cancelFailed: src_myVenueBookings.copy_301f0250ef,
  cancelUnavailable: src_myVenueBookings.cancelUnavailable,
  endAction: src_myVenueBookings.endUse,
  endConfirmTitle: src_myVenueBookings.confirmEndTitle,
  endConfirmContent: src_myVenueBookings.confirmEndContent,
  endSuccess: src_myVenueBookings.endSuccess,
  endUnavailable: src_myVenueBookings.endUnavailable,
  operationFailed: src_signaturePad.copy_bff49f783f,
  createSubmit: src_venueBooking.copy_02ef2f799d,
  createTitleLabel: src_venueBooking.copy_bbb0cc00c9,
  createTitleRequired: src_venueBooking.copy_7db68605c6,
  createTimeLabel: src_venueBooking.copy_91fd6d9600,
  createPurposeLabel: src_venueBooking.copy_5b5ccadb74,
  createDescPlaceholder: src_venueBooking.copy_2edf3fde90,
  createVenueLabel: src_venueBooking.copy_3ecbe06312,
  chooseVenue: src_web.venue.chooseVenue,
  adminTitle: src_venueManage.copy_02719d6557,
  notFound: src_myVenueBookings.bookingNotFound,
  emptyPending: src_web.venue.emptyPending,
  emptyHistory: src_web.venue.emptyHistory,
  adminNote: src_web.venue.adminNote,
  mineNote: src_web.venue.mineNote,
  loadFailed: src_myApprovalHistory.copy_e52119b17e,
  submitting: src_web.audit.createSubmitting,
  createDone: src_web.audit.createDone,
});
