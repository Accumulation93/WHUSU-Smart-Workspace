'use strict';

const copy = require('../../locales/zh-CN/authorization');

// 错误码只供日志和内部分类使用；即使上层误读 message，也不能向用户暴露内部状态。
function authorizationError(code) {
  return Object.assign(new Error(copy.operationFailed), { code });
}

module.exports = { authorizationError };
