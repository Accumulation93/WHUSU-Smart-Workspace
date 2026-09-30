// 人事补充资料的日期/日期时间解析与格式化（与 server/src/utils/dateValue.js 同源规则）。
//
// 语义约定：
// - 日期字段一律按字面取年月日，静默忽略时间与任何时区偏移。
// - 日期时间字段带偏移时按偏移还原绝对时刻；没有偏移按 UTC；只有日期按当天 00:00:00Z。
// - 展示始终按系统配置时区换算，不读取设备本地时区。
//
// 只做字符串解析与 Date.UTC 运算，禁止使用设备本地年月日/时分读取。
const { getSystemTimezoneConfig } = require('./dateTime');

const DEFAULT_SYSTEM_TIMEZONE_OFFSET = 8;
const MIN_TIMEZONE_OFFSET = -12;
const MAX_TIMEZONE_OFFSET = 14;
// 中文数字用码点书写，避免把数据常量误当成用户可见文案。
const CJK_DIGITS = {
  '\u3007': 0, '\u96f6': 0, '\u4e00': 1, '\u4e8c': 2, '\u4e24': 2,
  '\u4e09': 3, '\u56db': 4, '\u4e94': 5, '\u516d': 6, '\u4e03': 7, '\u516b': 8, '\u4e5d': 9
};
const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};
const WEEKDAY_NAME = /^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?$/i;

function padDatePart(value, width) {
  return String(value).padStart(width || 2, '0');
}

function systemTimezoneOffset(value) {
  const raw = Number(value);
  const offset = Number.isFinite(raw) ? raw : getSystemTimezoneConfig().offset;
  const safe = Number.isFinite(offset) ? offset : DEFAULT_SYSTEM_TIMEZONE_OFFSET;
  return Math.max(MIN_TIMEZONE_OFFSET, Math.min(MAX_TIMEZONE_OFFSET, safe));
}

function normalizeCharacters(value) {
  let text = String(value == null ? '' : value);
  text = text.replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  text = text.replace(/\u3000/g, ' ');
  text = text.replace(/\uFF08/g, '(').replace(/\uFF09/g, ')');
  text = text.replace(/[\uFF0D\u2212]/g, '-').replace(/\uFF0F/g, '/').replace(/\uFF0E/g, '.');
  text = text.replace(/\uFF1A/g, ':').replace(/\uFF0C/g, ',');
  return text.replace(/\s+/g, ' ').trim();
}

