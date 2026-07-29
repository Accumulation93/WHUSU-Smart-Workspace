const PERMISSION_GROUPS = [
  {
    key: 'authentication',
    label: '身份认证',
    description: '',
    permissions: [
      { key: 'auth.identity.verify', label: '身份认证', description: '处理认领请求并签发个人认证码' },
      { key: 'auth.accounts.recover', label: '账号恢复', description: '审核他人的微信账号恢复申请' },
      { key: 'auth.accounts.audit', label: '安全审计', description: '查看本组织认证与账号安全记录' },
      { key: 'auth.policy.manage', label: '认证策略', description: '管理全局认证与恢复策略', targetLevels: ['admin'], defaultLevels: [] }
    ]
  },
  {
    key: 'permissions',
    label: '权限管理',
    description: '',
    permissions: [
      { key: 'permissions.manage_regular_admins', label: '配置普通管理员权限', description: '管理同组织普通管理员权限', targetLevels: ['admin'], defaultLevels: [] }
    ]
  },
  {
    key: 'scoring',
    label: '考核评分',
    description: '',
    permissions: [
      { key: 'scoring.activities', label: '活动管理', description: '管理评分活动' },
      { key: 'scoring.templates', label: '评分模板', description: '管理评分问题模板' },
      { key: 'scoring.rules', label: '评分规则', description: '管理评分对象和规则' },
      { key: 'scoring.results', label: '结果查看', description: '查看评分结果、明细与完成率' },
      { key: 'scoring.results_export', label: '结果导出', description: '导出结果和完成情况' },
      { key: 'scoring.results_revoke', label: '撤销评分', description: '撤销已提交的评分' },
      { key: 'scoring.publications', label: '结果公示与评优', description: '管理结果公示和评优' }
    ]
  },
  {
    key: 'hr',
    label: '人事信息',
    description: '',
    permissions: [
      { key: 'hr.people', label: '人员信息', description: '管理人员和绑定信息' },
      { key: 'hr.import', label: '人员导入', description: '检查并导入人事表格' },
      { key: 'hr.profile_review', label: '扩展资料审核', description: '管理人员扩展资料' },
      { key: 'hr.profile_templates.manage', label: '共享人事模板', description: '管理共享人事模板' },
      { key: 'hr.profile_templates.select', label: '本组织人事模板', description: '设置本组织模板和填写方式' },
      { key: 'hr.departments', label: '部门管理', description: '新增、修改和删除部门' },
      { key: 'hr.identities', label: '身份管理', description: '新增、修改和删除身份' },
      { key: 'hr.work_groups', label: '职能组管理', description: '新增、修改和删除职能组' }
    ]
  },
  {
    key: 'audit',
    label: '审核管理',
    description: '',
    permissions: [
      { key: 'audit.templates', label: '流程模板', description: '配置审核流程模板和步骤条件' },
      { key: 'audit.stamps', label: '印章管理', description: '维护印章及身份授权' },
      { key: 'audit.submissions', label: '审核记录', description: '查看审核记录和进度' },
      { key: 'audit.verification', label: '验证权限', description: '配置文件验证权限并执行验证' }
    ]
  },
  {
    key: 'venue',
    label: '场地管理',
    description: '',
    permissions: [
      { key: 'venue.resources', label: '场地与排期', description: '管理场地和排期' },
      { key: 'venue.bookings', label: '借用管理', description: '管理场地借用' },
      { key: 'venue.approvals', label: '借用审批', description: '审批借用并管理审批流' },
      { key: 'venue.purposes', label: '事由管理', description: '管理共享借用事由' }
    ]
  },
  {
    key: 'system',
    label: '系统配置',
    description: '',
    permissions: [
      { key: 'system.admin_accounts.read', label: '管理员账号读取', description: '查看并导出同组织管理员账号' },
      { key: 'system.admin_accounts.write', label: '管理员账号写入', description: '管理普通管理员身份授权' },
      { key: 'system.settings', label: '系统参数', description: '查看和修改系统运行参数' },
      { key: 'system.organizations', label: '全局组织配置', description: '管理组织和默认组织', targetLevels: [], defaultLevels: [] }
    ]
  }
];

