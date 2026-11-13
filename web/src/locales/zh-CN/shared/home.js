// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

import common from './common.js';
const text = Object.freeze({
  publicationGroupOwn: '本人的评分结果',
  publicationGroupDepartment: '同部门成员的评分结果',
  publicationGroupDepartmentIdentity: name => `同部门“${name}”成员的评分结果`,
  publicationGroupWorkGroup: '同部门、同职能组成员的评分结果',
  publicationGroupWorkGroupIdentity: name => `同部门、同职能组“${name}”成员的评分结果`,
  publicationGroupOrganization: '本组织成员的评分结果',
  publicationGroupUnknown: '可查看的评分结果',
  profileReviewNone: '未提交审核',
  profileReviewPending: '待审核',
  profileReviewApproved: '已生效',
  profileReviewRejected: '已驳回',
  profileStatusUnknown: '资料审核状态暂未确认',
  profileComplete: '必填资料已填齐',
  profileIncomplete: '必填资料待补充',
  profileCompletenessUnknown: '资料完整度暂未确认',
  profileModeDirect: '修改后直接生效',
  profileModeAudit: '修改后需审核',
  profileModeReadonly: '仅管理员可修改',
  profileModeUnknown: '填写方式暂未确认',
  all: '全部',
  rankMedalGold: '🥇',
  rankMedalSilver: '🥈',
  rankMedalBronze: '🥉',
  appName: common.brandName,
  organizationName: common.organizationName,
  defaultPageName: '考核评分',
  scoring: '考核评分',
  hr: '人事信息',
  audit: '审核',
  results: '结果公示',
  meritList: '评优名单',
  welcome: '欢迎使用',
  signedOut: '未登录',
  signInWithWechat: '请先登录',
  superAdmin: '超级管理员',
  admin: '普通管理员',
  unsetIdentity: '未设置岗位',
  currentActivity: '当前评分活动',
  loadingDots: '正在加载',
  noActivity: '暂无评分活动',
  totalTargets: '需评分人数',
  completed: '已完成',
  pendingScore: '待评分',
  scoreTarget: '被评分人',
  activityPaused: '当前评分活动已暂停',
  activityNotStarted: '当前评分活动尚未开始',
  activityEnded: '当前评分活动已结束',
  loadingTargets: '正在加载评分任务',
  refreshTargetsLater: '评分任务未能加载，请重试',
  noTargets: '暂无可评分人员',
  unclassified: '未分类',
  assignmentNatureStaff: '本会岗位',
  assignmentNatureLiaison: '学院对接岗位',
  assignmentNatureOther: '其他岗位',
  waitingPublication: '等待公示',
  noPublication: '暂无结果公示',
  noPermission: '当前工作角色无权查看',
  noVisibleResults: '暂无可查看的评分结果',
  scoringResults: '评分结果',
  totalPrefix: '共',
  publicationCount: '公示人数',
  maxScore: '最高分',
  averageScore: '平均分',
  personSuffix: '人',
  positionSuffix: '个岗位',
  groupSuffix: '个组别',
  search: '搜索',
  resultSearchPlaceholder: '搜索姓名、身份类别、部门或职能组',
  filter: '筛选',
  identity: '身份类别',
  department: '部门',
  workGroup: '职能组',
  clearAllFilters: '清除全部筛选',
  grade: '等第',
  score: '分数',
  earnedScore: '得分',
  noMatchingResults: '没有符合筛选条件的结果',
  unrated: '未评级',
  merit: '评优',
  meritGroup: '评优组别',
  designatedCount: '已指定人数',
  involvedDepartments: '涉及部门',
  edit: '编辑',
  noDesignatedMember: '暂未指定人选',
  noMeritList: '暂无评优名单',
  noTemplate: '当前组织未设置补充资料项',
  profilePending: '资料修改已提交，正在等待审核',
  rejectionReasonPrefix: '驳回原因：',
  name: '姓名',
  studentId: '学号',
  belongingDepartment: '所属部门',
  workDivision: '职能组',
  profileManagedByAdmin: '基础信息由管理员维护，如需修改请联系管理员。',
  loadingProfile: '正在加载本人资料',
  profileLoadFailed: '本人资料未能加载，请重试',
  reloadProfile: '重新加载',
  noExtraProfile: '暂无补充资料',
  select: '请选择',
  inputNumber: '请输入数字',
  selectDate: '请选择日期',
  selectDateTime: '请选择日期与时间',
  selectTime: '请选择时间',
  inputPhone: '请输入手机号',
  inputEmail: '请输入邮箱',
  inputPrefix: '请输入',
  submitReview: '提交审核',
  saveProfile: '保存本人资料',
  accountAndLogin: '账号与登录',
  accountDescription: '管理本人的恢复方式、登录口令和登录设备',
  verified: '已认证',
  loadingAccount: '正在加载账号信息…',
  contactAdminForWechat: '如无法自行更换微信，请联系管理员。',
  recoveryCode: '账号恢复码',
  recoveryCodeWarning: '新码生成后，旧码立即失效',
  generateCode: '生成新恢复码',
  copy: '复制',
  saved: '关闭恢复码',
  loginPassphrase: '登录口令',
  passphraseDescription: '设置后可用于口令登录',
  passphrasePlaceholder: '输入新的登录口令',
  savePassphrase: '保存口令',
  loginDevices: '登录设备',
  loginSessions: '登录记录',
  loginSessionsDescription: '可结束不再使用的登录；多条记录可能来自同一台设备。',
  sessionSuffix: '条',
  currentSession: '当前登录',
  otherSession: '其他登录',
  endSession: '结束登录',
  noSessions: '暂无登录记录',
  sessionEnded: '这条登录记录已结束',
  loginDevicesDescription: '可退出不再使用的设备',
  deviceSuffix: '台',
  recentActivity: '最近活动',
  current: '当前',
  signOutDevice: '退出设备',
  noDevices: '暂无登录设备',
  auditCenter: '审核中心',
  myAudits: '我的申请',
  pendingApprovals: '待我审批',
  approvalHistory: '审批记录',
  myApprovalHistory: '我的审批记录',
  auditVerification: '文件验签',
  auditVerificationDescription: '核对文件内容与签署记录。',
  enter: common.actions.enter,
  noIdentity: '暂无可用工作角色',
  backToPortal: '返回应用服务',
  designateMeritList: '指定评优名单',
  close: common.actions.close,
  currentList: '当前名单',
  remove: '移除',
  noCandidate: '暂无人选',
  availableMembers: '可选成员',
  nameOrStudentId: '搜索姓名',
  noMatchingMembers: '没有符合筛选条件的成员',
  selected: '已选',
  choose: '选择',
  cancel: common.actions.cancel,
  saveList: '保存名单',
  noFeatureInOrganization: '当前组织尚未开放这项功能',
  profileNotSubmitted: '尚未提交补充资料',
  managementIdentity: '管理身份',
  regularPosition: '岗位',
  currentDevice: '当前设备',
  signedInDevice: '已登录设备',
  unrecognizedDevice: '无法识别的设备',
  deviceModelUnavailable: '暂未获取设备型号',
  miniProgram: '微信小程序',
  numberType: '数字',
  sequenceType: '序列选择',
  dateType: '日期',
  datetimeType: '日期时间',
  phoneType: '手机号',
  emailType: '邮箱',
  textType: '文本',
  integerOnly: '仅限整数',
  decimalAllowed: '可填小数',
  dateFormat: '日期格式：年-月-日，例如 2006-10-20',
  phoneHint: '请输入中国大陆手机号（11位）',
  emailHint: '例如：name@example.com',
  retryLater: '请稍后重试',
  generationFailed: '恢复码生成失败，请重试',
  passphraseRequired: '请输入登录口令',
  saveFailed: '保存失败，请重试',
  passphraseUpdated: '口令已更新',
  retry: '请重试',
  deviceSignedOut: '该设备已退出',
  noProfile: '暂无本人资料',
  contactAdminToEdit: '如需修改，请联系管理员',
  updateFailed: '资料未能更新，请刷新后查看',
  updated: '已更新',
  enteringScorePage: '正在打开评分页面',
  enterScorePageFailed: '评分页面未能打开，请重试',
  refreshLater: '请稍后重试',
  unlimitedPeople: '不限人数'
});

