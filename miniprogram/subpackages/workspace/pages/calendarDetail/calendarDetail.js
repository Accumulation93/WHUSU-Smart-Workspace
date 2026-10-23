'use strict';
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const view=require('../../package-resources/utils/calendarView');
const time=require('../../../../utils/dateTime');
const {callFunction}=require('../../../../utils/api');
const orgSession=require('../../../../utils/orgSession');
const scopes=['instance','following','series'];
Page({
  data:{copy,common,navTopPx:0,navigationTitle:copy.title+' - '+common.appName,loading:false,busy:false,notice:'',detail:null,confirmation:false,action:'',scopeIndex:0,scopeLabels:scopes.map(scope=>copy[scope]),canAdd:false},
  onLoad:function(options){this._options=options;this.setData({navTopPx:getNavigationBarMetrics().totalHeight});let canAdd=false;try{const platform=wx.getDeviceInfo().platform;canAdd=['ios','android'].includes(platform)&&wx.canIUse('addPhoneCalendar');}catch(_){}this.setData({canAdd});},
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onShow:function(){const contextChange=orgSession.consume(this);if(contextChange.changed)orgSession.invalidateRequests(this);this._visible=true;this.load();},
  onHide:function(){this._visible=false;orgSession.invalidateRequests(this);this.setData({detail:null,confirmation:false,busy:false});},
  onUnload:function(){this._visible=false;orgSession.invalidateRequests(this);},
  async load(){
    const request=orgSession.beginRequest(this,'detail'),current=()=>this._visible&&orgSession.isRequestCurrent(this,request);this.setData({loading:true,notice:''});
    try{const config=await callFunction({name:'getCalendarConfiguration',data:{}});if(!current())return;if(config.status!=='success')throw new Error(config.message||copy.operationFailed);
      const range=view.period(this._options.selected||this._options.date,this._options.mode||'week',config.timezoneOffset);
      const result=await callFunction({name:'getCalendar',data:Object.assign({},range,{managed:true,detailId:this._options.id,occurrenceDate:this._options.date})});if(!current())return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);
      const detail=result.items.find(item=>item.id===this._options.id&&item.occurrenceDate===this._options.date);if(!detail)throw new Error(copy.unavailable);
      detail.timeText=time.formatListTime(detail.startAt,config.timezoneOffset/60)+' — '+time.formatListTime(detail.endAt,config.timezoneOffset/60);
      detail.participants=(detail.participants||[]).map(person=>({name:person.name,personReference:person.personReference||'',positions:person.positions.map(position=>[position.identityCategory,position.department,position.workGroup].filter(Boolean).join(' · '))}));
      this.setData({detail,loading:false});
    }catch(error){if(current())this.setData({loading:false,notice:error.message||copy.operationFailed});}
  },
  edit:function(){const item=this.data.detail;if(item)wx.navigateTo({url:'/subpackages/workspace/pages/calendarEdit/calendarEdit?id='+item.id+'&date='+item.occurrenceDate});},
  confirm:function(e){if(!this.data.busy)this.setData({confirmation:true,action:e.currentTarget.dataset.action,scopeIndex:0});},
  close:function(){if(!this.data.busy)this.setData({confirmation:false});},
  scope:function(e){this.setData({scopeIndex:Number(e.detail.value)});},
  noop:function(){},
  async execute(){
    if(this.data.busy||!this.data.detail)return;const item=this.data.detail;const request=orgSession.beginRequest(this,'change'),current=()=>this._visible&&orgSession.isRequestCurrent(this,request);this.setData({busy:true,notice:''});
    try{const result=await callFunction({name:'changeCalendarParticipation',data:{id:item.id,version:item.version,occurrenceDate:item.occurrenceDate,scope:scopes[this.data.scopeIndex],action:this.data.action}});if(!current())return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);this.setData({busy:false,confirmation:false});wx.navigateBack();}
    catch(error){if(current())this.setData({busy:false,notice:error.message||copy.operationFailed});}
  },
  addPhone:function(){
    const item=this.data.detail;if(!item||!this.data.canAdd)return;
    wx.addPhoneCalendar({title:item.title,startTime:Math.floor(Date.parse(item.startAt)/1000),endTime:String(Math.floor(Date.parse(item.endAt)/1000)),allDay:item.allDay,
      description:item.description||'',location:item.location||'',alarm:(item.reminders||[]).length>0,alarmOffset:((item.reminders||[])[0]||0)*60,
      success:()=>{if(this._visible)this.setData({notice:copy.added});},fail:()=>{if(this._visible)this.setData({notice:copy.unsupported});}});
  }
});
