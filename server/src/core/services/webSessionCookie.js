'use strict';

/**
 * 网页会话凭证存放位置。
 *
 * 小程序把令牌放在 Authorization 头里，网页把它放在 HttpOnly Cookie 里：
 * 浏览器脚本读不到明文令牌，登录、切换工作角色和退出登录三条链路共用同一套服务端校验。
 * Cookie 名和属性集中在这里，避免不同路由各写一份而产生分歧。
 */

const COOKIE_NAME = 'wsw_web_session';
const COOKIE_PATH = '/';
const SAME_SITE = 'Lax';

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCookieHeader(header) {
  const jar = new Map();
  String(header || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index <= 0) return;
    const name = part.slice(0, index).trim();
    if (!name || jar.has(name)) return;
    let value = part.slice(index + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    jar.set(name, value);
  });
  return jar;
}

function readWebSessionToken(req) {
  const header = req && req.headers ? req.headers.cookie : '';
  return safeString(parseCookieHeader(header).get(COOKIE_NAME));
}

function hasWebSessionCookie(req) {
  return Boolean(readWebSessionToken(req));
}

/**
 * Nginx 终止 HTTPS 并通过信任代理传递协议。本地 http 调试时不加 Secure，
 * 生产环境的请求一律带 Secure，避免凭证在明文链路上传输。
 */
function isSecureRequest(req) {
  if (req && req.secure === true) return true;
  const forwarded = safeString(req && req.headers ? req.headers['x-forwarded-proto'] : '');
  return forwarded.split(',')[0].trim().toLowerCase() === 'https';
}

function serializeCookie(value, maxAgeSeconds, secure) {
  const parts = [COOKIE_NAME + '=' + value, 'Path=' + COOKIE_PATH, 'HttpOnly', 'SameSite=' + SAME_SITE];
  const age = Number(maxAgeSeconds);
  if (Number.isFinite(age) && age >= 0) parts.push('Max-Age=' + Math.floor(age));
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function buildWebSessionSetCookie(token, maxAgeSeconds, secure) {
  return serializeCookie(safeString(token), maxAgeSeconds, secure);
}

function buildClearedWebSessionCookie(secure) {
  return serializeCookie('', 0, secure);
}

module.exports = {
  COOKIE_NAME,
  parseCookieHeader,
  readWebSessionToken,
  hasWebSessionCookie,
  isSecureRequest,
  buildWebSessionSetCookie,
  buildClearedWebSessionCookie
};
