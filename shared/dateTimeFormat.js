'use strict';

/**
 * 绝对时间与日期型值的展示规则唯一源。
 *
 * 库内绝对时间按 UTC 传递，展示时按系统时区偏移换算；列表精确到分钟，详情精确到秒；
 * 日期型值（YYYY-MM-DD、HH:mm）是日历值，不做时区换算；来源不明的历史时间必须带
 * "时间待核对"标记，标记文字由调用方从语言资源传入。
 *
 * 副本由 scripts/sync-shared-modules.js 生成，修改唯一源后必须重新运行 --write。
 */

const DEFAULT_SYSTEM_TIMEZONE_OFFSET = 8;
const MIN_TIMEZONE_OFFSET = -12;
const MAX_TIMEZONE_OFFSET = 14;
const REVIEW_REQUIRED = 'review_required';

function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

function padText(value, width, append) {
  let text = String(value);
  const target = Number(width || 0);
  while (text.length < target) text = append ? text + '0' : '0' + text;
  return text;
}

function normalizeSystemTimezoneOffset(value, fallback) {
  const resolvedFallback = fallback === undefined ? DEFAULT_SYSTEM_TIMEZONE_OFFSET : fallback;
  const parsed = Number(value);
  if (!isFiniteNumber(parsed) || parsed < MIN_TIMEZONE_OFFSET || parsed > MAX_TIMEZONE_OFFSET) {
    return resolvedFallback;
  }
  return parsed;
}

/**
 * 把服务端下发的绝对时间解析成时间戳。
 * 无时区后缀的 `YYYY-MM-DD HH:mm:ss` 是历史兼容写法，统一按 UTC 解释，
 * 不允许按设备时区或显示时区猜测。纯日期与纯时刻值在这里返回空值，
 * 由日期型格式化函数单独处理。
 */
function parseAbsoluteTime(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return isFiniteNumber(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number') return isFiniteNumber(value) ? value : null;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(text)) {
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    const milliseconds = Number(padText(match[7] || '0', 3, true));
    return Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]), Number(match[5]), Number(match[6]), milliseconds
    );
  }
  const timestamp = Date.parse(text);
  return isFiniteNumber(timestamp) ? timestamp : null;
}

function pad(value, width) {
  return padText(value, width || 2, false);
}

function getShiftedUtcParts(value, systemTimezoneOffset) {
  const offset = normalizeSystemTimezoneOffset(systemTimezoneOffset);
  const timestamp = parseAbsoluteTime(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp + Math.round(offset * 60) * 60 * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
}

function formatParts(parts, includeSeconds) {
  if (!parts) return '';
  const dateText = pad(parts.year, 4) + '-' + pad(parts.month) + '-' + pad(parts.day);
  const timeText = pad(parts.hour) + ':' + pad(parts.minute);
  return includeSeconds ? dateText + ' ' + timeText + ':' + pad(parts.second) : dateText + ' ' + timeText;
}

/**
 * 展示规则要求来源不明的历史时间必须带标记。缺标记时宁可报错，
 * 也不能静默少显示一段，否则用户会把未核对的时间当成已确认的时间。
 */
function appendReviewLabel(text, reviewStatus, reviewLabel) {
  if (!text || reviewStatus !== REVIEW_REQUIRED) return text;
  const label = String(reviewLabel || '').trim();
  if (!label) throw new Error('dateTimeFormat: reviewLabel is required for review_required values');
  return text + ' · ' + label;
}

function readOptions(options) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    timezoneOffset: source.timezoneOffset,
    reviewStatus: source.reviewStatus || '',
    reviewLabel: source.reviewLabel || ''
  };
}

function formatListTime(value, options) {
  const resolved = readOptions(options);
  return appendReviewLabel(
    formatParts(getShiftedUtcParts(value, resolved.timezoneOffset), false),
    resolved.reviewStatus,
    resolved.reviewLabel
  );
}

function formatDetailTime(value, options) {
  const resolved = readOptions(options);
  return appendReviewLabel(
    formatParts(getShiftedUtcParts(value, resolved.timezoneOffset), true),
    resolved.reviewStatus,
    resolved.reviewLabel
  );
}

function formatAbsoluteDate(value, systemTimezoneOffset) {
  const parts = getShiftedUtcParts(value, systemTimezoneOffset);
  return parts ? pad(parts.year, 4) + '-' + pad(parts.month) + '-' + pad(parts.day) : '';
}

/** 日期型值：只校验是不是合法日历日，不做任何时区换算。 */
function formatDateOnly(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]) ? text : '';
}

/** 规则型值：只校验是不是合法时刻，不做任何时区换算。 */
function formatClockTime(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const match = text.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? match[1] + ':' + match[2]
    : '';
}

module.exports = {
  DEFAULT_SYSTEM_TIMEZONE_OFFSET,
  MIN_TIMEZONE_OFFSET,
  MAX_TIMEZONE_OFFSET,
  normalizeSystemTimezoneOffset,
  parseAbsoluteTime,
  getShiftedUtcParts,
  formatListTime,
  formatDetailTime,
  formatAbsoluteDate,
  formatDateOnly,
  formatClockTime
};
