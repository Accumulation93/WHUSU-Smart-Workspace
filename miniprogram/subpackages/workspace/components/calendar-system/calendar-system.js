'use strict';
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const {callFunction}=require('../../../../utils/api');
const orgSession=require('../../../../utils/orgSession');
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{options:{type:Object,value:{}}},
  lifetimes:{attached:function(){this.initialize();this.resume();},detached:function(){this.dispose();}},
  pageLifetimes:{show:function(){if(!this._visible)this.resume();},hide:function(){this.suspend();}},
  observers:{
    'busy':function(){this.triggerEvent('statechange',{locked:Boolean(this.data.busy)});},
    'confirmation':function(){this.triggerEvent('dialogchange',{visible:Boolean(this.data.confirmation)});}
  },
  data:{copy,common,navTopPx:0,navigationTitle:copy.systemCalendar+' - '+common.brandName,busy:false,notice:'',subscription:null,confirmation:false,action:'create'},
  methods:{
  initialize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  resume:function(){const contextChange=orgSession.consume(this);if(contextChange.changed)orgSession.invalidateRequests(this);this._visible=true;},
  suspend:function(){this._visible=false;orgSession.invalidateRequests(this);this.setData({subscription:null,confirmation:false,notice:''});},
  dispose:function(){this._disposed=true;this._visible=false;orgSession.invalidateRequests(this);},
  ask:function(e){if(!this.data.busy)this.setData({confirmation:true,action:e.currentTarget.dataset.action});},
  close:function(){if(!this.data.busy)this.setData({confirmation:false});},
  noop:function(){},
  async execute(){
    if(this._writeInFlight||this.data.busy||!this.data.confirmation)return;
    const action=this.data.action,request=orgSession.beginRequest(this,'subscription'),contextId=orgSession.getSnapshot().contextId;
    this._writeInFlight=true;this.setData({busy:true,notice:''});
    try{
      const result=await callFunction({name:'manageCalendarSubscription',data:{action}});
      if(this._disposed||contextId!==orgSession.getSnapshot().contextId)return;
      if(result.status!=='success')throw new Error(result.message||copy.operationFailed);
      const current=this._visible&&orgSession.isRequestCurrent(this,request);
      this.setData({confirmation:false,subscription:current&&action!=='revoke'?result:null,notice:action==='revoke'?copy.subscriptionRevoked:copy.subscriptionCreated});
    }catch(error){if(!this._disposed&&contextId===orgSession.getSnapshot().contextId)this.setData({notice:error.message||copy.operationFailed});}
    finally{this._writeInFlight=false;if(!this._disposed)this.setData({busy:false});}
  },
  copy:function(e){const item=this.data.subscription,key=e.currentTarget.dataset.key;if(item&&['url','server','username','password'].includes(key))wx.setClipboardData({data:item[key]});}
  }
});
