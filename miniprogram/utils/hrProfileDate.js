// 人事补充资料的日期文本处理。
// 日期只按字面拆分年月日，不经过 Date、时区或时间部分，避免出现时间与时区尾巴。
// 兼容 2004-08-31 / 2004/8/31 / 2004.08.31 / 2004年8月31日
// 以及 Mon Jul 23 2007 08:00:00 GMT+0800 (China Standard Time) 这类文本日期。
const DATE_MONTH_NAMES = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function padDatePart(value) {
  return String(Number(value)).padStart(2, '0');
}

function extractDateParts(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    return { year: match[1], month: padDatePart(match[2]), day: padDatePart(match[3]) };
  }
  match = text.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if (match) {
    const month = DATE_MONTH_NAMES[String(match[1]).toLowerCase()];
    if (month) return { year: match[3], month, day: padDatePart(match[2]) };
  }
  return null;
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
  extractDateParts,
  formatDateTextOnly,
  toDatePickerValue
};
