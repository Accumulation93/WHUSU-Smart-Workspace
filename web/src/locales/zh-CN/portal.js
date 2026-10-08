// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_common from './shared/common.js';
import src_workspace_hero from './shared/generated/components/workspace-hero/workspace-hero.js';
import src_signaturePad from './shared/generated/subpackages/audit/components/signaturePad/signaturePad.js';
import src_myApprovalHistory from './shared/generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory.js';
import src_mySubmissions from './shared/generated/subpackages/audit/pages/mySubmissions/mySubmissions.js';
import src_signatureManager from './shared/generated/subpackages/audit/pages/signatureManager/signatureManager.js';
import src_accountSecurity from './shared/generated/subpackages/org/pages/accountSecurity/accountSecurity.js';
import src_adminPermissions from './shared/generated/subpackages/org/pages/adminPermissions/adminPermissions.js';
import src_identitySwitch from './shared/generated/subpackages/org/pages/identitySwitch/identitySwitch.js';
import src_admin from './shared/generated/subpackages/scoring/pages/admin/admin.js';
import src_hrInfoBehavior from './shared/generated/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js';
import src_venueBookingDetail from './shared/generated/subpackages/venue/components/venueBookingDetail/venueBookingDetail.js';
import src_myVenueBookings from './shared/generated/subpackages/venue/pages/myVenueBookings/myVenueBookings.js';
import src_venueBooking from './shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import src_venueManage from './shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import src_home from './shared/home.js';
import src_login from './shared/login.js';
import src_main from './shared/main.js';

export default Object.freeze({
  partialOrganizationLoading: src_main.portal.partialOrganizationLoading,
  navigationTitle: src_main.portal.navigationTitle,
  appName: src_common.brandName,
  pageName: src_main.portal.pageName,
  organizationName: src_common.organizationName,
  audit: src_myApprovalHistory.copy_56d416c578,
  venue: src_venueBookingDetail.copy_bbbebc1abf,
  scoring: src_admin.copy_33a502217d,
  hr: src_accountSecurity.copy_166a418985,
  system: src_admin.copy_5b4cf5d1bf,
  scan: src_main.portal.cards.scan,
  messages: src_main.portal.cards.messages,
  workContextSwitch: src_identitySwitch.copy_c3e7d7fee4,
  venueBooking: src_myVenueBookings.copy_9ba3b8c8a9,
  venueManage: src_venueManage.copy_02719d6557,
  permissions: src_main.portal.cards.permissions,
  signedOut: src_home.text.signedOut,
  superAdmin: src_workspace_hero.copy_ccd219e5f1,
  admin: src_adminPermissions.copy_1557b96093,
  unset: src_venueBooking.copy_ad183b164d,
  welcome: src_home.text.welcome,
  notification: src_hrInfoBehavior.hrDeletionCleanupNotification,
  todo: src_main.portal.messages.todo,
  readFailed: src_main.portal.messages.readFailed,
  deleteFailed: src_signatureManager.copy_076bb5d383,
  incomplete: src_signaturePad.copy_bff49f783f,
  partialBulkAction: src_main.portal.messages.partialBulkAction,
  retryLater: src_common.actions.retryLater,
  switchWorkContext: src_main.portal.messages.switchWorkContext,
  switchOrganizationAndWorkContext: src_main.portal.messages.switchOrganizationAndWorkContext,
  targetOrganization: src_main.portal.messages.targetOrganization,
  selectWorkContext: src_main.portal.messages.selectWorkContext,
  selectOrganization: src_main.portal.messages.selectOrganization,
  switchFailed: src_identitySwitch.copy_53d5e0a0c8,
  workContextHint: src_main.portal.view.workContextHint,
  loadingHint: src_main.portal.view.loadingHint,
  todoTitle: src_main.portal.view.todoTitle,
  totalPrefix: src_admin.copy_b4c3e73028,
  itemSuffix: src_main.portal.view.itemSuffix,
  viewAll: src_main.portal.view.viewAll,
  noTodos: src_main.portal.view.noTodos,
  todoType: src_main.portal.view.todoType,
  organization: src_login.view.organization,
  current: src_home.text.current,
  enter: src_common.actions.enter,
  loadingMore: src_main.portal.view.loadingMore,
  notificationTitle: src_hrInfoBehavior.hrDeletionCleanupNotification,
  markAllRead: src_mySubmissions.copy_6830671a51,
  noNotifications: src_main.portal.view.noNotifications,
  notificationType: src_main.portal.view.notificationType,
  delete: src_signatureManager.copy_acc985cabc,
  servicesTitle: src_main.portal.pageName,
  grid: src_main.portal.view.grid,
  list: src_main.portal.view.list,
  search: src_adminPermissions.copy_cea1da7603,
  searchPlaceholder: src_main.portal.view.searchPlaceholder,
  clearSearch: src_identitySwitch.copy_ed081670d5,
  scanResultTitle: src_main.portal.view.scanResultTitle,
  scanExternalHint: src_main.portal.view.scanExternalHint,
  scanCopyAction: src_main.portal.view.scanCopyAction,
  scanCloseAction: src_common.actions.close,
  scanFailed: src_main.portal.view.scanFailed,
  navLoginAction: src_login.view.loginTitle,
  authUnavailable: src_main.portal.view.authUnavailable,
  authFrozen: src_main.portal.view.authFrozen,
  authRetryAction: src_main.portal.view.authRetryAction,
  authLoginAction: src_main.portal.view.authLoginAction,
  noMatchingApps: src_main.portal.view.noMatchingApps,
  noApps: src_main.portal.view.noApps,
  developing: src_main.portal.view.developing,
  logout: src_main.portal.view.logout,
  crossOrganization: src_main.portal.view.crossOrganization,
  switchDescription: src_main.portal.view.switchDescription,
  cancel: src_common.actions.cancel,
  switchAndView: src_main.portal.view.switchAndView,
});
