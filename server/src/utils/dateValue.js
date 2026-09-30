'use strict';

// 人事资料日期/日期时间解析的唯一事实来源。
//
// 语义约定：
// - 日期字段一律按字面取年月日，忽略时间与任何时区偏移。
// - 日期时间字段带偏移时按偏移还原绝对时刻；没有偏移时按 UTC 解释；只有日期按当天 00:00:00Z。
// - 展示始终按系统配置时区换算，禁止依赖设备或进程本地时区。
//
// 只做字符串解析与 Date.UTC 运算，不读取本地时区。

const DEFAULT_SYSTEM_TIMEZONE_OFFSET = 8;
const MIN_TIMEZONE_OFFSET = -12;
const MAX_TIMEZONE_OFFSET = 14;

const CJK_DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};
const WEEKDAY_NAMES = /^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?$/i;

function pad(value, width) {
  return String(value).padStart(width || 2, '0');
}

function normalizeSystemTimezoneOffset(value, fallback) {
  const offset = Number(value);
  const base = Number.isFinite(offset) ? offset : fallback;
  const safe = Number.isFinite(base) ? base : DEFAULT_SYSTEM_TIMEZONE_OFFSET;
  return Math.max(MIN_TIMEZONE_OFFSET, Math.min(MAX_TIMEZONE_OFFSET, safe));
}

// 全角数字/符号、中文空格统一切成半角，避免全角括号或全角空格导致解析失败。
function normalizeCharacters(value) {
  let text = String(value == null ? '' : value);
  text = text.replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  text = text.replace(/\u3000/g, ' ');
  text = text.replace(/[\uFF08]/g, '(').replace(/[\uFF09]/g, ')');
  text = text.replace(/[\uFF0D\u2212]/g, '-').replace(/[\uFF0F]/g, '/').replace(/[\uFF0E]/g, '.');
  text = text.replace(/[\uFF1A]/g, ':').replace(/[\uFF0C]/g, ',');
  return text.replace(/\s+/g, ' ').trim();
}

function chineseNumber(text) {
  const source = String(text || '');
  if (!source) return null;
  if (/^[〇零一二三四五六七八九]+$/.test(source)) {
    let digits = '';
    for (const char of source) digits += String(CJK_DIGITS[char]);
    return Number(digits);
  }
  const match = source.match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
  if (match) {
    const tens = match[1] ? CJK_DIGITS[match[1]] : 1;
    const ones = match[2] ? CJK_DIGITS[match[2]] : 0;
    return tens * 10 + ones;
  }
  const single = CJK_DIGITS[source];
  return typeof single === 'number' ? single : null;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() + 1 === month && probe.getUTCDate() === day;
}

function parseTimeParts(text) {
  const source = String(text || '').trim();
  if (!source) return { hour: 0, minute: 0, second: 0, hasTime: false };
  const match = source.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, hasTime: true };
}

// 从尾部文本解析时区偏移（分钟）；返回 null 表示没有偏移信息。
function parseTimezoneOffsetMinutes(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  if (/(?:^|[^A-Za-z])Z(?:$|[^A-Za-z])/.test(source) || /\b(?:UTC|GMT)\b(?!\s*[+-])/i.test(source)) return 0;
  const match = source.match(/(?:GMT|UTC)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (!Number.isFinite(hours) || hours > 14 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
}

// 在文本里找到时间与偏移的起始位置，便于把“日期部分”和“时间部分”拆开。
function splitDateAndTime(text) {
  const source = String(text || '');
  const timeMatch = source.match(/(?:^|[\sT])(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:\.\d{1,3})?)\s*(.*)$/);
  if (!timeMatch) return { datePart: source.trim(), timePart: '', tail: '' };
  const offset = timeMatch[2] || '';
  return {
    datePart: source.slice(0, timeMatch.index).trim(),
    timePart: timeMatch[1],
    tail: offset.trim()
  };
}

function extractDateParts(raw) {
  const text = normalizeCharacters(raw);
  if (!text) return null;
  const split = splitDateAndTime(text);
  const head = split.datePart;
  const compact = head.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    return {
      year: Number(compact[1]), month: Number(compact[2]), day: Number(compact[3]),
      compactTime: { hour: Number(compact[4]), minute: Number(compact[5]), second: Number(compact[6]) }
    };
  }
  const compactMinute = head.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compactMinute) {
    return {
      year: Number(compactMinute[1]), month: Number(compactMinute[2]), day: Number(compactMinute[3]),
      compactTime: { hour: Number(compactMinute[4]), minute: Number(compactMinute[5]), second: 0 }
    };
  }

  let match = head.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!match) match = head.match(/^(\d{4})\s+(\d{1,2})\s+(\d{1,2})$/);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  match = head.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  match = normalizeCharacters(head).match(/^([〇零一二三四五六七八九]{2,4})年([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})日?$/);
  if (match) {
    const year = chineseNumber(match[1]);
    const month = chineseNumber(match[2]);
    const day = chineseNumber(match[3]);
    if (year != null && month != null && day != null) return { year, month, day };
  }

  match = head.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTH_NAMES[String(match[1]).toLowerCase()];
    if (month) return { year: Number(match[3]), month, day: Number(match[2]) };
  }

  match = head.match(/^(\d{1,2})(?:st|nd|rd|th)?,?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTH_NAMES[String(match[2]).toLowerCase()];
    if (month) return { year: Number(match[3]), month, day: Number(match[1]) };
  }

  match = head.match(/^\d{4}[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return { year: Number(head.slice(0, 4)), month: Number(match[1]), day: Number(match[2]) };

  return null;
}

function stripWeekday(text) {
  let result = normalizeCharacters(text);
  let changed = true;
  while (changed) {
    changed = false;
    const first = result.split(' ')[0];
    if (first && WEEKDAY_NAMES.test(first)) {
      result = result.slice(first.length).replace(/^[\s,]+/, '');
      changed = true;
    }
  }
  return result;
}

// 解析结果为 { year, month, day, hour, minute, second, offsetMinutes }；无法识别返回 null。
function parseDateValue(raw) {
  const cleaned = stripWeekday(raw);
  if (!cleaned) return null;
  const split = splitDateAndTime(cleaned);
  const parts = extractDateParts(split.datePart);
  if (!parts || !isValidCalendarDate(parts.year, parts.month, parts.day)) return null;
  const time = split.timePart ? parseTimeParts(split.timePart) : (parts.compactTime ? Object.assign({ hasTime: true }, parts.compactTime) : parseTimeParts(''));
  if (time === null) return null;
  // 偏移只可能出现在时间之后的尾巴里；绝不能拿整串去匹配，否则年月日里的 “-” 会被当成时区符号。
  const offsetMinutes = parseTimezoneOffsetMinutes(split.tail);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
    hasTime: time.hasTime,
    offsetMinutes
  };
}