const PERMISSION_DEFINITIONS = new Map();
PERMISSION_GROUPS.forEach((group) => {
  group.permissions.forEach((permission) => {
    PERMISSION_DEFINITIONS.set(permission.key, Object.assign({
      groupKey: group.key,
      targetLevels: ['admin'],
      defaultLevels: []
    }, permission));
  });
});

const ROUTE_RULES = new Map();

function mapRoutes(permissionKey, routes, options = {}) {
  routes.forEach((route) => ROUTE_RULES.set(route, {
    anyOf: [permissionKey],
    allowUserRole: Boolean(options.allowUserRole)
  }));
}

function mapAny(routes, permissionKeys, options = {}) {
  routes.forEach((route) => ROUTE_RULES.set(route, {
    anyOf: permissionKeys,
    allowUserRole: Boolean(options.allowUserRole)
  }));
}

mapAny(['/listScoreActivities'], [
  'scoring.activities', 'scoring.rules', 'scoring.results', 'scoring.publications'
]);
mapAny(['/getCurrentScoreActivity'], [
  'scoring.activities', 'scoring.rules', 'scoring.results', 'scoring.publications'
], { allowUserRole: true });
mapRoutes('scoring.activities', ['/saveScoreActivity', '/deleteScoreActivity', '/setCurrentScoreActivity', '/toggleActivityPause']);
mapAny(['/listScoreTemplates'], ['scoring.templates', 'scoring.rules']);
mapRoutes('scoring.templates', ['/saveScoreTemplate', '/deleteScoreTemplate', '/duplicateScoreTemplate']);
mapRoutes('scoring.rules', ['/listRateRules', '/saveRateRule', '/deleteRateRule', '/generateRateTargetRules']);
mapRoutes('scoring.results', ['/getScoreResults', '/getScorerTaskStatus']);
mapRoutes('scoring.results_export', ['/exportScoreResults', '/exportScorerTaskStatus']);
mapRoutes('scoring.results_revoke', ['/revokeScoreRecord']);
mapRoutes('scoring.publications', [
  '/getResultPublication', '/saveResultPublication', '/saveResultViewPermission', '/deleteResultViewPermission',
  '/saveMeritListPermission', '/deleteMeritListPermission', '/saveMeritListDesignations', '/removeMeritListDesignation',
  '/generatePubViewRules', '/generatePubMeritRules', '/savePubViewRule', '/listPubViewRules', '/deletePubViewRule',
  '/savePubMeritRule', '/listPubMeritRules', '/deletePubMeritRule', '/getMeritListSummary', '/exportMeritListSummary'
]);

mapAny(['/listHrInfo'], [
  'hr.people', 'hr.import', 'hr.profile_review', 'venue.resources',
  'audit.templates', 'audit.stamps', 'audit.submissions', 'audit.verification'
]);
mapRoutes('hr.people', [
  '/saveHrInfo',
  '/deleteHrInfo',
  '/batchMaintainFromHrInfo',
  '/unbindHrWechat',
  '/listMembershipAssignments',
  '/saveMembershipAssignment',
  '/deleteMembershipAssignment'
]);
mapRoutes('hr.import', ['/previewHrTableImport', '/importHrTable', '/importHrCsv']);
mapAny(['/listHrProfileAdminData'], ['hr.people', 'hr.profile_review']);
mapAny(['/getHrPersonDetail', '/saveHrPersonFull'], ['hr.people', 'hr.profile_review']);
mapRoutes('hr.profile_review', ['/reviewHrProfileChange']);
mapAny(['/listHrProfileTemplates'], ['hr.profile_templates.manage', 'hr.profile_templates.select']);
mapRoutes('hr.profile_templates.manage', [
  '/saveHrProfileTemplateDefinition', '/duplicateHrProfileTemplateDefinition', '/deleteHrProfileTemplateDefinition',
  '/saveHrProfileTemplate'
]);
mapRoutes('hr.profile_templates.select', [
  '/getHrProfileTemplateSwitchContext', '/previewHrProfileTemplateSwitch',
  '/applyHrProfileTemplateSwitch', '/saveOrgHrProfileTemplateSettings'
]);
mapRoutes('hr.departments', ['/saveDepartment', '/deleteDepartment']);
mapRoutes('hr.identities', ['/saveIdentity', '/deleteIdentity']);
mapRoutes('hr.work_groups', ['/saveWorkGroup', '/deleteWorkGroup']);

