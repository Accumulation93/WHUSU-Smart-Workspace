// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_adminPersonnel from './shared/adminPersonnel.js';
import src_myApprovalHistory from './shared/generated/subpackages/audit/pages/myApprovalHistory/myApprovalHistory.js';
import src_mySubmissions from './shared/generated/subpackages/audit/pages/mySubmissions/mySubmissions.js';
import src_accountSecurity from './shared/generated/subpackages/org/pages/accountSecurity/accountSecurity.js';
import src_identitySwitch from './shared/generated/subpackages/org/pages/identitySwitch/identitySwitch.js';
import src_admin from './shared/generated/subpackages/scoring/pages/admin/admin.js';
import src_venueBooking from './shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import src_main from './shared/main.js';
import src_web from './shared/web.js';

export default Object.freeze({
  navigationTitle: src_web.workbench.navigationTitle,
  title: src_web.workbench.title,
  tabScoring: src_admin.copy_33a502217d,
  tabHr: src_accountSecurity.copy_166a418985,
  tabAudit: src_myApprovalHistory.copy_56d416c578,
  currentOrgLabel: src_identitySwitch.copy_e74c96dd07,
  currentRoleLabel: src_mySubmissions.currentWorkContext,
  pendingLabel: src_admin.copy_a7cee696a3,
  unreadLabel: src_web.workbench.unreadLabel,
  sectionAccount: src_web.workbench.sectionAccount,
  pendingEmpty: src_main.portal.view.noTodos,
  scoringEntry: src_web.workbench.scoringEntry,
  hrEntry: src_web.workbench.hrEntry,
  auditEntry: src_myApprovalHistory.copy_56d416c578,
  notPortedTitle: src_web.workbench.notPortedTitle,
  notPortedBody: src_web.workbench.notPortedBody,
  openMiniProgram: src_venueBooking.copy_e75039f02b,
  heroTitle: src_web.workbench.title,
  roleAdmin: src_identitySwitch.copy_3704f9b212,
  roleAssignment: src_adminPersonnel.adminCandidatePositionPrefix,
});
