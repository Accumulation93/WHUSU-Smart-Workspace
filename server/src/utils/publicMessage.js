'use strict';

const localeCopy = require('../locales/zh-CN/generated/utils/publicMessage');
const INTERNAL_COPY_PATTERN = /(?:\b(?:id|sql|jwt|token|openid|route|internal|undefined|null|econn\w*|timeout|pool|server|column|table|constraint)\b|duplicate entry|foreign key|syntax error|ER_[A-Z_]+|参数|数据库|上下文|会话|凭据|主体|哈希|签名链|快照|字段映射|扩展字段|校验|配置格式|请求标识|组织标识|统一身份|账号体系|认领请求|服务端|客户端|接口|路由)/i;
const FAILURE_COPY_PATTERN = /失败|异常|错误/;
const PERMISSION_COPY_PATTERN = /没有.*权限|无权|仅.*(?:可|能)|不能.*(?:操作|修改|删除|访问|解绑)|不允许|禁止/;

function fallbackForStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'auth_failed' || value === 'need_login') return localeCopy.copy_b10d64a68c;
  if (
    value === 'forbidden'
    || value === 'permission_denied'
    || value === 'org_access_denied'
    || value === 'invalid_role'
  ) {
    return localeCopy.copy_dafc6a4a1f;
  }
  if (value === 'invalid_params' || value === 'invalid_request') return localeCopy.copy_e6669be1f4;
  if (value === 'not_found' || value === 'conflict' || value === 'stale') return localeCopy.copy_f4c0b882f5;
  return localeCopy.copy_e58fa637eb;
}

function protectPublicMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  if (typeof body.message !== 'string') return body;
  const status = String(body.status || '').toLowerCase();
  // 未分类异常可能包含驱动消息、绝对路径或第三方响应。所有通用 error
  // 都失败关闭；需要向用户解释的业务错误必须使用明确状态和 locale 文案。
  if (status === 'error' || status === 'internal_error') {
    return Object.assign({}, body, { message: fallbackForStatus(status) });
  }
  if (
    !INTERNAL_COPY_PATTERN.test(body.message)
    && !FAILURE_COPY_PATTERN.test(body.message)
    && !PERMISSION_COPY_PATTERN.test(body.message)
  ) {
    return body;
  }
  return Object.assign({}, body, { message: fallbackForStatus(body.status) });
}

module.exports = {
  fallbackForStatus,
  protectPublicMessage
};