// 日期字段：按字面取年月日，忽略时间与时区偏移。
function normalizeDateValue(raw) {
  const parsed = parseDateValue(raw);
  if (!parsed) return '';
  return `${pad(parsed.year, 4)}-${pad(parsed.month)}-${pad(parsed.day)}`;
}

function toUtcIso(year, month, day, hour, minute, second) {
  const epoch = Date.UTC(year, month - 1, day, hour, minute, second);
  const iso = new Date(epoch).toISOString();
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

// 日期时间字段：带偏移按偏移还原，无偏移按 UTC，只有日期按当天 00:00:00Z。
function normalizeDateTimeValue(raw) {
  const parsed = parseDateValue(raw);
  if (!parsed) return '';
  const offset = parsed.offsetMinutes == null ? 0 : parsed.offsetMinutes;
  const epoch = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second) - offset * 60000;
  return toUtcIso(
    new Date(epoch).getUTCFullYear(),
    new Date(epoch).getUTCMonth() + 1,
    new Date(epoch).getUTCDate(),
    new Date(epoch).getUTCHours(),
    new Date(epoch).getUTCMinutes(),
    new Date(epoch).getUTCSeconds()
  );
}

function isValidUtcIso(value) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/);
  if (!match) return false;
  return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    && Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6] || 0) <= 59;
}

// 绝对时刻 → 系统时区的年月日时分秒。
function getSystemDateTimeParts(utcIso, systemTimezoneOffset) {
  if (!isValidUtcIso(utcIso)) return null;
  const offset = normalizeSystemTimezoneOffset(systemTimezoneOffset, DEFAULT_SYSTEM_TIMEZONE_OFFSET);
  const base = Date.parse(utcIso);
  if (!Number.isFinite(base)) return null;
  const shifted = new Date(base + offset * 3600000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

function formatDateTimeText(utcIso, systemTimezoneOffset) {
  const parts = getSystemDateTimeParts(utcIso, systemTimezoneOffset);
  if (!parts) return '';
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function formatDatePickerValue(utcIso, systemTimezoneOffset) {
  const parts = getSystemDateTimeParts(utcIso, systemTimezoneOffset);
  if (!parts) return '';
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

function formatTimePickerValue(utcIso, systemTimezoneOffset) {
  const parts = getSystemDateTimeParts(utcIso, systemTimezoneOffset);
  if (!parts) return '';
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

// 选择器结果（系统时区墙上时间）→ 绝对时刻 ISO。
function systemPickerToUtcIso(dateText, timeText, systemTimezoneOffset) {
  const dateMatch = String(dateText == null ? '' : dateText).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dateMatch) return '';
  const timeMatch = String(timeText == null ? '' : timeText).trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const second = timeMatch ? Number(timeMatch[3] || 0) : 0;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return '';
  const offset = normalizeSystemTimezoneOffset(systemTimezoneOffset, DEFAULT_SYSTEM_TIMEZONE_OFFSET);
  const epoch = Date.UTC(year, month - 1, day, hour, minute, second) - offset * 3600000;
  return new Date(epoch).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = {
  DEFAULT_SYSTEM_TIMEZONE_OFFSET,
  normalizeSystemTimezoneOffset,
  parseDateValue,
  normalizeDateValue,
  normalizeDateTimeValue,
  isValidUtcIso,
  getSystemDateTimeParts,
  formatDateTimeText,
  formatDatePickerValue,
  formatTimePickerValue,
  systemPickerToUtcIso
};
