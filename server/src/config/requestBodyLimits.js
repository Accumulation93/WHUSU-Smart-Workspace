'use strict';

// JSON 请求体上限的事实来源。
//
// 默认上限只覆盖普通表单类请求；任何可能携带图片 Data URL 的接口必须显式登记到
// LARGE_JSON_ROUTES，否则 2MB 图片编码成 base64（约 2.8MB）会在进入路由之前
// 被 413 拒绝，用户只会看到“请减少本次提交内容”。
//
// 判定规则：路由自己会校验的图片上限（server/src/modules/audit/utils/auditImageData.js
// 的 MAX_AUDIT_IMAGE_BYTES = 2MB）换算成 base64 后必须仍然小于请求体上限。

const DEFAULT_JSON_BODY_BYTES = 500000;
const LARGE_JSON_BODY_BYTES = 15 * 1024 * 1024;

const LARGE_JSON_ROUTES = new Set([
  '/api/uploadAuditFile',
  '/api/parseTableFile',
  '/api/verifySignatureChain',
  '/api/verifyFileSignature',
  // 以下接口会接收最长 2MB 的图片 Data URL（印章、手写签名、签名模板）。
  '/api/saveStamp',
  '/api/saveSignature',
  '/api/approveStep'
]);

function resolveJsonBodyLimit(routePath) {
  return LARGE_JSON_ROUTES.has(String(routePath || '')) ? LARGE_JSON_BODY_BYTES : DEFAULT_JSON_BODY_BYTES;
}

module.exports = {
  DEFAULT_JSON_BODY_BYTES,
  LARGE_JSON_BODY_BYTES,
  LARGE_JSON_ROUTES,
  resolveJsonBodyLimit
};
