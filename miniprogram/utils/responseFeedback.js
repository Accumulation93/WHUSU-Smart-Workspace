'use strict';

// 只解释协议字段；message、errMsg 和堆栈从不参与用户提示生成。
const STATUS_KEYS = Object.freeze({
  unauthorized: 'loginRequired',
  need_login: 'loginRequired',
  auth_failed: 'sessionExpired',
  session_expired: 'sessionExpired',
  forbidden: 'forbidden',
  permission_denied: 'forbidden',
  org_access_denied: 'organizationUnavailable',
  org_context_required: 'roleUnavailable',
  invalid_role: 'roleUnavailable',
  invalid_params: 'invalidInput',
  invalid_request: 'invalidInput',
  client_upgrade_required: 'outdatedClient',
  rate_limited: 'rateLimited',
  request_in_progress: 'writeStillPending'
});

function resultCode(result) {
  if (!result || typeof result !== 'object') return '';
  return typeof result.code === 'string' && result.code
    ? result.code : typeof result.status === 'string' ? result.status : '';
}

function feedbackText(result, copy, options) {
  const settings = options || {};
  const code = resultCode(result);
  const statusCode = Number(settings.statusCode || (result && result.statusCode)) || 0;
  if (statusCode === 401) return copy.sessionExpired;
  if (settings.messages && Object.prototype.hasOwnProperty.call(settings.messages, code)
    && typeof settings.messages[code] === 'string') return settings.messages[code];
  if (statusCode === 426) return copy.outdatedClient;
  if (statusCode === 429 || code === 'rate_limited') {
    const seconds = result && result.retryAfterSeconds;
    return Number.isInteger(seconds) && seconds > 0 && seconds <= 86400
      ? copy.retryAfterSeconds(seconds) : copy.rateLimited;
  }
  const key = STATUS_KEYS[code];
  if (key) return copy[key];
  if (statusCode === 403) return copy.forbidden;
  if (settings.readOnly === true && (code === 'not_found' || statusCode === 404)) return copy.resourceUnavailable;
  if (settings.fallback) return settings.fallback;
  if (settings.readOnly === true) return settings.timedOut ? copy.readTimeout : copy.readFailed;
  return copy.writeResultUnknown;
}

// 仅替换响应信封的系统提示，不递归删除姓名、意见等业务内容。
function presentResult(result, copy, options) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { status: 'unrecognized_response', message: copy.unsupportedResult };
  }
  const output = Object.assign({}, result);
  if (Object.prototype.hasOwnProperty.call(output, 'message')) {
    output.message = output.status === 'success' || output.status === 'login_success'
      ? '' : feedbackText(output, copy, options);
  }
  return output;
}

module.exports = { STATUS_KEYS, resultCode, feedbackText, presentResult };
