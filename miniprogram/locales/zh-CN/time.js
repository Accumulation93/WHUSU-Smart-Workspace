'use strict';

module.exports = Object.freeze({
  historicalTimezoneReviewRequired: '时间待核对',
  calendarDate: (year, month, day) => `${year}年${month}月${day}日`,
  minuteTime: (hour, minute) => `${hour}:${minute}`,
  minuteDateTime: (date, time) => `${date} ${time}`,
  sameDayTimeRange: (date, startTime, endTime) => `${date} ${startTime}-${endTime}`,
  dateTimeRange: (startDateTime, endDateTime) => `${startDateTime}-${endDateTime}`,
  dateRange: (startDate, endDate) => `${startDate} 至 ${endDate}`
});
