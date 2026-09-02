'use strict';

const eventBus = require('./eventBus');
const timeCopy = require('../locales/zh-CN/time');

const STORAGE_KEY = 'systemTimezoneConfig';
const DEFAULT_SYSTEM_TIMEZONE_OFFSET = 8;
const MIN_TIMEZONE_OFFSET = -12;
const MAX_TIMEZONE_OFFSET = 14;

let cachedConfig = {
  offset: DEFAULT_SYSTEM_TIMEZONE_OFFSET,
  version: '',
  reviewRequired: false,
  reviewVersion: ''
};

function normalizeSystemTimezoneOffset(value, fallback) {
  const resolvedFallback = fallback === undefined ? DEFAULT_SYSTEM_TIMEZONE_OFFSET : fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_TIMEZONE_OFFSET || parsed > MAX_TIMEZONE_OFFSET) {
    return resolvedFallback;
  }
  return parsed;
}

function readStoredConfig() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return cachedConfig;
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (!stored || typeof stored !== 'object') return cachedConfig;
  cachedConfig = {
    offset: normalizeSystemTimezoneOffset(stored.offset),
    version: stored.version === undefined || stored.version === null ? '' : String(stored.version),
    reviewRequired: stored.reviewRequired === true,
    reviewVersion: stored.reviewVersion === undefined || stored.reviewVersion === null
      ? '' : String(stored.reviewVersion)
  };
  return cachedConfig;
}

function setSystemTimezoneConfig(systemTimezoneOffset, configVersion, reviewRequired, reviewVersion) {
  const nextConfig = {
    offset: normalizeSystemTimezoneOffset(systemTimezoneOffset),
    version: configVersion === undefined || configVersion === null ? '' : String(configVersion),
    reviewRequired: reviewRequired === undefined ? cachedConfig.reviewRequired : reviewRequired === true,
    reviewVersion: reviewVersion === undefined || reviewVersion === null
      ? cachedConfig.reviewVersion : String(reviewVersion)
  };
  const changed = cachedConfig.offset !== nextConfig.offset
    || cachedConfig.version !== nextConfig.version
    || cachedConfig.reviewRequired !== nextConfig.reviewRequired
    || cachedConfig.reviewVersion !== nextConfig.reviewVersion;
  cachedConfig = nextConfig;
  if (changed && typeof wx !== 'undefined' && typeof wx.setStorage === 'function') {
    wx.setStorage({ key: STORAGE_KEY, data: cachedConfig });
  } else if (changed && typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
    wx.setStorageSync(STORAGE_KEY, cachedConfig);
  }
  if (changed) eventBus.emit('time:configChanged', Object.assign({}, cachedConfig));
  return Object.assign({}, cachedConfig);
}

function getSystemTimezoneConfig() {
  readStoredConfig();
  return Object.assign({}, cachedConfig);
}

function clearSystemTimezoneConfig() {
  cachedConfig = {
    offset: DEFAULT_SYSTEM_TIMEZONE_OFFSET,
    version: '',
    reviewRequired: false,
    reviewVersion: ''
  };
  if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
    wx.removeStorageSync(STORAGE_KEY);
  }
}

function parseAbsoluteTime(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(text)) {
    // API/数据库绝对时间的无后缀兼容形式统一解释为 UTC，禁止前端按设备或显示时区猜测。
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
    const milliseconds = Number(String(match[7] || '0').padEnd(3, '0'));
    return Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]), Number(match[5]), Number(match[6]), milliseconds
    );
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function pad(value, width) {
  return String(value).padStart(width || 2, '0');
}

function getShiftedUtcParts(value, systemTimezoneOffset) {
  const offset = normalizeSystemTimezoneOffset(
    systemTimezoneOffset,
    getSystemTimezoneConfig().offset
  );
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
  const dateText = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
  const timeText = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return includeSeconds ? `${dateText} ${timeText}:${pad(parts.second)}` : `${dateText} ${timeText}`;
}

function normalizeFormatOptions(systemTimezoneOffsetOrOptions, reviewStatus) {
  if (systemTimezoneOffsetOrOptions && typeof systemTimezoneOffsetOrOptions === 'object') {
    return {
      timezoneOffset: systemTimezoneOffsetOrOptions.timezoneOffset,
      reviewStatus: systemTimezoneOffsetOrOptions.reviewStatus || ''
    };
  }
  return {
    timezoneOffset: systemTimezoneOffsetOrOptions,
    reviewStatus: reviewStatus || ''
  };
}

