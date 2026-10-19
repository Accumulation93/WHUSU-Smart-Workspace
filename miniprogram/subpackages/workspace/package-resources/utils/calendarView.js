'use strict';
const DAY=86400000;
function date(value) { return new Date(value+'T00:00:00.000Z'); }
function dateText(value) { return new Date(value).toISOString().slice(0,10); }
function addDays(value,count) { return dateText(date(value).getTime()+count*DAY); }
function period(selected,mode,offset) {
  const current=date(selected), year=current.getUTCFullYear(),month=current.getUTCMonth();
  let start=selected,end=addDays(selected,1);
  if (mode==='month' || mode==='list') { start=dateText(Date.UTC(year,month,1)); end=dateText(Date.UTC(year,month+1,1)); }
  if (mode==='month') { start=addDays(start,-((date(start).getUTCDay()+6)%7)); end=addDays(start,42); }
  if (mode==='week') { start=addDays(selected,-((current.getUTCDay()+6)%7)); end=addDays(start,7); }
  return {start,end,from:new Date(date(start).getTime()-offset*60000).toISOString(),to:new Date(date(end).getTime()-offset*60000).toISOString()};
}
function move(selected,mode,amount) {
  if (mode==='day') return addDays(selected,amount);
  if (mode==='week') return addDays(selected,amount*7);
  const current=date(selected),target=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+amount,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  return dateText(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),Math.min(current.getUTCDate(),last)));
}
function days(selected,mode,offset,items,today) {
  const range=period(selected,mode,offset), output=[];
  for (let value=range.start;value<range.end;value=addDays(value,1)) {
    const start=date(value).getTime()-offset*60000,end=start+DAY;
    output.push({date:value,label:Number(value.slice(-2)),selected:value===selected,today:value===today,
      outside:value.slice(0,7)!==selected.slice(0,7),items:items.filter(item=>Date.parse(item.startAt)<end && Date.parse(item.endAt)>start)});
  }
  return output;
}
function blank(selected) {
  return {title:'',description:'',location:'',startDate:selected,endDate:selected,startTime:'09:00',endTime:'10:00',allDay:false,
    recurrence:{frequency:'none',interval:1,weekdays:[]},visibility:'private',targets:[{type:'self'}],reminders:[15],scope:'series'};
}
function edit(detail,offset) {
  const start=new Date(Date.parse(detail.startAt)+offset*60000),end=new Date(Date.parse(detail.endAt)+offset*60000);
  const clock=value=>String(value.getUTCHours()).padStart(2,'0')+':'+String(value.getUTCMinutes()).padStart(2,'0');
  return Object.assign(blank(dateText(start)),detail.form,{id:detail.id,version:detail.version,occurrenceDate:detail.occurrenceDate,
    visibility:detail.visibility,targets:detail.targets,startDate:dateText(start),endDate:dateText(end),startTime:clock(start),endTime:clock(end),scope:'instance'});
}
function timeline(day,offset) {
  const start=date(day.date).getTime()-offset*60000;
  const timed=day.items.filter(item=>!item.allDay).map(item=>Object.assign({},item,{
    key:item.id+':'+item.occurrenceDate,startMinute:Math.max(0,(Date.parse(item.startAt)-start)/60000),
    endMinute:Math.min(1440,(Date.parse(item.endAt)-start)/60000)
  })).sort((a,b)=>a.startMinute-b.startMinute||b.endMinute-a.endMinute);
  let group=[],ends=[],groupEnd=-1;
  function finish(){const count=ends.length;for(const item of group){item.conflict=count>1;item.position='top:'+(item.startMinute/14.4)+'%;height:'+((item.endMinute-item.startMinute)/14.4)+'%;left:'+(item.column*100/count)+'%;width:'+(100/count)+'%;';}group=[];ends=[];}
  for(const item of timed){if(item.startMinute>=groupEnd){finish();groupEnd=-1;}let column=ends.findIndex(end=>end<=item.startMinute);if(column<0)column=ends.length;ends[column]=item.endMinute;item.column=column;group.push(item);groupEnd=Math.max(groupEnd,item.endMinute);}
  finish();
  return Object.assign({},day,{timed,allDayItems:day.items.filter(item=>item.allDay),hours:Array.from({length:24},(_,hour)=>({label:String(hour).padStart(2,'0')+':00',items:timed.filter(item=>Math.floor(item.startMinute/60)===hour)}))});
}
module.exports = { addDays, period, move, days, blank, edit, timeline };
