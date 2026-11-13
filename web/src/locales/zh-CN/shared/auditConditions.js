// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
import relations from './identityNatureRelations.js';
const sharedModule = Object.freeze({
  approvalNatureLabel: relations.nature,
  approvalLegacyNature: relations.legacyScope,
  starterConditionGroupsHint: '发起岗位符合以下任意一组条件即可；每组条件须在同一岗位上同时满足。',
  starterConditionGroup: index => `发起条件组 ${index}`,
  starterIdentityScopeHint: '发起岗位须同时符合以下条件。',
  starterPeopleCondition: names => `指定人员可发起：${names}。`,
  starterAssignmentsCondition: labels => `指定岗位可发起：${labels}。`,
  starterConditionIncomplete: '本组部分条件未能读取，暂时无法完整显示发起范围。',
  starterRangeUnavailable: '暂时无法确认哪些岗位可以发起申请。',
  starterConditionNeedsReview: '这组发起条件包含当前不支持的设置，请打开模板核对。',
  approvalConditionGroupsHint: '符合以下任意一组条件即可；每组条件须在同一岗位上同时满足。',
  approvalConditionGroup: index => '条件组 ' + index,
  approvalIdentityScopeHint: '同一岗位须同时符合以下条件，并具有本步骤的审批资格。',
  approvalSpecificValuesHint: '同一类中列出多个选项时，符合任意一个即可。',
  approvalSubmitterCondition: '由申请人本人审批。',
  approvalPeopleCondition: names => '指定审批人：' + names + '。',
  approvalAssignmentsCondition: labels => '指定审批岗位：' + labels + '。',
  approvalDepartmentLabel: '部门', approvalIdentityLabel: '身份类别', approvalWorkGroupLabel: '职能组',
  approvalAllDepartments: '不限部门', approvalAllIdentities: '不限身份类别', approvalAllWorkGroups: '不限职能组',
  approvalOwnDepartment: '与申请岗位所属部门相同', approvalOwnIdentity: '与申请岗位的身份类别相同', approvalOwnWorkGroup: '与申请岗位所属职能组相同',
  approvalSpecifiedValues: names => '指定：' + names,
  approvalConditionIncomplete: '本组部分条件未能读取，暂时无法完整显示审批范围。',
  approvalDimensionUnavailable: '此项条件暂未确认',
  approverRangeUnavailable: '暂时无法确认审批人范围',
  allIdentityApprovers: identity => '审批范围：本组织的“' + identity + '”岗位',
  sameDepartmentApprovers: identity => '审批范围：与申请人同部门的“' + identity + '”岗位',
  sameWorkGroupApprovers: identity => '审批范围：与申请人同职能组的“' + identity + '”岗位',
  departmentApprovers: (department,identity) => '审批范围：“' + department + '”中的“' + identity + '”岗位',
  workGroupApprovers: (department,group,identity) => '审批范围：“' + department + ' · ' + group + '”中的“' + identity + '”岗位'
});

export default sharedModule;
