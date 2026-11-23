// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  switchTitle: '确认切换审批方式',
  directToFlow: '保存审批流程后，当前生效的「直接通过」规则会停用，原配置会保留。',
  flowToDirect: '保存『直接通过』后，本组织在该场地其他已启用的预约规则和审批流程会停用，原配置会保留。',
  enabled: '已启用',
  disabled: '未启用',
  approver: '审批工作角色',
  chooseApprover: '选择审批工作角色',
  identity: '审批身份类别',
  department: '适用部门',
  workGroup: '适用职能组',
  allDepartments: '全部部门',
  allWorkGroups: '全部职能组',
  chooseIdentity: '选择身份类别',
  retry: '重试',
  continuousOccupancy: '连续占用',
  intervalOccupancy: '间隔重复',
  occurrenceStart: '单次活动开始',
  occurrenceEnd: '单次活动结束',
  intervalValue: '间隔数量',
  intervalUnit: '间隔单位',
  intervalDay: '天',
  intervalWeek: '周',
  intervalInvalid: '间隔数量须为 1 至 366 的整数，重复次数须为 1 至 1000 的整数。',
  unavailableReference: '原选项已失效，请重新选择',
  incomplete: '操作未完成，请刷新查看结果'
});

export default sharedModule;