mapRoutes('audit.templates', ['/listAuditFlowTemplates', '/saveAuditFlowTemplate', '/deleteAuditFlowTemplate']);
mapRoutes('audit.stamps', ['/listStamps', '/saveStamp', '/deleteStamp', '/saveStampAssignments', '/listIdentityStamps']);
mapRoutes('audit.submissions', ['/listAllAuditSubmissions', '/getAuditProgress']);
mapRoutes('audit.submissions', ['/getSubmissionDetail'], { allowUserRole: true });
mapRoutes('audit.verification', ['/listVerificationPermissions', '/saveVerificationPermission', '/verifyAuditFile']);
mapRoutes('audit.verification', ['/verifySignatureChain'], { allowUserRole: true });

mapAny(['/listVenues'], ['venue.resources', 'venue.bookings', 'venue.approvals']);
mapRoutes('venue.resources', [
  '/saveVenue', '/deleteVenue', '/listVenueOpenRules', '/saveVenueOpenRule', '/deleteVenueOpenRule',
  '/listVenueActivityRules', '/saveVenueActivityRule', '/deleteVenueActivityRule'
]);
mapAny(['/getVenueSchedule'], ['venue.resources', 'venue.bookings'], { allowUserRole: true });
mapAny(['/listAllVenueBookings'], ['venue.bookings', 'venue.approvals']);
mapRoutes('venue.bookings', ['/createAdminVenueBooking']);
mapRoutes('venue.approvals', [
  '/listVenueBookingRules', '/saveVenueBookingRule', '/deleteVenueBookingRule',
  '/getVenueApprovalFlow', '/saveVenueApprovalFlow', '/deleteVenueApprovalFlow', '/saveVenueApprovalStep',
  '/saveVenueApprovalWholeFlow', '/deleteVenueApprovalStep', '/saveVenueApprovalStepRule', '/deleteVenueApprovalStepRule',
  '/approveVenueBooking', '/rejectVenueBooking', '/approveVenueBookingAdmin', '/rejectVenueBookingAdmin'
]);
mapRoutes('venue.approvals', [
  '/approveVenueBookingStep', '/rejectVenueBookingStep', '/listPendingVenueApprovals'
], { allowUserRole: true });
mapAny(['/listVenueBookingPurposes'], [
  'venue.resources', 'venue.bookings', 'venue.purposes'
], { allowUserRole: true });
mapRoutes('venue.purposes', ['/saveVenueBookingPurpose', '/deleteVenueBookingPurpose']);

mapRoutes('system.admin_accounts.read', ['/listAdmins', '/exportAdmins', '/listUserBindings']);
mapRoutes('system.admin_accounts.write', [
  '/saveAdmin', '/deleteAdmin', '/createAdminInvite', '/generateAdminInviteCode', '/adminUnbindUser'
]);
mapRoutes('system.settings', ['/getSystemConfig', '/saveSystemConfig', '/listOrganizations', '/admin/health']);
mapRoutes('system.organizations', ['/saveOrganization', '/deleteOrganization', '/switchOrganization']);
mapRoutes('auth.identity.verify', ['/admin/auth/claims']);
mapRoutes('auth.accounts.recover', ['/admin/auth/recoveries', '/admin/auth/accounts']);
mapRoutes('auth.accounts.audit', ['/admin/auth/audit']);
mapRoutes('auth.policy.manage', ['/admin/auth/policy']);
mapAny(['/parseTableFile', '/buildTableFile'], [
  'hr.import', 'hr.people', 'hr.profile_review', 'scoring.templates'
]);

