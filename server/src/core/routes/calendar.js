'use strict';
const router=require('express').Router();
const model=require('../models/calendar');
const {CalendarError}=require('../services/calendarRecurrence');
const {DirectoryError}=require('../services/contactDirectoryPolicy');
const {getAuthenticatedContext}=require('../services/authenticatedContext');
const {requireAdminOrganizationPermission,AdminOrganizationAccessError}=require('../services/adminOrganizationAccess');
const adminModel=require('../models/adminInfo');
const {loadEffectivePermissions,hasAnyPermission}=require('../services/adminPermissions');
const copy=require('../../locales/zh-CN/calendar');
const ics=require('../services/calendarIcs');
const subscription=require('../models/calendarSubscription');
function authorization(req,actor) {
  return async (connection,action)=>{
    if (action==='rules') await requireAdminOrganizationPermission(req,actor.organizationId,['calendar.rules.manage'],connection);
    const account=(await connection.query("SELECT a.id FROM accounts a JOIN persons p ON p.id=a.person_id AND p.status='active' WHERE a.id=? AND a.person_id=? AND a.status='verified' FOR SHARE",[req.authAccount.id,actor.personId]))[0][0];
    if (!account) throw new CalendarError('forbidden');
    const result={manage:false,rules:false,venueBookings:false,venueResources:false};
    if (actor.role!=='admin') return result;
    const admin=await adminModel.getActiveGrantForAccountInOrganization(req.authAccount.id,actor.personId,actor.organizationId,connection,true);
    if (!admin) throw new CalendarError('forbidden');
    const effective=await loadEffectivePermissions(admin,actor.organizationId,connection);
    result.manage=hasAnyPermission(effective,['calendar.manage']);
    result.rules=hasAnyPermission(effective,['calendar.rules.manage']);
    result.venueBookings=hasAnyPermission(effective,['venue.bookings']);
    result.venueResources=hasAnyPermission(effective,['venue.resources']);
    return result;
  };
}
function handler(work) {
  return async (req,res)=>{
    try {
      const actor=getAuthenticatedContext(req);
      if (!actor) return res.status(401).json({status:'unauthorized',message:copy.forbidden});
      const data=await work(req.body || {},actor,authorization(req,actor),req);
      res.json(Object.assign({status:'success'},data));
    } catch (error) {
      if (error instanceof CalendarError || error instanceof DirectoryError) return res.json({status:'calendar_'+error.code,message:copy[error.code] || copy.operationFailed});
      if (error instanceof AdminOrganizationAccessError) return res.status(403).json({status:'forbidden',message:copy.forbidden});
      console.error('[calendar]',error.code || error.name);
      res.status(500).json({status:'error',message:copy.operationFailed});
    }
  };
}
router.post('/getCalendarConfiguration',handler((body,actor,authorize)=>model.configuration(actor,authorize)));
router.post('/getCalendarRules',handler((body,actor,authorize)=>model.configuration(actor,authorize,true)));
router.post('/saveCalendarRule',handler(async(body,actor,authorize)=>({rule:await model.saveRule(body,actor,authorize)})));
router.post('/batchCalendarRules',handler((body,actor,authorize)=>model.batchRules(body,actor,authorize)));
router.post('/getCalendar',handler((body,actor,authorize)=>model.list(body,actor,authorize)));
router.post('/saveCalendarEvent',handler((body,actor,authorize)=>model.save(body,actor,authorize)));
router.post('/changeCalendarParticipation',handler((body,actor,authorize)=>model.mutate(body,actor,authorize)));
router.post('/saveCalendarParticipants',handler((body,actor,authorize)=>model.saveParticipants(body,actor,authorize)));
router.post('/getCalendarParticipants',handler((body,actor,authorize)=>model.getParticipants(body,actor,authorize)));
router.post('/exportCalendar',handler(async(body,actor,authorize)=>{
  const result=await model.list({from:body.from,to:body.to,export:true,detailId:body.id,occurrenceDate:body.occurrenceDate},actor,authorize);
  const items=body.id ? result.items.filter(item=>item.id===body.id && item.occurrenceDate===body.occurrenceDate) : result.items;
  if (body.id && !items.length) throw new CalendarError('unavailable');
  return {content:ics.render(items),fileName:'calendar.ics'};
}));
router.post('/manageCalendarSubscription',handler((body,actor,authorize,req)=>subscription.manage(body,actor,req.authAccount.id,authorize)));
router.get('/calendarFeed',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try { res.type('text/calendar; charset=utf-8').send(await subscription.feed(req.get('Authorization'))); }
  catch(error) {
    if (error instanceof CalendarError) return res.set('WWW-Authenticate','Basic realm="Calendar", charset="UTF-8"').status(401).send(copy.subscriptionRevoked);
    console.error('[calendar-feed]',error.code || error.name);
    res.status(503).send(copy.operationFailed);
  }
});
module.exports=router;
