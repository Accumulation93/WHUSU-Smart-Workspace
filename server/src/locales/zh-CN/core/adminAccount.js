'use strict';

/**
 * 管理员级别与账号认证状态的唯一文案来源。
 * 原先在 core/routes/admin.js 与 core/routes/adminPermissions.js 各写一份。
 */

module.exports = Object.freeze({
  superAdmin: '超级管理员',
  admin: '普通管理员',
  verified: '已认证',
  frozen: '已冻结',
  recoveryRequired: '待恢复',
  pendingVerification: '待认证'
});
