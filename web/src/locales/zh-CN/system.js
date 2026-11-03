// 由 scripts/locale-align.js 从共享语言库生成，请勿直接修改。
// 唯一来源：shared/locales/zh-CN/**；改文案请改共享语言库后重新运行本脚本。
import src_adminPersonnel from './shared/adminPersonnel.js';
import src_authorization from './shared/authorization.js';
import src_admin from './shared/generated/subpackages/scoring/pages/admin/admin.js';
import src_settingsBehavior from './shared/generated/subpackages/scoring/pages/admin/modules/settingsBehavior.js';
import src_web from './shared/web.js';

export default Object.freeze({
  navigationTitle: src_web.system.navigationTitle,
  title: src_admin.copy_5b4cf5d1bf,
  configTitle: src_authorization.resources["system.settings"],
  dictionaryTitle: src_web.system.dictionaryTitle,
  auditTemplateTitle: src_adminPersonnel.dictionaryUsageCategories.audit_templates,
  permissionsTitle: src_web.system.permissionsTitle,
  timezoneLabel: src_web.system.timezoneLabel,
  configVersionLabel: src_web.system.configVersionLabel,
  currentOrganizationLabel: src_settingsBehavior.systemDefaultOrganization,
  adminLevelLabel: src_web.system.adminLevelLabel,
  permissionListTitle: src_web.system.permissionListTitle,
  noPermission: src_web.system.noPermission,
  departmentTitle: src_authorization.department,
  identityTitle: src_authorization.fieldLabels.identityCategoryId,
  workGroupTitle: src_adminPersonnel.dictionaryUsageCategories.work_groups,
  templateStepCount: src_web.system.templateStepCount,
  emptyTemplates: src_web.system.emptyTemplates,
});
