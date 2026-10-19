'use strict';
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const {callFunction}=require('../../../../utils/api');
const session=require('../../../../utils/orgSession');
Page({
  data:{copy,common,busy:false,notice:'',subscription:null,confirmation:false,action:'create'},
  onLoad:function(){wx.setNavigationBarTitle({title:copy.systemCalendar+' - '+common.appName});},
  onShow:function(){this._visible=true;},
  onHide:function(){this._visible=false;session.invalidateRequests(this);this.setData({subscription:null,confirmation:false,busy:false,notice:''});},
  onUnload:function(){this._visible=false;session.invalidateRequests(this);},
  ask:function(e){if(!this.data.busy)this.setData({confirmation:true,action:e.currentTarget.dataset.action});},
  close:function(){if(!this.data.busy)this.setData({confirmation:false});},
  noop:function(){},
  async execute(){
    if(this.data.busy)return;const action=this.data.action,request=session.beginRequest(this,'subscription');this.setData({busy:true,notice:''});
    try{const result=await callFunction({name:'manageCalendarSubscription',data:{action}});if(!this._visible||!session.isRequestCurrent(this,request))return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);this.setData({busy:false,confirmation:false,subscription:action==='revoke'?null:result,notice:action==='revoke'?copy.subscriptionRevoked:copy.subscriptionCreated});}
    catch(error){if(this._visible&&session.isRequestCurrent(this,request))this.setData({busy:false,notice:error.message||copy.operationFailed});}
  },
  copy:function(e){const item=this.data.subscription,key=e.currentTarget.dataset.key;if(item&&['url','server','username','password'].includes(key))wx.setClipboardData({data:item[key]});}
});
