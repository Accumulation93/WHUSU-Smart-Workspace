'use strict';
const crypto=require('node:crypto');
const pool=require('../../config/db');
const {generateId}=require('../../utils/helpers');
const identity=require('./unifiedIdentity');
const calendar=require('./calendar');
const {CalendarError}=require('../services/calendarRecurrence');
const ics=require('../services/calendarIcs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function manage(input,actor,accountId,authorize) {
  if (!['create','revoke'].includes(input.action)) throw new CalendarError('invalidSchedule');
  return pool.withTransaction(async connection=>{
    await authorize(connection,'read');
    // 账号行锁串行化重置与撤销；数据库不保存可恢复的订阅口令。
    await connection.query('SELECT id FROM accounts WHERE id=? FOR UPDATE',[accountId]);
    await connection.query('UPDATE calendar_subscriptions SET revoked=1 WHERE person_id=? AND account_id=? AND revoked=0',[actor.personId,accountId]);
    if (input.action==='revoke') return {revoked:true};
    const token=crypto.randomBytes(32).toString('base64url');
    await connection.query('INSERT INTO calendar_subscriptions (id,person_id,account_id,token_hash) VALUES (?,?,?,?)',[generateId(),actor.personId,accountId,hash(token)]);
    // 使用 HTTP Basic，凭据不进入反向代理的请求路径及查询参数日志。
    return {url:'https://calendar:'+token+'@accumulation93.com/api/calendarFeed',
      server:'https://accumulation93.com/api/calendarFeed',username:'calendar',password:token};
  });
}
function credential(header) {
  if (typeof header!=='string' || !/^Basic [A-Za-z0-9+/]+=*$/.test(header) || header.length>256) return '';
  const value=Buffer.from(header.slice(6),'base64').toString('utf8');
  return /^calendar:[A-Za-z0-9_-]{43}$/.test(value) ? value.slice(9) : '';
}
async function feed(header,now=Date.now()) {
  const token=credential(header);
  if (!token) throw new CalendarError('forbidden');
  return pool.withTransaction(async connection=>{
    const row=(await connection.query(`SELECT s.account_id,s.person_id FROM calendar_subscriptions s
      JOIN accounts a ON a.id=s.account_id AND a.person_id=s.person_id AND a.status='verified'
      JOIN persons p ON p.id=s.person_id AND p.status='active'
      WHERE s.token_hash=? AND s.revoked=0 FOR SHARE`,[hash(token)]))[0][0];
    if (!row) throw new CalendarError('forbidden');
    const contexts=await identity.listContexts(row.account_id,connection);
    const organizations=new Map();
    for (const context of contexts) if (context.organizationId && context.personId===row.person_id) organizations.set(context.organizationId,context);
    const items=new Map(),from=new Date(now-31*86400000).toISOString(),to=new Date(now+334*86400000).toISOString();
    for (const actor of organizations.values()) {
      for (const item of await calendar.listForActor(connection,actor,{from,to,export:true})) items.set(item.id+':'+item.occurrenceDate,item);
    }
    return ics.render([...items.values()],now);
  });
}
module.exports={manage,feed,credential};
