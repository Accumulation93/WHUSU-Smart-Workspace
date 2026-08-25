'use strict';

const DEFAULT_SYSTEM_TIMEZONE_OFFSET = 8;
const MIN_TIMEZONE_OFFSET = -12;
const MAX_TIMEZONE_OFFSET = 14;

function normalizeSystemTimezoneOffset(value, fallback = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_TIMEZONE_OFFSET || parsed > MAX_TIMEZONE_OFFSET) {
    return fallback;
  }
  return parsed;
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

  let normalized = text;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(text)) {
    normalized = text.replace(' ', 'T') + 'Z';
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

function getShiftedUtcParts(value, systemTimezoneOffset) {
  const timestamp = parseAbsoluteTime(value);
  if (timestamp === null) return null;
  const offset = normalizeSystemTimezoneOffset(systemTimezoneOffset);
  const date = new Date(timestamp + Math.round(offset * 60) * 60 * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds()
  };
}

function formatParts(parts, includeSeconds) {
  if (!parts) return '';
  const dateText = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
  const timeText = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return includeSeconds ? `${dateText} ${timeText}:${pad(parts.second)}` : `${dateText} ${timeText}`;
}

function formatListTime(value, systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  return formatParts(getShiftedUtcParts(value, systemTimezoneOffset), false);
}

function formatDetailTime(value, systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  return formatParts(getShiftedUtcParts(value, systemTimezoneOffset), true);
}

function formatAbsoluteDate(value, systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const parts = getShiftedUtcParts(value, systemTimezoneOffset);
  return parts ? `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

function getSystemNowParts(value = Date.now(), systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  return getShiftedUtcParts(value, systemTimezoneOffset);
}

function getSystemDate(value = Date.now(), systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const parts = getSystemNowParts(value, systemTimezoneOffset);
  return parts ? `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` : '';
}

function getSystemMinuteOfDay(value = Date.now(), systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const parts = getSystemNowParts(value, systemTimezoneOffset);
  return parts ? parts.hour * 60 + parts.minute : -1;
}

function formatSystemClock(value = Date.now(), includeSeconds = false, systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const parts = getSystemNowParts(value, systemTimezoneOffset);
  if (!parts) return '';
  const base = `${pad(parts.hour)}:${pad(parts.minute)}`;
  return includeSeconds ? `${base}:${pad(parts.second)}` : base;
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

function parseSystemDateTime(value, systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const text = typeof value === 'string' ? value.trim().replace('T', ' ') : '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const wallTimestamp = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] || 0, 0);
  const wallDate = new Date(wallTimestamp);
  if (wallDate.getUTCFullYear() !== parts[0] || wallDate.getUTCMonth() + 1 !== parts[1]
    || wallDate.getUTCDate() !== parts[2] || wallDate.getUTCHours() !== parts[3]
    || wallDate.getUTCMinutes() !== parts[4] || wallDate.getUTCSeconds() !== (parts[5] || 0)) return null;
  const offset = normalizeSystemTimezoneOffset(systemTimezoneOffset);
  return new Date(wallTimestamp - Math.round(offset * 60) * 60 * 1000);
}

function systemDateTimeToMysqlUtc(value, systemTimezoneOffset = DEFAULT_SYSTEM_TIMEZONE_OFFSET) {
  const date = parseSystemDateTime(value, systemTimezoneOffset);
  return date ? toMysqlUtc(date) : null;
}

function toIsoUtc(value) {
  const timestamp = parseAbsoluteTime(value);
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function toMysqlUtc(value) {
  const timestamp = parseAbsoluteTime(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.`
    + pad(date.getUTCMilliseconds(), 3);
}

function nowMysqlUtc() {
  return toMysqlUtc(Date.now());
}

module.exports = {
  DEFAULT_SYSTEM_TIMEZONE_OFFSET,
  MIN_TIMEZONE_OFFSET,
  MAX_TIMEZONE_OFFSET,
  normalizeSystemTimezoneOffset,
  parseAbsoluteTime,
  formatListTime,
  formatDetailTime,
  formatAbsoluteDate,
  getSystemNowParts,
  getSystemDate,
  getSystemMinuteOfDay,
  formatSystemClock,
  formatDateOnly,
  formatClockTime,
  parseSystemDateTime,
  systemDateTimeToMysqlUtc,
  toIsoUtc,
  toMysqlUtc,
  nowMysqlUtc
};