function chineseNumber(text) {
  const source = String(text || '');
  if (!source) return null;
  if (/^[〇零一二三四五六七八九]+$/.test(source)) {
    let digits = '';
    for (let index = 0; index < source.length; index += 1) digits += String(CJK_DIGITS[source.charAt(index)]);
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

function splitDateAndTime(text) {
  const source = normalizeCharacters(text);
  const match = source.match(/(?:^|[\sT])(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:\.\d{1,3})?)\s*(.*)$/);
  if (!match) return { datePart: source.trim(), timePart: '', tail: '' };
  return {
    datePart: source.slice(0, match.index).trim(),
    timePart: match[1],
    tail: String(match[2] || '').trim()
  };
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

function parseTimezoneOffsetMinutes(text) {
  const source = normalizeCharacters(text);
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

function stripWeekday(value) {
  let text = normalizeCharacters(value);
  let changed = true;
  while (changed) {
    changed = false;
    const first = text.split(' ')[0];
    if (first && WEEKDAY_NAME.test(first)) {
      text = text.slice(first.length).replace(/^[\s,]+/, '');
      changed = true;
    }
  }
  return text;
}

function extractNumericDateParts(head) {
  const compactFull = head.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compactFull) {
    return {
      year: Number(compactFull[1]), month: Number(compactFull[2]), day: Number(compactFull[3]),
      compactTime: { hour: Number(compactFull[4]), minute: Number(compactFull[5]), second: Number(compactFull[6]) }
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
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  match = head.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return null;
}

function extractChineseDateParts(head) {
  const match = head.match(/^([〇零一二三四五六七八九]{2,4})年([一二三四五六七八九十]{1,3})月([一二三四五六七八九十]{1,3})日?$/);
  if (!match) return null;
  const year = chineseNumber(match[1]);
  const month = chineseNumber(match[2]);
  const day = chineseNumber(match[3]);
  if (year == null || month == null || day == null) return null;
  return { year, month, day };
}

function extractEnglishDateParts(head) {
  let match = head.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTH_NAMES[String(match[1]).toLowerCase()];
    if (month) return { year: Number(match[3]), month, day: Number(match[2]) };
  }
  match = head.match(/^(\d{1,2})(?:st|nd|rd|th)?,?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (match) {
    const month = MONTH_NAMES[String(match[2]).toLowerCase()];
    if (month) return { year: Number(match[3]), month, day: Number(match[1]) };
  }
  return null;
}

// 解析任意受支持的日期写法；失败返回 null。
function parseDateValue(value) {
  const cleaned = stripWeekday(value);
  if (!cleaned) return null;
  const split = splitDateAndTime(cleaned);
  const head = split.datePart;
  const parts = extractNumericDateParts(head) || extractChineseDateParts(head) || extractEnglishDateParts(head);
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
function normalizeDateLiteral(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return '';
  return padDatePart(parsed.year, 4) + '-' + padDatePart(parsed.month) + '-' + padDatePart(parsed.day);
}

function isValidUtcIso(value) {
  const text = String(value == null ? '' : value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/);
  if (!match) return false;
  return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    && Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6] || 0) <= 59;
}

// 日期时间字段：带偏移按偏移还原，无偏移按 UTC，只有日期按当天 00:00:00Z。
function normalizeDateTimeInstant(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return '';
  const offset = parsed.offsetMinutes == null ? 0 : parsed.offsetMinutes;
  const epoch = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second) - offset * 60000;
  return new Date(epoch).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getSystemDateTimeParts(utcIso, timezoneOffset) {
  if (!isValidUtcIso(utcIso)) return null;
  const offset = systemTimezoneOffset(timezoneOffset);
  const shifted = new Date(Date.parse(utcIso) + offset * 3600000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

function formatDateTimeText(utcIso, timezoneOffset) {
  const parts = getSystemDateTimeParts(utcIso, timezoneOffset);
  if (!parts) return '';
  return padDatePart(parts.year, 4) + '-' + padDatePart(parts.month) + '-' + padDatePart(parts.day)
    + ' ' + padDatePart(parts.hour) + ':' + padDatePart(parts.minute) + ':' + padDatePart(parts.second);
}

function formatDateTimePickerDate(utcIso, timezoneOffset) {
  const parts = getSystemDateTimeParts(utcIso, timezoneOffset);
  if (!parts) return '';
  return padDatePart(parts.year, 4) + '-' + padDatePart(parts.month) + '-' + padDatePart(parts.day);
}

function formatDateTimePickerTime(utcIso, timezoneOffset) {
  const parts = getSystemDateTimeParts(utcIso, timezoneOffset);
  if (!parts) return '';
  return padDatePart(parts.hour) + ':' + padDatePart(parts.minute);
}

// 选择器结果（系统时区墙上时间）→ 绝对时刻 ISO。
function pickerToUtcIso(dateText, timeText, timezoneOffset) {
  const dateMatch = String(dateText == null ? '' : dateText).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dateMatch) return '';
  const timeMatch = String(timeText == null ? '' : timeText).trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = timeMatch ? Number(timeMatch[1]) : 0;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const second = timeMatch ? Number(timeMatch[3] || 0) : 0;
  if (!isValidCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return '';
  const epoch = Date.UTC(year, month - 1, day, hour, minute, second) - systemTimezoneOffset(timezoneOffset) * 3600000;
  return new Date(epoch).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// 导入列类型推断：全部可解析且都没有时间/偏移 → date；全部可解析且至少一条带时间或偏移 → datetime。
// 列类型推断入口在管理端 adminUtils.detectFieldTypeFromValues，判定完全依赖本函数。
function detectColumnDateType(values) {
  const rows = (values || []).filter((value) => String(value == null ? '' : value).trim() !== '');
  if (!rows.length) return '';
  let sawDateTime = false;
  for (const value of rows) {
    const parsed = parseDateValue(value);
    if (!parsed) return '';
    if (parsed.hasTime || parsed.offsetMinutes != null) sawDateTime = true;
  }
  return sawDateTime ? 'datetime' : 'date';
}

// 兼容旧调用：返回补零后的字符串年月日。
function extractDateParts(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  return {
    year: padDatePart(parsed.year, 4),
    month: padDatePart(parsed.month),
    day: padDatePart(parsed.day)
  };
}

// 展示用简略格式：2004.08.31，不显示时间，也不显示时区。
function formatDateTextOnly(value) {
  const parts = extractDateParts(value);
  if (!parts) return value;
  return parts.year + '.' + parts.month + '.' + parts.day;
}

// 原生 date picker 的 value 只接受 YYYY-MM-DD，无法解析时返回空串回落到今天。
function toDatePickerValue(value) {
  const parts = extractDateParts(value);
  if (!parts) return '';
  return parts.year + '-' + parts.month + '-' + parts.day;
}

module.exports = {
  parseDateValue,
  normalizeDateLiteral,
  normalizeDateTimeInstant,
  isValidUtcIso,
  getSystemDateTimeParts,
  formatDateTimeText,
  formatDateTimePickerDate,
  formatDateTimePickerTime,
  pickerToUtcIso,
  detectColumnDateType,
  extractDateParts,
  formatDateTextOnly,
  toDatePickerValue
};
