'use strict';
const recurrence = require('./calendarRecurrence');
const { CalendarError } = recurrence;
const DAY = 86400000;

function normalizeSpec(input, offset) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CalendarError('invalidSchedule');
  function text(value, length, required) {
    if (typeof value !== 'string' || Array.from(value.trim()).length > length || (required && !value.trim())) throw new CalendarError('invalidSchedule');
    return value.trim();
  }
  const reminders = input.reminders === undefined ? [] : input.reminders;
  if (!Array.isArray(reminders) || reminders.length > 5 || reminders.some(value=>!Number.isInteger(value) || value < 0 || value > 10080)) throw new CalendarError('invalidSchedule');
  const times = recurrence.normalizeTimes(input,offset);
  return Object.assign(times,{title:text(input.title,120,true),description:text(input.description || '',4000,false),
    location:text(input.location || '',240,false),reminders:Array.from(new Set(reminders)).sort((a,b)=>a-b)});
}
function form(spec) {
  const clock = minute => String(Math.floor(minute/60)).padStart(2,'0') + ':' + String(minute%60).padStart(2,'0');
  return Object.assign({},spec,{startTime:clock(spec.startMinute),endTime:clock(spec.endMinute)});
}
function applies(change,date) {
  return change.scope === 'series' || (change.scope === 'following' ? date >= change.occurrenceDate : date === change.occurrenceDate);
}
function expand(spec, changes, from, to) {
  const window = recurrence.normalizeWindow(from,to);
  const ordered = changes.slice().sort((a,b)=>a.version-b.version);
  let maxShift = 0;
  for (const change of ordered) {
    if (change.action !== 'update') continue;
    const original = recurrence.dateParts(change.occurrenceDate).time + spec.startMinute*60000 - spec.timezoneOffset*60000;
    maxShift = Math.max(maxShift,Math.abs(change.spec.startAt-original),change.spec.endAt-change.spec.startAt);
  }
  // 修改后的事件可能移入查询窗口，因此把原始日期候选扩展后再按实际时刻过滤。
  const left = window.start - maxShift - DAY, right = window.end + maxShift + DAY;
  const candidates = new Map();
  for (let start=left; start<right; start+=365*DAY) {
    for (const item of recurrence.expand(spec,new Date(start).toISOString(),new Date(Math.min(right,start+365*DAY)).toISOString())) candidates.set(item.occurrenceDate,item);
  }
  const result=[];
  for (const original of candidates.values()) {
    let item=Object.assign({},spec,original), cancelled=false;
    for (const change of ordered) {
      if (!applies(change,original.occurrenceDate)) continue;
      if (change.action === 'cancel') { cancelled=true; continue; }
      if (change.action !== 'update') throw new CalendarError('invalidSchedule');
      const distance=recurrence.dateParts(original.occurrenceDate).time-recurrence.dateParts(change.occurrenceDate).time;
      item=Object.assign({},change.spec,{occurrenceDate:original.occurrenceDate,
        startAt:new Date(change.spec.startAt+distance).toISOString(),endAt:new Date(change.spec.endAt+distance).toISOString()});
    }
    if (!cancelled && Date.parse(item.startAt)<window.end && Date.parse(item.endAt)>window.start) result.push(item);
  }
  return result.sort((a,b)=>a.startAt.localeCompare(b.startAt));
}
function assertOccurrence(spec,date) {
  const start=recurrence.dateParts(date).time-spec.timezoneOffset*60000;
  if (!recurrence.expand(spec,new Date(start).toISOString(),new Date(start+DAY).toISOString()).some(item=>item.occurrenceDate===date)) throw new CalendarError('unavailable');
}
function resolve(spec,changes,date) {
  assertOccurrence(spec,date);
  const start=recurrence.dateParts(date).time-spec.timezoneOffset*60000;
  let item=Object.assign({},spec,recurrence.expand(spec,new Date(start).toISOString(),new Date(start+DAY).toISOString()).find(value=>value.occurrenceDate===date));
  for(const change of changes.slice().sort((a,b)=>a.version-b.version)) {
    if(!applies(change,date))continue;
    if(change.action==='cancel')return null;
    if(change.action!=='update')throw new CalendarError('invalidSchedule');
    const distance=recurrence.dateParts(date).time-recurrence.dateParts(change.occurrenceDate).time;
    item=Object.assign({},change.spec,{occurrenceDate:date,startAt:new Date(change.spec.startAt+distance).toISOString(),endAt:new Date(change.spec.endAt+distance).toISOString()});
  }
  return item;
}
module.exports = {normalizeSpec,form,expand,applies,assertOccurrence,resolve};
