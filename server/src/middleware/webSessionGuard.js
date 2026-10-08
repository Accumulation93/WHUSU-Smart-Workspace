'use strict';

const localeCopy = require('../locales/zh-CN/core/webSession');
const { logger } = require('../utils/logger');
const webSessionCookie = require('../core/services/webSessionCookie');

/**
 * 带网页会话 Cookie 的改动类请求必须来自受信任的网页来源。
 *
 * Cookie 会随同站请求自动带上，因此除了 SameSite=Lax 之外，还要逐请求核对来源，
 * 防止其他站点借用浏览器里已有的登录状态发起改动。小程序链路不带这个 Cookie，
 * 不受本中间件影响。
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_WEB_ORIGIN = 'https://accumulation93.com';

function configuredWebOrigin() {
  const value = String(process.env.WEB_ORIGIN || DEFAULT_WEB_ORIGIN).trim();
  return value.replace(/\/+$/, '');
}

function originOf(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text).origin;
  } catch (_) {
    return '';
  }
}

function webSessionGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!webSessionCookie.hasWebSessionCookie(req)) return next();
  const allowed = configuredWebOrigin();
  // 现代浏览器对跨站与同站请求都会带 Origin；只有极少数旧浏览器只给 Referer。
  const origin = originOf(req.get('Origin')) || originOf(req.get('Referer'));
  if (origin && origin === allowed) return next();
  logger.warn('Web session request rejected by origin guard', {
    event: 'webSession.originRejected',
    method: req.method,
    path: req.path,
    origin: origin,
    ip: req.ip
  });
  return res.status(403).json({ status: 'origin_not_allowed', message: localeCopy.originNotAllowed });
}

module.exports = { webSessionGuard, configuredWebOrigin, originOf };
