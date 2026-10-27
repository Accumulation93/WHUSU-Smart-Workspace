'use strict';
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const view=require('../../package-resources/utils/calendarView');
const time=require('../../../../utils/dateTime');
const {callFunction}=require('../../../../utils/api');
const orgSession=require('../../../../utils/orgSession');
const eventBus=require('../../../../utils/eventBus');
Page({
  data:{copy,common,navTopPx:0,navigationTitle:copy.title+' - '+common.brandName,loading:false,notice:'',selected:'',mode:'month',modes:['month','week','day','list'],query:'',source:'',sourceIndex:0,sources:['','manual','venue_booking','venue_activity'],sourceLabels:[copy.allSources,copy.manual,copy.venue_booking,copy.venue_activity],managed:false,metadata:{permissions:{},timezoneOffset:480},days:[],items:[],visibleItems:[]},
  onLoad:function(){
    this.setData({navTopPx:getNavigationBarMetrics().totalHeight});
    this._contextChanged=()=>{this.clear();if(this._visible)this.load();};
    eventBus.on('auth:contextChanged',this._contextChanged);eventBus.on('auth:selectionChanged',this._contextChanged);eventBus.on('org:changed',this._contextChanged);
    this.setData({selected:time.formatAbsoluteDate(new Date())});
  },
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onShow:function(){const contextChange=orgSession.consume(this);if(contextChange.changed)orgSession.invalidateRequests(this);this._visible=true;this.load();},
  onHide:function(){this._visible=false;this.clear();},
  onUnload:function(){this._visible=false;this.clear();eventBus.off('auth:contextChanged',this._contextChanged);eventBus.off('auth:selectionChanged',this._contextChanged);eventBus.off('org:changed',this._contextChanged);},
  clear:function(){orgSession.invalidateRequests(this);this._items=[];this.setData({items:[],visibleItems:[],days:[],notice:'',loading:false,metadata:{permissions:{},timezoneOffset:480}});},
  async load(){
    const request=orgSession.beginRequest(this,'calendar');const current=()=>this._visible&&orgSession.isRequestCurrent(this,request);
    this.setData({loading:true,notice:''});
    try{
      const config=await callFunction({name:'getCalendarConfiguration',data:{}});if(!current())return;
      if(config.status!=='success')throw new Error(config.message||copy.operationFailed);
      const range=view.period(this.data.selected,this.data.mode,config.timezoneOffset);
      const result=await callFunction({name:'getCalendar',data:Object.assign({},range,{managed:this.data.managed})});if(!current())return;
      if(result.status!=='success')throw new Error(result.message||copy.operationFailed);
      this._items=result.items.map(item=>Object.assign({},item,{key:item.id+':'+item.occurrenceDate,timeText:time.formatListTime(item.startAt,config.timezoneOffset/60)+' — '+time.formatListTime(item.endAt,config.timezoneOffset/60)}));
      this.setData({metadata:config,loading:false});this.render();
    }catch(error){if(current())this.setData({loading:false,notice:error.message||copy.operationFailed});}
  },
  render:function(){
    const query=this.data.query.trim().toLowerCase();
    const items=(this._items||[]).filter(item=>(!this.data.source||item.sourceKind===this.data.source)&&[item.title,item.location].join(' ').toLowerCase().includes(query));
    const days=view.days(this.data.selected,this.data.mode,this.data.metadata.timezoneOffset,items,time.formatAbsoluteDate(new Date())).map(day=>view.timeline(day,this.data.metadata.timezoneOffset));
    const day=days.find(item=>item.date===this.data.selected);
    this.setData({items,days,visibleItems:this.data.mode==='month'?(day?day.items:[]):items});
  },
  setMode:function(e){this.setData({mode:e.currentTarget.dataset.mode});this.load();},
  dateChange:function(e){this.setData({selected:e.detail.value});this.load();},
  selectDay:function(e){this.setData({selected:e.currentTarget.dataset.date});this.load();},
  navigate:function(e){this.setData({selected:view.move(this.data.selected,this.data.mode,Number(e.currentTarget.dataset.amount))});this.load();},
  today:function(){this.setData({selected:time.formatAbsoluteDate(new Date())});this.load();},
  search:function(e){this.setData({query:e.detail.value});this.render();},
  setSource:function(e){const sourceIndex=Number(e.detail.value);this.setData({sourceIndex,source:this.data.sources[sourceIndex]});this.render();},
  setManaged:function(e){this.setData({managed:Boolean(e.detail.value)});this.load();},
  create:function(){wx.navigateTo({url:'/subpackages/workspace/pages/calendarEdit/calendarEdit?date='+this.data.selected});},
  open:function(e){const {id,date}=e.currentTarget.dataset;wx.navigateTo({url:'/subpackages/workspace/pages/calendarDetail/calendarDetail?id='+encodeURIComponent(id)+'&date='+date+'&selected='+this.data.selected+'&mode='+this.data.mode});},
  rules:function(){wx.navigateTo({url:'/subpackages/workspace/pages/calendarRules/calendarRules'});},
  system:function(){wx.navigateTo({url:'/subpackages/workspace/pages/calendarSystem/calendarSystem'});}
});
