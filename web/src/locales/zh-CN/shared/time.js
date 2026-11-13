// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const sharedModule = Object.freeze({
  historicalTimezoneReviewRequired: '时间待核对',
  calendarDate: (year, month, day) => `${year}年${month}月${day}日`,
  minuteTime: (hour, minute) => `${hour}:${minute}`,
  minuteDateTime: (date, time) => `${date} ${time}`,
  sameDayTimeRange: (date, startTime, endTime) => `${date} ${startTime}-${endTime}`,
  dateTimeRange: (startDateTime, endDateTime) => `${startDateTime}-${endDateTime}`,
  dateRange: (startDate, endDate) => `${startDate} 至 ${endDate}`
});

export default sharedModule;
