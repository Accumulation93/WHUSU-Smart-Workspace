// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_adminGovernance from './shared/adminGovernance.js';
import src_auditSigning from './shared/auditSigning.js';
import src_authorization from './shared/authorization.js';
import src_common from './shared/common.js';
import src_submissionDetail from './shared/generated/subpackages/audit/pages/submissionDetail/submissionDetail.js';
import src_adminPermissions from './shared/generated/subpackages/org/pages/adminPermissions/adminPermissions.js';
import src_identitySwitch from './shared/generated/subpackages/org/pages/identitySwitch/identitySwitch.js';
import src_main from './shared/main.js';
import src_web from './shared/web.js';

export default Object.freeze({
  appName: src_authorization.appName,
  organizationName: src_common.organizationName,
  webVersionLabel: src_web.common.webVersionLabel,
  retry: src_authorization.retry,
  confirm: src_submissionDetail.copy_a58e97a9f8,
  cancel: src_adminGovernance.cancel,
  close: src_authorization.close,
  back: src_auditSigning.back,
  refresh: src_authorization.refresh,
  loading: src_common.loading,
  empty: src_web.common.empty,
  search: src_adminPermissions.copy_cea1da7603,
  searchPlaceholder: src_web.common.searchPlaceholder,
  more: src_web.common.more,
  logout: src_main.portal.view.logout,
  logoutConfirmTitle: src_main.portal.view.logout,
  logoutConfirmBody: src_web.common.logoutConfirmBody,
  logoutDone: src_web.common.logoutDone,
  goPortal: src_web.common.goPortal,
  notFoundTitle: src_web.common.notFoundTitle,
  notFoundBody: src_web.common.notFoundBody,
  notice: src_identitySwitch.copy_54474b693d,
  building: src_main.portal.view.developing,
});
