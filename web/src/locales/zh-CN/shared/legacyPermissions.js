// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
import governance from './adminGovernance.js';
import account from './generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';
import directory from './generated/subpackages/org/pages/adminPermissions/adminPermissions.js';
const sharedModule = Object.freeze({
  directoryPeopleCount: count => `${count} 位管理员`,
  unknown: '未识别的旧权限',
  unknownDescription: '这项旧权限暂时无法显示说明。',
  unknownGroup: '权限分组暂未确认',
  unknownAdminLevel: '管理身份暂未确认',
  adminLevels: { admin: directory.copy_1557b96093, super_admin: directory.copy_ccd219e5f1 },
  accountStates: {
    verified: account.copy_8e4abe3d58,
    frozen: account.copy_4defd9babd,
    recovery_required: account.copy_16399ef078,
    pending_verification: account.accountPendingVerification
  },
  unknownAccountState: account.accountStateUnknown,
  groups: {
    calendar: '日程', authentication: '账号认证', permissions: '权限管理',
    scoring: '考核评分', hr: '人事信息', audit: '审核', venue: '场地管理', system: '系统设置'
  },
  permissions: {
    'calendar.manage': ['日程管理', '管理授权范围内的日程。'],
    'calendar.rules.manage': ['日程安排规则', '设置哪些人可以安排他人的日程。'],
    'auth.identity.verify': ['身份认证管理', '审核成员认证并生成认证码。'],
    'auth.accounts.recover': ['组织账号查看', '查看本组织成员的账号状态和登录记录。'],
    'auth.accounts.global_manage': ['全局账号管理', '管理成员的全局账号，相关操作会影响其在各组织的登录。'],
    'auth.policy.manage': ['认证设置', '设置身份认证和账号恢复的可用方式。'],
    'permissions.manage_regular_admins': ['普通管理员权限设置', '设置本组织普通管理员的管理权限。'],
    'scoring.activities': ['评分活动管理', '新增和维护评分活动。'],
    'scoring.templates': ['评分模板管理', '新增和维护评分模板及题目。'],
    'scoring.rules': ['评分范围设置', '设置评分人和被评分人的范围。'],
    'scoring.results': ['查看评分结果', '查看评分结果、明细和完成情况。'],
    'scoring.results_export': ['导出评分结果', '导出评分结果和任务完成情况。'],
    'scoring.results_revoke': ['撤销评分记录', '撤销已提交的评分记录。'],
    'scoring.publications': ['公示与评优管理', '设置结果公示和评优人选规则。'],
    'hr.people': ['成员资料管理', '维护成员资料及岗位；账号操作还需对应账号权限。'],
    'hr.directory.manage': ['通讯录规则管理', '设置通讯录的可见人员和资料项，不附带查看其资料的权限。'],
    'hr.import': ['人事表格导入', '检查表格内容并导入成员资料。'],
    'hr.profile_review': ['补充资料审核', '审核成员提交的补充资料修改。'],
    'hr.profile_templates.manage': ['资料模板管理', '新增和维护可供组织使用的资料模板。'],
    'hr.profile_templates.select': ['本组织资料设置', '为本组织选择资料模板及填写方式。'],
    'hr.departments': ['部门管理', '新增和修改部门选项。'],
    'hr.identities': ['身份类别管理', '新增和修改身份类别选项。'],
    'hr.work_groups': ['职能组管理', '新增和修改职能组选项。'],
    'audit.templates': ['审核模板管理', '设置申请模板、审批步骤及适用范围。'],
    'audit.stamps': ['印章管理', '维护电子印章及使用授权。'],
    'audit.submissions': ['查看审核记录', '查看授权范围内的申请记录和审批进展。'],
    'audit.submissions_delete': [governance.auditRecordsDelete, governance.auditRecordsDeleteDescription],
    'audit.verification': ['文件验证管理', '设置文件验证权限并核验已获授权的文件。'],
    'venue.resources': ['场地与排期管理', '维护场地资料、开放时间及活动占用。'],
    'venue.bookings': ['借用管理', '管理授权范围内的场地借用。'],
    'venue.bookings_delete': [governance.venueRecordsDelete, governance.venueRecordsDeleteDescription],
    'venue.approvals': ['借用审批管理', '设置借用审批流程，并在具备处理资格时审批借用。'],
    'venue.purposes': ['借用事由管理', '新增和修改常用借用事由。'],
    'system.admin_accounts.read': ['查看管理员', '查看并导出本组织的管理员目录。'],
    'system.admin_accounts.write': ['管理普通管理员', '新增、修改和移除本组织的普通管理员身份。'],
    'system.settings': ['系统基本设置', '查看和修改已授权的系统设置。'],
    'system.organizations': ['组织管理', '管理组织资料和系统默认组织。']
  },
  deletePermissions: governance.deletePermissions,
  deleteDescription: governance.deleteDescription
});

export default sharedModule;
