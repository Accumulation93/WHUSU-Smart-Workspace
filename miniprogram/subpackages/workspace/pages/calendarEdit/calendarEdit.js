'use strict';
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const view=require('../../package-resources/utils/calendarView');
const time=require('../../../../utils/dateTime');
const {callFunction}=require('../../../../utils/api');
const orgSession=require('../../../../utils/orgSession');
const frequencies=['none','daily','weekly','monthly','yearly'],scopes=['instance','following','series'],reminders=[-1,0,5,15,30,60,1440];
Page({
  data:{copy,common,navTopPx:0,navigationTitle:copy.edit+' - '+common.brandName,loading:true,busy:false,saved:false,failed:false,notice:'',draft:view.blank('2026-01-01'),metadata:{},sourceKind:'',pickerVisible:false,
    frequencyIndex:0,frequencyLabels:frequencies.map(value=>copy[value]),scopeIndex:0,scopeLabels:scopes.map(value=>copy[value]),
    reminderIndex:3,reminderLabels:[copy.reminderNone,copy.reminderStart,copy.reminderFive,copy.reminderFifteen,copy.reminderThirty,copy.reminderHour,copy.reminderDay],endMode:0,endModes:[copy.unlimited,copy.byDate,copy.byCount],weekdays:[]},
  onLoad:function(options){this._options=options;this.setData({navTopPx:getNavigationBarMetrics().totalHeight});this.setData({sourceKind:options.sourceKind||'',draft:view.blank(options.date||time.formatAbsoluteDate(new Date()))});},
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onShow:function(){const contextChange=orgSession.consume(this);if(contextChange.changed)orgSession.invalidateRequests(this);this._visible=true;if(contextChange.changed){this._loaded=false;this._original=null;this.setData({draft:view.blank(this._options.date||time.formatAbsoluteDate(new Date())),metadata:{},saved:false,busy:false});}if(!this._loaded)this.load();},
  onHide:function(){this._visible=false;orgSession.invalidateRequests(this);if(this.data.busy)this._loaded=false;this.setData({pickerVisible:false,busy:false,loading:false});},
  onUnload:function(){this._visible=false;orgSession.invalidateRequests(this);this._original=null;},
  async load(){
    const request=orgSession.beginRequest(this,'calendarEdit'),current=()=>this._visible&&orgSession.isRequestCurrent(this,request);
    this.setData({loading:true,failed:false,notice:''});
    try{
      const config=await callFunction({name:'getCalendarConfiguration',data:{}});if(!current())return;if(config.status!=='success')throw new Error(config.message||copy.operationFailed);
      let draft=this.data.draft;
      if(this._options.sourceKind){const result=await callFunction({name:'getCalendarParticipants',data:{sourceKind:this._options.sourceKind,sourceId:this._options.sourceId,edit:true}});if(!current())return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);draft=Object.assign({},draft,{targets:result.targets,version:result.version});if(result.people)config.people=result.people;}
      else if(this._options.id){const result=await callFunction({name:'getCalendar',data:Object.assign({},view.period(this._options.date,'week',config.timezoneOffset),{managed:true,detailId:this._options.id,occurrenceDate:this._options.date})});if(!current())return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);const item=result.items.find(value=>value.id===this._options.id&&value.occurrenceDate===this._options.date);if(!item||!item.canUpdate)throw new Error(copy.unavailable);this._original=item;draft=view.edit(item,config.timezoneOffset);}
      this._loaded=true;this._context=orgSession.getSnapshot().contextId;
      this.setData({draft,metadata:config,loading:false,frequencyIndex:frequencies.indexOf(draft.recurrence.frequency),scopeIndex:scopes.indexOf(draft.scope),reminderIndex:Math.max(0,reminders.indexOf(draft.reminders[0]===undefined?-1:draft.reminders[0])),endMode:draft.recurrence.until?1:draft.recurrence.count?2:0});this.decorate();
    }catch(error){if(current())this.setData({loading:false,failed:true,notice:error.message||copy.operationFailed});}
  },
  decorate:function(){this.setData({weekdays:copy.weekdays.map((label,index)=>({label,value:index+1,selected:(this.data.draft.recurrence.weekdays||[]).includes(index+1)}))});},
  field:function(e){if(this.data.busy||this.data.saved)return;const field=e.currentTarget.dataset.field;const allowed=['title','description','location','startDate','endDate','startTime','endTime'];if(allowed.includes(field))this.setData({['draft.'+field]:e.detail.value});},
  allDay:function(e){const allDay=Boolean(e.detail.value),patch={'draft.allDay':allDay};if(allDay&&this.data.draft.endDate<=this.data.draft.startDate)patch['draft.endDate']=view.addDays(this.data.draft.startDate,1);this.setData(patch);},
  visibility:function(e){this.setData({'draft.visibility':e.detail.value?'organization':'private'});},
  frequency:function(e){const index=Number(e.detail.value);this.setData({frequencyIndex:index,'draft.recurrence.frequency':frequencies[index]});},
  ruleField:function(e){const key=e.currentTarget.dataset.field;if(['interval','count','until'].includes(key))this.setData({['draft.recurrence.'+key]:key==='until'?e.detail.value:Number(e.detail.value)});},
  weekday:function(e){if(this.data.busy||(this.data.draft.id&&this.data.draft.scope!=='series'))return;const value=Number(e.currentTarget.dataset.value),values=this.data.draft.recurrence.weekdays||[];this.setData({'draft.recurrence.weekdays':values.includes(value)?values.filter(item=>item!==value):values.concat(value)});this.decorate();},
  endMode:function(e){this.setData({endMode:Number(e.detail.value)});},
  reminder:function(e){this.setData({reminderIndex:Number(e.detail.value)});},
  scope:function(e){const scopeIndex=Number(e.detail.value),scope=scopes[scopeIndex],patch={scopeIndex,'draft.scope':scope};if(scope==='series'&&this._original&&this._original.seriesForm){const form=this._original.seriesForm;['startDate','endDate','startTime','endTime'].forEach(key=>{patch['draft.'+key]=form[key];});}this.setData(patch);},
  targets:function(e){this.setData({'draft.targets':e.detail.value});},
  picker:function(e){this.setData({pickerVisible:e.detail.visible});},
  back:function(){if(!this.data.busy)wx.navigateBack();},
  async save(){
    if(this.data.busy||this.data.loading||this.data.saved||this.data.failed)return;
    if(orgSession.getSnapshot().contextId!==this._context){this._loaded=false;this.load();return;}
    const request=orgSession.beginRequest(this,'calendarSave'),current=()=>this._visible&&orgSession.isRequestCurrent(this,request);this.setData({busy:true,notice:''});
    try{
      const body=JSON.parse(JSON.stringify(this.data.draft));
      if(this.data.sourceKind){body.sourceKind=this.data.sourceKind;body.sourceId=this._options.sourceId;}
      else{const reminder=reminders[this.data.reminderIndex];body.reminders=reminder<0?[]:[reminder];if(this.data.endMode!==1)delete body.recurrence.until;if(this.data.endMode!==2)delete body.recurrence.count;if(body.recurrence.frequency!=='weekly')body.recurrence.weekdays=[];}
      if(!this.data.sourceKind&&!body.id){const payload=JSON.stringify(body);if(payload!==this._lastPayload){this._lastPayload=payload;this._requestId='calendar-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}body.clientRequestId=this._requestId;}
      const result=await callFunction({name:this.data.sourceKind?'saveCalendarParticipants':'saveCalendarEvent',data:body});if(!current())return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);
      this.setData({saved:true,busy:false});wx.navigateBack();
    }catch(error){if(current())this.setData({busy:false,notice:error.message||copy.operationFailed});}
  }
});
