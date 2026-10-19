// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';
const sharedModule = Object.freeze({
  title: '身份卡', navigationTitle: '身份卡 - WHUSU智慧工作台', verifyTitle: '身份核验',
  loading: '正在读取身份', generating: '正在生成小程序码', retry: '重试', refresh: '刷新身份卡',
  scanHint: '微信扫码核验当前身份', expiryHint: '小程序码24小时内有效，核验时重新检查当前身份。',
  privacyHint: '扫码者可以查看姓名、组织、当前岗位和在职状态。',
  verified: '当前身份有效', unavailable: '身份已失效或小程序码已过期',
  active: '在职', noPosition: '在职，暂无岗位', adminActive: '管理权限有效',
  organization: '组织', position: '当前岗位', state: '身份状态',
  failure: '身份卡暂时无法读取，请重试。', qrFailure: '小程序码暂时无法生成，请重试。',
  noIdentity: '当前身份无法生成身份卡，请切换有效工作角色。',
  login: '登录后查看我的身份卡', notPhysicalProof: '此结果核验系统登记身份，不证明出示者就是本人。',
  checkedAt: '核验时间', open: '查看身份卡'
});

export default sharedModule;
