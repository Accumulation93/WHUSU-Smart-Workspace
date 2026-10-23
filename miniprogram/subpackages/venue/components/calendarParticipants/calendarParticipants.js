'use strict';
const copy=require('../../../../locales/zh-CN/calendar');
const {callFunction}=require('../../../../utils/api');
const session=require('../../../../utils/orgSession');
Component({options:{styleIsolation:'apply-shared'},properties:{sourceKind:String,sourceId:String,occurrenceDate:String},data:{copy,result:null,loading:false,failed:false},
  observers:{'sourceId,occurrenceDate':function(){this.load();}},
  lifetimes:{attached:function(){this._visible=true;this.load();},detached:function(){this._visible=false;session.invalidateRequests(this);}},
  pageLifetimes:{show:function(){this._visible=true;this.load();},hide:function(){this._visible=false;session.invalidateRequests(this);this.setData({result:null});}},
  methods:{async load(){if(!this.properties.sourceId||!this._visible)return;const request=session.beginRequest(this,'participants'),current=()=>this._visible&&session.isRequestCurrent(this,request);this.setData({result:null,loading:true,failed:false});try{const result=await callFunction({name:'getCalendarParticipants',data:{sourceKind:this.properties.sourceKind,sourceId:this.properties.sourceId,occurrenceDate:this.properties.occurrenceDate||undefined}});if(!current())return;if(result.status!=='success'){this.setData({failed:!['calendar_forbidden','calendar_unavailable','forbidden'].includes(result.status)});return;}result.participants=result.participants.map(person=>({name:person.name,personReference:person.personReference||'',positions:person.positions.map(position=>[position.identityCategory,position.department,position.workGroup].filter(Boolean).join(' · ')).join(' / ')}));this.setData({result});}catch(_){if(current())this.setData({failed:true});}finally{if(current())this.setData({loading:false});}},
    edit:function(){if(this.data.result&&this.data.result.canEdit)wx.navigateTo({url:'/subpackages/workspace/pages/calendarEdit/calendarEdit?sourceKind='+this.properties.sourceKind+'&sourceId='+encodeURIComponent(this.properties.sourceId)});}
  }
});
