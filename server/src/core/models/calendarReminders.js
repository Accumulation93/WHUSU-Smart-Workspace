'use strict';
const pool=require('../../config/db');
const calendar=require('./calendar');
const directory=require('./contactDirectory');
const sources=require('./calendarSources');
const occurrences=require('../services/calendarOccurrences');
const policy=require('../services/calendarPolicy');
const notifications=require('../../modules/audit/models/notification');
const {orgStorage}=require('../../utils/orgContext');
const {generateId}=require('../../utils/helpers');
const copy=require('../../locales/zh-CN/calendar');
const identity=require('./unifiedIdentity');
const {lockOrganizationDictionaryWrites}=require('../services/dictionaryUsage');

// 每个组织独立事务；收据和通知同事务提交，重试不会重复投递。
async function processOrganization(orgId,now=Date.now()) {
  return orgStorage.run(orgId,()=>pool.withTransaction(async connection=>{
    const candidates=(await connection.query("SELECT creator_person_id FROM calendar_events WHERE org_id=? AND status='active'",[orgId]))[0];
    if(!candidates.length)return {created:0};
    const initial=await directory.catalog(connection,orgId);
    const ids=[...new Set(initial.people.map(person=>person.personId).concat(candidates.map(row=>row.creator_person_id)))].sort();
    const active=(await connection.query(`SELECT id FROM persons WHERE id IN (${ids.map(()=>'?').join(',')}) AND status='active' ORDER BY id`,ids))[0];
    const activeIds=new Set(active.map(row=>row.id));
    await identity.lockActiveBusinessSubjects(connection,active.map(row=>({personId:row.id,requireMembership:false})));
    await lockOrganizationDictionaryWrites(orgId,connection);
    const rows=(await connection.query("SELECT * FROM calendar_events WHERE org_id=? AND status='active' ORDER BY id FOR UPDATE",[orgId]))[0];
    if(!rows.length)return {created:0};
    const events=rows.map(calendar.decode), catalog=await directory.catalog(connection,orgId,true);
    const linked=await calendar.related(connection,events,orgId), offset=await calendar.timezone(connection);
    const from=new Date(now-86400000).toISOString(),to=new Date(now+8*86400000).toISOString();
    const external=await sources.read(connection,events,orgId,offset,from,to);
    const hrIds=new Map(catalog.people.map(person=>[person.personId,person.hrId]));
    let created=0;
    for(const event of events) {
      const instances=event.sourceKind==='manual'?occurrences.expand(event.spec,linked.changes.get(event.id)||[],from,to):(external.get(event.sourceKind+':'+event.sourceId)||[]).map(item=>Object.assign({},event.spec,item));
      const base=calendar.members(event,catalog,[],null).filter(person=>activeIds.has(person.personId));
      for(const item of instances) {
        const starts=Date.parse(item.startAt),ends=Date.parse(item.endAt);
        const people=base.filter(person=>!policy.hasExited(linked.exits.get(event.id)||[],person.personId,item.occurrenceDate));
        if(starts<=now&&ends>now) {
          await connection.query(`INSERT INTO calendar_occurrence_records (id,org_id,event_id,occurrence_date,starts_at,ends_at,spec_json,participants_json,version)
            VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,[generateId(),orgId,event.id,item.occurrenceDate,new Date(starts),new Date(ends),JSON.stringify(item),JSON.stringify(people),event.version]);
        }
        for(const minutes of item.reminders||[]) {
          const due=starts-minutes*60000;
          // 允许短暂离线后补送；活动结束后不再发送过期提醒。
          if(due>now||due<now-86400000||ends<=now)continue;
          for(const person of people) {
            const hrId=hrIds.get(person.personId);
            if(!hrId)continue;
            const receipt=(await connection.query('SELECT id FROM calendar_reminder_receipts WHERE org_id=? AND event_id=? AND person_id=? AND occurrence_date=? AND minutes_before=? AND starts_at=?',[orgId,event.id,person.personId,item.occurrenceDate,minutes,new Date(starts)]))[0];
            if(receipt.length)continue;
            const key='calendar:'+event.id+':'+item.occurrenceDate+':'+minutes+':'+starts;
            await notifications.batchCreate([{id:generateId(),orgId,recipientType:'user',recipientId:hrId,type:'calendar_reminder',title:copy.reminderTitle,
              description:copy.reminderText.replace('{title}',item.title),category:'system',targetType:'calendar',targetId:event.id,
              targetUrl:'/subpackages/workspace/pages/calendarDetail/calendarDetail?id='+encodeURIComponent(event.id)+'&date='+item.occurrenceDate,
              eventKey:key+':user:'+hrId}],connection);
            await connection.query('INSERT INTO calendar_reminder_receipts (id,org_id,event_id,person_id,occurrence_date,minutes_before,starts_at) VALUES (?,?,?,?,?,?,?)',[generateId(),orgId,event.id,person.personId,item.occurrenceDate,minutes,new Date(starts)]);
            created++;
          }
        }
      }
    }
    return {created};
  }));
}
async function tick(now=Date.now()) {
  const organizations=(await pool.query("SELECT DISTINCT org_id FROM calendar_events WHERE status='active' ORDER BY org_id"))[0];
  let created=0;
  for(const row of organizations)created+=(await processOrganization(row.org_id,now)).created;
  return {created};
}
module.exports={tick,processOrganization};
