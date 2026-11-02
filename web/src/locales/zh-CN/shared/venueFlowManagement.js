// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  switchTitle: '确认切换审核方式',
  directToFlow: '保存审批流程会移除当前“直接通过”规则，是否继续？',
  flowToDirect: '保存“直接通过”会移除该场地生效中的审批流程，是否继续？',
  enabled: '已启用',
  disabled: '未启用',
  approver: '审批岗位',
  chooseApprover: '选择审批岗位',
  identity: '审批身份类别',
  department: '适用部门',
  workGroup: '适用职能组',
  allDepartments: '全部部门',
  allWorkGroups: '全部职能组',
  chooseIdentity: '选择身份类别',
  retry: '重试',
  continuousOccupancy: '连续占用',
  intervalOccupancy: '间隔重复',
  occurrenceStart: '单次开始',
  occurrenceEnd: '单次结束',
  intervalValue: '间隔数量',
  intervalUnit: '间隔单位',
  intervalDay: '天',
  intervalWeek: '周',
  intervalInvalid: '间隔须为1至366，次数须为1至1000的整数。',
  unavailableReference: '原选项已失效，请重新选择',
  incomplete: '操作未完成'
});

export default sharedModule;