function listPermissionKeys() {
  return Array.from(PERMISSION_DEFINITIONS.keys());
}

function defaultGranted(adminLevel, definition) {
  return definition.defaultLevels.indexOf(adminLevel) >= 0;
}

function isApplicable(permissionKey, adminLevel) {
  const definition = PERMISSION_DEFINITIONS.get(permissionKey);
  return Boolean(definition && definition.targetLevels.indexOf(adminLevel) >= 0);
}

function canConfigureAdminPermissions(operator, effective, target, orgId) {
  if (!operator || !target || target.org_id !== orgId || target.id === operator.id) return false;
  if (operator.admin_level === 'super_admin') return target.admin_level === 'admin';
  return operator.admin_level === 'admin'
    && Boolean(effective && effective.canAccessPermissionSystem)
    && target.admin_level === 'admin';
}

function editablePermissionKeys(operator, effective, target, orgId, targetEffective) {
  if (!canConfigureAdminPermissions(operator, effective, target, orgId)) return [];
  const applicableKeys = Array.from(PERMISSION_DEFINITIONS.keys())
    .filter((key) => isApplicable(key, target.admin_level));
  if (operator.admin_level === 'super_admin') return applicableKeys;
  const editableKeys = applicableKeys.filter((key) => key !== 'permissions.manage_regular_admins'
    && Boolean(effective.permissions && effective.permissions[key]));
  if (targetEffective
    && targetEffective.permissions
    && targetEffective.permissions['system.admin_accounts.write']
    && !editableKeys.includes('system.admin_accounts.write')) {
    return editableKeys.filter((key) => key !== 'system.admin_accounts.read');
  }
  return editableKeys;
}

async function loadEffectivePermissions(admin, orgId, connection) {
  if (!admin) return { permissions: {}, keys: [], isSuper: false, canAccessPermissionSystem: false };
  const isSuper = admin.admin_level === 'super_admin';
  const permissions = {};
  PERMISSION_DEFINITIONS.forEach((definition, key) => {
    permissions[key] = isSuper || defaultGranted(admin.admin_level, definition);
  });

  if (!isSuper && orgId && admin.org_id === orgId) {
    const adminPermissionModel = require('../models/adminPermission');
    const rows = await adminPermissionModel.getOverrides(orgId, admin.id, connection);
    rows.forEach((row) => {
      if (PERMISSION_DEFINITIONS.has(row.permission_key) && isApplicable(row.permission_key, admin.admin_level)) {
        permissions[row.permission_key] = Boolean(row.granted);
      }
    });
  }

  if (permissions['system.admin_accounts.write']) {
    permissions['system.admin_accounts.read'] = true;
  }

  const keys = Object.keys(permissions).filter((key) => permissions[key]);
  return {
    permissions,
    keys,
    isSuper,
    canAccessPermissionSystem: isSuper || (admin.admin_level === 'admin' && Boolean(permissions['permissions.manage_regular_admins']))
  };
}

function hasAnyPermission(effective, keys) {
  if (!effective) return false;
  if (effective.isSuper) return true;
  return (keys || []).some((key) => effective.permissions && effective.permissions[key]);
}

function serializeCatalog(targetLevel, effectivePermissions, editableKeys) {
  const editableSet = new Set(editableKeys || []);
  return PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    permissions: group.permissions
      .filter((item) => isApplicable(item.key, targetLevel))
      .map((item) => ({
        key: item.key,
        label: item.label,
        description: item.description,
        granted: Boolean(effectivePermissions && effectivePermissions[item.key]),
        editable: editableSet.has(item.key)
      }))
  })).filter((group) => group.permissions.length > 0);
}

module.exports = {
  PERMISSION_GROUPS,
  PERMISSION_DEFINITIONS,
  ROUTE_RULES,
  listPermissionKeys,
  defaultGranted,
  isApplicable,
  canConfigureAdminPermissions,
  editablePermissionKeys,
  loadEffectivePermissions,
  hasAnyPermission,
  serializeCatalog
};
