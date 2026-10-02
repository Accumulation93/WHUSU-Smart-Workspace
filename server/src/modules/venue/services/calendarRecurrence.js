'use strict';

const compiled = new Map();
function parts(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) return null;
  return { year, month, day };
}
function leap(year) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
function leapCount(year) { return Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400); }
function monthDays(year, month) { return month === 2 ? (leap(year) ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31); }
function ordinal(date) {
  let days = 365 * (date.year - 1) + leapCount(date.year - 1) + date.day;
  for (let month = 1; month < date.month; month += 1) days += monthDays(date.year, month);
  return days;
}
function prepare(type, values) {
  const key = JSON.stringify([type, values]);
  if (compiled.has(key)) return compiled.get(key);
  const sets = Array.from({ length: 12 }, () => new Set());
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= 31; day += 1) {
      if (type === 'monthly' && values.includes(day)) sets[month - 1].add(day);
      if (type === 'yearly' && values.some(item => item && Number(item.m) === month
        && day >= Number(item.dStart !== undefined ? item.dStart : item.d)
        && day <= Number(item.dEnd !== undefined ? item.dEnd : item.d))) sets[month - 1].add(day);
    }
  }
  const prefix = (isLeap) => {
    const result = [0];
    for (let month = 1; month <= 12; month += 1) {
      result.push(result[month - 1] + Array.from(sets[month - 1]).filter(day => day <= monthDays(isLeap ? 2000 : 2001, month)).length);
    }
    return result;
  };
  const value = { sets, ordinary: prefix(false), leap: prefix(true) };
  if (compiled.size >= 128) compiled.delete(compiled.keys().next().value);
  compiled.set(key, value);
  return value;
}

function countThrough(date, type, values, inclusive) {
  const endDay = date.day - (inclusive ? 0 : 1);
  if (type === 'daily' || type === 'range') return ordinal(date) - (inclusive ? 0 : 1);
  if (type === 'weekly') {
    const end = ordinal(date) - (inclusive ? 0 : 1);
    const weeks = Math.floor(end / 7), tail = end % 7;
    // 公历 0001-01-01 为周一；重复星期只计一次。
    return Array.from(new Set(values)).filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
      .reduce((sum, day) => sum + weeks + (day <= tail ? 1 : 0), 0);
  }
  if (type !== 'monthly' && type !== 'yearly') return 0;
  const rule = prepare(type, values);
  const completeYears = date.year - 1;
  const yearly = completeYears * rule.ordinary[12]
    + leapCount(completeYears) * (rule.leap[12] - rule.ordinary[12]);
  const prefix = leap(date.year) ? rule.leap : rule.ordinary;
  return yearly + prefix[date.month - 1] + Array.from(rule.sets[date.month - 1]).filter(day => day <= endDay).length;
}

function countOccurrences(startText, targetText, type, values) {
  const start = parts(startText), end = parts(targetText);
  if (!start || !end || ordinal(end) < ordinal(start)) return 0;
  return countThrough(end, type, values || [], true) - countThrough(start, type, values || [], false);
}

module.exports = { countOccurrences, parts, ordinal };
