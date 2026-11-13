'use strict';
const copy=require('../../../../locales/zh-CN/calendar');
const relations=require('../../../../locales/zh-CN/identityNatureRelations');
const directory=require('../../package-resources/utils/contactDirectoryView');
const calendarView=require('../../package-resources/utils/calendarView');
const dimensions=[{key:'departmentIds',same:'sameDepartment',label:'department',options:'departments'},{key:'identityCategoryIds',same:'sameIdentity',label:'identity',options:'identities'},{key:'workGroupIds',same:'sameWorkGroup',label:'workGroup',options:'workGroups'}];
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{value:{type:Array,value:[]},metadata:{type:Object,value:{}},audience:Boolean,participants:Boolean,disabled:Boolean},
  data:{copy,relations,rows:[],types:[],activeIndex:-1,pickerVisible:false,people:[],selected:[]},
  observers:{'value,metadata,audience':function(){this.rebuild();}},
  lifetimes:{attached:function(){this._visible=true;},detached:function(){this._visible=false;this._scrollPending=null;}},
  pageLifetimes:{show:function(){this._visible=true;},hide:function(){this._visible=false;this._scrollPending=null;this.closePicker();}},
  methods:{
    rebuild:function(){
      const types=this.properties.audience ? ['people','scope'] : ['self','people','scope'];
      const people=directory.peopleOptions(this.properties.metadata.people);
      const value=this.properties.value, metadata=this.properties.metadata;
      if (!this._initialized && value.length) { this._initialized=true; const empty=value.findIndex(clause=>clause.type==='people'&&!(clause.personIds||[]).length||clause.type==='scope'&&Array.isArray(clause.natureIds)&&!clause.natureIds.length&&!clause.sameNature); if(empty>=0)this.setData({activeIndex:empty}); }
      const rows=this.properties.value.map((clause,index)=>({index,type:clause.type,typeIndex:types.indexOf(clause.type),
        expanded:this.data.activeIndex===index,summary:calendarView.participantSourceSummary(clause,metadata,copy,relations),
        sameNature:Boolean(clause.sameNature),legacyNature:clause.natureIds==null&&!clause.sameNature,natures:(this.properties.metadata.natures||[]).map(item=>({id:item.id,name:item.name,selected:(clause.natureIds||[]).includes(item.id)})),
        names:people.filter(person=>(clause.personIds||[]).includes(person.id)).map(person=>person.name).join(' / '),
        count:(clause.personIds||[]).length,dimensions:dimensions.map(dimension=>({key:dimension.key,same:dimension.same,label:copy[dimension.label],sameLabel:copy[dimension.same],
          summary:clause[dimension.same]?copy[dimension.same]:!(clause[dimension.key]||[]).length?copy.unlimited:(clause[dimension.key]||[]).map(id=>{const option=(metadata[dimension.options]||[]).find(item=>item.id===id);return option?option.name:copy.staleReferences;}).join('、'),
          checked:Boolean(clause[dimension.same]),expanded:Boolean(this._expanded && this._expanded[index+dimension.key]),
          count:(clause[dimension.key]||[]).length,options:(this.properties.metadata[dimension.options]||[]).filter(option=>dimension.key!=='identityCategoryIds'||clause.sameNature||(option.natureIds||[]).some(id=>(clause.natureIds||[]).includes(id))).map(option=>({id:option.id,name:option.name+(option.departmentId?' · '+((this.properties.metadata.departments||[]).find(item=>item.id===option.departmentId)||{}).name:''),
            selected:(clause[dimension.key]||[]).includes(option.id)}))}))}));
      this._types=types;this.setData({rows,people,types:types.map(type=>copy[type==='people'?'choosePeople':type==='scope'?'chooseScope':'self'])},()=>{
        if(this._scrollPending==null)return;
        const index=this._scrollPending;this._scrollPending=null;
        this.createSelectorQuery().select('#calendar-source-'+index).boundingClientRect().selectViewport().scrollOffset().exec(result=>{
          if(this._visible!==false&&this.data.activeIndex===index&&result[0]&&result[1])wx.pageScrollTo({scrollTop:Math.max(0,result[0].top+result[1].scrollTop),duration:200});
        });
      });
    },
    publish:function(list){if(!this.properties.disabled)this.triggerEvent('change',{value:list});},
    patch:function(index,work){const list=JSON.parse(JSON.stringify(this.properties.value));if(!list[index])return;work(list[index]);this.publish(list);},
    typeChange:function(e){const list=JSON.parse(JSON.stringify(this.properties.value));list[Number(e.currentTarget.dataset.index)]=directory.blankClause(this._types[Number(e.detail.value)]);this.publish(list);},
    add:function(e){if(this.properties.disabled)return;const type=e&&e.currentTarget.dataset.type||'scope';this._scrollPending=this.properties.value.length;this.setData({activeIndex:this.properties.value.length});this.publish(this.properties.value.concat(directory.blankClause(type)));},
    editSource:function(e){if(!this.properties.disabled)this.setData({activeIndex:Number(e.currentTarget.dataset.index)},()=>this.rebuild());},
    finishSource:function(){this.setData({activeIndex:-1},()=>this.rebuild());},
    remove:function(e){if(this.properties.value.length>1){this.setData({activeIndex:-1});this.publish(this.properties.value.filter((_,i)=>i!==Number(e.currentTarget.dataset.index)));}},
    expand:function(e){const key=e.currentTarget.dataset.index+e.currentTarget.dataset.key;this._expanded=this._expanded||{};this._expanded[key]=!this._expanded[key];this.rebuild();},
    toggle:async function(e){
      const {index,key,id}=e.currentTarget.dataset,source=this.properties.value[Number(index)];if(this.properties.disabled||!source)return;
      const values=source[key]||[],next=values.includes(id)?values.filter(value=>value!==id):values.concat(id);
      const invalid=key==='natureIds'?(this.properties.metadata.identities||[]).filter(item=>(source.identityCategoryIds||[]).includes(item.id)&&!(item.natureIds||[]).some(nature=>next.includes(nature))):[];
      if(invalid.length){const result=await wx.showModal({title:relations.incompatibleSelectionTitle,content:[relations.incompatibleSelectionHelp].concat(invalid.map(item=>item.name)).join('\n'),confirmText:relations.clearIncompatibleSelection,cancelText:copy.cancel});if(!result.confirm||this.properties.value[Number(index)]!==source)return;}
      this.patch(Number(index),clause=>{clause[key]=next;if(key==='natureIds'){delete clause.sameNature;clause.identityCategoryIds=(clause.identityCategoryIds||[]).filter(value=>!invalid.some(item=>item.id===value));}});
    },
    same:function(e){const {index,key,same}=e.currentTarget.dataset;this.patch(Number(index),clause=>{clause[same]=Boolean(e.detail.value);clause[key]=[];});},
    openPicker:function(e){if(this.properties.disabled)return;this._pickerIndex=Number(e.currentTarget.dataset.index);this.setData({pickerVisible:true,selected:this.properties.value[this._pickerIndex].personIds||[]});this.triggerEvent('pickerchange',{visible:true});},
    closePicker:function(){this.setData({pickerVisible:false,selected:[]});this.triggerEvent('pickerchange',{visible:false});},
    confirmPicker:function(e){this.setData({activeIndex:-1});this.patch(this._pickerIndex,clause=>{clause.personIds=e.detail.items.map(item=>item.personId||item.id);});this.closePicker();}
  }
});
