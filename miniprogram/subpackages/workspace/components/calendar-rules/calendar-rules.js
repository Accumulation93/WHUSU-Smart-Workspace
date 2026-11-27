'use strict';
const {getNavigationBarMetrics}=require('../../../../utils/navigationBarMetrics');
const copy=require('../../../../locales/zh-CN/calendar');
const controls=require('../../package-resources/locales/zh-CN/controlLayout');
const relations=require('../../../../locales/zh-CN/identityNatureRelations');
const common=require('../../../../locales/zh-CN/common');
const {callFunction}=require('../../../../utils/api');
const orgSession=require('../../../../utils/orgSession');
const ruleAllows = (page, id, action) => page.data.rules.some(rule => rule.id === id && rule[action]);
const canSaveDraft = (page, draft) => draft.id ? ruleAllows(page, draft.id, 'canUpdate') : page.data.canCreate;
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{options:{type:Object,value:{}}},
  lifetimes:{attached:function(){this.initialize(this.properties.options);this.resume();},detached:function(){this.dispose();}},
  pageLifetimes:{show:function(){if(!this._visible)this.resume();},hide:function(){this.suspend();}},
  observers:{
    'draft,busy':function(){this.triggerEvent('statechange',{locked:Boolean(this.data.draft||this.data.busy)});},
    'pickerVisible,confirmation':function(){this.triggerEvent('dialogchange',{visible:Boolean(this.data.pickerVisible||this.data.confirmation)});}
  },
  data:{copy,controls,common,navTopPx:0,navigationTitle:copy.ruleManage+' - '+common.brandName,loading:false,busy:false,failed:false,saved:false,notice:'',metadata:{},rules:[],canCreate:false,hasDeletableRules:false,draft:null,pickerVisible:false,confirmation:false,selected:[],selectedNames:[],actions:[{key:'assign',label:copy.assign},{key:'update',label:copy.update},{key:'cancel',label:copy.cancelAction}]},
  methods:{
  initialize:function(options){this._copyId=options&&options.copyKind==='calendar.rules'&&/^[A-Za-z0-9_-]{1,64}$/.test(options.copyId||'')?options.copyId:'';this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  onResize:function(){this.setData({navTopPx:getNavigationBarMetrics().totalHeight});},
  resume:function(){const contextChange=orgSession.consume(this);if(contextChange.changed)orgSession.invalidateRequests(this);this._visible=true;if(contextChange.changed){this.setData({draft:null,metadata:{},rules:[],canCreate:false,hasDeletableRules:false,selected:[]});}if(!this.data.draft&&!this.data.busy)this.load();},
  suspend:function(){this._visible=false;orgSession.invalidateRequests(this);this.setData({confirmation:false,pickerVisible:false});},
  dispose:function(){this._disposed=true;this._visible=false;orgSession.invalidateRequests(this);},
  async load(){
    const request=orgSession.beginRequest(this,'rules');this.setData({loading:true,failed:false,notice:''});
    try{
      const result=await callFunction({name:'getCalendarRules',data:{}});
      if(!this._visible||!orgSession.isRequestCurrent(this,request))return;
      if(result.status!=='success')throw new Error(result.message||copy.operationFailed);
      const rules=result.rules.map(rule=>Object.assign({},rule,{selected:false,canUpdate:rule.canUpdate!==false,canDelete:rule.canDelete!==false}));
      this.setData({metadata:result,rules,canCreate:result.canCreate!==false,hasDeletableRules:rules.some(rule=>rule.canDelete),selected:[],loading:false,draft:null,saved:false});
      if(this._copyId){const id=this._copyId;this._copyId='';this.triggerEvent('entryconsumed');this.edit({currentTarget:{dataset:{id}}});}
    }catch(error){if(this._visible&&orgSession.isRequestCurrent(this,request))this.setData({loading:false,failed:true,notice:error.message||copy.operationFailed});}
  },
  create:function(){if(this.data.canCreate&&!this.data.busy&&!this.data.loading&&!this.data.failed){this._legacyNatureEdit=false;this.setDraft({name:'',enabled:true,audience:[{type:'people',personIds:[]}],targets:[{type:'self'}],actions:['assign']});}},
  setDraft:function(draft){this.setData({draft,actions:this.data.actions.map(action=>Object.assign({},action,{selected:draft.actions.includes(action.key)})),saved:false});},
  edit:function(e){if(this.data.busy||this.data.loading||this.data.failed)return;const rule=this.data.rules.find(item=>item.id===e.currentTarget.dataset.id);if(rule&&rule.canUpdate){this._legacyNatureEdit=rule.audience.concat(rule.targets).some(clause=>clause.type==='scope'&&clause.natureIds==null&&!clause.sameNature);this.setDraft(JSON.parse(JSON.stringify(rule)));}},
  duplicate:function(e){if(!this.data.canCreate||this.data.busy||this.data.loading||this.data.failed)return;const rule=this.data.rules.find(item=>item.id===e.currentTarget.dataset.id);if(rule){const draft=JSON.parse(JSON.stringify(rule));this._legacyNatureEdit=rule.audience.concat(rule.targets).some(clause=>clause.type==='scope'&&clause.natureIds==null&&!clause.sameNature);delete draft.id;delete draft.version;this.setDraft(draft);}},
  closeEditor:function(){if(!this.data.busy)this.setData({draft:null});},
  name:function(e){this.setData({'draft.name':e.detail.value});},
  enabled:function(e){this.setData({'draft.enabled':Boolean(e.detail.value)});},
  conditions:function(e){const key=e.currentTarget.dataset.key;if(['audience','targets'].includes(key))this.setData({['draft.'+key]:e.detail.value});},
  picker:function(e){this.setData({pickerVisible:e.detail.visible});},
  action:function(e){if(this.data.busy||this.data.saved)return;const key=e.currentTarget.dataset.key,values=this.data.draft.actions;this.setDraft(Object.assign({},this.data.draft,{actions:values.includes(key)?values.filter(value=>value!==key):values.concat(key)}));},
  select:function(e){const id=e.currentTarget.dataset.id;if(this.data.busy||this.data.loading||this.data.failed||!ruleAllows(this,id,'canDelete'))return;const selected=this.data.selected.includes(id)?this.data.selected.filter(value=>value!==id):this.data.selected.concat(id);this.setData({selected,rules:this.data.rules.map(rule=>Object.assign({},rule,{selected:selected.includes(rule.id)}))});},
  askDelete:function(){
    if(this.data.busy||this.data.loading||this.data.failed||!this.data.selected.length)return;
    const rules=this.data.rules.filter(rule=>rule.canDelete&&this.data.selected.includes(rule.id));
    if(rules.length!==this.data.selected.length)return;
    this._pending=rules.map(rule=>({id:rule.id,version:rule.version}));
    this.setData({confirmation:true,selectedNames:rules.map(rule=>rule.name)});
  },
  close:function(){if(!this.data.busy)this.setData({confirmation:false});},
  noop:function(){},
  async save(){
    if(this.data.busy||this.data.loading||this.data.saved||this.data.failed||!this.data.draft||!canSaveDraft(this,this.data.draft))return;
    if(['audience','targets'].some(key=>this.data.draft[key].some(clause=>clause.type==='scope'&&!(clause.natureIds||[]).length&&!clause.sameNature))){this.setData({notice:relations.selectNatureRequired});return;}
    const source=this.data.draft;
    if(this._legacyNatureEdit){const clauses=source.audience.concat(source.targets).filter(clause=>clause.type==='scope');const labels=(this.data.metadata.natures||[]).filter(item=>clauses.some(clause=>(clause.natureIds||[]).includes(item.id))).map(item=>item.name);if(clauses.some(clause=>clause.sameNature))labels.push(relations.calendarSameNatureSummary);const result=await wx.showModal({title:relations.legacyScopeChangeTitle,content:relations.legacyScopeChangeHelp(labels),confirmText:relations.confirmScopeChange,cancelText:copy.cancel});if(!result.confirm||this.data.draft!==source)return;}
    if(canSaveDraft(this,source))await this.write('saveCalendarRule',source);
  },
  async toggle(e){const rule=this.data.rules.find(item=>item.id===e.currentTarget.dataset.id);if(rule&&rule.canUpdate&&!this.data.busy&&!this.data.loading&&!this.data.failed)await this.write('batchCalendarRules',{action:rule.enabled?'disable':'enable',rules:[{id:rule.id,version:rule.version}]});},
  async remove(){if(!this.data.busy&&!this.data.loading&&!this.data.failed&&this.data.confirmation&&this._pending.length&&this._pending.every(rule=>ruleAllows(this,rule.id,'canDelete')))await this.write('batchCalendarRules',{action:'delete',rules:this._pending});},
  async write(name,data){
    if(this._writeInFlight)return;
    const contextId=orgSession.getSnapshot().contextId;
    this._writeInFlight=true;this.setData({busy:true,notice:''});
    try{
      const result=await callFunction({name,data});
      if(this._disposed||contextId!==orgSession.getSnapshot().contextId)return;
      if(result.status!=='success')throw new Error(result.message||copy.operationFailed);
      this.setData({saved:true,draft:null,confirmation:false,busy:false});
      if(this._visible)await this.load();
    }catch(error){if(!this._disposed&&contextId===orgSession.getSnapshot().contextId)this.setData({notice:error.message||copy.operationFailed});}
    finally{this._writeInFlight=false;if(!this._disposed&&contextId===orgSession.getSnapshot().contextId)this.setData({busy:false});}
  }
  }
});
