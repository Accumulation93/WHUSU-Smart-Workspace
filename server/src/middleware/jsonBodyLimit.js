'use strict';

const express = require('express');
const localeCopy = require('../locales/zh-CN/generated/index');
const { resolveJsonBodyLimit } = require('../config/requestBodyLimits');

// 请求体解析统一在这里按路由决定额度：携带图片 Data URL 的接口使用大额度，
// 其余接口保持默认小额。超限必须在解析前用 413 明确拒绝，不能等到路由里再失败。
function parseJsonBody(req, res, next) {
  const bodyLimit = resolveJsonBodyLimit(req.path);
  const contentLength = Number(req.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
    return res.status(413).json({ status: 'payload_too_large', message: localeCopy.copy_ac4ff526e9 });
  }
  return express.json({ limit: bodyLimit, strict: true })(req, res, next);
}

module.exports = { parseJsonBody };
