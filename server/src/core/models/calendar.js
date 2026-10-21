'use strict';
const pool = require('../../config/db');
const {isDeepStrictEqual}=require('node:util');
const {generateId} = require('../../utils/helpers');
const identity = require('./unifiedIdentity');
const directory = require('./contactDirectory');
const directoryPolicy = require('../services/contactDirectoryPolicy');
const policy = require('../services/calendarPolicy');
const recurrence = require('../services/calendarRecurrence');
const occurrences = require('../services/calendarOccurrences');
const {lockOrganizationDictionaryWrites} = require('../services/dictionaryUsage');
const {CalendarError} = recurrence;
const sources = require('./calendarSources');
const dedup=require('../../utils/requestDeduplication');
const parse = value=>typeof value === 'string' ? JSON.parse(value) : value;
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const placeholders = values=>values.map(()=>'?').join(',');
function validId(id) { if (typeof id !== 'string' || !idPattern.test(id)) throw new CalendarError('invalidSchedule'); return id; }
function actorSnapshot(actor) {
  return {personId:actor.personId,organizationId:actor.organizationId,assignmentId:actor.assignmentId || '',
    contextId:actor.contextId,role:actor.role,adminGrantId:actor.adminGrantId || ''};
}
async function timezone(connection) {
  const rows=(await connection.query('SELECT timezone FROM system_config WHERE id = ?',['default']))[0];
  return Math.round(Number(rows.length ? rows[0].timezone : 8)*60);
}
function decode(row) {
  return {id:row.id,organizationId:row.org_id,creatorPersonId:row.creator_person_id,creator:parse(row.creator_context_json),
    visibility:row.visibility,sourceKind:row.source_kind,sourceId:row.source_id,spec:parse(row.spec_json),
    targets:parse(row.targets_json),status:row.status,version:row.version};
}
async function rules(connection,orgId) {
  return (await connection.query('SELECT * FROM calendar_rules WHERE org_id = ? ORDER BY created_at,id',[orgId]))[0].map(row=>({
    id:row.id,version:row.version,name:row.name,enabled:Boolean(row.enabled),audience:parse(row.audience_json),targets:parse(row.targets_json),actions:parse(row.actions_json)
  }));
}
async function configuration(actor,authorize,editingRules=false) {
  return pool.withTransaction(async connection=>{
    const permissions=await authorize(connection,editingRules ? 'rules' : 'read');
    const data=await directory.catalog(connection,actor.organizationId);
    const stored=await rules(connection,actor.organizationId);
    const allowed=permissions.manage || editingRules ? new Set(data.people.map(person=>person.personId)) : policy.allowedPeople(stored,'assign',actor,data);
    const people=data.people.filter(person=>allowed.has(person.personId)).map(person=>({personId:person.personId,name:person.name,
      assignments:person.assignments.map(a=>({id:a.id,departmentId:a.departmentId,identityCategoryId:a.identityCategoryId,workGroupId:a.workGroupId,
        departmentName:a.departmentName,identityCategoryName:a.identityCategoryName,workGroupName:a.workGroupName}))}));
    return {people,departments:data.departments,identities:data.identities,workGroups:data.workGroups,
      rules:editingRules ? stored : [],permissions,timezoneOffset:await timezone(connection)};
  });
}
async function saveRule(input,actor,authorize) {
  const rule=policy.normalize(input);
  return pool.withTransaction(async connection=>{
    await authorize(connection,'rules');
    await identity.lockActiveBusinessSubjects(connection,directoryPolicy.referenceIds(rule).map(personId=>({personId,organizationId:actor.organizationId})));
    await lockOrganizationDictionaryWrites(actor.organizationId,connection);
    directoryPolicy.validateReferences(rule,await directory.catalog(connection,actor.organizationId,true));
    const values=[rule.name,JSON.stringify(rule.audience),JSON.stringify(rule.targets),JSON.stringify(rule.actions),rule.enabled ? 1 : 0];
    if (rule.id) {
      const [result]=await connection.query(`UPDATE calendar_rules SET name=?,audience_json=?,targets_json=?,actions_json=?,enabled=?,version=version+1
        WHERE id=? AND org_id=? AND version=?`,values.concat([rule.id,actor.organizationId,rule.version]));
      if (result.affectedRows!==1) throw new CalendarError('conflict');
    } else {
      rule.id=generateId();
      await connection.query('INSERT INTO calendar_rules (name,audience_json,targets_json,actions_json,enabled,id,org_id) VALUES (?,?,?,?,?,?,?)',values.concat([rule.id,actor.organizationId]));
    }
    return (await rules(connection,actor.organizationId)).find(item=>item.id===rule.id);
  });
}
async function batchRules(input,actor,authorize) {
  if (!input || !['enable','disable','delete'].includes(input.action) || !Array.isArray(input.rules) || !input.rules.length || input.rules.length>500) throw new CalendarError('invalidRule');
  const versions=new Map();
  for (const rule of input.rules) {
    validId(rule.id);
    if (!Number.isSafeInteger(rule.version) || rule.version<1 || versions.has(rule.id)) throw new CalendarError('invalidRule');
    versions.set(rule.id,rule.version);
  }
  return pool.withTransaction(async connection=>{
    await authorize(connection,'rules');
    await lockOrganizationDictionaryWrites(actor.organizationId,connection);
    const rows=(await connection.query(`SELECT id,version FROM calendar_rules WHERE org_id=? AND id IN (${placeholders(input.rules)}) ORDER BY id FOR UPDATE`,[actor.organizationId,...versions.keys()]))[0];
    if (rows.length!==versions.size || rows.some(row=>row.version!==versions.get(row.id))) throw new CalendarError('conflict');
    if (input.action==='enable') {
      const data=await directory.catalog(connection,actor.organizationId,true);
      (await rules(connection,actor.organizationId)).filter(rule=>versions.has(rule.id)).forEach(rule=>directoryPolicy.validateReferences(rule,data));
    }
    if (input.action==='delete') await connection.query(`DELETE FROM calendar_rules WHERE org_id=? AND id IN (${placeholders(rows)})`,[actor.organizationId,...versions.keys()]);
    else await connection.query(`UPDATE calendar_rules SET enabled=?,version=version+1 WHERE org_id=? AND id IN (${placeholders(rows)})`,[input.action==='enable' ? 1 : 0,actor.organizationId,...versions.keys()]);
    return {count:rows.length};
  });
}
async function load(connection,id,orgId,lock=false) {
  const row=(await connection.query('SELECT * FROM calendar_events WHERE id=? AND org_id=?'+(lock ? ' FOR UPDATE' : ''),[validId(id),orgId]))[0][0];
  if (!row) throw new CalendarError('unavailable');
  return decode(row);
}
async function related(connection,events,orgId) {
  if (!events.length) return {changes:new Map(),exits:new Map()};
  const ids=events.map(event=>event.id), args=[orgId,...ids];
  const changes=new Map(), exits=new Map();
  for (const row of (await connection.query(`SELECT * FROM calendar_exceptions WHERE org_id=? AND event_id IN (${placeholders(ids)}) ORDER BY version`,args))[0]) {
    const list=changes.get(row.event_id)||[];
    list.push({scope:row.scope,action:row.action,occurrenceDate:row.occurrence_date,version:row.version,spec:parse(row.spec_json)}); changes.set(row.event_id,list);
  }
  for (const row of (await connection.query(`SELECT * FROM calendar_exits WHERE org_id=? AND event_id IN (${placeholders(ids)})`,args))[0]) {
    const list=exits.get(row.event_id)||[];
    list.push({scope:row.scope,personId:row.person_id,occurrenceDate:row.occurrence_date}); exits.set(row.event_id,list);
  }
  return {changes,exits};
}
function members(event,catalog,exits,date) {
  if (event.visibility==='private') {
    const owner=catalog.people.find(person=>person.personId===event.creatorPersonId)||(catalog.privateOwners||[]).find(person=>person.personId===event.creatorPersonId);
    return [{personId:event.creatorPersonId,name:owner ? owner.name : '',assignments:owner ? owner.assignments : []}];
  }
  let selected;
  try { selected=policy.selectedAssignments(event.targets,event.creator,catalog,{dynamic:true}); }
  catch (error) { if (error instanceof CalendarError) return []; throw error; }
  const people=new Map();
  for (const item of selected) {
    if (policy.hasExited(exits,item.person.personId,date)) continue;
    const person=people.get(item.person.personId)||{personId:item.person.personId,name:item.person.name,assignments:[]};
    if (item.assignment && !person.assignments.some(a=>a.id===item.assignment.id)) person.assignments.push(item.assignment);
    people.set(person.personId,person);
  }
  return [...people.values()];
}
function publicMembers(people) {
  return people.map(person=>({name:person.name,positions:person.assignments.map(a=>({department:a.departmentName,identityCategory:a.identityCategoryName,workGroup:a.workGroupName || ''}))}));
}
async function canModify(event,actor,action,data,stored,permissions) {
  if (event.visibility==='private') return event.creatorPersonId===actor.personId;
  if (permissions.manage) return true;
  if (event.creatorPersonId!==actor.personId) return false;
  try {
    policy.assertSelection(policy.selectedPeople(event.targets,event.creator,data,{dynamic:true}),policy.allowedPeople(stored,action,actor,data));
    return true;
  } catch (error) { if (error instanceof CalendarError) return false; throw error; }
}
async function save(input,actor,authorize) {
  if (!input || !['private','organization'].includes(input.visibility) || (input.sourceKind && input.sourceKind!=='manual')) throw new CalendarError('invalidSchedule');
  return pool.withTransaction(async connection=>{
    const permissions=await authorize(connection,'read');
    await identity.lockActiveBusinessSubjects(connection,[{personId:actor.personId,organizationId:actor.organizationId,assignmentId:actor.assignmentId,requireMembership:actor.role!=='admin'}]);
    await lockOrganizationDictionaryWrites(actor.organizationId,connection);
    const data=await directory.catalog(connection,actor.organizationId,true), stored=await rules(connection,actor.organizationId);
    const spec=occurrences.normalizeSpec(input,await timezone(connection));
    const event=input.id ? await load(connection,input.id,actor.organizationId,true) : null;
    if (event && (event.status!=='active' || event.version!==input.version)) throw new CalendarError('conflict');
    if (event && event.sourceKind!=='manual') throw new CalendarError('sourceReadOnly');
    if (event && !(await canModify(event,actor,'update',data,stored,permissions))) throw new CalendarError('forbidden');
    const targets=input.visibility==='private' ? [{type:'self'}] : directoryPolicy.normalizeClauses(input.targets,true);
    const selected=input.visibility==='private' ? [event ? event.creatorPersonId : actor.personId] : policy.selectedPeople(targets,event ? event.creator : actor,data);
    if (!permissions.manage && (!event || !isDeepStrictEqual(targets,event.targets))) policy.assertSelection(selected,policy.allowedPeople(stored,'assign',actor,data));
    await identity.lockActiveBusinessSubjects(connection,selected.filter(personId=>personId!==actor.personId).map(personId=>({personId,organizationId:actor.organizationId})));
    if (!input.id) {
      const clientRequestId=dedup.normalizeClientRequestId(input.clientRequestId);
      const id=clientRequestId?dedup.stableResourceId('calendar-create',[actor.organizationId,actor.personId,clientRequestId]):generateId();
      const request={orgId:actor.organizationId,actorKey:actor.personId,operationType:'calendar-create',clientRequestId,resourceId:dedup.stableResourceId('calendar-payload',[JSON.stringify({spec,targets,visibility:input.visibility})])};
      const claim=await dedup.claim(connection,request);
      if(!claim.claimed){if(claim.response)return claim.response;throw new CalendarError('conflict');}
      await connection.query(`INSERT INTO calendar_events (id,org_id,creator_person_id,creator_context_json,visibility,spec_json,targets_json)
        VALUES (?,?,?,?,?,?,?)`,[id,actor.organizationId,actor.personId,JSON.stringify(actorSnapshot(actor)),input.visibility,JSON.stringify(spec),JSON.stringify(targets)]);
      const response={id,version:1};
      await dedup.complete(connection,Object.assign({},request,claim),response);
      return response;
    }
    if (event.visibility!==input.visibility) throw new CalendarError('invalidSchedule');
    const scope=input.scope || 'series';
    if (!['series','instance','following'].includes(scope)) throw new CalendarError('invalidSchedule');
    if (scope==='series') {
      await connection.query('UPDATE calendar_events SET spec_json=?,targets_json=?,version=version+1 WHERE id=? AND org_id=?',
        [JSON.stringify(spec),JSON.stringify(targets),event.id,actor.organizationId]);
      // 整个系列编辑保留已退出成员，旧的局部时间覆盖由新系列配置取代。
      await connection.query("DELETE FROM calendar_exceptions WHERE event_id=? AND org_id=? AND action='update'",[event.id,actor.organizationId]);
    } else {
      occurrences.assertOccurrence(event.spec,input.occurrenceDate);
      if (!isDeepStrictEqual(spec.recurrence,event.spec.recurrence) || !isDeepStrictEqual(targets,event.targets)) throw new CalendarError('changeRecurrenceSeries');
      const base=recurrence.dateParts(input.occurrenceDate).time+event.spec.startMinute*60000-event.spec.timezoneOffset*60000;
      if (Math.abs(spec.startAt-base)>366*86400000) throw new CalendarError('invalidSchedule');
      await connection.query('INSERT INTO calendar_exceptions (id,org_id,event_id,occurrence_date,scope,action,spec_json,version) VALUES (?,?,?,?,?,?,?,?)',
        [generateId(),actor.organizationId,event.id,input.occurrenceDate,scope,'update',JSON.stringify(spec),event.version+1]);
      await connection.query('UPDATE calendar_events SET version=version+1 WHERE id=? AND org_id=?',[event.id,actor.organizationId]);
    }
    return {id:event.id,version:event.version+1};
  });
}
async function listForActor(connection,actor,input,permissions={}) {
  const window=recurrence.normalizeWindow(input.from,input.to);
  const rows=(await connection.query(`SELECT * FROM calendar_events WHERE org_id=? AND (visibility='organization' OR creator_person_id=?) ORDER BY created_at,id`,[actor.organizationId,actor.personId]))[0];
  const events=rows.map(decode), data=await directory.catalog(connection,actor.organizationId);
  const privateIds=[...new Set(events.filter(event=>event.visibility==='private'&&!data.people.some(person=>person.personId===event.creatorPersonId)).map(event=>event.creatorPersonId))];
  data.privateOwners=privateIds.length?(await connection.query(`SELECT id AS personId,name FROM persons WHERE id IN (${placeholders(privateIds)})`,privateIds))[0].map(person=>({...person,assignments:[]})):[];
  const stored=await rules(connection,actor.organizationId), linked=await related(connection,events,actor.organizationId);
  const offset=await timezone(connection), external=await sources.read(connection,events,actor.organizationId,offset,input.from,input.to);
  const historyRows=(await connection.query('SELECT event_id,occurrence_date,spec_json,participants_json FROM calendar_occurrence_records WHERE org_id=? AND ((starts_at<? AND ends_at>?) OR (event_id=? AND occurrence_date=?))',[actor.organizationId,new Date(window.end),new Date(window.start),input.detailId||'',input.occurrenceDate||'1000-01-01']))[0];
  const history=new Map();
  for(const row of historyRows){const group=history.get(row.event_id)||new Map();group.set(row.occurrence_date,{spec:parse(row.spec_json),participants:parse(row.participants_json)});history.set(row.event_id,group);}
  const result=[];
  for (const event of events) {
    if (event.status!=='active') continue;
    const direct=input.detailId===event.id && input.occurrenceDate;
    const instances=event.sourceKind==='manual' ? occurrences.expand(event.spec,linked.changes.get(event.id)||[],input.from,input.to)
      : (external.get(event.sourceKind+':'+event.sourceId)||[]).map(item=>Object.assign({},event.spec,item));
    if(direct && event.sourceKind==='manual' && !instances.some(item=>item.occurrenceDate===input.occurrenceDate)) {
      const item=occurrences.resolve(event.spec,linked.changes.get(event.id)||[],input.occurrenceDate);
      if(item)instances.push(item);
    }
    const recorded=event.sourceKind==='manual'||instances.length ? (history.get(event.id)||new Map()) : new Map();
    for(const [date,record] of recorded){
      if((linked.changes.get(event.id)||[]).some(change=>change.action==='cancel'&&occurrences.applies(change,date)))continue;
      const index=instances.findIndex(item=>item.occurrenceDate===date);if(index>=0)instances[index]=record.spec;else instances.push(record.spec);
    }
    const baseParticipants=members(event,data,[],null);
    const canUpdate=await canModify(event,actor,'update',data,stored,permissions);
    const canCancel=await canModify(event,actor,'cancel',data,stored,permissions);
    for (const item of instances) {
      if (!direct && (Date.parse(item.startAt)>=window.end || Date.parse(item.endAt)<=window.start)) continue;
      // 已结束且没有当时名单的组织活动不能按现岗位补造历史访问权。
      if(event.visibility==='organization'&&Date.parse(item.endAt)<Date.now()&&!recorded.has(item.occurrenceDate))continue;
      const participants=(recorded.has(item.occurrenceDate)?recorded.get(item.occurrenceDate).participants:baseParticipants).filter(person=>!policy.hasExited(linked.exits.get(event.id)||[],person.personId,item.occurrenceDate));
      const attending=participants.some(person=>person.personId===actor.personId);
      if (!attending && !(input.managed===true && event.visibility==='organization' && (canUpdate || canCancel))) continue;
      const card={id:event.id,occurrenceDate:item.occurrenceDate,version:event.version,title:item.title,startAt:item.startAt,endAt:item.endAt,
        allDay:item.allDay,location:item.location,sourceKind:event.sourceKind,visibility:event.visibility,timezoneOffset:event.spec.timezoneOffset,
        participantCount:participants.length,attending,canUpdate:canUpdate && event.sourceKind==='manual',canCancel:canCancel && event.sourceKind==='manual'};
      if (input.export===true) Object.assign(card,{description:item.description,reminders:item.reminders || []});
      if (input.detailId===event.id && input.occurrenceDate===item.occurrenceDate) Object.assign(card,{description:item.description,participants:publicMembers(participants),
        form:occurrences.form(Object.assign({},item,{startAt:Date.parse(item.startAt),endAt:Date.parse(item.endAt)})),
        seriesForm:canUpdate && event.sourceKind==='manual' ? occurrences.form(event.spec) : null,
        targets:canUpdate ? event.targets : [],reminders:item.reminders || []});
      result.push(card);
    }
  }
  return result.sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id));
}
async function list(input,actor,authorize) {
  return pool.withTransaction(async connection=>({items:await listForActor(connection,actor,input,await authorize(connection,'read'))}));
}
async function mutate(input,actor,authorize) {
  if (!input || !['leave','cancel'].includes(input.action) || !['instance','following','series'].includes(input.scope)) throw new CalendarError('invalidSchedule');
  recurrence.dateParts(input.occurrenceDate);
  return pool.withTransaction(async connection=>{
    const permissions=await authorize(connection,'read');
    const event=await load(connection,input.id,actor.organizationId,true);
    if (event.version!==input.version || event.status!=='active') throw new CalendarError('conflict');
    const start=recurrence.dateParts(input.occurrenceDate).time-86400000;
    const items=await listForActor(connection,actor,{from:new Date(start).toISOString(),to:new Date(start+3*86400000).toISOString(),managed:true,detailId:event.id,occurrenceDate:input.occurrenceDate},permissions);
    const item=items.find(value=>value.id===event.id && value.occurrenceDate===input.occurrenceDate);
    if (!item) throw new CalendarError('unavailable');
    if (input.action==='leave') {
      if (!item.attending || event.visibility==='private') throw new CalendarError('forbidden');
      await connection.query(`INSERT INTO calendar_exits (id,org_id,event_id,person_id,occurrence_date,scope) VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE scope=VALUES(scope)`,[generateId(),actor.organizationId,event.id,actor.personId,input.occurrenceDate,input.scope]);
    } else {
      if (!item.canCancel) throw new CalendarError(event.sourceKind==='manual' ? 'forbidden' : 'sourceReadOnly');
      if (input.scope==='series') await connection.query("UPDATE calendar_events SET status='cancelled' WHERE id=? AND org_id=?",[event.id,actor.organizationId]);
      else await connection.query('INSERT INTO calendar_exceptions (id,org_id,event_id,occurrence_date,scope,action,version) VALUES (?,?,?,?,?,?,?)',
        [generateId(),actor.organizationId,event.id,input.occurrenceDate,input.scope,'cancel',event.version+1]);
    }
    await connection.query('UPDATE calendar_events SET version=version+1 WHERE id=? AND org_id=?',[event.id,actor.organizationId]);
    return {id:event.id,version:event.version+1};
  });
}
async function saveParticipants(input,actor,authorize) {
  validId(input.sourceId);
  const targets=directoryPolicy.normalizeClauses(input.targets,true);
  return pool.withTransaction(async connection=>{
    const permissions=await authorize(connection,'read');
    await identity.lockActiveBusinessSubjects(connection,[{personId:actor.personId,organizationId:actor.organizationId,assignmentId:actor.assignmentId,requireMembership:actor.role!=='admin'}]);
    await lockOrganizationDictionaryWrites(actor.organizationId,connection);
    await sources.assertEditable(connection,input.sourceKind,input.sourceId,actor,permissions);
    const data=await directory.catalog(connection,actor.organizationId,true);
    const existing=(await connection.query('SELECT * FROM calendar_events WHERE org_id=? AND source_kind=? AND source_id=? FOR UPDATE',[actor.organizationId,input.sourceKind,input.sourceId]))[0][0];
    const selected=policy.selectedPeople(targets,existing ? parse(existing.creator_context_json) : actor,data);
    await identity.lockActiveBusinessSubjects(connection,selected.map(personId=>({personId,organizationId:actor.organizationId})));
    // 场地来源由原业务授权安排参会者，日程不能反向批准或修改场地占用。
    if (existing) {
      if (existing.version!==input.version) throw new CalendarError('conflict');
      await connection.query('UPDATE calendar_events SET targets_json=?,version=version+1 WHERE id=? AND org_id=?',[JSON.stringify(targets),existing.id,actor.organizationId]);
      return {id:existing.id,version:existing.version+1};
    }
    const id=generateId(),spec={timezoneOffset:await timezone(connection),reminders:[15]};
    await connection.query(`INSERT INTO calendar_events (id,org_id,creator_person_id,creator_context_json,visibility,source_kind,source_id,spec_json,targets_json)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,actor.organizationId,actor.personId,JSON.stringify(actorSnapshot(actor)),'organization',input.sourceKind,input.sourceId,JSON.stringify(spec),JSON.stringify(targets)]);
    return {id,version:1};
  });
}
async function getParticipants(input,actor,authorize) {
  validId(input.sourceId);
  return pool.withTransaction(async connection=>{
    const permissions=await authorize(connection,'read');
    let canEdit=true;
    try { await sources.assertEditable(connection,input.sourceKind,input.sourceId,actor,permissions); }
    catch(error) { if(error instanceof CalendarError)canEdit=false;else throw error; }
    const row=(await connection.query('SELECT * FROM calendar_events WHERE org_id=? AND source_kind=? AND source_id=?',[actor.organizationId,input.sourceKind,input.sourceId]))[0][0];
    if (!row && !canEdit) throw new CalendarError('forbidden');
    const catalog=await directory.catalog(connection,actor.organizationId);
    const metadata=canEdit && input.edit===true ? {people:catalog.people.map(person=>({personId:person.personId,name:person.name,assignments:person.assignments.map(a=>({id:a.id,departmentId:a.departmentId,identityCategoryId:a.identityCategoryId,workGroupId:a.workGroupId,departmentName:a.departmentName,identityCategoryName:a.identityCategoryName,workGroupName:a.workGroupName}))})),
      departments:catalog.departments,identities:catalog.identities,workGroups:catalog.workGroups,timezoneOffset:await timezone(connection)} : {};
    if (!row) return Object.assign(metadata,{id:null,version:0,canEdit,targets:[{type:'self'}],participants:[]});
    const event=decode(row), linked=await related(connection,[event],actor.organizationId);
    const offset=await timezone(connection);
    const sourceDate=await sources.occurrenceDate(connection,input.sourceKind,input.sourceId,actor.organizationId,offset);
    const date=input.sourceKind==='venue_booking'?sourceDate:(input.occurrenceDate||sourceDate);
    recurrence.dateParts(date);
    if(!canEdit){
      const start=recurrence.dateParts(date).time-offset*60000;
      const visible=await sources.read(connection,[event],actor.organizationId,offset,new Date(start).toISOString(),new Date(start+86400000).toISOString());
      if(!(visible.get(event.sourceKind+':'+event.sourceId)||[]).some(item=>item.occurrenceDate===date))throw new CalendarError('unavailable');
    }
    const participants=members(event,catalog,linked.exits.get(event.id)||[],date);
    if(!canEdit&&!participants.some(person=>person.personId===actor.personId))throw new CalendarError('forbidden');
    return Object.assign(metadata,{id:event.id,version:event.version,canEdit,targets:canEdit?event.targets:[],participants:publicMembers(participants)});
  });
}
module.exports={configuration,saveRule,batchRules,save,list,mutate,saveParticipants,getParticipants,listForActor,load,related,members,publicMembers,canModify,rules,decode,timezone,validId,actorSnapshot};
