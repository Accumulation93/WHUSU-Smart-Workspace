import { WEB_CLIENT_TYPE, WEB_CLIENT_VERSION } from './version.js';
import copy from '@/locales/zh-CN/index.js';
import { isAuthEntry, isIdempotentWrite } from '@/shared/apiContracts.js';
import { setSystemTimezoneConfig } from './dateTime.js';

/**
 * 网页接口调用入口。
 *
 * 与小程序的区别只有三处：同源路径 `/api`、进程内不再持有登录凭证（凭证在
 * HttpOnly Cookie 里，浏览器自动携带）、请求头声明自己是网页客户端。
 * 接口名、请求体形状、幂等写入约定和错误状态都与小程序一致。
 */

const API_BASE = '/api/';

let authenticationLostHandler = null;

export function setAuthenticationLostHandler(handler) {
  authenticationLostHandler = typeof handler === 'function' ? handler : null;
}

export function createRequestId() {
  return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function apiError(fields) {
  const error = new Error(fields.message || '');
  error.status = fields.status || '';
  error.statusCode = fields.statusCode || 0;
  error.requestId = fields.requestId || '';
  error.silent = fields.silent === true;
  return error;
}

/** 接口响应里带着当前系统时区配置，任何一次响应都可以刷新它。 */
function captureSystemTimezone(result) {
  if (!result || typeof result !== 'object') return;
  const offset = result.systemTimezoneOffset;
  if (offset === undefined) return;
  try {
    setSystemTimezoneConfig(
      offset,
      result.timezoneConfigVersion,
      result.historicalTimeReviewRequired,
      result.timeReviewConfigVersion
    );
  } catch (_) {
    // 时区配置只是展示参数，读不出来不能让已经成功的请求变成失败。
  }
}

function failureMessage(name, statusCode, result) {
  if (statusCode === 401) return copy.errors.sessionExpired;
  if (statusCode === 426) return copy.errors.upgradeRequired;
  if (result && result.status === 'origin_not_allowed') return copy.errors.originRejected;
  if (statusCode === 403) return result && result.message ? result.message : copy.errors.permissionDenied;
  if (statusCode === 0) return copy.errors.networkFailed;
  return (result && result.message) || copy.errors.requestFailed;
}

export async function callApi(name, data, options) {
  const requestId = createRequestId();
  const payload = Object.assign({}, data || {});
  // 重复提交会产生重复业务的写入必须带请求标识，服务端据此去重。
  if (isIdempotentWrite(name) && !payload.clientRequestId) payload.clientRequestId = requestId;

  let response;
  try {
    response = await fetch(API_BASE + encodeURI(name), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': WEB_CLIENT_TYPE,
        'X-Client-Version': WEB_CLIENT_VERSION,
        'X-Request-Id': requestId
      },
      body: JSON.stringify(payload),
      signal: options && options.signal
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw apiError({ status: 'request_cancelled', requestId, silent: true });
    }
    throw apiError({
      status: 'network_failed',
      message: copy.errors.networkFailed,
      requestId
    });
  }

  let result = null;
  try {
    result = await response.json();
  } catch (_) {
    result = null;
  }
  if (!result || typeof result !== 'object') result = {};
  captureSystemTimezone(result);

  if (response.ok) return result;

  const failure = apiError({
    status: result.status || '',
    statusCode: response.status,
    message: failureMessage(name, response.status, result),
    requestId: (result && result.requestId) || requestId
  });
  if (failure.status === 'origin_not_allowed') {
    // 来源核对失败说明页面已经过期，本地状态不再可信。
    window.location.reload();
    failure.silent = true;
    throw failure;
  }
  if (response.status === 401 && !isAuthEntry(name) && !(options && options.skipAuthRedirect)) {
    // 登录状态失效时只回到登录页，不自动重试、不在其他账号下重放。
    if (authenticationLostHandler) authenticationLostHandler(failure);
    failure.silent = true;
  }
  throw failure;
}

export function errorText(error, fallback) {
  if (error && (error.silent || error.status === 'request_cancelled')) return '';
  const text = String((error && error.message) || '').trim();
  return text || fallback || copy.errors.requestFailed;
}

export function requireSuccess(result, fallback) {
  if (!result || result.status !== 'success') {
    throw apiError({ status: result?.status, message: result?.message || fallback || copy.errors.requestFailed });
  }
  return result;
}
