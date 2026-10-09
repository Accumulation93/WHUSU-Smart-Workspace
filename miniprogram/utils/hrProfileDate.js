// 人事日期解析与展示复用共享规则，时区来自当前系统配置。
const { createHrProfileDate } = require('./hrProfileDateRules');
const { getSystemTimezoneConfig } = require('./dateTime');

module.exports = createHrProfileDate(getSystemTimezoneConfig);
