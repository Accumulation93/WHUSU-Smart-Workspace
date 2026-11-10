// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
const sharedModule = Object.freeze({
  title: '身份卡', navigationTitle: '身份卡 - WHUSU智慧工作台', verifyTitle: '身份核验',
  loading: '正在读取身份', generating: '正在生成核验码', retry: '重试', refresh: '刷新身份卡',
  refreshVerification: '刷新',
  scanHint: '扫一扫，核验身份', expiryHint: '24 小时内有效',
  credential: '电子身份凭证', liveCheck: '实时核验',
  verificationCode: '核验二维码', miniProgramCode: '小程序码',
  originalImage: '查看或保存原图', imageName: '身份核验码',
  verified: '当前身份有效', unavailable: '身份已失效或核验码已过期',
  personalUnavailable: '当前工作角色无法生成身份卡，请刷新或切换工作角色。',
  verificationUnavailable: '本次未能核实有效身份，请出示人刷新身份卡后重新扫码。',
  active: '在职', noPosition: '在职，暂无岗位', adminActive: '管理身份有效',
  organization: '组织', department: '部门', identityCategory: '身份类别', functionGroup: '职能组',
  position: '当前岗位', state: '身份状态',
  failure: '身份卡暂时无法读取，请重试。', qrFailure: '核验码暂时无法生成，请重试。',
  noIdentity: '当前身份无法生成身份卡，请切换有效工作角色。',
  login: '登录后查看我的身份卡',
  currentTime: '当前时间', checkedAt: '核验时间', open: '查看身份卡'
});

export default sharedModule;