const format = Object.freeze({
  navigationTitle(pageName) {
    return `${pageName || text.defaultPageName} - ${common.brandName}`;
  },
  shortest(value) {
    return `最短 ${value}`;
  },
  longest(value) {
    return `最长 ${value}`;
  },
  lengthLimit(parts) {
    return `长度限制：${parts.join('、')}`;
  },
  numberLength(parts, decimalText) {
    return `数字长度：${parts.join('、')}；${decimalText}`;
  },
  minimum(value) {
    return `最小值 ${value}`;
  },
  maximum(value) {
    return `最大值 ${value}`;
  },
  numberRange(parts, decimalText) {
    return `数值范围：${parts.join('、')}；${decimalText}`;
  },
  required(label) {
    return `请填写“${label}”。`;
  },
  minimumCharacters(label, value) {
    return `“${label}”的内容太短，请补充后再试（最低长度：${value}）。`;
  },
  maximumCharacters(label, value) {
    return `“${label}”的内容太长，请缩短后再试（最大长度：${value}）。`;
  },
  integer(label) {
    return `“${label}”需要填写整数。`;
  },
  number(label) {
    return `“${label}”需要填写数字。`;
  },
  minimumDigits(label, value) {
    return `“${label}”至少需要 ${value} 位数字。`;
  },
  maximumDigits(label, value) {
    return `“${label}”不能超过 ${value} 位数字。`;
  },
  minimumValue(label, value) {
    return `“${label}”不能小于 ${value}。`;
  },
  maximumValue(label, value) {
    return `“${label}”不能大于 ${value}。`;
  },
  select(label) {
    return `请选择“${label}”。`;
  },
  selectValid(label) {
    return `“${label}”的选项已不可用，请重新选择。`;
  },
  check(label) {
    return `请检查“${label}”的填写内容。`;
  },
  reopenScorePage(name) {
    return `请重新打开“${name}”的评分页面。`;
  },
  exactQuota(value) {
    return `需指定 ${value} 人`;
  },
  maximumQuota(value) {
    return `最多指定 ${value} 人`;
  }
});

const sharedModule = Object.freeze({ text, format });

export { text, format };
export default sharedModule;
