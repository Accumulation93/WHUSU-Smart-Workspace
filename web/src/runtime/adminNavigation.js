import adminCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';

export const ADMIN_MODULES = Object.freeze({
  scoring: { label: adminCopy.copy_33a502217d, tabs: ['activities', 'templates', 'rules', 'results', 'publications'] },
  hr: { label: adminCopy.copy_eb65126cfe, tabs: ['hrInfo', 'hrTemplates', 'departments', 'workGroups', 'identities'] },
  system: { label: adminCopy.copy_5b4cf5d1bf, tabs: ['admins', 'settings'] },
  audit: { label: adminCopy.copy_4f6ab0ccf7, tabs: ['auditTemplates', 'auditStamps', 'auditSubmissions', 'auditVerification'] }
});

export const ADMIN_TABS = Object.freeze({
  activities: { label: adminCopy.copy_5aa4cb13ec, permissions: ['scoring.activities'] },
  templates: { label: adminCopy.copy_5a49161fd7, permissions: ['scoring.templates'] },
  rules: { label: adminCopy.copy_9ad6311419, permissions: ['scoring.rules'] },
  results: { label: adminCopy.copy_ade4fb64f7, permissions: ['scoring.results'] },
  publications: { label: adminCopy.copy_414b7d9da7, permissions: ['scoring.publications'] },
  hrInfo: { label: adminCopy.copy_166a418985, permissions: ['hr.people', 'hr.import', 'hr.profile_review', 'auth.identity.verify', 'auth.accounts.recover', 'auth.accounts.global_manage', 'auth.policy.manage'] },
  hrTemplates: { label: adminCopy.copy_a0d495faa0, permissions: ['hr.profile_templates.manage', 'hr.profile_templates.select'] },
  departments: { label: adminCopy.copy_c15260b37c, permissions: ['hr.departments'] },
  workGroups: { label: adminCopy.copy_303b7a8611, permissions: ['hr.work_groups'] },
  identities: { label: adminCopy.copy_38f7aca35c, permissions: ['hr.identities'] },
  admins: { label: adminCopy.copy_72d3c6f7c2, permissions: ['system.admin_accounts.read', 'system.admin_accounts.write'] },
  settings: { label: adminCopy.copy_a8792b30e7, permissions: ['system.settings', 'system.organizations'] },
  auditTemplates: { label: adminCopy.copy_7312ee863e, permissions: ['audit.templates'] },
  auditStamps: { label: adminCopy.copy_8ef1f4695c, permissions: ['audit.stamps'] },
  auditSubmissions: { label: adminCopy.copy_be547ba4c7, permissions: ['audit.submissions'] },
  auditVerification: { label: adminCopy.copy_e68b797796, permissions: ['audit.verification'] }
});

export function adminModule(key) {
  return Object.hasOwn(ADMIN_MODULES, key) ? ADMIN_MODULES[key] : ADMIN_MODULES.scoring;
}

export function adminTabs(key, profile) {
  if (!profile) return [];
  return adminModule(key).tabs.filter(tab => profile.adminLevel === 'super_admin'
    || ADMIN_TABS[tab].permissions.some(permission => profile.permissions?.[permission] === true))
    .map(key => ({ key, ...ADMIN_TABS[key] }));
}
