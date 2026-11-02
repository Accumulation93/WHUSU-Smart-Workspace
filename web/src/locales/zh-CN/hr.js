// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_adminPersonnel from './shared/adminPersonnel.js';
import src_authorization from './shared/authorization.js';
import src_contactDirectory from './shared/contactDirectory.js';
import src_accountSecurity from './shared/generated/subpackages/org/pages/accountSecurity/accountSecurity.js';
import src_web from './shared/web.js';

export default Object.freeze({
  navigationTitle: src_web.hr.navigationTitle,
  title: src_accountSecurity.copy_166a418985,
  profileTitle: src_contactDirectory.profile,
  reviewTitle: src_authorization.resources["hr.profileReview"],
  authTitle: src_authorization.resources["auth.policy"],
  nameLabel: src_authorization.adminExportColumns["0"],
  departmentLabel: src_authorization.department,
  identityLabel: src_authorization.fieldLabels.identityCategoryId,
  workGroupLabel: src_adminPersonnel.dictionaryUsageCategories.work_groups,
  assignmentLabel: src_adminPersonnel.adminCandidatePositionPrefix,
  profileReadOnlyNote: src_web.hr.profileReadOnlyNote,
});
