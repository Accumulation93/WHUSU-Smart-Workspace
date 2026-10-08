import rules from '@/shared/dateTimeFormat.js';
import timeCopy from '@/locales/zh-CN/time.js';

/**
 * 网页端时间展示入口。
 *
 * 换算与格式化规则来自 shared/dateTimeFormat.js（与小程序的规则同源），
 * 这里只负责保存服务端下发的系统时区偏移，并把待核对标记文字传进去。
 * 每次接口响应都会刷新这个偏移，所以退出登录或切换工作角色后不会沿用旧值。
 */

const config = {
  offset: rules.DEFAULT_SYSTEM_TIMEZONE_OFFSET,
  version: '',
  reviewRequired: false,
  reviewVersion: ''
};

export function setSystemTimezoneConfig(offset, version, reviewRequired, reviewVersion) {
  config.offset = rules.normalizeSystemTimezoneOffset(offset);
  config.version = version === undefined || version === null ? '' : String(version);
  config.reviewRequired = reviewRequired === undefined ? config.reviewRequired : reviewRequired === true;
  config.reviewVersion = reviewVersion === undefined || reviewVersion === null
    ? config.reviewVersion
    : String(reviewVersion);
  return Object.assign({}, config);
}

export function getSystemTimezoneConfig() {
  return Object.assign({}, config);
}

export function resetSystemTimezoneConfig() {
  config.offset = rules.DEFAULT_SYSTEM_TIMEZONE_OFFSET;
  config.version = '';
  config.reviewRequired = false;
  config.reviewVersion = '';
}

export function formatListTime(value, reviewStatus) {
  return rules.formatListTime(value, {
    timezoneOffset: config.offset,
    reviewStatus: reviewStatus,
    reviewLabel: timeCopy.historicalTimezoneReviewRequired
  });
}

export function formatDetailTime(value, reviewStatus) {
  return rules.formatDetailTime(value, {
    timezoneOffset: config.offset,
    reviewStatus: reviewStatus,
    reviewLabel: timeCopy.historicalTimezoneReviewRequired
  });
}

export function formatAbsoluteDate(value, timezoneOffset) {
  return rules.formatAbsoluteDate(
    value,
    timezoneOffset === undefined ? config.offset : timezoneOffset
  );
}

export function formatDateOnly(value) {
  return rules.formatDateOnly(value);
}

export function formatClockTime(value) {
  return rules.formatClockTime(value);
}