function appendReviewLabel(text, reviewStatus) {
  if (!text || reviewStatus !== 'review_required') return text;
  return `${text} · ${timeCopy.historicalTimezoneReviewRequired}`;
}

function formatListTime(value, systemTimezoneOffsetOrOptions, reviewStatus) {
  const options = normalizeFormatOptions(systemTimezoneOffsetOrOptions, reviewStatus);
  return appendReviewLabel(
    formatParts(getShiftedUtcParts(value, options.timezoneOffset), false),
    options.reviewStatus
  );
}

function formatDetailTime(value, systemTimezoneOffsetOrOptions, reviewStatus) {
  const options = normalizeFormatOptions(systemTimezoneOffsetOrOptions, reviewStatus);
  return appendReviewLabel(
    formatParts(getShiftedUtcParts(value, options.timezoneOffset), true),
    options.reviewStatus
  );
}

function formatAbsoluteDate(value, systemTimezoneOffset) {
  const parts = getShiftedUtcParts(value, systemTimezoneOffset);
  return parts ? `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

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

function formatClockTime(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const match = text.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60
    ? `${match[1]}:${match[2]}`
    : '';
}

function splitSystemDateTime(value, systemTimezoneOffset) {
  const text = formatDetailTime(value, systemTimezoneOffset);
  const parts = text.split(' ');
  return { date: parts[0] || '', time: (parts[1] || '').slice(0, 5) };
}

function systemDateTimeToIsoUtc(dateValue, timeValue, systemTimezoneOffset) {
  const date = formatDateOnly(String(dateValue || ''));
  const time = formatClockTime(String(timeValue || '00:00'));
  if (!date || !time) return '';
  const dateParts = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const offset = normalizeSystemTimezoneOffset(
    systemTimezoneOffset,
    getSystemTimezoneConfig().offset
  );
  const timestamp = Date.UTC(
    dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1], 0, 0
  ) - Math.round(offset * 60) * 60 * 1000;
  return new Date(timestamp).toISOString();
}

function getSystemNowParts(value, systemTimezoneOffset) {
  return getShiftedUtcParts(value === undefined ? Date.now() : value, systemTimezoneOffset);
}

function getSystemDate(value, systemTimezoneOffset) {
  const parts = getSystemNowParts(value, systemTimezoneOffset);
  return parts ? `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

function getSystemMinuteOfDay(value, systemTimezoneOffset) {
  const parts = getSystemNowParts(value, systemTimezoneOffset);
  return parts ? parts.hour * 60 + parts.minute : -1;
}

function formatSystemClock(value, includeSeconds, systemTimezoneOffset) {
  const parts = getSystemNowParts(value, systemTimezoneOffset);
  if (!parts) return '';
  const base = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return includeSeconds ? `${base}:${pad(parts.second)}` : base;
}

function addDateDays(dateValue, amount) {
  const date = formatDateOnly(String(dateValue || ''));
  if (!date || !Number.isFinite(Number(amount))) return '';
  const parts = date.split('-').map(Number);
  const carrier = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(amount)));
  return `${pad(carrier.getUTCFullYear(), 4)}-${pad(carrier.getUTCMonth() + 1)}-${pad(carrier.getUTCDate())}`;
}

function getDateWeekday(dateValue) {
  const date = formatDateOnly(String(dateValue || ''));
  if (!date) return -1;
  const parts = date.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
}

function getSystemWeekStart(value, systemTimezoneOffset) {
  const date = getSystemDate(value, systemTimezoneOffset);
  const weekday = getDateWeekday(date);
  return weekday < 0 ? '' : addDateDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

function systemDateTimeToTimestamp(dateValue, timeValue, systemTimezoneOffset) {
  const iso = systemDateTimeToIsoUtc(dateValue, timeValue, systemTimezoneOffset);
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : null;
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_SYSTEM_TIMEZONE_OFFSET,
  normalizeSystemTimezoneOffset,
  setSystemTimezoneConfig,
  getSystemTimezoneConfig,
  clearSystemTimezoneConfig,
  parseAbsoluteTime,
  formatListTime,
  formatDetailTime,
  formatAbsoluteDate,
  formatDateOnly,
  formatClockTime,
  splitSystemDateTime,
  systemDateTimeToIsoUtc,
  systemDateTimeToTimestamp,
  getSystemNowParts,
  getSystemDate,
  getSystemMinuteOfDay,
  formatSystemClock,
  addDateDays,
  getDateWeekday,
  getSystemWeekStart
};
