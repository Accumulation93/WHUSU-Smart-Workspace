const PERMISSION_GROUPS = [
  {
    key: 'permissions',
    label: '权限管理',
    description: '控制普通管理员是否可以配置同组织其他普通管理员权限',
    permissions: [
      { key: 'permissions.manage_regular_admins', label: '配置普通管理员权限', description: '允许进入权限系统并配置同组织其他普通管理员', targetLevels: ['admin'], defaultLevels: [] }
    ]
  },
  {
    key: 'scoring',
    label: '考核评分',
    description: '活动、模板、规则、结果与公示管理',
    permissions: [
      { key: 'scoring.activities', label: '活动管理', description: '新建、编辑、删除、启用及暂停评分活动' },
      { key: 'scoring.templates', label: '评分模板', description: '维护评分问题模板及复制模板' },
      { key: 'scoring.rules', label: '评分规则', description: '配置评分对象、评分人及模板规则' },
      { key: 'scoring.results', label: '结果查看', description: '查看评分结果、明细与完成率' },
      { key: 'scoring.results_export', label: '结果导出', description: '导出评分结果和评分任务完成情况' },
      { key: 'scoring.results_revoke', label: '撤销评分', description: '撤销已经提交的评分记录' },
      { key: 'scoring.publications', label: '结果公示与评优', description: '配置结果公示、查看规则及评优名单' }
    ]
  },
  {
    key: 'hr',
    label: '人事信息',
    description: '人员、资料审核与组织字典管理',
    permissions: [
      { key: 'hr.people', label: '人员信息', description: '查看、新建、修改、删除及解绑人员' },
      { key: 'hr.import', label: '人员导入', description: '预检并导入人事表格' },
      { key: 'hr.profile_review', label: '扩展资料审核', description: '查看、审核及维护人员扩展资料' },
      { key: 'hr.profile_templates.manage', label: '全局人事模板管理', description: '创建、修改、复制和删除跨组织共用的人事模板' },
      { key: 'hr.profile_templates.select', label: '本组织人事模板切换', description: '为本组织选择模板、迁移字段并调整填写说明和修改模式' },
      { key: 'hr.departments', label: '部门管理', description: '新增、修改和删除部门' },
      { key: 'hr.identities', label: '身份管理', description: '新增、修改和删除身份' },
      { key: 'hr.work_groups', label: '职能组管理', description: '新增、修改和删除职能组' }
    ]
  },
  {
    key: 'audit',
    label: '审核管理',
    description: '流程、印章、记录与验证权限管理',
    permissions: [
      { key: 'audit.templates', label: '流程模板', description: '配置审核流程模板和步骤条件' },
      { key: 'audit.stamps', label: '印章管理', description: '维护印章及身份授权' },
      { key: 'audit.submissions', label: '审核记录', description: '查看全组织审核记录和流程进度' },
      { key: 'audit.verification', label: '验证权限', description: '配置文件验证权限并执行验证' }
    ]
  },
  {
    key: 'venue',
    label: '场地管理',
    description: '场地、排期、借用与审批配置',
    permissions: [
      { key: 'venue.resources', label: '场地与排期', description: '维护场地、开放规则、活动占用和排期' },
      { key: 'venue.bookings', label: '借用管理', description: '查看借用记录并创建管理员免审借用' },
      { key: 'venue.approvals', label: '借用审批', description: '审批或驳回场地借用并配置审批流' },
      { key: 'venue.purposes', label: '事由管理', description: '维护跨组织共享的场地借用事由' }
    ]
  },
  {
    key: 'system',
    label: '系统配置',
    description: '管理员账号、系统参数与组织配置',
    permissions: [
      { key: 'system.admin_accounts.read', label: '管理员账号读取', description: '查看并导出同组织管理员账号' },
      { key: 'system.admin_accounts.write', label: '管理员账号写入', description: '创建、编辑、删除同组织普通管理员并管理邀请码' },
      { key: 'system.settings', label: '系统参数', description: '查看和修改系统运行参数' },
      { key: 'system.organizations', label: '全局组织配置', description: '创建、删除及切换全系统默认组织', targetLevels: [], defaultLevels: [] }
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

function mapRoutes(permissionKey, routes) {
  routes.forEach((route) => ROUTE_RULES.set(route, { anyOf: [permissionKey] }));
}

function mapAny(routes, permissionKeys) {
  routes.forEach((route) => ROUTE_RULES.set(route, { anyOf: permissionKeys }));
}

mapAny(['/listScoreActivities', '/getCurrentScoreActivity'], [
  'scoring.activities', 'scoring.rules', 'scoring.results', 'scoring.publications'
]);
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
mapRoutes('hr.people', ['/saveHrInfo', '/deleteHrInfo', '/batchMaintainFromHrInfo', '/unbindHrWechat']);
mapRoutes('hr.import', ['/previewHrTableImport', '/importHrTable', '/importHrCsv']);
mapAny(['/listHrProfileAdminData', '/getHrPersonDetail', '/saveHrPersonFull'], ['hr.people', 'hr.profile_review']);
mapRoutes('hr.profile_review', ['/reviewHrProfileChange']);
mapAny(['/listHrProfileTemplates'], ['hr.profile_templates.manage', 'hr.profile_templates.select']);
mapRoutes('hr.profile_templates.manage', [
  '/saveHrProfileTemplateDefinition', '/duplicateHrProfileTemplateDefinition', '/deleteHrProfileTemplateDefinition'
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
mapRoutes('audit.verification', ['/listVerificationPermissions', '/saveVerificationPermission', '/verifyAuditFile']);

mapAny(['/listVenues'], ['venue.resources', 'venue.bookings', 'venue.approvals']);
mapRoutes('venue.resources', [
  '/saveVenue', '/deleteVenue', '/listVenueOpenRules', '/saveVenueOpenRule', '/deleteVenueOpenRule',
  '/listVenueActivityRules', '/saveVenueActivityRule', '/deleteVenueActivityRule', '/listVenueBookingRules',
  '/saveVenueBookingRule', '/deleteVenueBookingRule'
]);
mapAny(['/getVenueSchedule'], ['venue.resources', 'venue.bookings']);
mapAny(['/listAllVenueBookings'], ['venue.bookings', 'venue.approvals']);
mapRoutes('venue.bookings', ['/createAdminVenueBooking']);
mapRoutes('venue.approvals', [
  '/getVenueApprovalFlow', '/saveVenueApprovalFlow', '/deleteVenueApprovalFlow', '/saveVenueApprovalStep',
  '/saveVenueApprovalWholeFlow', '/deleteVenueApprovalStep', '/saveVenueApprovalStepRule', '/deleteVenueApprovalStepRule',
  '/approveVenueBookingStep', '/rejectVenueBookingStep', '/approveVenueBooking', '/rejectVenueBooking',
  '/approveVenueBookingAdmin', '/rejectVenueBookingAdmin', '/listPendingVenueApprovals'
]);
mapAny(['/listVenueBookingPurposes'], ['venue.resources', 'venue.bookings', 'venue.purposes']);
mapRoutes('venue.purposes', ['/saveVenueBookingPurpose', '/deleteVenueBookingPurpose']);

mapRoutes('system.admin_accounts.read', ['/listAdmins', '/exportAdmins']);
mapRoutes('system.admin_accounts.write', [
  '/saveAdmin', '/deleteAdmin', '/createAdminInvite', '/generateAdminInviteCode', '/adminUnbindUser'
]);
mapRoutes('system.settings', ['/getSystemConfig', '/saveSystemConfig', '/listOrganizations']);
mapRoutes('system.organizations', ['/saveOrganization', '/deleteOrganization', '/switchOrganization']);
mapAny(['/parseTableFile', '/buildTableFile'], ['hr.import', 'scoring.templates']);

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
