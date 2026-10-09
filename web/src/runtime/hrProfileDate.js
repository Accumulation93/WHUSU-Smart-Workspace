import { createHrProfileDate } from '@/shared/hrProfileDate.js';
import { getSystemTimezoneConfig } from '@/runtime/dateTime.js';

export default createHrProfileDate(getSystemTimezoneConfig);
