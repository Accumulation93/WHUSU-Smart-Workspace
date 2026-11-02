'use strict';
const ui=require('../../package-resources/locales/zh-CN/authorization');
const {callFunction,getErrorText}=require('../../../../utils/api');
const session=require('../../../../utils/orgSession');
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
Page({
  data:{ui,navTopPx:0,tone:'blue',rows:[],draft:{name:''},canCreate:false,ready:false,loading:false,busy:false,failed:false,saved:false,notice:''},
  onLoad:function(options){this._copyId=options&&options.copyKind==='hr.assignmentNatures'?options.copyId:'';this.onResize();},
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onShow:function(){this._visible=true;const state=session.consume(this);this.setData({tone:state.snapshot.role==='admin'?'admin':'blue'});this.load();},
  onHide:function(){this._visible=false;session.invalidateRequests(this);this.setData({rows:[],draft:{name:''},ready:false,busy:false});},
  onUnload:function(){this.onHide();},
  current:function(request){return this._visible&&session.isRequestCurrent(this,request);},
  reset:function(){if(!this.data.busy)this.setData({draft:{name:''},saved:false});},
  name:function(e){this.setData({'draft.name':e.detail.value});},
  edit:function(e){if(this.data.busy||this.data.loading||this.data.failed)return;const row=this.data.rows.find(item=>item.id===e.currentTarget.dataset.id);if(row&&row.canUpdate)this.setData({draft:{id:row.id,name:row.name,version:Number(row.version)},saved:false});},
  load:async function(){const request=session.beginRequest(this,'nature');this.setData({loading:true,failed:false,notice:''});try{const result=await callFunction({name:'listAssignmentNatures',data:{}});if(!this.current(request))return;if(result.status!=='success')throw result;this.setData({rows:result.list,canCreate:result.canCreate===true,ready:true,loading:false});if(this.data.saved)this.setData({draft:{name:''},saved:false});if(this._copyId){const id=this._copyId;this._copyId='';this.edit({currentTarget:{dataset:{id}}});}}catch(error){if(this.current(request))this.setData({failed:true,notice:getErrorText(error,ui.operationFailed)});}finally{if(this.current(request))this.setData({loading:false});}},
  write:async function(name,data){if(this.data.busy||this.data.loading||this.data.failed||this.data.saved)return;const request=session.beginRequest(this,'natureWrite');this.setData({busy:true,notice:''});try{const result=await callFunction({name,data});if(!this.current(request))return;if(result.status!=='success')throw result;this.setData({saved:true});await this.load();}catch(error){if(this.current(request))this.setData({notice:getErrorText(error,ui.operationFailed)});}finally{if(this.current(request))this.setData({busy:false});}},
  save:function(){if(this.data.draft.id?!this.data.rows.some(row=>row.id===this.data.draft.id&&row.canUpdate):!this.data.canCreate)return;return this.write('saveAssignmentNature',Object.assign({},this.data.draft));},
  remove:function(e){if(this.data.busy||this.data.loading||this.data.failed)return;const row=this.data.rows.find(item=>item.id===e.currentTarget.dataset.id);if(!row)return;const request=session.beginRequest(this,'natureConfirm');wx.showModal({title:ui.remove,content:row.name,confirmText:ui.remove,cancelText:ui.cancel,success:result=>{if(result.confirm&&this.current(request))this.write('deleteAssignmentNature',{id:row.id,version:Number(row.version)});}});}
});
