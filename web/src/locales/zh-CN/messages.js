// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_common from './shared/common.js';
import src_signaturePad from './shared/generated/subpackages/audit/components/signaturePad/signaturePad.js';
import src_myApprovalHistory from './shared/generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory.js';
import src_mySubmissions from './shared/generated/subpackages/audit/pages/mySubmissions/mySubmissions.js';
import src_signatureManager from './shared/generated/subpackages/audit/pages/signatureManager/signatureManager.js';
import src_submissionDetail from './shared/generated/subpackages/audit/pages/submissionDetail/submissionDetail.js';
import src_identitySwitch from './shared/generated/subpackages/org/pages/identitySwitch/identitySwitch.js';
import src_admin from './shared/generated/subpackages/scoring/pages/admin/admin.js';
import src_authPersonnelBehavior from './shared/generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';
import src_hrInfoBehavior from './shared/generated/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js';
import src_venueBookingDetail from './shared/generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js';
import src_home from './shared/home.js';
import src_login from './shared/login.js';
import src_main from './shared/main.js';

export default Object.freeze({
  navigationTitle: src_main.messageCenter.navigationTitle,
  audit: src_myApprovalHistory.copy_56d416c578,
  venue: src_venueBookingDetail.copy_bbbebc1abf,
  scoring: src_main.portal.categoryLabels.scoring,
  hr: src_main.portal.categoryLabels.hr,
  system: src_main.portal.categoryLabels.system,
  notification: src_hrInfoBehavior.hrDeletionCleanupNotification,
  allOrganizations: src_authPersonnelBehavior.copy_d337157f74,
  selectOrganizationOrWorkContext: src_main.messageCenter.messages.selectOrganizationOrWorkContext,
  refreshLater: src_myApprovalHistory.copy_e52119b17e,
  retryLater: src_myApprovalHistory.copy_e52119b17e,
  switchWorkContext: src_main.portal.messages.switchWorkContext,
  switchOrganizationAndWorkContext: src_main.portal.messages.switchOrganizationAndWorkContext,
  targetOrganization: src_main.portal.messages.targetOrganization,
  notificationReadFailed: src_main.portal.messages.readFailed,
  selectWorkContext: src_main.portal.messages.selectWorkContext,
  selectOrganization: src_identitySwitch.copy_9fa9026726,
  switchFailed: src_identitySwitch.copy_53d5e0a0c8,
  incomplete: src_signaturePad.copy_bff49f783f,
  partialBulkAction: src_main.portal.messages.partialBulkAction,
  deleteFailed: src_signatureManager.copy_076bb5d383,
  clearFailed: src_main.messageCenter.messages.clearFailed,
  clearTitle: src_main.messageCenter.messages.clearTitle,
  clearDescription: src_main.messageCenter.messages.clearDescription,
  clearConfirm: src_main.messageCenter.messages.clearConfirm,
  appName: src_common.brandName,
  pageName: src_main.portal.cards.messages,
  todos: src_main.portal.messages.todo,
  notifications: src_hrInfoBehavior.hrDeletionCleanupNotification,
  organizationScope: src_main.messageCenter.view.organizationScope,
  loadingHint: src_main.portal.view.loadingHint,
  partialOrganizationLoading: src_main.portal.partialOrganizationLoading,
  currentTodos: src_main.messageCenter.view.currentTodos,
  allNotifications: src_main.messageCenter.view.allNotifications,
  markAllRead: src_mySubmissions.copy_6830671a51,
  clearAll: src_main.messageCenter.messages.clearConfirm,
  noTodos: src_main.portal.view.noTodos,
  noNotifications: src_main.portal.view.noNotifications,
  organization: src_login.view.organization,
  current: src_home.text.current,
  enter: src_common.actions.enter,
  deleteNotification: src_main.messageCenter.view.deleteNotification,
  loading: src_admin.copy_a017932da1,
  crossOrganizationItem: src_main.portal.view.crossOrganization,
  switchDescription: src_main.portal.view.switchDescription,
  cancel: src_common.actions.cancel,
  switchAndView: src_main.portal.view.switchAndView,
  selectOrganizationScope: src_main.messageCenter.view.selectOrganizationScope,
  close: src_common.actions.close,
  selected: src_identitySwitch.copy_56f0b27402,
  confirm: src_submissionDetail.copy_a58e97a9f8,
});
