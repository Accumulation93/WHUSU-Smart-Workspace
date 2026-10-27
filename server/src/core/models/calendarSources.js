'use strict';
const {getActivitySlots} = require('../../modules/venue/services/venueActivitySchedule');
const {CalendarError,dateText,normalizeWindow} = require('../services/calendarRecurrence');
const placeholders=values=>values.map(()=>'?').join(',');
const DAY=86400000;
async function read(connection,events,orgId,offset,from,to) {
  const result=new Map();
  const bookings=events.filter(event=>event.sourceKind==='venue_booking').map(event=>event.sourceId);
  if (bookings.length) {
    const rows=(await connection.query(`SELECT b.id,b.title,b.description,b.time_start,b.time_end,b.status,v.name AS venue_name,v.location
      FROM venue_bookings b JOIN venues v ON v.id=b.venue_id WHERE b.creator_org_id=? AND b.id IN (${placeholders(bookings)})`,[orgId,...bookings]))[0];
    for (const row of rows) {
      if (row.status!=='approved') { result.set('venue_booking:'+row.id,[]); continue; }
      const start=new Date(row.time_start),end=new Date(row.time_end);
      result.set('venue_booking:'+row.id,[{occurrenceDate:dateText(start.getTime()+offset*60000),title:row.title,
        description:row.description || '',location:[row.venue_name,row.location].filter(Boolean).join(' · '),
        startAt:start.toISOString(),endAt:end.toISOString(),allDay:false}]);
    }
  }
  const activities=events.filter(event=>event.sourceKind==='venue_activity').map(event=>event.sourceId);
  if (activities.length) {
    const rows=(await connection.query(`SELECT r.*,v.name AS venue_name,v.location FROM venue_activity_rules r
      JOIN venues v ON v.id=r.venue_id AND v.is_active=1 WHERE r.id IN (${placeholders(activities)})`,activities))[0];
    const window=normalizeWindow(from,to), byId=new Map(rows.map(row=>[row.id,row]));
    const grouped=new Map(rows.map(row=>[row.id,new Map()]));
    const first=Math.floor((window.start+offset*60000)/DAY)*DAY-DAY;
    for (let cursor=first;cursor<window.end+offset*60000;cursor+=DAY) {
      for (const slot of getActivitySlots(dateText(cursor),rows,offset/60)) {
        const row=byId.get(slot.ruleId);
        const key=slot.fullTimeStart;
        grouped.get(row.id).set(key,{occurrenceDate:dateText(Date.parse(key)+offset*60000),title:row.activity_name,
          description:'',location:[row.venue_name,row.location].filter(Boolean).join(' · '),
          startAt:slot.fullTimeStart,endAt:slot.fullTimeEnd,allDay:false});
      }
    }
    for (const [id,instances] of grouped) result.set('venue_activity:'+id,[...instances.values()]);
  }
  return result;
}
async function assertEditable(connection,sourceKind,sourceId,actor,permissions) {
  if (sourceKind==='venue_booking') {
    const row=(await connection.query('SELECT id,creator_person_id,status FROM venue_bookings WHERE id=? AND creator_org_id=? FOR UPDATE',[sourceId,actor.organizationId]))[0][0];
    if (!row || (row.creator_person_id!==actor.personId && !permissions.venueBookings)) throw new CalendarError('forbidden');
    if (!['pending','approved'].includes(row.status)) throw new CalendarError('unavailable');
    return;
  }
  if (sourceKind==='venue_activity' && permissions.venueResources) {
    const row=(await connection.query('SELECT r.id FROM venue_activity_rules r JOIN venues v ON v.id=r.venue_id AND v.is_active=1 WHERE r.id=? AND r.is_active=1 FOR UPDATE',[sourceId]))[0][0];
    if (row) return;
  }
  throw new CalendarError('forbidden');
}
async function occurrenceDate(connection,sourceKind,sourceId,orgId,offset) {
  if(sourceKind==='venue_booking') {
    const row=(await connection.query('SELECT time_start FROM venue_bookings WHERE id=? AND creator_org_id=?',[sourceId,orgId]))[0][0];
    if(!row)throw new CalendarError('unavailable');
    return dateText(new Date(row.time_start).getTime()+offset*60000);
  }
  return dateText(Date.now()+offset*60000);
}
// 查看历史名单与编辑名单分开；取消借用不能剥夺申请人或管理者的查看权。
async function participantReadAccess(connection,sourceKind,sourceId,actor,permissions) {
  if(sourceKind==='venue_booking') {
    const row=(await connection.query('SELECT creator_person_id FROM venue_bookings WHERE id=? AND creator_org_id=?',[sourceId,actor.organizationId]))[0][0];
    return {canRead:!!row&&(row.creator_person_id===actor.personId||!!permissions.venueBookings),emptyVisible:false};
  }
  if(sourceKind==='venue_activity') {
    const row=(await connection.query('SELECT r.id FROM venue_activity_rules r JOIN venues v ON v.id=r.venue_id AND v.is_active=1 WHERE r.id=? AND r.is_active=1',[sourceId]))[0][0];
    // 场地活动为共享公开占用；未配置名单时只返回空状态，不返回任何其他组织的人员。
    return {canRead:!!row&&!!permissions.venueResources,emptyVisible:!!row};
  }
  return {canRead:false,emptyVisible:false};
}
module.exports={read,assertEditable,occurrenceDate,participantReadAccess};
