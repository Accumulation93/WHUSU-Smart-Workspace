// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

/**
 * 接口调用约定唯一源。
 *
 * 小程序和网页对同一批接口有相同约定：哪些写入必须带请求标识才能避免重复提交，
 * 哪些是登录前就能调用的入口。副本由 scripts/sync-shared-modules.js 生成，
 * 修改唯一源后必须运行 node scripts/sync-shared-modules.js --write。
 */

// 重复提交会产生重复业务的写入接口：客户端必须带上本次请求的标识。
const IDEMPOTENT_WRITE_APIS = Object.freeze({
  submitScoreRecord: true,
  startAuditSubmission: true,
  startAdHocAudit: true,
  createVenueBooking: true,
  createAdminVenueBooking: true,
  deleteHrMembershipPermanently: true,
  deletePersonPermanently: true
});

// 会话入口：调用时客户端可能还没有可比较的工作角色，服务端按登录前的规则处理。
const AUTH_ENTRY_APIS = Object.freeze({
  getTimeConfig: true,
  'auth/wechat/session': true,
  'auth/claims': true,
  'auth/claims/verify': true,
  'auth/claims/redeem': true,
  'auth/password/session': true,
  'auth/recovery/start': true,
  'auth/recovery/complete': true
});

function isIdempotentWrite(name) {
  return IDEMPOTENT_WRITE_APIS[String(name || '')] === true;
}

function isAuthEntry(name) {
  return AUTH_ENTRY_APIS[String(name || '')] === true;
}

const sharedModule = {
  IDEMPOTENT_WRITE_APIS,
  AUTH_ENTRY_APIS,
  isIdempotentWrite,
  isAuthEntry
};

export { IDEMPOTENT_WRITE_APIS, AUTH_ENTRY_APIS, isIdempotentWrite, isAuthEntry };
export default sharedModule;
