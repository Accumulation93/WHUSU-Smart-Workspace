'use strict';
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const view=require('../../package-resources/utils/calendarView');
const time=require('../../../../utils/dateTime');
const timeCopy=require('../../../../locales/zh-CN/time');
const messageCopy=require('../../../../locales/zh-CN/messageFacts');
const {callFunction,createResultError,getErrorText}=require('../../../../utils/api');
const orgSession=require('../../../../utils/orgSession');
const eventBus=require('../../../../utils/eventBus');
Page({
  data:{copy,common,navTopPx:0,navigationTitle:copy.title+' - '+common.brandName,loading:false,notice:'',selected:'',mode:'month',modes:['month','week','day','list'],query:'',source:'',sourceIndex:0,sources:['','manual','venue_booking','venue_activity'],sourceLabels:[copy.allSources,copy.manual,copy.venue_booking,copy.venue_activity],managed:false,metadata:{permissions:{},timezoneOffset:480},days:[],items:[],visibleItems:[]},
  onLoad:function(options){
    this._entryOptions=options||{};
    this._openRuleManagement=options&&(options.area==='management'||options.area==='rules');
    this.setData({activeTab:options&&options.area==='system'?'system':'calendar',editorOptions:null,detailOptions:null,panelLocked:false,panelDialog:false,rulesOptions:options||{}});
    this.setData({navTopPx:getNavigationBarMetrics().totalHeight});
    this._contextChanged=()=>{if(orgSession.consume(this).changed){this._entryOptions=null;this._openRuleManagement=false;this.clear();if(this._visible)this.load();}};
    eventBus.on('auth:contextChanged',this._contextChanged);eventBus.on('auth:selectionChanged',this._contextChanged);eventBus.on('org:changed',this._contextChanged);
    this.setData({selected:options&&(options.selected||options.date)||time.formatAbsoluteDate(new Date()),mode:options&&this.data.modes.includes(options.mode)?options.mode:'month'});
  },
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onShow:function(){if(orgSession.consume(this).changed){if(this._hasShown){this._entryOptions=null;this._openRuleManagement=false;}this.clear();}this._hasShown=true;this._visible=true;this.load();},
  onHide:function(){this._visible=false;orgSession.invalidateRequests(this);if(this.data.loading)this.setData({loading:false});},
  onUnload:function(){this._visible=false;this.clear();eventBus.off('auth:contextChanged',this._contextChanged);eventBus.off('auth:selectionChanged',this._contextChanged);eventBus.off('org:changed',this._contextChanged);},
  clear:function(){orgSession.invalidateRequests(this);this._items=[];this._listKey=null;this.setData({items:[],visibleItems:[],days:[],notice:'',loading:false,listReady:false,managed:false,activeTab:'calendar',editorOptions:null,detailOptions:null,rulesOptions:{},panelLocked:false,panelDialog:false,metadata:{permissions:{},timezoneOffset:480}});},
  async load(){
    const request=orgSession.beginRequest(this,'calendar');const current=()=>this._visible&&orgSession.isRequestCurrent(this,request);
    this.setData({loading:true,notice:'',listReady:false});
    const listKey=[this.data.selected,this.data.mode,this.data.managed,this.data.metadata.timezoneOffset].join(':');
    if(this._listKey!==listKey){this._items=[];this.render();}
    try{
      const config=await callFunction({name:'getCalendarConfiguration',data:{}});if(!current())return;
      if(config.status!=='success')throw createResultError(config,copy.operationFailed);
      this.setData({metadata:config});
      if(this.data.managed&&!(config.permissions&&config.permissions.manage)){this._items=[];this.setData({managed:false,items:[],visibleItems:[],days:[]});}
      if(this._entryOptions&&this._entryOptions.area==='system'){this._entryOptions=null;this.setData({activeTab:'system'});}
      const openRuleManagement=this._openRuleManagement;
      this._openRuleManagement=false;
      if(openRuleManagement&&config.permissions&&config.permissions.rules){
        this.setData({activeTab:'rules',rulesOptions:this._entryOptions||{}});this._entryOptions=null;
      }
      if(this.data.activeTab==='rules'&&!(config.permissions&&config.permissions.rules))this.setData({activeTab:'calendar',panelLocked:false,panelDialog:false});
      if(this._entryOptions&&this._entryOptions.area==='edit'){const editorOptions=this._entryOptions;this._entryOptions=null;this.setData({activeTab:'calendar',editorOptions});}
      if(this._entryOptions&&this._entryOptions.area==='detail'){const detailOptions=this._entryOptions;this._entryOptions=null;this.setData({activeTab:'calendar',detailOptions});}
      if(this.data.activeTab!=='calendar'||this.data.editorOptions){this.setData({loading:false});return;}
      const range=view.period(this.data.selected,this.data.mode,config.timezoneOffset);
      const result=await callFunction({name:'getCalendar',data:Object.assign({},range,{managed:this.data.managed})});if(!current())return;
      if(result.status!=='success')throw createResultError(result,copy.operationFailed);
      this._items=result.items.map(item=>Object.assign({},item,{key:item.id+':'+item.occurrenceDate,timeText:view.timeText(item,config.timezoneOffset,time,timeCopy,messageCopy)}));
      this._listKey=[this.data.selected,this.data.mode,this.data.managed,config.timezoneOffset].join(':');
      this.setData({loading:false,listReady:true});this.render();
    }catch(error){if(current()){
      if(['authorization_forbidden','forbidden'].includes(error.code||error.status))this.clear();
      this.setData({loading:false,notice:getErrorText(error,copy.operationFailed)});
    }}
  },
  render:function(){
    const query=this.data.query.trim().toLowerCase();
    const items=(this._items||[]).filter(item=>(!this.data.source||item.sourceKind===this.data.source)&&[item.title,item.location].join(' ').toLowerCase().includes(query));
    const days=view.days(this.data.selected,this.data.mode,this.data.metadata.timezoneOffset,items,time.formatAbsoluteDate(new Date())).map(day=>Object.assign(view.timeline(day,this.data.metadata.timezoneOffset),{accessibleLabel:copy.calendarDayLabel.replace('{date}',day.date).replace('{count}',String(day.items.length))}));
    const day=days.find(item=>item.date===this.data.selected);
    const visibleItems=this.data.mode==='month'?(day?day.items:[]):items;
    this.setData({items,days,visibleItems,resultsHeading:this.data.mode==='list'?this.data.selected.slice(0,7):this.data.selected,scheduleCount:copy.scheduleCount.replace('{count}',String(visibleItems.length))});
  },
  setMode:function(e){this.setData({mode:e.currentTarget.dataset.mode});this.load();},
  dateChange:function(e){this.setData({selected:e.detail.value});this.load();},
  selectDay:function(e){this.setData({selected:e.currentTarget.dataset.date});this.load();},
  navigate:function(e){this.setData({selected:view.move(this.data.selected,this.data.mode,Number(e.currentTarget.dataset.amount))});this.load();},
  today:function(){this.setData({selected:time.formatAbsoluteDate(new Date())});this.load();},
  search:function(e){this.setData({query:e.detail.value});this.render();},
  setSource:function(e){const sourceIndex=Number(e.detail.value);this.setData({sourceIndex,source:this.data.sources[sourceIndex]});this.render();},
  setManaged:function(e){const managed=Number(e.detail.value)===1;if(managed&&!this.data.metadata.permissions.manage)return;if(managed===this.data.managed)return;this._items=[];this.setData({managed,items:[],visibleItems:[],days:[],listReady:false});this.load();},
  create:function(){if(!this.data.loading)this.setData({editorOptions:{date:this.data.selected},panelDialog:false});},
  open:function(e){const {id,date}=e.currentTarget.dataset;this.setData({detailOptions:{id,date,selected:this.data.selected,mode:this.data.mode,managed:this.data.managed}});},
  closeDetail:function(){this.setData({detailOptions:null});},
  detailChanged:function(){this.closeDetail();this.load();},
  editDetail:function(e){this.setData({detailOptions:null,editorOptions:e.detail});},
  switchTab:function(e){
    const tab=e.currentTarget.dataset.tab;
    if(this.data.editorOptions||this.data.detailOptions||this.data.panelLocked||!['calendar','rules','system'].includes(tab)||tab===this.data.activeTab)return;
    if(tab==='rules'&&!this.data.metadata.permissions.rules)return;
    orgSession.invalidateRequests(this);
    this.setData({activeTab:tab,panelDialog:false,notice:'',loading:false});
    if(tab==='calendar')this.load();
  },
  panelState:function(e){this.setData({panelLocked:Boolean(e.detail.locked)});},
  consumeRulesEntry:function(){this.setData({rulesOptions:{}});},
  panelDialog:function(e){this.setData({panelDialog:Boolean(e.detail.visible)});},
  closeEditor:function(){this.setData({editorOptions:null,panelLocked:false,panelDialog:false});this.load();},
  rules:function(){this.switchTab({currentTarget:{dataset:{tab:'rules'}}});},
  system:function(){this.switchTab({currentTarget:{dataset:{tab:'system'}}});}
});
