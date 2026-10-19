'use strict';
const copy=require('../../../../locales/zh-CN/calendar');
const common=require('../../../../locales/zh-CN/common');
const {callFunction}=require('../../../../utils/api');
const session=require('../../../../utils/orgSession');
Page({
  data:{copy,common,loading:false,busy:false,failed:false,saved:false,notice:'',metadata:{},rules:[],draft:null,pickerVisible:false,confirmation:false,selected:[],selectedNames:[],actions:[{key:'assign',label:copy.assign},{key:'update',label:copy.update},{key:'cancel',label:copy.cancelAction}]},
  onLoad:function(){wx.setNavigationBarTitle({title:copy.ruleManage+' - '+common.appName});},
  onShow:function(){this._visible=true;this.load();},
  onHide:function(){this._visible=false;session.invalidateRequests(this);this.setData({metadata:{},rules:[],draft:null,selected:[],confirmation:false,pickerVisible:false,busy:false});},
  onUnload:function(){this._visible=false;session.invalidateRequests(this);},
  async load(){const request=session.beginRequest(this,'rules');this.setData({loading:true,failed:false,notice:''});try{const result=await callFunction({name:'getCalendarRules',data:{}});if(!this._visible||!session.isRequestCurrent(this,request))return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);this.setData({metadata:result,rules:result.rules.map(rule=>Object.assign({},rule,{selected:false})),selected:[],loading:false,draft:null,saved:false});}catch(error){if(this._visible&&session.isRequestCurrent(this,request))this.setData({loading:false,failed:true,notice:error.message||copy.operationFailed});}},
  create:function(){if(!this.data.busy&&!this.data.failed)this.setDraft({name:'',enabled:true,audience:[{type:'people',personIds:[]}],targets:[{type:'self'}],actions:['assign']});},
  setDraft:function(draft){this.setData({draft,actions:this.data.actions.map(action=>Object.assign({},action,{selected:draft.actions.includes(action.key)})),saved:false});},
  edit:function(e){if(this.data.busy||this.data.failed)return;const rule=this.data.rules.find(item=>item.id===e.currentTarget.dataset.id);if(rule)this.setDraft(JSON.parse(JSON.stringify(rule)));},
  duplicate:function(e){if(this.data.busy||this.data.failed)return;const rule=this.data.rules.find(item=>item.id===e.currentTarget.dataset.id);if(rule){const draft=JSON.parse(JSON.stringify(rule));delete draft.id;delete draft.version;this.setDraft(draft);}},
  closeEditor:function(){if(!this.data.busy)this.setData({draft:null});},
  name:function(e){this.setData({'draft.name':e.detail.value});},
  enabled:function(e){this.setData({'draft.enabled':Boolean(e.detail.value)});},
  conditions:function(e){const key=e.currentTarget.dataset.key;if(['audience','targets'].includes(key))this.setData({['draft.'+key]:e.detail.value});},
  picker:function(e){this.setData({pickerVisible:e.detail.visible});},
  action:function(e){if(this.data.busy||this.data.saved)return;const key=e.currentTarget.dataset.key,values=this.data.draft.actions;this.setDraft(Object.assign({},this.data.draft,{actions:values.includes(key)?values.filter(value=>value!==key):values.concat(key)}));},
  select:function(e){if(this.data.busy)return;const id=e.currentTarget.dataset.id,selected=this.data.selected.includes(id)?this.data.selected.filter(value=>value!==id):this.data.selected.concat(id);this.setData({selected,rules:this.data.rules.map(rule=>Object.assign({},rule,{selected:selected.includes(rule.id)}))});},
  askDelete:function(){if(this.data.busy||!this.data.selected.length)return;this._pending=this.data.rules.filter(rule=>this.data.selected.includes(rule.id)).map(rule=>({id:rule.id,version:rule.version}));this.setData({confirmation:true,selectedNames:this.data.rules.filter(rule=>this.data.selected.includes(rule.id)).map(rule=>rule.name)});},
  close:function(){if(!this.data.busy)this.setData({confirmation:false});},
  noop:function(){},
  async save(){if(this.data.busy||this.data.saved||this.data.failed)return;await this.write('saveCalendarRule',this.data.draft);},
  async toggle(e){const rule=this.data.rules.find(item=>item.id===e.currentTarget.dataset.id);if(rule&&!this.data.busy&&!this.data.failed)await this.write('batchCalendarRules',{action:rule.enabled?'disable':'enable',rules:[{id:rule.id,version:rule.version}]});},
  async remove(){if(!this.data.busy&&this.data.confirmation)await this.write('batchCalendarRules',{action:'delete',rules:this._pending});},
  async write(name,data){const request=session.beginRequest(this,'rulesWrite');this.setData({busy:true,notice:''});try{const result=await callFunction({name,data});if(!this._visible||!session.isRequestCurrent(this,request))return;if(result.status!=='success')throw new Error(result.message||copy.operationFailed);this.setData({saved:true,confirmation:false,busy:false});await this.load();}catch(error){if(this._visible&&session.isRequestCurrent(this,request))this.setData({busy:false,notice:error.message||copy.operationFailed});}}
});
