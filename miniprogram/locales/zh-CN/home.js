'use strict';

const common = require('./common');

const text = Object.freeze({
  all: '全部',
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
  signInWithWechat: '请微信登录',
  superAdmin: '超级管理员',
  admin: '普通管理员',
  unsetIdentity: '未设置岗位',
  currentActivity: '当前评分活动',
  loadingDots: '加载中...',
  noActivity: '暂无评分活动',
  totalTargets: '待评人数',
  completed: '已完成',
  pendingScore: '待评分',
  scoreTarget: '被评分人',
  activityPaused: '当前评分活动已暂停',
  activityNotStarted: '当前评分活动尚未开始',
  activityEnded: '当前评分活动已结束',
  loadingTargets: '正在加载被评分人',
  refreshTargetsLater: '请稍后刷新被评分人',
  noTargets: '暂无符合规则的被评分人',
  unclassified: '未分类',
  assignmentNatureStaff: '本会岗位',
  assignmentNatureLiaison: '学院对接岗位',
  assignmentNatureOther: '其他岗位',
  waitingPublication: '等待公示',
  noPublication: '暂无结果公示',
  noPermission: '暂无权限',
  noVisibleResults: '暂无可查看结果',
  scoringResults: '评分结果',
  totalPrefix: '共',
  publicationCount: '公示人数',
  maxScore: '最高分',
  averageScore: '平均分',
  personSuffix: '人',
  positionSuffix: '个岗位',
  groupSuffix: '个组别',
  search: '搜索',
  resultSearchPlaceholder: '搜索姓名或组织信息',
  filter: '筛选',
  identity: '身份类别',
  department: '部门',
  workGroup: '职能组',
  clearAllFilters: '清除全部筛选',
  grade: '等第',
  score: '分数',
  earnedScore: '得分',
  noMatchingResults: '没有匹配结果',
  unrated: '未评级',
  merit: '评优',
  meritGroup: '评优组别',
  designatedCount: '已指定人数',
  involvedDepartments: '涉及部门',
  edit: '✎ 编辑',
  noDesignatedMember: '暂未指定人选',
  noMeritList: '暂无评优名单',
  noTemplate: '未使用模板',
  profilePending: '资料正在审核，请等待结果。',
  rejectionReasonPrefix: '驳回原因：',
  name: '姓名',
  studentId: '学号',
  belongingDepartment: '所属部门',
  workDivision: '工作分工（职能组）',
  profileManagedByAdmin: '基础信息由管理员维护，如需修改请联系管理员。',
  loadingProfile: '正在加载人事信息...',
  noExtraProfile: '暂无补充资料',
  select: '请选择',
  inputNumber: '请输入数字',
  selectDate: '请选择日期',
  inputPhone: '请输入手机号',
  inputEmail: '请输入邮箱',
  inputPrefix: '请输入',
  submitReview: '提交审核',
  saveProfile: '保存人事信息',
  accountAndLogin: '账号与登录',
  accountDescription: '管理账号恢复方式和已登录设备',
  verified: '已认证',
  loadingAccount: '正在加载账号信息…',
  contactAdminForWechat: '如需更换微信，请联系管理员。',
  recoveryCode: '账号恢复码',
  recoveryCodeWarning: '新码生成后，旧码立即失效',
  generateCode: '生成新码',
  copy: '复制',
  saved: '已保存',
  loginPassphrase: '登录口令',
  passphraseDescription: '设置后可用于口令登录',
  passphrasePlaceholder: '输入新的登录口令',
  savePassphrase: '保存口令',
  loginDevices: '登录设备',
  loginDevicesDescription: '可退出不再使用的设备',
  deviceSuffix: '台',
  recentActivity: '最近活动',
  current: '当前',
  signOutDevice: '退出设备',
  noDevices: '暂无登录设备',
  auditCenter: '审核中心',
  myAudits: '我的审核',
  pendingApprovals: '待我审批',
  approvalHistory: '审批记录',
  myApprovalHistory: '我的审批记录',
  enter: common.actions.enter,
  noIdentity: '暂无可用工作上下文',
  backToPortal: '返回门户',
  designateMeritList: '指定评优名单',
  close: common.actions.close,
  currentList: '当前名单',
  remove: '移除',
  noCandidate: '暂无人选',
  availableMembers: '可选成员',
  nameOrStudentId: '姓名/学号',
  noMatchingMembers: '没有匹配的成员',
  selected: '已选',
  choose: '选择',
  cancel: common.actions.cancel,
  saveList: '保存名单',
  noFeatureInOrganization: '该组织无此功能',
  profileNotSubmitted: '尚未提交补充资料',
  managementIdentity: '管理工作上下文',
  regularPosition: '普通岗位',
  currentDevice: '当前设备',
  signedInDevice: '已登录设备',
  unrecognizedDevice: '无法识别的设备',
  miniProgram: '微信小程序',
  numberType: '数字',
  sequenceType: '序列选择',
  dateType: '日期',
  phoneType: '手机号',
  emailType: '邮箱',
  textType: '文字',
  integerOnly: '填写整数',
  decimalAllowed: '可填小数',
  dateFormat: '格式：YYYY-MM-DD',
  phoneHint: '请输入 11 位手机号',
  emailHint: '示例：name@example.com',
  retryLater: '请稍后重试',
  generationFailed: '未生成，请重试',
  passphraseRequired: '请输入登录口令',
  saveFailed: '未保存，请重试',
  passphraseUpdated: '口令已更新',
  retry: '请重试',
  deviceSignedOut: '该设备已退出',
  noProfile: '暂无人事资料',
  contactAdminToEdit: '请联系管理员修改',
  updateFailed: '未更新，请重试',
  updated: '已更新',
  enteringScorePage: '进入评分页',
  enterScorePageFailed: '无法进入评分页',
  refreshLater: '请稍后刷新',
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
    return `长度限制：${parts.join('，')}`;
  },
  numberLength(parts, decimalText) {
    return `数字长度：${parts.join('，')}，${decimalText}`;
  },
  minimum(value) {
    return `最小 ${value}`;
  },
  maximum(value) {
    return `最大 ${value}`;
  },
  numberRange(parts, decimalText) {
    return `数值范围：${parts.join('，')}，${decimalText}`;
  },
  required(label) {
    return `请填写${label}`;
  },
  minimumCharacters(label, value) {
    return `${label}请填写至少 ${value} 个字符`;
  },
  maximumCharacters(label, value) {
    return `${label}请控制在 ${value} 个字符内`;
  },
  integer(label) {
    return `${label}请输入整数`;
  },
  number(label) {
    return `${label}请输入数字`;
  },
  minimumDigits(label, value) {
    return `${label}请输入至少 ${value} 位`;
  },
  maximumDigits(label, value) {
    return `${label}请输入不超过 ${value} 位`;
  },
  minimumValue(label, value) {
    return `${label}请输入不小于 ${value} 的数值`;
  },
  maximumValue(label, value) {
    return `${label}请输入不大于 ${value} 的数值`;
  },
  select(label) {
    return `请选择${label}`;
  },
  selectValid(label) {
    return `请选择有效的${label}`;
  },
  check(label) {
    return `请检查${label}`;
  },
  reopenScorePage(name) {
    return `请重新打开${name}评分页`;
  },
  exactQuota(value) {
    return `等额 ${value} 人`;
  },
  maximumQuota(value) {
    return `最多 ${value} 人`;
  }
});

module.exports = Object.freeze({ text, format });
