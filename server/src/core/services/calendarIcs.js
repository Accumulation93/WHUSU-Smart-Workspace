'use strict';
const crypto=require('node:crypto');
const {dateText,CalendarError}=require('./calendarRecurrence');
// 按 UTF-8 字节折行，不能从汉字或表情的编码中间截断。
function fold(line) {
  const parts=[];let part='',length=0;
  for (const character of line) {
    const size=Buffer.byteLength(character,'utf8');
    if (length+size>75) {parts.push(part);part=' ';length=1;}
    part+=character;length+=size;
  }
  parts.push(part);return parts.join('\r\n');
}
function escape(value) {
  return String(value || '').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
}
function instant(value) {
  const date=new Date(value);
  if (!Number.isFinite(date.getTime())) throw new CalendarError('invalidSchedule');
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}
function render(items,now=Date.now()) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//WHUSU//Workspace Calendar//ZH-CN','CALSCALE:GREGORIAN'];
  for (const item of items) {
    const uid=crypto.createHash('sha256').update(item.id+'\0'+item.occurrenceDate).digest('hex')+'@accumulation93.com';
    lines.push('BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+instant(now),'SEQUENCE:'+Math.max(0,Number(item.version)||0),'CLASS:PRIVATE');
    if (item.allDay) {
      const offset=Number(item.timezoneOffset)*60000;
      lines.push('DTSTART;VALUE=DATE:'+dateText(Date.parse(item.startAt)+offset).replace(/-/g,''),
        'DTEND;VALUE=DATE:'+dateText(Date.parse(item.endAt)+offset).replace(/-/g,''));
    } else lines.push('DTSTART:'+instant(item.startAt),'DTEND:'+instant(item.endAt));
    lines.push('SUMMARY:'+escape(item.title),'LOCATION:'+escape(item.location),'DESCRIPTION:'+escape(item.description));
    if (item.cancelled) lines.push('STATUS:CANCELLED');
    else {
      lines.push('STATUS:CONFIRMED');
      for (const minutes of item.reminders || []) {
        if (!Number.isInteger(minutes) || minutes<0 || minutes>10080) throw new CalendarError('invalidSchedule');
        lines.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-PT'+minutes+'M','DESCRIPTION:'+escape(item.title),'END:VALARM');
      }
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
module.exports={fold,escape,instant,render};
